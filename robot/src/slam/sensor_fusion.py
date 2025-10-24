"""Extended Kalman filter for fusing odometry, IMU, and SLAM pose updates."""

# pylint: disable=too-many-arguments,too-many-locals

from __future__ import annotations

import math
from typing import Mapping

import numpy as np


STATE_DIMENSION = 5


def _wrap_angle(angle: float) -> float:
    """Wrap an angle to the range [-π, π]."""

    wrapped = (angle + math.pi) % (2.0 * math.pi)
    return wrapped - math.pi


class SensorFusionEKF:
    """Extended Kalman filter combining encoder, IMU, and pose measurements."""

    def __init__(
        self,
        *,
        x0: np.ndarray,
        P0: np.ndarray,
        Q: np.ndarray,
        R_pose: np.ndarray,
        R_v: float,
        R_w: float,
    ) -> None:  # pylint: disable=too-many-arguments
        self._state = self._validate_vector(x0, name="x0")
        self._covariance = self._validate_matrix(P0, name="P0")
        self._process_noise = self._validate_matrix(Q, name="Q")
        self._pose_noise = self._validate_matrix(R_pose, name="R_pose", expected_shape=(3, 3))
        self._velocity_noise = float(R_v)
        self._omega_noise = float(R_w)
        self._identity_matrix = np.eye(STATE_DIMENSION, dtype=float)

    @property
    def state_vector(self) -> np.ndarray:
        """Return the current EKF state vector."""

        return self._state.copy()

    @property
    def covariance(self) -> np.ndarray:
        """Return the current state covariance."""

        return self._covariance.copy()

    def predict(
        self,
        *,
        control_v: float,
        control_w: float,
        dt: float,
    ) -> None:  # pylint: disable=too-many-locals
        """Predict the state using velocity and angular rate commands."""

        if dt <= 0.0:
            raise ValueError("dt must be positive")

        x, y, theta, _v, _w = self._state
        v = float(control_v)
        w = float(control_w)

        cos_theta = math.cos(theta)
        sin_theta = math.sin(theta)

        x_pred = x + v * cos_theta * dt
        y_pred = y + v * sin_theta * dt
        theta_pred = _wrap_angle(theta + w * dt)

        self._state = np.array([x_pred, y_pred, theta_pred, v, w], dtype=float)

        state_jacobian = np.eye(STATE_DIMENSION, dtype=float)
        state_jacobian[0, 2] = -v * sin_theta * dt
        state_jacobian[0, 3] = cos_theta * dt
        state_jacobian[1, 2] = v * cos_theta * dt
        state_jacobian[1, 3] = sin_theta * dt
        state_jacobian[2, 4] = dt

        self._covariance = (
            state_jacobian @ self._covariance @ state_jacobian.T + self._process_noise
        )

    def update_pose(self, z: np.ndarray, *, R: np.ndarray | None = None) -> None:
        """Update state using an externally provided pose measurement [x, y, θ]."""

        measurement = self._validate_vector(z, name="z_pose", expected_length=3)
        noise = (
            self._validate_matrix(R, name="R_pose", expected_shape=(3, 3))
            if R is not None
            else self._pose_noise
        )
        measurement_matrix = np.array(
            [
                [1.0, 0.0, 0.0, 0.0, 0.0],
                [0.0, 1.0, 0.0, 0.0, 0.0],
                [0.0, 0.0, 1.0, 0.0, 0.0],
            ],
            dtype=float,
        )
        innovation = measurement - measurement_matrix @ self._state
        innovation[2] = _wrap_angle(float(innovation[2]))

        self._apply_kalman_update(measurement_matrix, innovation, noise)
        self._state[2] = _wrap_angle(float(self._state[2]))

    def update_v(self, value: float, *, R: float | None = None) -> None:
        """Update state with a measured linear velocity."""

        measurement_noise = float(R) if R is not None else self._velocity_noise
        measurement_matrix = np.array([[0.0, 0.0, 0.0, 1.0, 0.0]], dtype=float)
        innovation = np.array([value], dtype=float) - measurement_matrix @ self._state
        self._apply_kalman_update(
            measurement_matrix,
            innovation,
            np.array([[measurement_noise]], dtype=float),
        )

    def update_omega(self, value: float, *, R: float | None = None) -> None:
        """Update state with a measured angular velocity."""

        measurement_noise = float(R) if R is not None else self._omega_noise
        measurement_matrix = np.array([[0.0, 0.0, 0.0, 0.0, 1.0]], dtype=float)
        innovation = np.array([value], dtype=float) - measurement_matrix @ self._state
        self._apply_kalman_update(
            measurement_matrix,
            innovation,
            np.array([[measurement_noise]], dtype=float),
        )

    def state(self) -> Mapping[str, float]:
        """Return the state as a mapping with named fields."""

        x, y, theta, v, omega = (float(component) for component in self._state)
        return {"x": x, "y": y, "theta": theta, "v": v, "omega": omega}

    def _apply_kalman_update(
        self,
        measurement_matrix: np.ndarray,
        innovation: np.ndarray,
        measurement_noise: np.ndarray,
    ) -> None:
        innovation_covariance = (
            measurement_matrix @ self._covariance @ measurement_matrix.T + measurement_noise
        )
        kalman_gain = self._covariance @ measurement_matrix.T @ np.linalg.inv(innovation_covariance)
        self._state = self._state + (kalman_gain @ innovation).ravel()
        projection = self._identity_matrix - kalman_gain @ measurement_matrix
        self._covariance = (
            projection @ self._covariance @ projection.T
            + kalman_gain @ measurement_noise @ kalman_gain.T
        )
        self._covariance = 0.5 * (self._covariance + self._covariance.T)

    @staticmethod
    def _validate_vector(
        vector: np.ndarray,
        *,
        name: str,
        expected_length: int = STATE_DIMENSION,
    ) -> np.ndarray:
        array = np.asarray(vector, dtype=float)
        if array.shape != (expected_length,):
            raise ValueError(f"{name} must be a vector of length {expected_length}")
        return array

    @staticmethod
    def _validate_matrix(
        matrix: np.ndarray | None,
        *,
        name: str,
        expected_shape: tuple[int, int] = (STATE_DIMENSION, STATE_DIMENSION),
    ) -> np.ndarray:
        array = np.asarray(matrix, dtype=float)
        if array.shape != expected_shape:
            raise ValueError(f"{name} must have shape {expected_shape}")
        return array.copy()


__all__ = ["SensorFusionEKF"]
