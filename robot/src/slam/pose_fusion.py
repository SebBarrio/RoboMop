"""Extended Kalman Filter for fusing odometry and SLAM pose estimates.

This module provides a PoseEKF class that optimally combines:
- High-frequency odometry updates (prediction step)
- Lower-frequency SLAM pose corrections (measurement update)

The EKF handles the fact that odometry drifts over time while SLAM can provide
corrections when good scan matches are available.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Tuple

import numpy as np


@dataclass(slots=True)
class FusedPose:
    """Fused pose estimate with uncertainty."""
    
    x: float
    y: float
    theta: float
    # Diagonal elements of covariance matrix (uncertainty)
    var_x: float
    var_y: float
    var_theta: float


def _wrap_angle(angle: float) -> float:
    """Wrap angle to [-pi, pi]."""
    return (angle + math.pi) % (2.0 * math.pi) - math.pi


class PoseEKF:
    """Extended Kalman Filter for 2D robot pose estimation.
    
    State vector: [x, y, theta]
    
    The filter uses:
    - Odometry deltas for prediction (motion model)
    - SLAM pose estimates for measurement updates
    
    Args:
        initial_pose: Initial (x, y, theta) estimate
        initial_covariance: Initial state covariance (3x3 matrix or diagonal)
        process_noise_linear: Process noise for linear motion (m²)
        process_noise_angular: Process noise for angular motion (rad²)
        measurement_noise_xy: Measurement noise for SLAM x,y (m²)
        measurement_noise_theta: Measurement noise for SLAM theta (rad²)
    """
    
    def __init__(
        self,
        *,
        initial_pose: Tuple[float, float, float] = (0.0, 0.0, 0.0),
        initial_covariance: np.ndarray | None = None,
        process_noise_linear: float = 0.01,
        process_noise_angular: float = 0.005,
        measurement_noise_xy: float = 0.05,
        measurement_noise_theta: float = 0.02,
    ) -> None:
        # State vector: [x, y, theta]
        self._state = np.array(
            [initial_pose[0], initial_pose[1], initial_pose[2]], dtype=np.float64
        )
        
        # State covariance matrix P
        if initial_covariance is not None:
            self._P = np.array(initial_covariance, dtype=np.float64).reshape(3, 3)
        else:
            # Start with moderate uncertainty
            self._P = np.diag([0.1, 0.1, 0.05])
        
        # Process noise parameters (used to build Q matrix dynamically)
        self._q_linear = float(process_noise_linear)
        self._q_angular = float(process_noise_angular)
        
        # Measurement noise covariance R for SLAM updates
        self._R = np.diag([
            float(measurement_noise_xy),
            float(measurement_noise_xy),
            float(measurement_noise_theta),
        ])
        
        # Observation matrix H (direct observation of state)
        self._H = np.eye(3)
        
        # Track last odometry pose for computing deltas
        self._last_odom_pose: np.ndarray | None = None
    
    @property
    def state(self) -> np.ndarray:
        """Current state estimate [x, y, theta]."""
        return self._state.copy()
    
    @property
    def covariance(self) -> np.ndarray:
        """Current state covariance matrix (3x3)."""
        return self._P.copy()
    
    def get_pose(self) -> FusedPose:
        """Get the current fused pose estimate with uncertainties."""
        return FusedPose(
            x=float(self._state[0]),
            y=float(self._state[1]),
            theta=float(self._state[2]),
            var_x=float(self._P[0, 0]),
            var_y=float(self._P[1, 1]),
            var_theta=float(self._P[2, 2]),
        )
    
    def reset(
        self,
        pose: Tuple[float, float, float],
        covariance: np.ndarray | None = None,
    ) -> None:
        """Reset the filter to a new pose.
        
        Args:
            pose: New (x, y, theta) estimate
            covariance: Optional new covariance matrix
        """
        self._state = np.array([pose[0], pose[1], pose[2]], dtype=np.float64)
        if covariance is not None:
            self._P = np.array(covariance, dtype=np.float64).reshape(3, 3)
        self._last_odom_pose = None
    
    def predict_from_odometry(
        self,
        odom_x: float,
        odom_y: float,
        odom_theta: float,
    ) -> FusedPose:
        """Prediction step using odometry pose.
        
        This computes the odometry delta from the last odometry pose and applies
        it to the current state estimate. This should be called at the high-rate
        odometry update frequency.
        
        Args:
            odom_x: Current odometry x position
            odom_y: Current odometry y position
            odom_theta: Current odometry heading
            
        Returns:
            Updated fused pose estimate
        """
        odom_pose = np.array([odom_x, odom_y, odom_theta], dtype=np.float64)
        
        if self._last_odom_pose is None:
            # First call - just store the odometry pose, no prediction yet
            self._last_odom_pose = odom_pose
            return self.get_pose()
        
        # Compute odometry delta in the body frame
        dx_world = odom_pose[0] - self._last_odom_pose[0]
        dy_world = odom_pose[1] - self._last_odom_pose[1]
        dtheta = _wrap_angle(odom_pose[2] - self._last_odom_pose[2])
        
        # Transform world delta to body frame using previous heading
        prev_theta = self._state[2]
        cos_t = math.cos(prev_theta)
        sin_t = math.sin(prev_theta)
        
        # Actually, for differential drive, we apply the delta in world frame
        # but we need to compute it properly. The delta in world frame based
        # on odometry delta:
        dx = dx_world
        dy = dy_world
        
        # Apply motion model: simple addition for 2D pose
        self._state[0] += dx
        self._state[1] += dy
        self._state[2] = _wrap_angle(self._state[2] + dtheta)
        
        # Compute Jacobian of motion model F = d(new_state)/d(old_state)
        # For simple additive model: F = I
        F = np.eye(3)
        
        # But the motion also depends on the control input through the heading
        # For a more accurate model, we'd have:
        # x' = x + dx * cos(theta) - dy * sin(theta)  (if dx, dy are body frame)
        # Here we're using world-frame deltas, so F = I is correct
        
        # Build process noise Q based on motion magnitude
        linear_motion = math.sqrt(dx * dx + dy * dy)
        angular_motion = abs(dtheta)
        
        # Scale noise by motion magnitude (uncertainty grows with movement)
        q_x = self._q_linear * (1.0 + 2.0 * linear_motion)
        q_y = self._q_linear * (1.0 + 2.0 * linear_motion)
        q_theta = self._q_angular * (1.0 + 2.0 * angular_motion)
        
        Q = np.diag([q_x, q_y, q_theta])
        
        # Covariance prediction: P' = F * P * F^T + Q
        self._P = F @ self._P @ F.T + Q
        
        # Ensure covariance stays symmetric and positive definite
        self._P = 0.5 * (self._P + self._P.T)
        
        # Store current odometry pose for next delta computation
        self._last_odom_pose = odom_pose
        
        return self.get_pose()
    
    def update_from_slam(
        self,
        slam_x: float,
        slam_y: float,
        slam_theta: float,
        slam_covariance: np.ndarray | None = None,
    ) -> FusedPose:
        """Measurement update using SLAM pose estimate.
        
        This applies a Kalman filter correction using the SLAM-derived pose
        as a measurement. The correction is weighted by the relative uncertainties
        of the prediction and measurement.
        
        Args:
            slam_x: SLAM estimated x position
            slam_y: SLAM estimated y position
            slam_theta: SLAM estimated heading
            slam_covariance: Optional 3x3 SLAM covariance (uses default R if None)
            
        Returns:
            Updated fused pose estimate
        """
        # Measurement vector
        z = np.array([slam_x, slam_y, slam_theta], dtype=np.float64)
        
        # Use provided SLAM covariance or default
        R = slam_covariance if slam_covariance is not None else self._R
        
        # Innovation (measurement residual): y = z - H * x
        y = z - self._H @ self._state
        # Wrap angle difference
        y[2] = _wrap_angle(y[2])
        
        # Innovation covariance: S = H * P * H^T + R
        S = self._H @ self._P @ self._H.T + R
        
        # Kalman gain: K = P * H^T * S^(-1)
        try:
            K = self._P @ self._H.T @ np.linalg.inv(S)
        except np.linalg.LinAlgError:
            # If S is singular, skip this update
            return self.get_pose()
        
        # State update: x' = x + K * y
        self._state = self._state + K @ y
        self._state[2] = _wrap_angle(self._state[2])
        
        # Covariance update: P' = (I - K * H) * P
        # Use Joseph form for numerical stability:
        # P' = (I - K*H) * P * (I - K*H)^T + K * R * K^T
        IKH = np.eye(3) - K @ self._H
        self._P = IKH @ self._P @ IKH.T + K @ R @ K.T
        
        # Ensure covariance stays symmetric
        self._P = 0.5 * (self._P + self._P.T)
        
        return self.get_pose()
    
    def update_from_slam_if_significant(
        self,
        slam_x: float,
        slam_y: float,
        slam_theta: float,
        slam_covariance: np.ndarray | None = None,
        position_threshold: float = 0.5,
        angle_threshold: float = 0.3,
    ) -> Tuple[FusedPose, bool]:
        """Update from SLAM, tracking whether the correction was large.
        
        The Kalman filter always applies SLAM updates - the covariance-based
        weighting (Kalman gain) naturally handles how much to trust each source.
        Rejecting SLAM updates based on a fixed threshold breaks the filter's
        ability to correct accumulated drift.
        
        Args:
            slam_x: SLAM estimated x position
            slam_y: SLAM estimated y position  
            slam_theta: SLAM estimated heading
            slam_covariance: Optional 3x3 SLAM covariance
            position_threshold: Threshold for logging large corrections (m)
            angle_threshold: Threshold for logging large corrections (rad)
            
        Returns:
            Tuple of (updated pose, whether correction was small)
        """
        # Compute how large the correction will be
        dx = slam_x - self._state[0]
        dy = slam_y - self._state[1]
        dtheta = abs(_wrap_angle(slam_theta - self._state[2]))
        dist = math.sqrt(dx * dx + dy * dy)
        
        # Always apply the SLAM update - let Kalman gain handle the weighting
        # The filter's covariance tracks uncertainty and weights appropriately
        pose = self.update_from_slam(slam_x, slam_y, slam_theta, slam_covariance)
        
        # Return whether the correction was "small" (for logging purposes)
        was_small = dist <= position_threshold and dtheta <= angle_threshold
        return pose, was_small
    
    def sync_odometry_reference(
        self,
        odom_x: float,
        odom_y: float,
        odom_theta: float,
    ) -> None:
        """Synchronize the odometry reference without changing the state.
        
        Call this after a SLAM update to reset the odometry delta computation
        baseline. This prevents accumulating error from the odometry-SLAM
        difference.
        
        Args:
            odom_x: Current odometry x position
            odom_y: Current odometry y position
            odom_theta: Current odometry heading
        """
        self._last_odom_pose = np.array(
            [odom_x, odom_y, odom_theta], dtype=np.float64
        )


__all__ = ["PoseEKF", "FusedPose"]

