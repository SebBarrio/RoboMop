"""Pose PID Path Control Test

Drives geometric paths using encoder-based differential-drive odometry and a
cascaded controller:
  - Outer loop: XY distance PID -> linear velocity v, heading PID -> angular rate ω
  - Inner loop: wheel-speed PID per side -> motor voltages

Hardware:
  - PCA9685 PWM (two channels per motor; 4 motors total)
  - Two quadrature encoders, one per side (left encoder index 1, right index 0)

Safety:
  - Run in a safe, open area. Start with low velocity/turn-rate limits.
  - Ctrl+C triggers stop and cleanup.

Modes:
  - triangle: Equilateral triangle
  - line: Straight line segment along +X
"""

from __future__ import annotations

import argparse
import json
import math
import os
import socket
import sys
import threading
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional, Sequence, Tuple

# Add src to path for IMU imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))

import board
import busio
from adafruit_pca9685 import PCA9685
from gpiozero import RotaryEncoder

from sensors.imu import MPU9250, ImuSample

# Use non-interactive backend for headless plotting
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np


# ---------------------------- Geometry and Hardware ----------------------------

# PWM channels per motor (forward_channel, reverse_channel)
# Motor 0: (0, 1), Motor 1: (2, 3), Motor 2: (4, 5), Motor 3: (6, 7)
MOTOR_CHANNELS: Sequence[Tuple[int, int]] = ((0, 1), (2, 3), (4, 5), (6, 7))

# Encoders: index 0 on pins (13, 26), index 1 on pins (5, 6)
# Per user mapping: left encoder = 1, right encoder = 0
ENCODER_CHANNELS: Sequence[Tuple[int, int]] = ((13, 26), (5, 6))
LEFT_ENCODER_INDEX: int = 1
RIGHT_ENCODER_INDEX: int = 0

# Left motors = indices [0, 1]; Right motors = [2, 3]
LEFT_MOTOR_INDICES: Tuple[int, int] = (0, 1)
RIGHT_MOTOR_INDICES: Tuple[int, int] = (2, 3)

# Physical dimensions
WHEEL_DIAMETER_M: float = 0.1524
TRACK_WIDTH_M: float = 0.300

# Encoder configuration
ENCODER_PULSES_PER_REV: int = 400
ENCODER_ON_OUTPUT_SHAFT: bool = True

# Electrical / control
SUPPLY_VOLTAGE: float = 12.0
PWM_FREQUENCY: int = 1000
PWM_MIN: int = 0
PWM_MAX: int = 0xFFFF

CONTROL_INTERVAL_S: float = 0.02  # 50 Hz

# Motor polarity
# Right side wiring is reversed; apply -1 polarity to right commands only.
RIGHT_SIDE_POLARITY: float = -1.0

# Encoder speed filtering (tunable)
# First-order low-pass time constant and a small accumulation window to
# reduce quantization noise at low speeds.
SPEED_LP_TAU_S_DEFAULT: float = 0.12
SPEED_WINDOW_MIN_S: float = 0.06
SPEED_WINDOW_MIN_COUNTS: int = 2

# Outer-loop defaults
POS_KP_DEFAULT: float = 1.2
POS_KI_DEFAULT: float = 0.0
POS_KD_DEFAULT: float = 0.0

HEADING_KP_DEFAULT: float = 3.0
HEADING_KI_DEFAULT: float = 0.0
HEADING_KD_DEFAULT: float = 0.1

V_MAX_DEFAULT_MPS: float = 0.6
W_MAX_DEFAULT_RADPS: float = 2.0

# Inner wheel-speed PID defaults (rad/s -> Volts)
WS_KP_DEFAULT: float = 0.45
WS_KI_DEFAULT: float = 0.2
WS_KD_DEFAULT: float = 0.01

# Path defaults
SIDE_LENGTH_M_DEFAULT: float = 1.0
POS_TOL_M: float = 0.02
ANG_TOL_RAD: float = math.radians(2.0)

# Heading gating: do not move forward until roughly aligned
HEADING_MOVE_GATE_DEG_DEFAULT: float = 6.0

# Rotation settle/hold time (stay within tolerance for this time)
ROTATE_HOLD_TIME_S_DEFAULT: float = 0.35

# Desired wheel-speed (setpoint) shaping
#  - First-order low-pass on the desired omega
#  - Slew-rate limiter to cap step changes per tick (rad/s^2)
SETPOINT_LP_TAU_S_DEFAULT: float = 0.10
SETPOINT_SLEW_RADPS2_DEFAULT: float = 50.0


# ------------------------------ Utility helpers -------------------------------


def wrap_angle(angle_rad: float) -> float:
    """Wrap angle to (-pi, pi]."""
    a = (angle_rad + math.pi) % (2.0 * math.pi)
    if a <= 0.0:
        return a + math.pi
    return a - math.pi


def forward_kinematics(
    omega_left_rad_s: float,
    omega_right_rad_s: float,
    track_width_m: float,
    wheel_radius_m: float,
) -> Tuple[float, float]:
    """Compute body linear and angular velocity from wheel angular speeds.

    Returns (v_bx, omega_bz).
    """
    v_left = wheel_radius_m * omega_left_rad_s
    v_right = wheel_radius_m * omega_right_rad_s
    v_bx = 0.5 * (v_right + v_left)
    omega_bz = (v_right - v_left) / track_width_m
    return v_bx, omega_bz


def inverse_kinematics(
    v_bx_m_s: float,
    omega_bz_rad_s: float,
    track_width_m: float,
    wheel_radius_m: float,
) -> Tuple[float, float]:
    """Compute wheel angular speeds from body linear and angular velocity.

    Implements the differential-drive model:
      v_left  = v_bx - (omega_bz * w / 2)
      v_right = v_bx + (omega_bz * w / 2)
      omega   = v / r
    Returns (omega_left, omega_right) in rad/s.
    """
    v_left = v_bx_m_s - (omega_bz_rad_s * (track_width_m / 2.0))
    v_right = v_bx_m_s + (omega_bz_rad_s * (track_width_m / 2.0))
    return (v_left / wheel_radius_m, v_right / wheel_radius_m)


@dataclass(frozen=True)
class MotorConfig:
    index: int
    forward_channel: int
    reverse_channel: int


@dataclass(frozen=True)
class IMUConfig:
    bus: int
    address: int
    heading_alpha: float
    position_alpha: float


class PIDController:
    """Simple PID with integrator clamping."""

    def __init__(
        self,
        kp: float,
        ki: float,
        kd: float,
        integrator_limit: float = 1.0,
    ) -> None:
        self._kp = kp
        self._ki = ki
        self._kd = kd
        self._integrator = 0.0
        self._prev_error = 0.0
        self._integrator_limit = integrator_limit

    def reset(self) -> None:
        self._integrator = 0.0
        self._prev_error = 0.0

    def update(self, error: float, dt: float) -> float:
        self._integrator += error * dt
        self._integrator = max(
            -self._integrator_limit, min(self._integrator, self._integrator_limit)
        )
        derivative = (error - self._prev_error) / dt if dt > 0 else 0.0
        self._prev_error = error
        return (self._kp * error) + (self._ki * self._integrator) + (self._kd * derivative)


