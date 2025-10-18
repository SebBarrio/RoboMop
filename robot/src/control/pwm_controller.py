"""PWM motor controller abstraction using PCA9685 for RoboMop."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Tuple

try:
    from adafruit_pca9685 import PCA9685  # type: ignore
except Exception as exc:  # pragma: no cover - import guard for non-hardware envs
    raise ImportError("adafruit-pca9685 package is required for PWM control") from exc


PWM_MIN_DUTY: int = 0
PWM_MAX_DUTY: int = 0xFFFF


@dataclass(frozen=True, slots=True)
class MotorChannelConfig:
    """Mapping of a motor index to forward/reverse PWM channels."""

    index: int
    forward_channel: int
    reverse_channel: int


class MotorController:
    """Drives differential motors by commanding voltages via PCA9685 PWM."""

    def __init__(
        self,
        pwm_board: PCA9685,
        motor_configs: Iterable[MotorChannelConfig],
        *,
        supply_voltage: float,
    ) -> None:
        if supply_voltage <= 0.0:
            raise ValueError("supply_voltage must be positive")
        self._pwm_board = pwm_board
        self._supply_voltage = float(supply_voltage)
        configs = tuple(motor_configs)
        if not configs:
            raise ValueError("motor_configs must not be empty")
        self._motor_configs: Tuple[MotorChannelConfig, ...] = configs
        self._motors = {config.index: config for config in configs}
        if len(self._motors) != len(configs):
            raise ValueError("Duplicate motor indexes detected in motor_configs")

    @property
    def supply_voltage(self) -> float:
        return self._supply_voltage

    @property
    def motor_configs(self) -> Tuple[MotorChannelConfig, ...]:
        return self._motor_configs

    def set_voltage(self, motor_index: int, voltage_command: float) -> None:
        """Drive a motor with the desired voltage in volts."""

        config = self._motors.get(motor_index)
        if config is None:
            raise KeyError(f"Unknown motor index {motor_index}")
        clamped = max(-self._supply_voltage, min(voltage_command, self._supply_voltage))
        duty_ratio = abs(clamped) / self._supply_voltage
        level = int(PWM_MIN_DUTY + (PWM_MAX_DUTY - PWM_MIN_DUTY) * duty_ratio)
        level = max(PWM_MIN_DUTY, min(level, PWM_MAX_DUTY))
        if clamped >= 0.0:
            self._pwm_board.channels[config.forward_channel].duty_cycle = level
            self._pwm_board.channels[config.reverse_channel].duty_cycle = PWM_MIN_DUTY
        else:
            self._pwm_board.channels[config.forward_channel].duty_cycle = PWM_MIN_DUTY
            self._pwm_board.channels[config.reverse_channel].duty_cycle = level

    def stop(self, motor_index: int) -> None:
        config = self._motors.get(motor_index)
        if config is None:
            raise KeyError(f"Unknown motor index {motor_index}")
        self._pwm_board.channels[config.forward_channel].duty_cycle = PWM_MIN_DUTY
        self._pwm_board.channels[config.reverse_channel].duty_cycle = PWM_MIN_DUTY

    def stop_all(self) -> None:
        for config in self._motor_configs:
            self._pwm_board.channels[config.forward_channel].duty_cycle = PWM_MIN_DUTY
            self._pwm_board.channels[config.reverse_channel].duty_cycle = PWM_MIN_DUTY
