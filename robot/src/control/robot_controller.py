"""Differential-drive velocity and pose controller for the RoboMop robot."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable, Mapping, Sequence

from .motor_controller import MotorController
from .pid import PIDController


@dataclass(slots=True)
class Pose2D:
    """Planar robot pose."""

    x: float = 0.0
    y: float = 0.0
    theta: float = 0.0


class RobotController:
    """High-level velocity controller that wraps the low-level motor loop."""

    def __init__(
        self,
        *,
        motor_controller: MotorController,
        track_width: float,
        wheel_radius: float,
        left_motor_indices: Iterable[int],
        right_motor_indices: Iterable[int],
        position_pid: PIDController | None = None,
        heading_pid: PIDController | None = None,
        max_linear_speed: float = 1.0,
        max_angular_speed: float = 2.0,
        goal_tolerance: float = 0.02,
        heading_tolerance: float = math.radians(3.0),
        heading_gate: float = math.radians(45.0),
    ) -> None:
        if track_width <= 0.0:
            raise ValueError("track_width must be positive")
        if wheel_radius <= 0.0:
            raise ValueError("wheel_radius must be positive")
        if not left_motor_indices or not right_motor_indices:
            raise ValueError("left and right motor indices must not be empty")
        if max_linear_speed <= 0.0:
            raise ValueError("max_linear_speed must be positive")
        if max_angular_speed <= 0.0:
            raise ValueError("max_angular_speed must be positive")
        self._motor_controller = motor_controller
        self._track_width = float(track_width)
        self._wheel_radius = float(wheel_radius)
        self._left_indices: tuple[int, ...] = tuple(left_motor_indices)
        self._right_indices: tuple[int, ...] = tuple(right_motor_indices)
        self._max_linear = float(max_linear_speed)
        self._max_angular = float(max_angular_speed)
        self._position_pid = position_pid
        self._heading_pid = heading_pid
        self._goal_tolerance = float(goal_tolerance)
        self._heading_tolerance = float(heading_tolerance)
        self._heading_gate = float(heading_gate)

        self._pose = Pose2D()
        self._linear_cmd = 0.0
        self._angular_cmd = 0.0
        self._goal: Pose2D | None = None
        self._goal_heading: float | None = None
        self._goal_active = False

    @property
    def pose(self) -> Pose2D:
        return self._pose

    @property
    def track_width(self) -> float:
        return self._track_width

    @property
    def wheel_radius(self) -> float:
        return self._wheel_radius

    @property
    def goal_active(self) -> bool:
        return self._goal_active

    def reset_pose(self, pose: Pose2D | None = None) -> None:
        self._pose = Pose2D() if pose is None else Pose2D(pose.x, pose.y, _wrap_angle(pose.theta))

    def cancel_goal(self) -> None:
        self._goal_active = False
        self._goal = None
        self._goal_heading = None
        self._linear_cmd = 0.0
        self._angular_cmd = 0.0

    def set_velocity_command(self, *, linear: float, angular: float) -> None:
        self._goal_active = False
        self._goal = None
        self._goal_heading = None
        self._linear_cmd = _clamp(linear, -self._max_linear, self._max_linear)
        self._angular_cmd = _clamp(angular, -self._max_angular, self._max_angular)

    def set_pose_goal(self, *, x: float, y: float, theta: float | None = None) -> None:
        if self._position_pid is None or self._heading_pid is None:
            raise RuntimeError("position and heading PID controllers are required for pose goals")
        self._goal = Pose2D(x, y, _wrap_angle(theta) if theta is not None else 0.0)
        self._goal_heading = None if theta is None else _wrap_angle(theta)
        self._goal_active = True

    def update(self, dt: float | None = None) -> None:
        interval = self._resolve_interval(dt)
        if self._goal_active and self._goal is not None:
            self._apply_goal_control(interval)

        self._apply_velocity_targets()
        self._motor_controller.update(dt=interval)
        self._integrate_pose(interval)
        if self._goal_active and self._goal is not None:
            self._evaluate_goal_completion()

    def _resolve_interval(self, dt: float | None) -> float:
        if dt is not None:
            if dt <= 0.0:
                raise ValueError("dt must be positive")
            return dt
        interval = getattr(self._motor_controller, "loop_interval", None)
        if interval is None or interval <= 0.0:
            raise ValueError("Motor controller must supply a positive loop interval")
        return float(interval)

    def _apply_goal_control(self, dt: float) -> None:
        assert self._goal is not None
        dx = self._goal.x - self._pose.x
        dy = self._goal.y - self._pose.y
        distance = math.hypot(dx, dy)
        desired_heading = self._pose.theta if distance < 1e-6 else math.atan2(dy, dx)
        heading_error = _wrap_angle(desired_heading - self._pose.theta)

        linear_cmd = 0.0
        if self._position_pid is not None:
            linear_cmd = self._position_pid.update(distance, dt)
            if abs(heading_error) > self._heading_gate:
                linear_cmd = 0.0
            else:
                linear_cmd *= max(0.0, math.cos(heading_error))

        angular_cmd = 0.0
        if self._heading_pid is not None:
            angular_cmd = self._heading_pid.update(heading_error, dt)

        self._linear_cmd = _clamp(linear_cmd, -self._max_linear, self._max_linear)
        self._angular_cmd = _clamp(angular_cmd, -self._max_angular, self._max_angular)

    def _apply_velocity_targets(self) -> None:
        left_speed, right_speed = self._inverse_kinematics(self._linear_cmd, self._angular_cmd)
        targets: dict[int, float] = {}
        for index in self._left_indices:
            targets[index] = left_speed
        for index in self._right_indices:
            targets[index] = right_speed
        self._motor_controller.set_velocity_targets(targets)

    def _integrate_pose(self, dt: float) -> None:
        left_velocity = self._average_wheel_velocity(self._left_indices)
        right_velocity = self._average_wheel_velocity(self._right_indices)
        if left_velocity is None or right_velocity is None:
            left_velocity, right_velocity = (
                self._linear_cmd / self._wheel_radius,
                self._linear_cmd / self._wheel_radius,
            )

        v_l = left_velocity * self._wheel_radius
        v_r = right_velocity * self._wheel_radius
        v = 0.5 * (v_r + v_l)
        omega = (v_r - v_l) / self._track_width

        if abs(omega) < 1e-9:
            dx = v * math.cos(self._pose.theta) * dt
            dy = v * math.sin(self._pose.theta) * dt
            dtheta = 0.0
        else:
            dtheta = omega * dt
            radius = v / omega if abs(v) > 1e-9 else 0.0
            dx = radius * (math.sin(self._pose.theta + dtheta) - math.sin(self._pose.theta))
            dy = -radius * (math.cos(self._pose.theta + dtheta) - math.cos(self._pose.theta))

        self._pose = Pose2D(
            x=self._pose.x + dx,
            y=self._pose.y + dy,
            theta=_wrap_angle(self._pose.theta + dtheta),
        )

    def _evaluate_goal_completion(self) -> None:
        assert self._goal is not None
        dx = self._goal.x - self._pose.x
        dy = self._goal.y - self._pose.y
        distance = math.hypot(dx, dy)
        heading_error = 0.0
        if self._goal_heading is not None:
            heading_error = abs(_wrap_angle(self._goal_heading - self._pose.theta))

        position_reached = distance <= self._goal_tolerance
        heading_reached = self._goal_heading is None or heading_error <= self._heading_tolerance
        if position_reached and heading_reached:
            self.cancel_goal()

    def _inverse_kinematics(self, linear: float, angular: float) -> tuple[float, float]:
        v_left = linear - (angular * self._track_width / 2.0)
        v_right = linear + (angular * self._track_width / 2.0)
        return v_left / self._wheel_radius, v_right / self._wheel_radius

    def _average_wheel_velocity(self, indices: Sequence[int]) -> float | None:
        velocities: list[float] = []
        for index in indices:
            reading = self._motor_controller.get_last_reading(index)
            if reading is not None:
                velocities.append(reading.velocity_rad_s)
        if not velocities:
            return None
        return sum(velocities) / len(velocities)


def _wrap_angle(angle: float) -> float:
    return (angle + math.pi) % (2.0 * math.pi) - math.pi


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))