class SetpointShaper:
    """Slew-rate + first-order low-pass filter for setpoint shaping.

    This reduces sharp peaks in desired wheel angular speed to better match
    drivetrain backlash and actuator latency.
    """

    def __init__(self, slew_rate_radps2: float, lp_tau_s: float) -> None:
        self._slew = max(0.0, float(slew_rate_radps2))
        self._tau = max(0.0, float(lp_tau_s))
        self._last_slewed = 0.0
        self._y = 0.0

    def reset(self) -> None:
        self._last_slewed = 0.0
        self._y = 0.0

    def shape(self, target: float, dt: float) -> float:
        # Slew-rate limit the target first
        if dt > 0.0 and self._slew > 0.0:
            max_step = self._slew * dt
            delta = target - self._last_slewed
            if delta > max_step:
                slewed = self._last_slewed + max_step
            elif delta < -max_step:
                slewed = self._last_slewed - max_step
            else:
                slewed = target
        else:
            slewed = target
        self._last_slewed = slewed

        # Then apply a first-order low-pass
        if dt > 0.0 and self._tau > 0.0:
            alpha = dt / (self._tau + dt)
            self._y = self._y + alpha * (slewed - self._y)
        else:
            self._y = slewed
        return self._y


class MotorController:
    """Drives individual motors and provides side-level control convenience."""

    def __init__(self, pwm_board: PCA9685, motor_configs: Sequence[MotorConfig]) -> None:
        self._pwm_board = pwm_board
        self._configs = tuple(motor_configs)
        self._motors = {config.index: config for config in self._configs}

    def set_voltage(self, motor_index: int, voltage_command: float) -> None:
        """Command motor voltage in [-SUPPLY_VOLTAGE, SUPPLY_VOLTAGE]."""
        config = self._motors[motor_index]
        v_cmd = max(-SUPPLY_VOLTAGE, min(voltage_command, SUPPLY_VOLTAGE))
        duty = abs(v_cmd) / SUPPLY_VOLTAGE
        level = int(PWM_MIN + (PWM_MAX - PWM_MIN) * duty)
        if v_cmd >= 0:
            self._pwm_board.channels[config.forward_channel].duty_cycle = level
            self._pwm_board.channels[config.reverse_channel].duty_cycle = PWM_MIN
        else:
            self._pwm_board.channels[config.forward_channel].duty_cycle = PWM_MIN
            self._pwm_board.channels[config.reverse_channel].duty_cycle = level

    def set_side_voltages(self, v_left: float, v_right: float) -> None:
        for idx in LEFT_MOTOR_INDICES:
            self.set_voltage(idx, v_left)
        for idx in RIGHT_MOTOR_INDICES:
            self.set_voltage(idx, RIGHT_SIDE_POLARITY * v_right)

    def stop_all(self) -> None:
        for cfg in self._configs:
            self._pwm_board.channels[cfg.forward_channel].duty_cycle = PWM_MIN
            self._pwm_board.channels[cfg.reverse_channel].duty_cycle = PWM_MIN


class SideEncoderReader:
    """Reads left/right encoder steps and computes filtered wheel speeds."""

    def __init__(self, encoder_channels: Sequence[Tuple[int, int]], pulses_per_rev: int) -> None:
        self._ppr = float(pulses_per_rev)
        # Instantiate encoders by index
        self._encoders = {
            idx: RotaryEncoder(pins[0], pins[1], max_steps=0)
            for idx, pins in enumerate(encoder_channels)
        }
        self._last_counts = {
            "left": self._encoders[LEFT_ENCODER_INDEX].steps,
            "right": self._encoders[RIGHT_ENCODER_INDEX].steps,
        }
        self._omega_filtered = {"left": 0.0, "right": 0.0}
        self._r = WHEEL_DIAMETER_M / 2.0

    def read_counts(self) -> Tuple[int, int]:
        left = self._encoders[LEFT_ENCODER_INDEX].steps
        right = self._encoders[RIGHT_ENCODER_INDEX].steps
        return left, right

    def read_wheel_omegas(self, dt: float) -> Tuple[float, float]:
        """Return (omega_left, omega_right) in rad/s based on encoder deltas."""
        MIN_DT = 0.001
        if dt < MIN_DT:
            return 0.0, 0.0
        left_steps = self._encoders[LEFT_ENCODER_INDEX].steps
        right_steps = self._encoders[RIGHT_ENCODER_INDEX].steps
        d_left_steps = left_steps - self._last_counts["left"]
        d_right_steps = right_steps - self._last_counts["right"]
        self._last_counts["left"] = left_steps
        self._last_counts["right"] = right_steps

        # Steps -> rotations -> radians
        rot_l = d_left_steps / self._ppr
        rot_r = d_right_steps / self._ppr
        dtheta_l = 2.0 * math.pi * rot_l
        dtheta_r = 2.0 * math.pi * rot_r

        # Wheel angular speed (rad/s)
        omega_l_raw = dtheta_l / dt
        omega_r_raw = dtheta_r / dt

        # Low-pass filter
        tau = 0.04
        alpha = dt / (tau + dt)
        omega_l = self._omega_filtered["left"] + alpha * (omega_l_raw - self._omega_filtered["left"])
        omega_r = self._omega_filtered["right"] + alpha * (omega_r_raw - self._omega_filtered["right"])
        self._omega_filtered["left"] = omega_l
        self._omega_filtered["right"] = omega_r
        return omega_l, omega_r

    def close(self) -> None:
        for enc in self._encoders.values():
            enc.close()


class DifferentialOdometry:
    """Differential-drive odometry using encoder counts."""

    def __init__(self, encoder_reader: SideEncoderReader, speed_lp_tau_s: float = SPEED_LP_TAU_S_DEFAULT) -> None:
        self._enc = encoder_reader
        self.x = 0.0
        self.y = 0.0
        self.psi = 0.0
        self._prev_counts = self._enc.read_counts()
        self._r = WHEEL_DIAMETER_M / 2.0
        self._omega_filt_l = 0.0
        self._omega_filt_r = 0.0
        self._speed_tau = float(max(1e-3, speed_lp_tau_s))

    def update(self, dt: float) -> Tuple[float, float, float, float, float]:
        """Update pose. Returns (x, y, psi, omega_l, omega_r)."""
        MIN_DT = 0.001
        if dt < MIN_DT:
            omegas = self._enc.read_wheel_omegas(dt)
            return self.x, self.y, self.psi, omegas[0], omegas[1]

        counts_l, counts_r = self._enc.read_counts()
        prev_l, prev_r = self._prev_counts
        self._prev_counts = (counts_l, counts_r)

        d_left_steps = counts_l - prev_l
        d_right_steps = counts_r - prev_r

        rot_l = d_left_steps / float(ENCODER_PULSES_PER_REV)
        rot_r = d_right_steps / float(ENCODER_PULSES_PER_REV)
        dtheta_l = 2.0 * math.pi * rot_l
        dtheta_r = 2.0 * math.pi * rot_r
        ds_l = self._r * dtheta_l
        ds_r = self._r * dtheta_r
        ds = 0.5 * (ds_l + ds_r)
        dpsi = (ds_r - ds_l) / TRACK_WIDTH_M

        # Midpoint heading integration
        self.x += ds * math.cos(self.psi + 0.5 * dpsi)
        self.y += ds * math.sin(self.psi + 0.5 * dpsi)
        self.psi = wrap_angle(self.psi + dpsi)

        # Measured wheel speeds (low-pass filtered)
        omega_l_raw = dtheta_l / dt
        omega_r_raw = dtheta_r / dt
        alpha = dt / (self._speed_tau + dt)
        self._omega_filt_l = self._omega_filt_l + alpha * (omega_l_raw - self._omega_filt_l)
        self._omega_filt_r = self._omega_filt_r + alpha * (omega_r_raw - self._omega_filt_r)
        return self.x, self.y, self.psi, self._omega_filt_l, self._omega_filt_r




