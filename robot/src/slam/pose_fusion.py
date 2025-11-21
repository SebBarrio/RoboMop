"""Lightweight EKF-based pose fusion for combining odometry, IMU, and SLAM."""

from __future__ import annotations

import math
import threading
from typing import Optional

import numpy as np  # type: ignore[import]

from src.control.robot_controller import Pose2D


def _wrap_angle(angle: float) -> float:
    """Wrap angle to (-pi, pi]."""
    return (angle + math.pi) % (2.0 * math.pi) - math.pi


class PoseFusionEKF:
    """Simple 3-state EKF that fuses odometry predictions with pose/heading measurements."""

    def __init__(self, *, initial_pose: Optional[Pose2D] = None, initial_covariance: float = 1e-3) -> None:
        self._state = np.zeros(3, dtype=float)
        self._covariance = np.eye(3, dtype=float) * float(initial_covariance)
        if initial_pose is not None:
            self._state[:] = (initial_pose.x, initial_pose.y, _wrap_angle(initial_pose.theta))
        self._lock = threading.Lock()

    def reset(self, pose: Pose2D, covariance: Optional[np.ndarray] = None) -> None:
        """Reset the filter to a known pose."""
        with self._lock:
            self._state[:] = (pose.x, pose.y, _wrap_angle(pose.theta))
            if covariance is not None:
                cov = np.asarray(covariance, dtype=float)
                if cov.shape != (3, 3):
                    raise ValueError("covariance must be a 3x3 matrix")
                self._covariance = cov.copy()
            else:
                self._covariance = np.eye(3, dtype=float) * 1e-3

    def predict(self, dx: float, dy: float, dtheta: float, process_covariance: Optional[np.ndarray] = None) -> None:
        """
        Predict the next state using odometry deltas expressed in the world frame.

        Args:
            dx: World-frame delta x.
            dy: World-frame delta y.
            dtheta: Heading change (rad).
            process_covariance: 3x3 covariance matrix for the motion noise.
        """
        process_cov = self._resolve_covariance(process_covariance, default=5e-4)
        with self._lock:
            self._state[0] += dx
            self._state[1] += dy
            self._state[2] = _wrap_angle(self._state[2] + dtheta)
            self._covariance = self._covariance + process_cov

    def update_with_pose(self, pose: Pose2D, measurement_covariance: Optional[np.ndarray] = None) -> None:
        """Fuse an (x, y, theta) pose measurement such as a SLAM estimate."""
        measurement_cov = self._resolve_covariance(measurement_covariance, default=2e-4)
        z = np.array([pose.x, pose.y, _wrap_angle(pose.theta)], dtype=float)
        H = np.eye(3, dtype=float)
        with self._lock:
            innovation = z - self._state
            innovation[2] = _wrap_angle(innovation[2])
            S = H @ self._covariance @ H.T + measurement_cov
            K = self._covariance @ H.T @ np.linalg.inv(S)
            self._state = self._state + K @ innovation
            self._state[2] = _wrap_angle(self._state[2])
            I = np.eye(3)
            self._covariance = (I - K @ H) @ self._covariance

    def update_heading(self, heading: float, variance: float) -> None:
        """Fuse a heading-only measurement (e.g., IMU yaw)."""
        if variance <= 0.0:
            raise ValueError("variance must be positive")
        H = np.array([[0.0, 0.0, 1.0]], dtype=float)
        R = np.array([[variance]], dtype=float)
        z = np.array([_wrap_angle(heading)], dtype=float)
        with self._lock:
            innovation = z - H @ self._state
            innovation[0] = _wrap_angle(innovation[0])
            S = H @ self._covariance @ H.T + R
            K = self._covariance @ H.T @ np.linalg.inv(S)
            self._state = self._state + (K.flatten() * innovation[0])
            self._state[2] = _wrap_angle(self._state[2])
            I = np.eye(3)
            self._covariance = (I - K @ H) @ self._covariance

    @property
    def pose(self) -> Pose2D:
        with self._lock:
            return Pose2D(self._state[0], self._state[1], _wrap_angle(self._state[2]))

    @property
    def covariance(self) -> np.ndarray:
        with self._lock:
            return self._covariance.copy()

    def _resolve_covariance(self, covariance: Optional[np.ndarray], *, default: float) -> np.ndarray:
        if covariance is None:
            return np.eye(3, dtype=float) * float(default)
        cov = np.asarray(covariance, dtype=float)
        if cov.shape != (3, 3):
            raise ValueError("covariance must be a 3x3 matrix")
        return cov


__all__ = ["PoseFusionEKF"]

