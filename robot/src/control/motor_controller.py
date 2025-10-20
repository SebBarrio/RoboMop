"""Closed-loop motor velocity controller using encoder feedback and PID."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Mapping, MutableMapping, Protocol, Sequence

from ..sensors.encoders import EncoderReading
from .pid import PIDController
from .pwm_controller import MotorChannelConfig


class MotorVoltageDriver(Protocol):
    """Minimal interface required from the low-level motor driver."""

    supply_voltage: float
    motor_configs: Sequence[MotorChannelConfig]

    def set_voltage(self, motor_index: int, voltage: float) -> None:  # pragma: no cover - protocol
        ...

    def stop(self, motor_index: int) -> None:  # pragma: no cover - protocol
        ...

    def stop_all(self) -> None:  # pragma: no cover - protocol
        ...


class EncoderFeedback(Protocol):
    """Provides encoder readings for a given encoder index."""

    def get_reading(self, encoder_index: int) -> EncoderReading:  # pragma: no cover - protocol
        ...


@dataclass(slots=True)
class PIDSettings:
    """PID tuning parameters shared by all motor velocity loops."""

    kp: float
    ki: float
    kd: float
    integrator_limit: float | None = None
    output_limits: tuple[float | None, float | None] | None = None


@dataclass(slots=True)
class MotorControllerConfig:
    """Configuration required to execute the motor velocity control loop."""

    motor_to_encoder: Mapping[int, int]
    gear_ratio: float
    rotor_inertia: float
    viscous_friction: float
    torque_constant: float
    back_emf_constant: float
    winding_resistance: float
    loop_interval: float
    pid: PIDSettings

    def __post_init__(self) -> None:
        if not self.motor_to_encoder:
            raise ValueError("motor_to_encoder must not be empty")
        if self.gear_ratio <= 0.0:
            raise ValueError("gear_ratio must be positive")
        if self.rotor_inertia < 0.0:
            raise ValueError("rotor_inertia must be non-negative")
        if self.viscous_friction < 0.0:
            raise ValueError("viscous_friction must be non-negative")
        if self.torque_constant <= 0.0:
            raise ValueError("torque_constant must be positive")
        if self.back_emf_constant <= 0.0:
            raise ValueError("back_emf_constant must be positive")
        if self.winding_resistance <= 0.0:
            raise ValueError("winding_resistance must be positive")
        if self.loop_interval <= 0.0:
            raise ValueError("loop_interval must be positive")


@dataclass(slots=True)
class MotorState:
    """Internal per-motor bookkeeping."""

    pid: PIDController
    target_velocity: float = 0.0
    previous_target_velocity: float = 0.0
    setpoint_position: float = 0.0
    last_reading: EncoderReading | None = None


class MotorController:
    """Runs a velocity PID loop using encoder feedback at a fixed cadence."""

    def __init__(
        self,
        driver: MotorVoltageDriver,
        encoder_feedback: EncoderFeedback,
        config: MotorControllerConfig,
    ) -> None:
        self._driver = driver
        self._feedback = encoder_feedback
        self._config = config
        self._loop_interval = config.loop_interval

        driver_motor_indexes = {config.index for config in driver.motor_configs}
        if not driver_motor_indexes:
            raise ValueError("driver must expose at least one motor configuration")
        unknown_motors = set(config.motor_to_encoder.keys()) - driver_motor_indexes
        if unknown_motors:
            unknown_str = ", ".join(str(idx) for idx in sorted(unknown_motors))
            raise ValueError(f"motor_to_encoder contains unknown motor indexes: {unknown_str}")

        self._motor_to_encoder: Mapping[int, int] = dict(config.motor_to_encoder)
        output_limits = config.pid.output_limits or (
            -driver.supply_voltage,
            driver.supply_voltage,
        )
        integrator_limit = (
            config.pid.integrator_limit
            if config.pid.integrator_limit is not None
            else driver.supply_voltage
        )

        self._states: MutableMapping[int, MotorState] = {}
        for motor_index in driver_motor_indexes:
            if motor_index not in self._motor_to_encoder:
                continue
            pid = PIDController(
                kp=config.pid.kp,
                ki=config.pid.ki,
                kd=config.pid.kd,
                integrator_limit=integrator_limit,
                output_limits=output_limits,
            )
            self._states[motor_index] = MotorState(pid=pid)

        if not self._states:
            raise ValueError("No motors configured for velocity control")

    @property
    def loop_interval(self) -> float:
        return self._loop_interval

    def set_velocity_targets(self, targets: Mapping[int, float]) -> None:
        for motor_index, velocity in targets.items():
            state = self._states.get(motor_index)
            if state is None:
                raise KeyError(f"Unknown motor index {motor_index}")
            state.target_velocity = float(velocity)

    def update(self, dt: float | None = None) -> None:
        interval = self._validate_interval(dt)
        for motor_index, state in self._states.items():
            encoder_index = self._motor_to_encoder[motor_index]
            reading = self._feedback.get_reading(encoder_index)
            state.last_reading = reading

            desired_velocity = state.target_velocity
            acceleration = (desired_velocity - state.previous_target_velocity) / interval
            feedforward = self._compute_feedforward(desired_velocity, acceleration)

            error = desired_velocity - reading.velocity_rad_s
            control = state.pid.update(error, interval)

            command_voltage = feedforward + control
            command_voltage = max(
                -self._driver.supply_voltage,
                min(command_voltage, self._driver.supply_voltage),
            )

            self._driver.set_voltage(motor_index, command_voltage)

            state.previous_target_velocity = desired_velocity
            state.setpoint_position += desired_velocity * interval

    def reset(self) -> None:
        for state in self._states.values():
            state.pid.reset()
            state.previous_target_velocity = state.target_velocity
            state.setpoint_position = 0.0
            state.last_reading = None

    def stop_all(self) -> None:
        for state in self._states.values():
            state.target_velocity = 0.0
            state.previous_target_velocity = 0.0
            state.setpoint_position = 0.0
            state.pid.reset()
            state.last_reading = None
        self._driver.stop_all()

    def get_last_reading(self, motor_index: int) -> EncoderReading | None:
        state = self._states.get(motor_index)
        if state is None:
            raise KeyError(f"Unknown motor index {motor_index}")
        return state.last_reading

    def _validate_interval(self, dt: float | None) -> float:
        interval = self._loop_interval if dt is None else dt
        if interval <= 0.0:
            raise ValueError("dt must be positive")
        return interval

    def _compute_feedforward(self, velocity_out: float, acceleration_out: float) -> float:
        torque_out = (
            self._config.rotor_inertia * acceleration_out
            + self._config.viscous_friction * velocity_out
        )
        torque_motor = torque_out / self._config.gear_ratio
        current = torque_motor / self._config.torque_constant
        velocity_motor = self._config.gear_ratio * velocity_out
        return (
            self._config.winding_resistance * current
            + self._config.back_emf_constant * velocity_motor
        )