class IMUSocketServer:
    """Broadcasts IMU data over TCP socket for external visualization."""

    def __init__(self, host: str = "0.0.0.0", port: int = 9250) -> None:
        self.host = host
        self.port = port
        self.server_socket: Optional[socket.socket] = None
        self.client_socket: Optional[socket.socket] = None
        self.running = False
        self.accept_thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()

    def start(self) -> bool:
        """Start the socket server."""
        try:
            self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.server_socket.bind((self.host, self.port))
            self.server_socket.listen(1)
            self.server_socket.settimeout(1.0)
            self.running = True
            
            # Start accept thread
            self.accept_thread = threading.Thread(target=self._accept_loop, daemon=True)
            self.accept_thread.start()
            
            print(f"IMU socket server listening on {self.host}:{self.port}")
            return True
        except Exception as exc:
            print(f"Failed to start IMU socket server: {exc}")
            return False

    def _accept_loop(self) -> None:
        """Accept client connections in background thread."""
        while self.running:
            try:
                client, addr = self.server_socket.accept()
                with self._lock:
                    if self.client_socket is not None:
                        try:
                            self.client_socket.close()
                        except Exception:
                            pass
                    self.client_socket = client
                    self.client_socket.settimeout(1.0)
                print(f"IMU visualizer connected from {addr}")
            except socket.timeout:
                continue
            except Exception as exc:
                if self.running:
                    print(f"Accept error: {exc}")
                break

    def send_sample(self, sample: ImuSample) -> None:
        """Send an IMU sample to connected client."""
        with self._lock:
            if self.client_socket is None:
                return
            
            try:
                # Convert ImuSample to dict format expected by visualizer
                data = {
                    "timestamp": sample.timestamp_s,
                    "accelerometer": {
                        "x": sample.acceleration_m_s2.x,
                        "y": sample.acceleration_m_s2.y,
                        "z": sample.acceleration_m_s2.z,
                    },
                    "gyroscope": {
                        "x": math.degrees(sample.angular_velocity_rad_s.x),
                        "y": math.degrees(sample.angular_velocity_rad_s.y),
                        "z": math.degrees(sample.angular_velocity_rad_s.z),
                    },
                    "temperature": sample.temperature_c,
                }
                
                # Add magnetometer if available
                if sample.magnetic_field_uT is not None:
                    data["magnetometer"] = {
                        "x": sample.magnetic_field_uT.x,
                        "y": sample.magnetic_field_uT.y,
                        "z": sample.magnetic_field_uT.z,
                    }
                
                # Send as JSON line
                json_str = json.dumps(data) + "\n"
                self.client_socket.sendall(json_str.encode("utf-8"))
            except (BrokenPipeError, ConnectionResetError):
                # Client disconnected
                self.client_socket = None
            except Exception:
                # Silently ignore send errors
                pass

    def stop(self) -> None:
        """Stop the socket server."""
        self.running = False
        
        with self._lock:
            if self.client_socket is not None:
                try:
                    self.client_socket.close()
                except Exception:
                    pass
                self.client_socket = None
        
        if self.server_socket is not None:
            try:
                self.server_socket.close()
            except Exception:
                pass
            self.server_socket = None
        
        if self.accept_thread is not None:
            self.accept_thread.join(timeout=2.0)


class IMUFusion:
    """Fuses odometry with IMU data for improved pose estimation."""

    def __init__(self, heading_alpha: float, position_alpha: float) -> None:
        self._heading_alpha = min(0.999, max(0.0, heading_alpha))
        self._position_alpha = min(0.999, max(0.0, position_alpha))
        self.x = 0.0
        self.y = 0.0
        self.psi = 0.0
        self._vx_imu = 0.0
        self._vy_imu = 0.0
        self._last_odom: Optional[Tuple[float, float, float]] = None

    def reset(self, x: float, y: float, psi: float) -> None:
        self.x = x
        self.y = y
        self.psi = psi
        self._vx_imu = 0.0
        self._vy_imu = 0.0
        self._last_odom = (x, y, psi)

    def update(
        self,
        dt: float,
        odom_x: float,
        odom_y: float,
        odom_psi: float,
        imu_sample: Optional[ImuSample],
    ) -> Tuple[float, float, float]:
        """Update fused pose estimate.
        
        Args:
            dt: Time step in seconds
            odom_x, odom_y, odom_psi: Odometry-based pose
            imu_sample: IMU sample from MPU9250, or None if unavailable
            
        Returns:
            Tuple of (x, y, psi) fused pose estimate
        """
        if self._last_odom is None:
            self.reset(odom_x, odom_y, odom_psi)
            return self.x, self.y, self.psi

        if imu_sample is None or dt <= 0.0:
            self._last_odom = (odom_x, odom_y, odom_psi)
            self.x = odom_x
            self.y = odom_y
            self.psi = odom_psi
            self._vx_imu = 0.0
            self._vy_imu = 0.0
            return self.x, self.y, self.psi

        # Extract IMU data from sample
        gyro_z = imu_sample.angular_velocity_rad_s.z
        accel_x = imu_sample.acceleration_m_s2.x
        accel_y = imu_sample.acceleration_m_s2.y

        # Fuse heading using gyro integration and odometry
        psi_pred = wrap_angle(self.psi + gyro_z * dt)
        psi_fused = wrap_angle(
            (self._heading_alpha * psi_pred) + ((1.0 - self._heading_alpha) * odom_psi)
        )

        # Transform acceleration to world frame
        cos_psi = math.cos(psi_fused)
        sin_psi = math.sin(psi_fused)
        ax_world = (accel_x * cos_psi) - (accel_y * sin_psi)
        ay_world = (accel_x * sin_psi) + (accel_y * cos_psi)

        # Integrate acceleration for IMU-based velocity
        self._vx_imu += ax_world * dt
        self._vy_imu += ay_world * dt

        # Compute odometry velocity
        dx_odom = odom_x - self._last_odom[0]
        dy_odom = odom_y - self._last_odom[1]
        odom_vx = dx_odom / dt
        odom_vy = dy_odom / dt

        # Blend IMU and odometry velocities
        vx_blend = (self._position_alpha * self._vx_imu) + ((1.0 - self._position_alpha) * odom_vx)
        vy_blend = (self._position_alpha * self._vy_imu) + ((1.0 - self._position_alpha) * odom_vy)

        # Predict position and fuse with odometry
        pred_x = self.x + vx_blend * dt
        pred_y = self.y + vy_blend * dt
        self.x = (self._position_alpha * pred_x) + ((1.0 - self._position_alpha) * odom_x)
        self.y = (self._position_alpha * pred_y) + ((1.0 - self._position_alpha) * odom_y)
        self.psi = psi_fused
        self._last_odom = (odom_x, odom_y, odom_psi)
        return self.x, self.y, self.psi

    def current_state(self) -> Tuple[float, float, float]:
        return self.x, self.y, self.psi

