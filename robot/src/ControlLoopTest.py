"""Model-based speed control test harness with physical units (rad/s, rad).

This integrates a simple DC motor dynamic model for feedforward voltage
computation and uses PID for feedback. It reads quadrature encoders to
estimate wheel/output shaft angular velocity and position, and saves plots of
setpoint vs actual speed and position for verification.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
import math
import os
from datetime import datetime
from typing import Callable, Sequence

import board
import busio
from adafruit_pca9685 import PCA9685
from gpiozero import RotaryEncoder

# Use non-interactive backend for headless plotting
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

# Pin assignments
# MOTOR_CHANNELS: PCA9685 PWM channels for each motor (forward_channel, reverse_channel)
# Motor 0: channels (0, 1) -> L_PWM=0, R_PWM=1
# Motor 1: channels (2, 3) -> L_PWM=2, R_PWM=3  
# Motor 2: channels (4, 5) -> L_PWM=4, R_PWM=5
# Motor 3: channels (6, 7) -> L_PWM=6, R_PWM=7
MOTOR_CHANNELS: Sequence[tuple[int, int]] = ((0, 1), (2, 3), (4, 5), (6, 7))

# ENCODER_CHANNELS: GPIO pins for quadrature encoders (pinA, pinB)
# Encoder 0: pins (5, 6) -> encoderA=5, encoderB=6 (shared by motors 0,1)
# Encoder 1: pins (13, 26) -> encoderA=13, encoderB=26 (shared by motors 2,3)
ENCODER_CHANNELS: Sequence[tuple[int, int]] = ((13, 26), (5, 6))

# Map motor index to encoder index. Motors 0,1 use encoder 0. Motors 2,3 use encoder 1.
MOTOR_TO_ENCODER_MAP: dict[int, int] = {0: 0, 1: 0, 2: 1, 3: 1}

# Motor and drive electrical/mechanical model constants
# Units: R[Ohm], L[H], J[kg*m^2], B[N*m*s/rad], Kt[N*m/A], Ke[V*s/rad], N[ratio]
R_OHMS: float = 0.091
L_HENRY: float = 0.0
J_KG_M2: float = 0.001085
B_NM_S_PER_RAD: float = 0.000467
KT_NM_PER_A: float = 0.018803
KE_VS_PER_RAD: float = 0.018803
GEAR_RATIO: float = 8.45

# Supply voltage (update to your battery/bus voltage)
SUPPLY_VOLTAGE: float = 12.0

# Encoder configuration
ENCODER_PULSES_PER_REV: int = 4000
# True if encoders measure output shaft (post-gear). If False, encoders on motor shaft.
ENCODER_ON_OUTPUT_SHAFT: bool = True


PWM_FREQUENCY: int = 1000
PWM_MIN: int = 0
PWM_MAX: int = 0xFFFF
CONTROL_INTERVAL: float = 0.02
TEST_DURATION: float = 10.0

# Speed setpoint profile parameters (rad/s at output shaft)
SETPOINT_MODE: str = "sine"  # "sine" or "steps"
SETPOINT_AMPLITUDE_RAD_PER_S: float = 20.0
SETPOINT_FREQ_HZ: float = 0.2  # Only used for sine

# Speed control PID gains (output units: Volts). Start conservative and tune on-hardware.
SPEED_KP: float = 3.65
SPEED_KI: float = 14.7
SPEED_KD: float = 0.0


@dataclass(frozen=True)
class MotorConfig:
    index: int
    forward_channel: int
    reverse_channel: int


@dataclass(frozen=True)
class EncoderConfig:
    index: int
    pin_a: int
    pin_b: int


class PIDController:
    def __init__(self, kp: float, ki: float, kd: float, integrator_limit: float = 1.0) -> None:
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
        self._integrator = max(-self._integrator_limit, min(self._integrator, self._integrator_limit))
        derivative = (error - self._prev_error) / dt if dt > 0 else 0.0
        self._prev_error = error
        return (self._kp * error) + (self._ki * self._integrator) + (self._kd * derivative)


class MotorController:
    def __init__(self, pwm_board: PCA9685, motor_configs: Sequence[MotorConfig]) -> None:
        self._pwm_board = pwm_board
        self._configs = tuple(motor_configs)
        self._motors = {config.index: config for config in self._configs}

    @property
    def motor_configs(self) -> tuple[MotorConfig, ...]:
        return self._configs

    def set_voltage(self, motor_index: int, voltage_command: float) -> None:
        """Command motor voltage using H-bridge via PWM (linearized mapping).

        Maps commanded voltage in [-SUPPLY_VOLTAGE, SUPPLY_VOLTAGE] to PWM duty on
        forward/reverse channels. Positive voltage is forward.
        """
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

    def stop_all(self) -> None:
        for config in self._motors.values():
            self._pwm_board.channels[config.forward_channel].duty_cycle = PWM_MIN
            self._pwm_board.channels[config.reverse_channel].duty_cycle = PWM_MIN


class EncoderReader:
    def __init__(
        self,
        encoder_configs: Sequence[EncoderConfig],
        pulses_per_rev: int,
    ) -> None:
        self._ppr = float(pulses_per_rev)
        self._encoders = {
            config.index: RotaryEncoder(config.pin_a, config.pin_b, max_steps=0)
            for config in encoder_configs
        }
        # Track last counts per motor (not per encoder) since motors share encoders
        self._last_counts_per_motor = {motor_idx: 0 for motor_idx in MOTOR_TO_ENCODER_MAP.keys()}
        self._zero_counts = {idx: enc.steps for idx, enc in self._encoders.items()}

    def read_state(self, motor_index: int, dt: float) -> tuple[float, float]:
        """Return (omega_out_rad_per_s, theta_out_rad)."""
        # Use minimum dt threshold to prevent division by very small values
        MIN_DT = 0.001  # 1ms minimum
        if dt < MIN_DT:
            return 0.0, 0.0
        
        encoder_index = MOTOR_TO_ENCODER_MAP[motor_index]
        encoder = self._encoders[encoder_index]
        steps = encoder.steps
        
        # Use per-motor last counts to handle multiple motors sharing one encoder
        delta_steps = steps - self._last_counts_per_motor[motor_index]
        self._last_counts_per_motor[motor_index] = steps

        # Total angle from zero (radians)
        total_steps = steps - self._zero_counts[encoder_index]
        rotations_total = total_steps / self._ppr
        theta_measured_rad = rotations_total * 2.0 * math.pi
        # Incremental speed (radians per second)
        rotations = delta_steps / self._ppr
        omega_measured_rad_per_s = (rotations * 2.0 * math.pi) / dt

        if ENCODER_ON_OUTPUT_SHAFT:
            theta_out = theta_measured_rad
            omega_out = omega_measured_rad_per_s
        else:
            # Encoders on motor shaft -> convert to output shaft via gear ratio
            theta_out = theta_measured_rad / GEAR_RATIO
            omega_out = omega_measured_rad_per_s / GEAR_RATIO

        return omega_out, theta_out

    def close(self) -> None:
        for encoder in self._encoders.values():
            encoder.close()


class MotorTestRig:
    def __init__(
        self,
        controller: MotorController,
        feedback_provider: Callable[[int, float], tuple[float, float]],
    ) -> None:
        self._controller = controller
        self._feedback_provider = feedback_provider
        self._pids = {
            config.index: PIDController(SPEED_KP, SPEED_KI, SPEED_KD, integrator_limit=SUPPLY_VOLTAGE)
            for config in controller.motor_configs
        }
        # Logging buffers
        self._times: list[float] = []
        self._omega_sp: dict[int, list[float]] = {cfg.index: [] for cfg in controller.motor_configs}
        self._theta_sp: dict[int, list[float]] = {cfg.index: [] for cfg in controller.motor_configs}
        self._omega_meas: dict[int, list[float]] = {cfg.index: [] for cfg in controller.motor_configs}
        self._theta_meas: dict[int, list[float]] = {cfg.index: [] for cfg in controller.motor_configs}
        self._last_theta_sp: dict[int, float] = {cfg.index: 0.0 for cfg in controller.motor_configs}

    def _evaluate_setpoint(self, t: float) -> float:
        """Output shaft setpoint speed (rad/s) as a function of time."""
        if SETPOINT_MODE == "sine":
            return SETPOINT_AMPLITUDE_RAD_PER_S * math.sin(2.0 * math.pi * SETPOINT_FREQ_HZ * t)
        # steps profile: 0 -> +A -> -A/2 -> 0
        if t < 2.0:
            return 0.0
        if t < 5.0:
            return SETPOINT_AMPLITUDE_RAD_PER_S
        if t < 7.0:
            return -0.5 * SETPOINT_AMPLITUDE_RAD_PER_S
        return 0.0

    def _evaluate_setpoint_derivative(self, t: float) -> float:
        if SETPOINT_MODE == "sine":
            return (
                SETPOINT_AMPLITUDE_RAD_PER_S * 2.0 * math.pi * SETPOINT_FREQ_HZ * math.cos(2.0 * math.pi * SETPOINT_FREQ_HZ * t)
            )
        return 0.0

    def _voltage_feedforward(self, omega_out_des: float, alpha_out_des: float) -> float:
        """Compute motor voltage feedforward with correct unit handling.

        Assumptions:
        - J_KG_M2 and B_NM_S_PER_RAD represent the effective load at the OUTPUT shaft.
        - Gear ratio N = GEAR_RATIO = omega_motor / omega_output.

        Derivation:
        - Required output torque: tau_out = J_out * alpha_out + B_out * omega_out
        - Motor torque to produce this (ideal gearbox): tau_m = tau_out / N
        - Motor electrical model: V = R * (tau_m / Kt) + Ke * omega_m
        - Where omega_m = N * omega_out
        """
        # Motor kinematics from output side
        omega_m_des = GEAR_RATIO * omega_out_des

        # Output-side torque demand (N*m)
        torque_out = (J_KG_M2 * alpha_out_des) + (B_NM_S_PER_RAD * omega_out_des)

        # Convert to motor-side torque through the gearbox (ideal, no losses)
        torque_m = torque_out / GEAR_RATIO

        # Current needed to generate motor torque (A)
        current_a = torque_m / KT_NM_PER_A

        # Feedforward voltage (V)
        return (R_OHMS * current_a) + (KE_VS_PER_RAD * omega_m_des)

    def run(self, duration: float, interval: float) -> None:
        start = time.monotonic()
        last_ts = start
        # Initialize setpoint position to 0 for all motors
        for idx in self._last_theta_sp:
            self._last_theta_sp[idx] = 0.0
        while time.monotonic() - start < duration:
            now = time.monotonic()
            dt = now - last_ts
            last_ts = now
            t_rel = now - start
            self._times.append(t_rel)
            # Evaluate setpoint and derivative (output shaft)
            omega_sp = self._evaluate_setpoint(t_rel)
            alpha_sp = self._evaluate_setpoint_derivative(t_rel)
            for motor_index, pid in self._pids.items():
                omega_meas, theta_meas = self._feedback_provider(motor_index, dt)
                # Compute feedforward in volts
                v_ff = self._voltage_feedforward(omega_sp, alpha_sp)
                # PID on speed error (rad/s)
                error = omega_sp - omega_meas
                v_pid = pid.update(error, dt)
                v_cmd = max(-SUPPLY_VOLTAGE, min(v_ff + v_pid, SUPPLY_VOLTAGE))
                self._controller.set_voltage(motor_index, v_cmd)

                # Integrate setpoint position for comparison
                theta_sp = self._last_theta_sp[motor_index] + omega_sp * dt
                self._last_theta_sp[motor_index] = theta_sp

                # Log
                self._omega_sp[motor_index].append(omega_sp)
                self._theta_sp[motor_index].append(theta_sp)
                self._omega_meas[motor_index].append(omega_meas)
                self._theta_meas[motor_index].append(theta_meas)
            time.sleep(max(0.0, interval - (time.monotonic() - now)))
        self._controller.stop_all()

        # After stopping, save plots
        self._save_plots()

    def _save_plots(self) -> None:
        if not self._times:
            return
        os.makedirs("logs", exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")

        # Convert to numpy arrays and filter out inf/nan values
        times_arr = np.array(self._times)
        
        # Create mask for valid time points (no inf/nan in any data)
        valid_mask = np.ones(len(times_arr), dtype=bool)
        for idx in self._omega_meas.keys():
            omega_sp_arr = np.array(self._omega_sp[idx])
            omega_meas_arr = np.array(self._omega_meas[idx])
            theta_sp_arr = np.array(self._theta_sp[idx])
            theta_meas_arr = np.array(self._theta_meas[idx])
            valid_mask &= np.isfinite(omega_sp_arr) & np.isfinite(omega_meas_arr)
            valid_mask &= np.isfinite(theta_sp_arr) & np.isfinite(theta_meas_arr)
        
        # Filter data
        times_clean = times_arr[valid_mask]
        if len(times_clean) == 0:
            print("Warning: No valid data points to plot")
            return

        # Figure 1: Speed tracking
        plt.figure(figsize=(10, 8))
        ax1 = plt.subplot(2, 1, 1)
        ax1.set_title("Speed Tracking (rad/s)")
        omega_sp_clean = np.array(self._omega_sp[next(iter(self._omega_sp))])[valid_mask]
        ax1.plot(times_clean, omega_sp_clean, "k--", label="setpoint", linewidth=2)
        for idx in sorted(self._omega_meas.keys()):
            omega_meas_clean = np.array(self._omega_meas[idx])[valid_mask]
            ax1.plot(times_clean, omega_meas_clean, label=f"motor {idx}", alpha=0.8)
        ax1.set_xlabel("time (s)")
        ax1.set_ylabel("omega_out (rad/s)")
        ax1.grid(True)
        ax1.legend()

        # Figure 1, bottom: Position tracking
        ax2 = plt.subplot(2, 1, 2)
        ax2.set_title("Position (rad)")
        theta_sp_clean = np.array(self._theta_sp[next(iter(self._theta_sp))])[valid_mask]
        ax2.plot(times_clean, theta_sp_clean, "k--", label="setpoint", linewidth=2)
        for idx in sorted(self._theta_meas.keys()):
            theta_meas_clean = np.array(self._theta_meas[idx])[valid_mask]
            ax2.plot(times_clean, theta_meas_clean, label=f"motor {idx}", alpha=0.8)
        ax2.set_xlabel("time (s)")
        ax2.set_ylabel("theta_out (rad)")
        ax2.grid(True)
        ax2.legend()

        out_path = os.path.join("logs", f"speed_position_tracking_{ts}.png")
        plt.tight_layout()
        plt.savefig(out_path, dpi=150)
        plt.close()
        print(f"Plot saved to {out_path}")


def build_motor_configs() -> list[MotorConfig]:
    return [
        MotorConfig(index=idx, forward_channel=channels[0], reverse_channel=channels[1])
        for idx, channels in enumerate(MOTOR_CHANNELS)
    ]


def build_encoder_configs() -> list[EncoderConfig]:
    return [
        EncoderConfig(index=idx, pin_a=pins[0], pin_b=pins[1])
        for idx, pins in enumerate(ENCODER_CHANNELS)
    ]


def main() -> None:
    i2c = busio.I2C(board.SCL, board.SDA)
    pwm = PCA9685(i2c)
    pwm.frequency = PWM_FREQUENCY
    controller = MotorController(pwm, build_motor_configs())
    encoders = EncoderReader(build_encoder_configs(), ENCODER_PULSES_PER_REV)
    rig = MotorTestRig(controller, encoders.read_state)
    try:
        rig.run(TEST_DURATION, CONTROL_INTERVAL)
    finally:
        controller.stop_all()
        encoders.close()
        pwm.deinit()


if __name__ == "__main__":
    main()
