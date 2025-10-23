"""Waypoint-based path execution utilities."""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import Enum
from typing import Iterable, Sequence

from src.control.robot_controller import Pose2D, RobotController


@dataclass(frozen=True, slots=True)
class Waypoint:
    """Represents a target pose along a planned path."""

    x: float
    y: float
    theta: float | None = None
    hold_time: float = 0.0
    linear_tolerance: float | None = None
    heading_tolerance: float | None = None


class PathExecutorStatus(Enum):
    """Execution state of the path executor."""

    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class PathExecutor:
    """Sequentially executes waypoints using the robot pose controller."""

    def __init__(
        self,
        controller: RobotController,
        *,
        default_linear_tolerance: float = 0.05,
        default_heading_tolerance: float = math.radians(5.0),
    ) -> None:
        if default_linear_tolerance <= 0.0:
            raise ValueError("default_linear_tolerance must be positive")
        if default_heading_tolerance <= 0.0:
            raise ValueError("default_heading_tolerance must be positive")

        self._controller = controller
        self._default_linear_tolerance = float(default_linear_tolerance)
        self._default_heading_tolerance = float(default_heading_tolerance)

        self._status = PathExecutorStatus.IDLE
        self._waypoints: list[Waypoint] = []
        self._index = -1
        self._active_goal: Waypoint | None = None
        self._hold_remaining = 0.0
        self._last_pose: Pose2D | None = None

    @property
    def status(self) -> PathExecutorStatus:
        return self._status

    @property
    def current_waypoint(self) -> Waypoint | None:
        return self._active_goal

    @property
    def waypoint_index(self) -> int:
        return self._index

    def load_path(self, waypoints: Sequence[Waypoint], *, start_immediately: bool = True) -> None:
        """Replace the current waypoint queue."""

        self._waypoints = list(waypoints)
        self._index = -1
        self._active_goal = None
        self._hold_remaining = 0.0
        self._last_pose = None

        if not self._waypoints:
            self._finish(PathExecutorStatus.COMPLETED)
            return

        self._status = PathExecutorStatus.IDLE
        if start_immediately:
            self.start()

    def append_waypoints(self, waypoints: Iterable[Waypoint]) -> None:
        """Append additional waypoints to the existing path."""

        extra = list(waypoints)
        if not extra:
            return
        self._waypoints.extend(extra)
        if self._status in {PathExecutorStatus.COMPLETED, PathExecutorStatus.CANCELLED}:
            self._status = PathExecutorStatus.IDLE

    def start(self) -> None:
        if not self._waypoints:
            self._finish(PathExecutorStatus.COMPLETED)
            return
        if self._status is PathExecutorStatus.RUNNING:
            return

        self._status = PathExecutorStatus.RUNNING
        self._advance_to_next_waypoint(reissue=False)

    def pause(self) -> None:
        if self._status is not PathExecutorStatus.RUNNING:
            return
        self._status = PathExecutorStatus.PAUSED
        self._controller.cancel_goal()

    def resume(self) -> None:
        if self._status is not PathExecutorStatus.PAUSED:
            return
        self._status = PathExecutorStatus.RUNNING
        if self._active_goal is None:
            self._advance_to_next_waypoint(reissue=False)
        else:
            self._command_current_waypoint()

    def cancel(self) -> None:
        if self._status in {PathExecutorStatus.CANCELLED, PathExecutorStatus.COMPLETED}:
            return
        self._finish(PathExecutorStatus.CANCELLED)

    def update(self, pose: Pose2D, *, dt: float | None = None) -> None:
        """Update execution progress using the latest robot pose."""

        self._last_pose = Pose2D(pose.x, pose.y, pose.theta)
        if self._status is not PathExecutorStatus.RUNNING:
            return

        if self._active_goal is None:
            self._advance_to_next_waypoint(reissue=False)
            return

        if not self._has_reached_waypoint(self._active_goal, self._last_pose):
            return

        if self._hold_remaining > 0.0:
            if dt is None:
                return
            self._hold_remaining = max(0.0, self._hold_remaining - dt)
            if self._hold_remaining > 0.0:
                return

        self._advance_to_next_waypoint(reissue=False)

    def is_complete(self) -> bool:
        return self._status is PathExecutorStatus.COMPLETED

    def _advance_to_next_waypoint(self, *, reissue: bool) -> None:
        if self._status is not PathExecutorStatus.RUNNING:
            return

        next_index = self._index if reissue else self._index + 1
        if next_index >= len(self._waypoints):
            self._finish(PathExecutorStatus.COMPLETED)
            return
        if next_index < 0:
            next_index = 0

        self._index = next_index
        self._active_goal = self._waypoints[next_index]
        self._hold_remaining = max(0.0, self._active_goal.hold_time)
        self._command_current_waypoint()

    def _command_current_waypoint(self) -> None:
        if self._active_goal is None:
            return
        waypoint = self._active_goal
        if waypoint.theta is None:
            self._controller.set_pose_goal(x=waypoint.x, y=waypoint.y)
        else:
            self._controller.set_pose_goal(x=waypoint.x, y=waypoint.y, theta=waypoint.theta)

    def _has_reached_waypoint(self, waypoint: Waypoint, pose: Pose2D) -> bool:
        tolerance = waypoint.linear_tolerance or self._default_linear_tolerance
        dx = waypoint.x - pose.x
        dy = waypoint.y - pose.y
        distance = math.hypot(dx, dy)
        if distance > tolerance:
            return False

        if waypoint.theta is None:
            return True

        heading_tolerance = waypoint.heading_tolerance or self._default_heading_tolerance
        heading_error = _wrap_angle(waypoint.theta - pose.theta)
        return abs(heading_error) <= heading_tolerance

    def _finish(self, status: PathExecutorStatus) -> None:
        self._controller.cancel_goal()
        self._status = status
        self._active_goal = None
        self._index = len(self._waypoints) if self._waypoints else -1
        self._hold_remaining = 0.0


def _wrap_angle(angle: float) -> float:
    return (angle + math.pi) % (2.0 * math.pi) - math.pi


__all__ = [
    "PathExecutor",
    "PathExecutorStatus",
    "Waypoint",
]