class PoseController:
    """Outer-loop controller that computes (v, omega) for pose regulation."""

    def __init__(
        self,
        pos_pid: PIDController,
        heading_pid: PIDController,
        v_max: float,
        w_max: float,
    ) -> None:
        self._pos_pid = pos_pid
        self._heading_pid = heading_pid
        self._v_max = v_max
        self._w_max = w_max

    def compute_to_waypoint(
        self, x: float, y: float, psi: float, goal_x: float, goal_y: float, dt: float
    ) -> Tuple[float, float, float, float]:
        """Return (v, w, dist_error, heading_error_to_goal)."""
        dx = goal_x - x
        dy = goal_y - y
        dist = math.hypot(dx, dy)
        desired_heading = math.atan2(dy, dx) if dist > 1e-6 else psi
        heading_error = wrap_angle(desired_heading - psi)

        # Distance PID for forward velocity (always non-negative command)
        v_cmd = self._pos_pid.update(dist, dt)

        # Reduce forward velocity when facing away
        v_cmd *= max(0.0, math.cos(heading_error))

        # Heading PID for angular rate
        w_cmd = self._heading_pid.update(heading_error, dt)

        # Saturations
        v_cmd = max(-self._v_max, min(v_cmd, self._v_max))
        w_cmd = max(-self._w_max, min(w_cmd, self._w_max))
        return v_cmd, w_cmd, dist, heading_error

    def compute_rotate_to(
        self, psi: float, target_psi: float, dt: float
    ) -> Tuple[float, float]:
        """Rotate in place to target heading. Returns (v=0, w)."""
        heading_error = wrap_angle(target_psi - psi)
        w_cmd = self._heading_pid.update(heading_error, dt)
        w_cmd = max(-self._w_max, min(w_cmd, self._w_max))
        return 0.0, w_cmd


def build_motor_configs() -> Sequence[MotorConfig]:
    return [
        MotorConfig(index=idx, forward_channel=ch[0], reverse_channel=ch[1])
        for idx, ch in enumerate(MOTOR_CHANNELS)
    ]


def triangle_waypoints(side_length_m: float) -> Sequence[Tuple[float, float]]:
    l = side_length_m
    return [
        (0.0, 0.0),
        (l, 0.0),
        (0.5 * l, (math.sqrt(3.0) / 2.0) * l),
        (0.0, 0.0),
    ]


def line_waypoints(length_m: float) -> Sequence[Tuple[float, float]]:
    """Return waypoints for a straight line along +X."""
    return [
        (0.0, 0.0),
        (length_m, 0.0),
    ]


