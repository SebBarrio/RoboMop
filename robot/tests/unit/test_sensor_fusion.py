"""Unit tests for the sensor fusion EKF module."""

from __future__ import annotations

import math

import numpy as np


def make_filter(
    *,
    state: np.ndarray | None = None,
    covariance_scale: float = 1.0,
) -> "SensorFusionEKF":
    from robot.src.slam.sensor_fusion import SensorFusionEKF  # Delayed import for TDD

    x0 = state if state is not None else np.zeros(5, dtype=float)
    P0 = np.eye(5, dtype=float) * covariance_scale
    Q = np.diag([1e-4, 1e-4, 1e-6, 1e-3, 1e-4])
    R_pose = np.diag([0.05, 0.05, 0.01])
    R_v = 0.02
    R_w = math.radians(2.0) ** 2
    return SensorFusionEKF(x0=x0, P0=P0, Q=Q, R_pose=R_pose, R_v=R_v, R_w=R_w)


def test_predict_linear_motion_updates_pose_forward():
    ekf = make_filter()

    ekf.predict(control_v=1.0, control_w=0.0, dt=1.0)

    state = ekf.state()
    assert math.isclose(state["x"], 1.0, rel_tol=1e-6, abs_tol=1e-6)
    assert math.isclose(state["y"], 0.0, abs_tol=1e-6)
    assert math.isclose(state["theta"], 0.0, abs_tol=1e-6)
    assert math.isclose(state["v"], 1.0, abs_tol=1e-6)
    assert math.isclose(state["omega"], 0.0, abs_tol=1e-6)


def test_predict_rotation_wraps_heading_correctly():
    ekf = make_filter()

    ekf.predict(control_v=0.0, control_w=math.pi / 2.0, dt=1.0)

    state = ekf.state()
    assert math.isclose(state["x"], 0.0, abs_tol=1e-6)
    assert math.isclose(state["y"], 0.0, abs_tol=1e-6)
    assert math.isclose(state["theta"], math.pi / 2.0, rel_tol=1e-6, abs_tol=1e-6)


def test_pose_update_corrects_position_error():
    initial = np.array([10.0, 0.5, 0.0, 0.0, 0.0], dtype=float)
    ekf = make_filter(state=initial, covariance_scale=0.5)

    measurement = np.array([9.0, 0.0, 0.0], dtype=float)
    ekf.update_pose(measurement, R=np.diag([1e-3, 1e-3, 1e-4]))

    state = ekf.state()
    assert state["x"] < 9.5
    assert abs(state["y"]) < 0.1


def test_velocity_update_tracks_measured_speed():
    ekf = make_filter()
    ekf.predict(control_v=0.0, control_w=0.0, dt=0.1)

    ekf.update_v(0.5, R=0.01)

    state = ekf.state()
    assert abs(state["v"] - 0.5) < 5e-3


def test_pose_update_handles_angle_wrapping():
    initial = np.array([0.0, 0.0, math.pi - 0.05, 0.0, 0.0], dtype=float)
    ekf = make_filter(state=initial, covariance_scale=0.3)

    measurement = np.array([0.0, 0.0, -math.pi + 0.05], dtype=float)
    ekf.update_pose(measurement, R=np.diag([0.1, 0.1, 1e-4]))

    state = ekf.state()
    expected = -math.pi + 0.05
    assert math.isclose(state["theta"], expected, abs_tol=1e-3)
