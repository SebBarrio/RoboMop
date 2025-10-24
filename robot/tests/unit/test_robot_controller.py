"""Unit tests for the differential-drive RobotController."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Mapping, MutableMapping

import math

import pytest

from src.control.pid import PIDController
from src.control.robot_controller import Pose2D, RobotController
from src.sensors.encoders import EncoderReading


@dataclass
class DummyMotorController:
    """Minimal stand-in for the MotorController used in unit tests."""

    loop_interval: float = 0.02
    last_targets: Dict[int, float] = field(default_factory=dict)
    feedback_velocities: MutableMapping[int, float] = field(default_factory=dict)
    readings: Dict[int, EncoderReading] = field(default_factory=dict)
    update_calls: int = 0

    def set_velocity_targets(self, targets: Mapping[int, float]) -> None:
        self.last_targets = dict(targets)

    def update(self, dt: float | None = None) -> None:  # pragma: no cover - trivial
        self.update_calls += 1
        interval = self.loop_interval if dt is None else dt
        timestamp = self.update_calls * interval
        motors = set(self.last_targets.keys()) | set(self.feedback_velocities.keys())
        for motor_index in motors:
            omega = self.feedback_velocities.get(
                motor_index, self.last_targets.get(motor_index, 0.0)
            )
            self.readings[motor_index] = EncoderReading(
                timestamp=timestamp,
                ticks=0,
                revolutions=0.0,
                position_rad=0.0,
                velocity_rad_s=omega,
                position_m=None,
                velocity_m_s=None,
            )

    def get_last_reading(self, motor_index: int) -> EncoderReading | None:
        return self.readings.get(motor_index)

    def stop_all(self) -> None:  # pragma: no cover - trivial
        self.last_targets = {}

    def set_feedback_velocity(self, motor_index: int, velocity: float) -> None:
        self.feedback_velocities[motor_index] = velocity


def _controller(
    position_pid: PIDController | None = None, heading_pid: PIDController | None = None
) -> tuple[RobotController, DummyMotorController]:
    motor = DummyMotorController()
    controller = RobotController(
        motor_controller=motor,
        track_width=0.4,
        wheel_radius=0.05,
        left_motor_indices=(0, 1),
        right_motor_indices=(2, 3),
        position_pid=position_pid,
        heading_pid=heading_pid,
        max_linear_speed=2.0,
        max_angular_speed=4.0,
    )
    return controller, motor


def test_velocity_command_sets_wheel_targets() -> None:
    controller, motor = _controller()

    controller.set_velocity_command(linear=0.5, angular=0.0)
    controller.update(dt=0.02)

    expected = 0.5 / 0.05
    for motor_index in (0, 1, 2, 3):
        assert motor.last_targets[motor_index] == pytest.approx(expected)


def test_velocity_command_with_rotation_splits_wheel_speeds() -> None:
    controller, motor = _controller()

    controller.set_velocity_command(linear=0.0, angular=1.0)
    controller.update(dt=0.02)

    left_expected = (-0.5 * controller.track_width) / controller.wheel_radius
    right_expected = (0.5 * controller.track_width) / controller.wheel_radius
    for motor_index in (0, 1):
        assert motor.last_targets[motor_index] == pytest.approx(left_expected)
    for motor_index in (2, 3):
        assert motor.last_targets[motor_index] == pytest.approx(right_expected)


def test_update_integrates_pose_from_encoder_feedback() -> None:
    controller, motor = _controller()
    for idx in (0, 1, 2, 3):
        motor.set_feedback_velocity(idx, 10.0)

    controller.update(dt=0.1)

    pose = controller.pose
    assert pose.x == pytest.approx(0.5 * 0.1)
    assert pose.y == pytest.approx(0.0)
    assert pose.theta == pytest.approx(0.0)


def test_pose_goal_generates_and_clears_velocity_commands() -> None:
    position_pid = PIDController(kp=1.2, ki=0.0, kd=0.0, integrator_limit=2.0)
    heading_pid = PIDController(kp=3.0, ki=0.0, kd=0.0, integrator_limit=2.0)
    controller, motor = _controller(position_pid=position_pid, heading_pid=heading_pid)

    controller.set_pose_goal(x=1.0, y=0.0)
    controller.update(dt=0.1)

    # Goal should drive the robot forward with symmetric wheel speeds.
    left_speed = motor.last_targets[0]
    right_speed = motor.last_targets[2]
    assert left_speed > 0.0
    assert right_speed > 0.0
    assert left_speed == pytest.approx(right_speed, rel=1e-6)

    # Simulate reaching the goal and ensure the controller stops.
    controller.reset_pose(Pose2D(x=1.0, y=0.0, theta=0.0))
    controller.update(dt=0.1)

    for target in motor.last_targets.values():
        assert abs(target) < 1e-6
    assert controller.goal_active is False
