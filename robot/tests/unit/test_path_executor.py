"""Unit tests for the navigation PathExecutor."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import List, Tuple

import pytest

from src.control.robot_controller import Pose2D
from src.navigation.path_executor import (
    PathExecutor,
    PathExecutorStatus,
    Waypoint,
)


@dataclass
class DummyRobotController:
    pose: Pose2D = field(default_factory=Pose2D)
    goal_active: bool = False
    pose_goals: List[Tuple[float, float, float | None]] = field(default_factory=list)
    cancel_calls: int = 0
    last_velocity_command: Tuple[float, float] | None = None

    def set_pose_goal(self, *, x: float, y: float, theta: float | None = None) -> None:
        self.goal_active = True
        self.pose_goals.append((x, y, theta))

    def set_velocity_command(self, *, linear: float, angular: float) -> None:
        self.goal_active = False
        self.last_velocity_command = (linear, angular)

    def cancel_goal(self) -> None:
        self.goal_active = False
        self.cancel_calls += 1


def test_executor_advances_through_waypoints() -> None:
    controller = DummyRobotController()

    executor = PathExecutor(
        controller,
        default_linear_tolerance=0.1,
        default_heading_tolerance=math.radians(10.0),
    )

    waypoints = [
        Waypoint(x=0.1, y=0.0),
        Waypoint(x=0.3, y=0.0, theta=math.pi / 2.0),
    ]

    executor.load_path(waypoints, start_immediately=False)
    assert executor.status is PathExecutorStatus.IDLE

    executor.start()
    assert executor.status is PathExecutorStatus.RUNNING
    assert controller.pose_goals == [(0.1, 0.0, None)]

    controller.pose = Pose2D(x=0.1, y=0.0, theta=0.0)
    executor.update(controller.pose, dt=0.05)
    assert controller.pose_goals[-1] == (0.3, 0.0, math.pi / 2.0)

    controller.pose = Pose2D(x=0.3, y=0.0, theta=math.pi / 2.0)
    executor.update(controller.pose, dt=0.05)

    assert executor.status is PathExecutorStatus.COMPLETED
    assert controller.cancel_calls >= 1
    assert controller.goal_active is False


def test_executor_pause_and_resume_reissues_goal() -> None:
    controller = DummyRobotController()

    executor = PathExecutor(controller, default_linear_tolerance=0.05)

    waypoint_a = Waypoint(x=0.0, y=0.0)
    waypoint_b = Waypoint(x=1.0, y=0.0)

    executor.load_path([waypoint_a, waypoint_b])
    assert executor.status is PathExecutorStatus.RUNNING
    assert controller.pose_goals == [(0.0, 0.0, None)]

    executor.pause()
    assert executor.status is PathExecutorStatus.PAUSED
    assert controller.goal_active is False

    controller.pose = Pose2D(x=0.0, y=0.0, theta=0.0)
    executor.update(controller.pose, dt=0.1)
    assert controller.pose_goals == [(0.0, 0.0, None)]

    executor.resume()
    assert executor.status is PathExecutorStatus.RUNNING
    assert controller.pose_goals[-1] == (0.0, 0.0, None)

    executor.update(controller.pose, dt=0.05)
    assert controller.pose_goals[-1] == (1.0, 0.0, None)


def test_executor_cancel_stops_execution() -> None:
    controller = DummyRobotController()
    executor = PathExecutor(controller)

    executor.load_path([Waypoint(x=0.5, y=0.5)])
    assert executor.status is PathExecutorStatus.RUNNING
    assert controller.goal_active is True

    executor.cancel()

    assert executor.status is PathExecutorStatus.CANCELLED
    assert controller.goal_active is False
    assert controller.cancel_calls >= 1

    controller.pose = Pose2D(x=0.5, y=0.5, theta=0.0)
    executor.update(controller.pose, dt=0.1)
    assert controller.pose_goals == [(0.5, 0.5, None)]
