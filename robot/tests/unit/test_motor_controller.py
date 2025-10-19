"""Unit tests for the motor velocity controller."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Mapping, Tuple

import pytest

from src.control.motor_controller import (
    EncoderFeedback,
    MotorChannelConfig,
    MotorVelocityController,
    MotorVelocityControllerConfig,
    PIDSettings,
)
from src.sensors.encoders import EncoderReading


@dataclass
class DummyDriver:
    supply_voltage: float = 12.0
    motor_configs: Tuple[MotorChannelConfig, ...] = (
        MotorChannelConfig(index=0, forward_channel=0, reverse_channel=1),
    )
    last_voltage: Dict[int, float] = None  # type: ignore[assignment]
    stop_all_called: bool = False

    def __post_init__(self) -> None:
        self.last_voltage = {}

    def set_voltage(self, motor_index: int, voltage: float) -> None:
        self.last_voltage[motor_index] = voltage

    def stop(self, motor_index: int) -> None:
        self.last_voltage[motor_index] = 0.0

    def stop_all(self) -> None:
        self.stop_all_called = True
        for cfg in self.motor_configs:
            self.last_voltage[cfg.index] = 0.0


class StubEncoderFeedback(EncoderFeedback):
    def __init__(self, readings: Mapping[int, EncoderReading]) -> None:
        self._readings: Dict[int, EncoderReading] = dict(readings)

    def get_reading(self, encoder_index: int) -> EncoderReading:
        return self._readings[encoder_index]

    def set_reading(self, encoder_index: int, reading: EncoderReading) -> None:
        self._readings[encoder_index] = reading


def _config(loop_interval: float = 0.01) -> MotorVelocityControllerConfig:
    return MotorVelocityControllerConfig(
        motor_to_encoder={0: 0},
        gear_ratio=8.45,
        rotor_inertia=0.001085,
        viscous_friction=0.000467,
        torque_constant=0.018803,
        back_emf_constant=0.018803,
        winding_resistance=0.091,
        loop_interval=loop_interval,
        pid=PIDSettings(kp=2.0, ki=0.0, kd=0.0),
    )


def _reading(velocity: float) -> EncoderReading:
    return EncoderReading(
        timestamp=0.0,
        ticks=0,
        revolutions=0.0,
        position_rad=0.0,
        velocity_rad_s=velocity,
        position_m=None,
        velocity_m_s=None,
    )


def test_update_combines_feedforward_and_pid() -> None:
    driver = DummyDriver()
    feedback = StubEncoderFeedback({0: _reading(velocity=0.8)})
    cfg = _config()
    controller = MotorVelocityController(driver, feedback, cfg)

    controller.set_velocity_targets({0: 1.0})
    controller.update()

    state = controller.get_last_reading(0)
    assert state is not None
    error = 1.0 - state.velocity_rad_s
    expected_pid = 2.0 * error
    accel = (1.0 - 0.0) / cfg.loop_interval
    torque_out = cfg.rotor_inertia * accel + cfg.viscous_friction * 1.0
    torque_motor = torque_out / cfg.gear_ratio
    current = torque_motor / cfg.torque_constant
    velocity_motor = cfg.gear_ratio * 1.0
    expected_ff = cfg.winding_resistance * current + cfg.back_emf_constant * velocity_motor
    assert driver.last_voltage[0] == pytest.approx(expected_ff + expected_pid)


def test_command_voltage_is_clamped_to_supply() -> None:
    driver = DummyDriver()
    feedback = StubEncoderFeedback({0: _reading(velocity=0.0)})
    controller = MotorVelocityController(driver, feedback, _config())

    controller.set_velocity_targets({0: 50.0})
    controller.update()

    assert driver.last_voltage[0] == pytest.approx(driver.supply_voltage)


def test_stop_all_resets_state_and_calls_driver() -> None:
    driver = DummyDriver()
    feedback = StubEncoderFeedback({0: _reading(velocity=1.0)})
    controller = MotorVelocityController(driver, feedback, _config())

    controller.set_velocity_targets({0: 1.0})
    controller.update()

    controller.stop_all()

    assert driver.stop_all_called is True
    assert driver.last_voltage[0] == pytest.approx(0.0)
    state = controller.get_last_reading(0)
    assert state is None


def test_setting_target_for_unknown_motor_raises() -> None:
    driver = DummyDriver()
    feedback = StubEncoderFeedback({0: _reading(velocity=0.0)})
    controller = MotorVelocityController(driver, feedback, _config())

    with pytest.raises(KeyError):
        controller.set_velocity_targets({1: 1.0})


def test_negative_dt_is_rejected() -> None:
    driver = DummyDriver()
    feedback = StubEncoderFeedback({0: _reading(velocity=0.0)})
    controller = MotorVelocityController(driver, feedback, _config())

    controller.set_velocity_targets({0: 1.0})
    with pytest.raises(ValueError):
        controller.update(dt=-0.01)