def run_triangle(
    side_length_m: float,
    v_max: float,
    w_max: float,
    pos_kp: float,
    pos_ki: float,
    pos_kd: float,
    heading_kp: float,
    heading_ki: float,
    heading_kd: float,
    ws_kp: float,
    ws_ki: float,
    ws_kd: float,
    setpoint_lp_tau_s: float = SETPOINT_LP_TAU_S_DEFAULT,
    setpoint_slew_radps2: float = SETPOINT_SLEW_RADPS2_DEFAULT,
    imu_config: Optional[IMUConfig] = None,
    imu_socket_port: Optional[int] = None,
    imu_calibration_samples: int = 100,
) -> None:
    """Main control loop to execute the triangle path."""
    # Hardware init
    i2c = busio.I2C(board.SCL, board.SDA)
    pwm = PCA9685(i2c)
    pwm.frequency = PWM_FREQUENCY
    controller = MotorController(pwm, build_motor_configs())
    encoders = SideEncoderReader(ENCODER_CHANNELS, ENCODER_PULSES_PER_REV)
    odom = DifferentialOdometry(encoders, speed_lp_tau_s=SPEED_LP_TAU_S_DEFAULT)

    imu_sensor: Optional[MPU9250] = None
    imu_fusion: Optional[IMUFusion] = None
    imu_socket_server: Optional[IMUSocketServer] = None
    
    if imu_config is not None:
        try:
            imu_sensor = MPU9250(
                bus=imu_config.bus,
                address=imu_config.address,
                sample_rate_hz=50.0,  # Match control loop rate
                filter_alpha=imu_config.heading_alpha,
            )
            imu_sensor.initialize()
            
            # Start socket server if requested
            if imu_socket_port is not None:
                imu_socket_server = IMUSocketServer(port=imu_socket_port)
                imu_socket_server.start()
            
            # Calibration period: collect samples while stationary
            print(f"\n{'=' * 60}")
            print("⚠️  IMU CALIBRATION PHASE")
            print(f"{'=' * 60}")
            print(f"Collecting {imu_calibration_samples} samples for stabilization...")
            print("KEEP THE ROBOT COMPLETELY STILL during calibration!")
            print(f"{'=' * 60}\n")
            
            calibration_start = time.monotonic()
            for sample_idx in range(imu_calibration_samples):
                sample = imu_sensor.read_sample()
                if imu_socket_server is not None:
                    imu_socket_server.send_sample(sample)
                
                # Progress indicator
                if (sample_idx + 1) % 20 == 0:
                    elapsed = time.monotonic() - calibration_start
                    progress = (sample_idx + 1) / imu_calibration_samples * 100
                    print(f"  Calibration: {sample_idx + 1}/{imu_calibration_samples} "
                          f"({progress:.0f}%) - {elapsed:.1f}s elapsed")
                
                time.sleep(0.02)  # 50 Hz
            
            print(f"\n✓ IMU calibration complete ({time.monotonic() - calibration_start:.1f}s)")
            print(f"{'=' * 60}\n")
            
            imu_fusion = IMUFusion(
                heading_alpha=imu_config.heading_alpha,
                position_alpha=imu_config.position_alpha,
            )
            imu_fusion.reset(odom.x, odom.y, odom.psi)
            print("IMU fusion enabled\n")
        except Exception as exc:
            imu_sensor = None
            imu_fusion = None
            if imu_socket_server is not None:
                imu_socket_server.stop()
                imu_socket_server = None
            print(f"Warning: IMU initialization failed ({exc}); continuing without fusion")

    # Setpoint shapers for desired wheel speeds
    sp_left = SetpointShaper(slew_rate_radps2=setpoint_slew_radps2, lp_tau_s=setpoint_lp_tau_s)
    sp_right = SetpointShaper(slew_rate_radps2=setpoint_slew_radps2, lp_tau_s=setpoint_lp_tau_s)

    # Controllers
    pos_pid = PIDController(pos_kp, pos_ki, pos_kd, integrator_limit=2.0)
    heading_pid = PIDController(heading_kp, heading_ki, heading_kd, integrator_limit=2.0)
    pose_ctrl = PoseController(pos_pid, heading_pid, v_max=v_max, w_max=w_max)
    ws_left_pid = PIDController(ws_kp, ws_ki, ws_kd, integrator_limit=SUPPLY_VOLTAGE)
    ws_right_pid = PIDController(ws_kp, ws_ki, ws_kd, integrator_limit=SUPPLY_VOLTAGE)

    # Logs
    times: list[float] = []
    xs: list[float] = []
    ys: list[float] = []
    psis: list[float] = []
    v_cmds: list[float] = []
    w_cmds: list[float] = []
    omega_l_des_log: list[float] = []
    omega_r_des_log: list[float] = []
    omega_l_meas_log: list[float] = []
    omega_r_meas_log: list[float] = []
    v_left_volts: list[float] = []
    v_right_volts: list[float] = []

    try:
        waypoints = triangle_waypoints(side_length_m)
        start_time = time.monotonic()
        last_ts = start_time

        # Execute each leg
        for wp_idx in range(1, len(waypoints)):
            goal_x, goal_y = waypoints[wp_idx]

            # Goto waypoint
            leg_start = time.monotonic()
            while True:
                now = time.monotonic()
                dt = now - last_ts
                last_ts = now

                # Update odometry and measured wheel speeds
                odom_x, odom_y, odom_psi, omega_l_meas, omega_r_meas = odom.update(dt)
                if imu_fusion is not None:
                    imu_sample = imu_sensor.read_sample() if imu_sensor is not None else None
                    if imu_sample is not None and imu_socket_server is not None:
                        imu_socket_server.send_sample(imu_sample)
                    x, y, psi = imu_fusion.update(dt, odom_x, odom_y, odom_psi, imu_sample)
                else:
                    x, y, psi = odom_x, odom_y, odom_psi

                # Outer loop
                v_cmd, w_cmd, dist, heading_err = pose_ctrl.compute_to_waypoint(
                    x, y, psi, goal_x, goal_y, dt
                )

                # Heading gating: suppress forward motion until roughly aligned
                if abs(math.degrees(heading_err)) > HEADING_MOVE_GATE_DEG_DEFAULT:
                    v_cmd = 0.0

                # Inverse kinematics -> desired wheel angular speeds (rad/s)
                r = WHEEL_DIAMETER_M / 2.0
                omega_l_des_raw, omega_r_des_raw = inverse_kinematics(
                    v_cmd, w_cmd, TRACK_WIDTH_M, r
                )

                # Shape desired wheel speeds
                omega_l_des = sp_left.shape(omega_l_des_raw, dt)
                omega_r_des = sp_right.shape(omega_r_des_raw, dt)

                # Inner wheel-speed PID -> voltages
                err_l = omega_l_des - omega_l_meas
                err_r = omega_r_des - omega_r_meas
                v_left = ws_left_pid.update(err_l, dt)
                v_right = ws_right_pid.update(err_r, dt)
                v_left = max(-SUPPLY_VOLTAGE, min(v_left, SUPPLY_VOLTAGE))
                v_right = max(-SUPPLY_VOLTAGE, min(v_right, SUPPLY_VOLTAGE))
                controller.set_side_voltages(v_left, v_right)

                # Logs
                t_rel = now - start_time
                times.append(t_rel)
                xs.append(x)
                ys.append(y)
                psis.append(psi)
                v_cmds.append(v_cmd)
                w_cmds.append(w_cmd)
                omega_l_des_log.append(omega_l_des)
                omega_r_des_log.append(omega_r_des)
                omega_l_meas_log.append(omega_l_meas)
                omega_r_meas_log.append(omega_r_meas)
                v_left_volts.append(v_left)
                v_right_volts.append(v_right)

                # Check convergence or timeout
                if dist <= POS_TOL_M:
                    break
                if (now - leg_start) > max(10.0, 60.0 * side_length_m):
                    print("Warning: position step timeout; proceeding to next step")
                    break

                # Maintain control cadence
                time.sleep(max(0.0, CONTROL_INTERVAL_S - (time.monotonic() - now)))

            # Rotate +120 degrees relative with hold-time inside tolerance
            rotate_start = time.monotonic()
            target_psi = wrap_angle(odom.psi + (2.0 * math.pi / 3.0))
            hold_timer_start = None
            while True:
                now = time.monotonic()
                dt = now - last_ts
                last_ts = now

                odom_x, odom_y, odom_psi, omega_l_meas, omega_r_meas = odom.update(dt)
                if imu_fusion is not None:
                    imu_sample = imu_sensor.read_sample() if imu_sensor is not None else None
                    x, y, psi = imu_fusion.update(dt, odom_x, odom_y, odom_psi, imu_sample)
                else:
                    x, y, psi = odom_x, odom_y, odom_psi
                v_cmd, w_cmd = pose_ctrl.compute_rotate_to(psi, target_psi, dt)

                # Inverse kinematics for pure rotation (v=0)
                r = WHEEL_DIAMETER_M / 2.0
                omega_l_des_raw, omega_r_des_raw = inverse_kinematics(
                    0.0, w_cmd, TRACK_WIDTH_M, r
                )

                # Shape desired wheel speeds for rotation as well
                omega_l_des = sp_left.shape(omega_l_des_raw, dt)
                omega_r_des = sp_right.shape(omega_r_des_raw, dt)

                # Wheel speed PID
                err_l = omega_l_des - omega_l_meas
                err_r = omega_r_des - omega_r_meas
                v_left = ws_left_pid.update(err_l, dt)
                v_right = ws_right_pid.update(err_r, dt)
                v_left = max(-SUPPLY_VOLTAGE, min(v_left, SUPPLY_VOLTAGE))
                v_right = max(-SUPPLY_VOLTAGE, min(v_right, SUPPLY_VOLTAGE))
                controller.set_side_voltages(v_left, v_right)

                # Logs
                t_rel = now - start_time
                times.append(t_rel)
                xs.append(x)
                ys.append(y)
                psis.append(psi)
                v_cmds.append(v_cmd)
                w_cmds.append(w_cmd)
                omega_l_des_log.append(omega_l_des)
                omega_r_des_log.append(omega_r_des)
                omega_l_meas_log.append(omega_l_meas)
                omega_r_meas_log.append(omega_r_meas)
                v_left_volts.append(v_left)
                v_right_volts.append(v_right)

                # Check completion or timeout (need to hold for some time)
                ang_err = abs(wrap_angle(target_psi - psi))
                if ang_err <= ANG_TOL_RAD:
                    if hold_timer_start is None:
                        hold_timer_start = now
                    if (now - hold_timer_start) >= ROTATE_HOLD_TIME_S_DEFAULT:
                        break
                else:
                    hold_timer_start = None
                if (now - rotate_start) > 20.0:
                    print("Warning: rotation step timeout; proceeding to next step")
                    break

                time.sleep(max(0.0, CONTROL_INTERVAL_S - (time.monotonic() - now)))

        # Stop motors after completion
        controller.stop_all()

    except KeyboardInterrupt:
        print("\nInterrupted by user")
    finally:
        try:
            controller.stop_all()
        except Exception:
            pass
        try:
            encoders.close()
        except Exception:
            pass
        try:
            if imu_sensor is not None and hasattr(imu_sensor, '_bus') and imu_sensor._bus is not None:
                imu_sensor._bus.close()
        except Exception:
            pass
        try:
            if imu_socket_server is not None:
                imu_socket_server.stop()
        except Exception:
            pass
        try:
            pwm.deinit()
        except Exception:
            pass

    # Save plots
    if times:
        os.makedirs("logs", exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        base = (
            f"triangle_{ts}_L{side_length_m:.2f}_kp{pos_kp:.2f}_kh{heading_kp:.2f}_"
            f"v{v_max:.2f}_w{w_max:.2f}_spTau{setpoint_lp_tau_s:.2f}_spSlew{setpoint_slew_radps2:.0f}"
        )

        # XY trace
        plt.figure(figsize=(8, 8))
        plt.title("XY Path Trace")
        plt.plot(xs, ys, label="trajectory")
        for gx, gy in triangle_waypoints(side_length_m):
            plt.plot(gx, gy, "ko")
        plt.axis("equal")
        plt.grid(True)
        plt.legend()
        plt.xlabel("x (m)")
        plt.ylabel("y (m)")
        plt.tight_layout()
        path_xy = os.path.join("logs", f"{base}_xy.png")
        plt.savefig(path_xy, dpi=150)
        plt.close()

        # Heading and wheel speeds
        t_arr = np.array(times)
        plt.figure(figsize=(10, 10))
        ax1 = plt.subplot(2, 1, 1)
        ax1.set_title("Heading vs Time")
        ax1.plot(t_arr, psis, label="psi (rad)")
        # Draw 120° headings to visualize target changes
        if len(psis) > 0:
            psi0 = psis[0]
            for k in range(1, 4):
                line = wrap_angle(psi0 + k * (2.0 * math.pi / 3.0))
                ax1.hlines(line, t_arr[0], t_arr[-1], colors="gray", linestyles=":", label=None)
        ax1.set_xlabel("time (s)")
        ax1.set_ylabel("psi (rad)")
        ax1.grid(True)
        ax1.legend()

        ax2 = plt.subplot(2, 1, 2)
        ax2.set_title("Wheel Speeds (filtered)")
        ax2.plot(t_arr, omega_l_des_log, "k--", label="omega_L des")
        ax2.plot(t_arr, omega_r_des_log, "k:", label="omega_R des")
        ax2.plot(t_arr, omega_l_meas_log, label="omega_L meas")
        ax2.plot(t_arr, omega_r_meas_log, label="omega_R meas")
        ax2.set_xlabel("time (s)")
        ax2.set_ylabel("rad/s")
        ax2.grid(True)
        ax2.legend()
        plt.tight_layout()
        path_hw = os.path.join("logs", f"{base}_heading_wheels.png")
        plt.savefig(path_hw, dpi=150)
        plt.close()

        print(f"Plots saved to {path_xy} and {path_hw}")


def run_line(
    length_m: float,
    v_max: float,
    w_max: float,
    pos_kp: float,
    pos_ki: float,
    pos_kd: float,
    heading_kp: float,
    heading_ki: float,
    heading_kd: float,
    ws_kp: float,
    ws_ki: float,
    ws_kd: float,
    setpoint_lp_tau_s: float = SETPOINT_LP_TAU_S_DEFAULT,
    setpoint_slew_radps2: float = SETPOINT_SLEW_RADPS2_DEFAULT,
    imu_config: Optional[IMUConfig] = None,
    imu_socket_port: Optional[int] = None,
    imu_calibration_samples: int = 100,
) -> None:
    """Main control loop to execute a straight line path (no rotations)."""
    # Hardware init
    i2c = busio.I2C(board.SCL, board.SDA)
    pwm = PCA9685(i2c)
    pwm.frequency = PWM_FREQUENCY
    controller = MotorController(pwm, build_motor_configs())
    encoders = SideEncoderReader(ENCODER_CHANNELS, ENCODER_PULSES_PER_REV)
    odom = DifferentialOdometry(encoders, speed_lp_tau_s=SPEED_LP_TAU_S_DEFAULT)

    imu_sensor: Optional[MPU9250] = None
    imu_fusion: Optional[IMUFusion] = None
    imu_socket_server: Optional[IMUSocketServer] = None
    
    if imu_config is not None:
        try:
            imu_sensor = MPU9250(
                bus=imu_config.bus,
                address=imu_config.address,
                sample_rate_hz=50.0,  # Match control loop rate
                filter_alpha=imu_config.heading_alpha,
            )
            imu_sensor.initialize()
            
            # Start socket server if requested
            if imu_socket_port is not None:
                imu_socket_server = IMUSocketServer(port=imu_socket_port)
                imu_socket_server.start()
            
            # Calibration period: collect samples while stationary
            print(f"\n{'=' * 60}")
            print("⚠️  IMU CALIBRATION PHASE")
            print(f"{'=' * 60}")
            print(f"Collecting {imu_calibration_samples} samples for stabilization...")
            print("KEEP THE ROBOT COMPLETELY STILL during calibration!")
            print(f"{'=' * 60}\n")
            
            calibration_start = time.monotonic()
            for sample_idx in range(imu_calibration_samples):
                sample = imu_sensor.read_sample()
                if imu_socket_server is not None:
                    imu_socket_server.send_sample(sample)
                
                # Progress indicator
                if (sample_idx + 1) % 20 == 0:
                    elapsed = time.monotonic() - calibration_start
                    progress = (sample_idx + 1) / imu_calibration_samples * 100
                    print(f"  Calibration: {sample_idx + 1}/{imu_calibration_samples} "
                          f"({progress:.0f}%) - {elapsed:.1f}s elapsed")
                
                time.sleep(0.02)  # 50 Hz
            
            print(f"\n✓ IMU calibration complete ({time.monotonic() - calibration_start:.1f}s)")
            print(f"{'=' * 60}\n")
            
            imu_fusion = IMUFusion(
                heading_alpha=imu_config.heading_alpha,
                position_alpha=imu_config.position_alpha,
            )
            imu_fusion.reset(odom.x, odom.y, odom.psi)
            print("IMU fusion enabled\n")
        except Exception as exc:
            imu_sensor = None
            imu_fusion = None
            if imu_socket_server is not None:
                imu_socket_server.stop()
                imu_socket_server = None
            print(f"Warning: IMU initialization failed ({exc}); continuing without fusion")

    # Setpoint shapers for desired wheel speeds
    sp_left = SetpointShaper(slew_rate_radps2=setpoint_slew_radps2, lp_tau_s=setpoint_lp_tau_s)
    sp_right = SetpointShaper(slew_rate_radps2=setpoint_slew_radps2, lp_tau_s=setpoint_lp_tau_s)

    # Controllers
    pos_pid = PIDController(pos_kp, pos_ki, pos_kd, integrator_limit=2.0)
    heading_pid = PIDController(heading_kp, heading_ki, heading_kd, integrator_limit=2.0)
    pose_ctrl = PoseController(pos_pid, heading_pid, v_max=v_max, w_max=w_max)
    ws_left_pid = PIDController(ws_kp, ws_ki, ws_kd, integrator_limit=SUPPLY_VOLTAGE)
    ws_right_pid = PIDController(ws_kp, ws_ki, ws_kd, integrator_limit=SUPPLY_VOLTAGE)

    # Logs
    times: list[float] = []
    xs: list[float] = []
    ys: list[float] = []
    psis: list[float] = []
    v_cmds: list[float] = []
    w_cmds: list[float] = []
    omega_l_des_log: list[float] = []
    omega_r_des_log: list[float] = []
    omega_l_meas_log: list[float] = []
    omega_r_meas_log: list[float] = []
    v_left_volts: list[float] = []
    v_right_volts: list[float] = []

    try:
        waypoints = line_waypoints(length_m)
        start_time = time.monotonic()
        last_ts = start_time

        # Single leg (start -> end)
        for wp_idx in range(1, len(waypoints)):
            goal_x, goal_y = waypoints[wp_idx]

            # Goto waypoint
            leg_start = time.monotonic()
            while True:
                now = time.monotonic()
                dt = now - last_ts
                last_ts = now

                # Update odometry and measured wheel speeds
                odom_x, odom_y, odom_psi, omega_l_meas, omega_r_meas = odom.update(dt)
                if imu_fusion is not None:
                    imu_sample = imu_sensor.read_sample() if imu_sensor is not None else None
                    if imu_sample is not None and imu_socket_server is not None:
                        imu_socket_server.send_sample(imu_sample)
                    x, y, psi = imu_fusion.update(dt, odom_x, odom_y, odom_psi, imu_sample)
                else:
                    x, y, psi = odom_x, odom_y, odom_psi

                # Outer loop
                v_cmd, w_cmd, dist, heading_err = pose_ctrl.compute_to_waypoint(
                    x, y, psi, goal_x, goal_y, dt
                )

                # Heading gating: suppress forward motion until roughly aligned
                if abs(math.degrees(heading_err)) > HEADING_MOVE_GATE_DEG_DEFAULT:
                    v_cmd = 0.0

                # Inverse kinematics -> desired wheel angular speeds (rad/s)
                r = WHEEL_DIAMETER_M / 2.0
                omega_l_des_raw, omega_r_des_raw = inverse_kinematics(
                    v_cmd, w_cmd, TRACK_WIDTH_M, r
                )

                # Shape desired wheel speeds
                omega_l_des = sp_left.shape(omega_l_des_raw, dt)
                omega_r_des = sp_right.shape(omega_r_des_raw, dt)

                # Inner wheel-speed PID -> voltages
                err_l = omega_l_des - omega_l_meas
                err_r = omega_r_des - omega_r_meas
                v_left = ws_left_pid.update(err_l, dt)
                v_right = ws_right_pid.update(err_r, dt)
                v_left = max(-SUPPLY_VOLTAGE, min(v_left, SUPPLY_VOLTAGE))
                v_right = max(-SUPPLY_VOLTAGE, min(v_right, SUPPLY_VOLTAGE))
                controller.set_side_voltages(v_left, v_right)

                # Logs
                t_rel = now - start_time
                times.append(t_rel)
                xs.append(x)
                ys.append(y)
                psis.append(psi)
                v_cmds.append(v_cmd)
                w_cmds.append(w_cmd)
                omega_l_des_log.append(omega_l_des)
                omega_r_des_log.append(omega_r_des)
                omega_l_meas_log.append(omega_l_meas)
                omega_r_meas_log.append(omega_r_meas)
                v_left_volts.append(v_left)
                v_right_volts.append(v_right)

                # Check convergence or timeout
                if dist <= POS_TOL_M:
                    break
                if (now - leg_start) > max(10.0, 60.0 * length_m):
                    print("Warning: position step timeout; stopping")
                    break

                # Maintain control cadence
                time.sleep(max(0.0, CONTROL_INTERVAL_S - (time.monotonic() - now)))

        # Stop motors after completion
        controller.stop_all()

    except KeyboardInterrupt:
        print("\nInterrupted by user")
    finally:
        try:
            controller.stop_all()
        except Exception:
            pass
        try:
            encoders.close()
        except Exception:
            pass
        try:
            if imu_sensor is not None and hasattr(imu_sensor, '_bus') and imu_sensor._bus is not None:
                imu_sensor._bus.close()
        except Exception:
            pass
        try:
            if imu_socket_server is not None:
                imu_socket_server.stop()
        except Exception:
            pass
        try:
            pwm.deinit()
        except Exception:
            pass

    # Save plots
    if times:
        os.makedirs("logs", exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        base = (
            f"line_{ts}_L{length_m:.2f}_kp{pos_kp:.2f}_kh{heading_kp:.2f}_"
            f"v{v_max:.2f}_w{w_max:.2f}_spTau{setpoint_lp_tau_s:.2f}_spSlew{setpoint_slew_radps2:.0f}"
        )

        # XY trace
        plt.figure(figsize=(8, 8))
        plt.title("XY Path Trace")
        plt.plot(xs, ys, label="trajectory")
        for gx, gy in waypoints:
            plt.plot(gx, gy, "ko")
        plt.axis("equal")
        plt.grid(True)
        plt.legend()
        plt.xlabel("x (m)")
        plt.ylabel("y (m)")
        plt.tight_layout()
        path_xy = os.path.join("logs", f"{base}_xy.png")
        plt.savefig(path_xy, dpi=150)
        plt.close()

        # Heading and wheel speeds
        t_arr = np.array(times)
        plt.figure(figsize=(10, 10))
        ax1 = plt.subplot(2, 1, 1)
        ax1.set_title("Heading vs Time")
        ax1.plot(t_arr, psis, label="psi (rad)")
        ax1.set_xlabel("time (s)")
        ax1.set_ylabel("psi (rad)")
        ax1.grid(True)
        ax1.legend()

        ax2 = plt.subplot(2, 1, 2)
        ax2.set_title("Wheel Speeds (filtered)")
        ax2.plot(t_arr, omega_l_des_log, "k--", label="omega_L des")
        ax2.plot(t_arr, omega_r_des_log, "k:", label="omega_R des")
        ax2.plot(t_arr, omega_l_meas_log, label="omega_L meas")
        ax2.plot(t_arr, omega_r_meas_log, label="omega_R meas")
        ax2.set_xlabel("time (s)")
        ax2.set_ylabel("rad/s")
        ax2.grid(True)
        ax2.legend()
        plt.tight_layout()
        path_hw = os.path.join("logs", f"{base}_heading_wheels.png")
        plt.savefig(path_hw, dpi=150)
        plt.close()

        print(f"Plots saved to {path_xy} and {path_hw}")


def main() -> None:
    # Declare globals at the start of the function
    global SPEED_LP_TAU_S_DEFAULT
    global HEADING_MOVE_GATE_DEG_DEFAULT
    global ROTATE_HOLD_TIME_S_DEFAULT
    
    parser = argparse.ArgumentParser(description="Pose PID path control test")
    parser.add_argument("--side-length", type=float, default=SIDE_LENGTH_M_DEFAULT)
    parser.add_argument("--v-max", type=float, default=V_MAX_DEFAULT_MPS)
    parser.add_argument("--w-max", type=float, default=W_MAX_DEFAULT_RADPS)
    parser.add_argument(
        "--mode",
        type=str,
        choices=["triangle", "line"],
        default="triangle",
        help="Path mode to execute",
    )

    parser.add_argument("--pos-kp", type=float, default=POS_KP_DEFAULT)
    parser.add_argument("--pos-ki", type=float, default=POS_KI_DEFAULT)
    parser.add_argument("--pos-kd", type=float, default=POS_KD_DEFAULT)

    parser.add_argument("--heading-kp", type=float, default=HEADING_KP_DEFAULT)
    parser.add_argument("--heading-ki", type=float, default=HEADING_KI_DEFAULT)
    parser.add_argument("--heading-kd", type=float, default=HEADING_KD_DEFAULT)

    parser.add_argument("--ws-kp", type=float, default=WS_KP_DEFAULT)
    parser.add_argument("--ws-ki", type=float, default=WS_KI_DEFAULT)
    parser.add_argument("--ws-kd", type=float, default=WS_KD_DEFAULT)

    parser.add_argument(
        "--speed-lp-tau",
        type=float,
        default=SPEED_LP_TAU_S_DEFAULT,
        help="Low-pass filter time constant for wheel speed (s)",
    )
    parser.add_argument(
        "--sp-lp-tau",
        type=float,
        default=SETPOINT_LP_TAU_S_DEFAULT,
        help="Low-pass tau for desired wheel-speed setpoint (s)",
    )
    parser.add_argument(
        "--sp-slew",
        type=float,
        default=SETPOINT_SLEW_RADPS2_DEFAULT,
        help="Max slew rate for desired wheel-speed (rad/s^2)",
    )
    parser.add_argument(
        "--heading-gate",
        type=float,
        default=HEADING_MOVE_GATE_DEG_DEFAULT,
        help="Do not move forward until |heading error| < this (deg)",
    )
    parser.add_argument(
        "--rotate-hold",
        type=float,
        default=ROTATE_HOLD_TIME_S_DEFAULT,
        help="Hold time within angle tolerance during rotation (s)",
    )
    parser.add_argument(
        "--enable-imu",
        action="store_true",
        help="Enable MPU9250-based IMU fusion with differential odometry",
    )
    parser.add_argument(
        "--imu-bus",
        type=int,
        default=1,
        help="I2C bus index for the MPU9250 when IMU fusion is enabled",
    )
    parser.add_argument(
        "--imu-address",
        type=lambda x: int(x, 0),
        default=0x68,
        help="I2C address for the MPU9250 (hex or decimal)",
    )
    parser.add_argument(
        "--imu-heading-alpha",
        type=float,
        default=0.98,
        help="Complementary filter weight for gyro heading vs odometry",
    )
    parser.add_argument(
        "--imu-position-alpha",
        type=float,
        default=0.9,
        help="Complementary filter weight for IMU acceleration vs odometry",
    )
    parser.add_argument(
        "--imu-socket-port",
        type=int,
        default=None,
        help="Enable IMU data socket server on specified port (e.g., 9250) for visualization",
    )
    parser.add_argument(
        "--imu-calibration-samples",
        type=int,
        default=100,
        help="Number of IMU samples to collect during calibration phase (default: 100)",
    )

    args = parser.parse_args()

    print("=" * 60)
    print("Pose PID Path Control Test")
    print("=" * 60)
    print(f"Mode: {args.mode}")
    print(f"Side length: {args.side_length:.2f} m")
    print(f"v_max: {args.v_max:.2f} m/s, w_max: {args.w_max:.2f} rad/s")
    print(
        f"Position PID: Kp={args.pos_kp:.2f}, Ki={args.pos_ki:.2f}, Kd={args.pos_kd:.2f} | "
        f"Heading PID: Kp={args.heading_kp:.2f}, Ki={args.heading_ki:.2f}, Kd={args.heading_kd:.2f}"
    )
    print(
        f"Wheel-speed PID: Kp={args.ws_kp:.3f}, Ki={args.ws_ki:.3f}, Kd={args.ws_kd:.3f}"
    )
    print(
        f"Setpoint shaping: tau={args.sp_lp_tau:.2f}s, slew={args.sp_slew:.1f} rad/s^2"
    )
    print(f"Track width: {TRACK_WIDTH_M:.3f} m, Wheel diameter: {WHEEL_DIAMETER_M:.4f} m")
    if args.enable_imu:
        print(
            f"IMU fusion enabled (bus={args.imu_bus}, address=0x{args.imu_address:02X}, "
            f"heading_alpha={args.imu_heading_alpha:.2f}, position_alpha={args.imu_position_alpha:.2f})"
        )
        if args.imu_socket_port is not None:
            print(f"IMU socket server: enabled on port {args.imu_socket_port}")
            print(f"  Connect visualizer: python mpu9250_visualizer.py --port {args.imu_socket_port}")
        print(f"IMU calibration samples: {args.imu_calibration_samples}")
    print("=" * 60 + "\n")

    # Apply runtime tuning knobs
    SPEED_LP_TAU_S_DEFAULT = max(0.01, float(args.speed_lp_tau))
    HEADING_MOVE_GATE_DEG_DEFAULT = float(args.heading_gate)
    ROTATE_HOLD_TIME_S_DEFAULT = max(0.0, float(args.rotate_hold))

    imu_config: Optional[IMUConfig] = None
    if args.enable_imu:
        imu_config = IMUConfig(
            bus=args.imu_bus,
            address=args.imu_address,
            heading_alpha=args.imu_heading_alpha,
            position_alpha=args.imu_position_alpha,
        )

    if args.mode == "triangle":
        run_triangle(
            side_length_m=args.side_length,
            v_max=args.v_max,
            w_max=args.w_max,
            pos_kp=args.pos_kp,
            pos_ki=args.pos_ki,
            pos_kd=args.pos_kd,
            heading_kp=args.heading_kp,
            heading_ki=args.heading_ki,
            heading_kd=args.heading_kd,
            ws_kp=args.ws_kp,
            ws_ki=args.ws_ki,
            ws_kd=args.ws_kd,
            setpoint_lp_tau_s=args.sp_lp_tau,
            setpoint_slew_radps2=args.sp_slew,
            imu_config=imu_config,
            imu_socket_port=args.imu_socket_port,
            imu_calibration_samples=args.imu_calibration_samples,
        )
    else:
        run_line(
            length_m=args.side_length,
            v_max=args.v_max,
            w_max=args.w_max,
            pos_kp=args.pos_kp,
            pos_ki=args.pos_ki,
            pos_kd=args.pos_kd,
            heading_kp=args.heading_kp,
            heading_ki=args.heading_ki,
            heading_kd=args.heading_kd,
            ws_kp=args.ws_kp,
            ws_ki=args.ws_ki,
            ws_kd=args.ws_kd,
            setpoint_lp_tau_s=args.sp_lp_tau,
            setpoint_slew_radps2=args.sp_slew,
            imu_config=imu_config,
            imu_socket_port=args.imu_socket_port,
            imu_calibration_samples=args.imu_calibration_samples,
        )


if __name__ == "__main__":
    main()


