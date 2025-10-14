"""Unit tests for the quadrature encoder interface."""

from __future__ import annotations

import math

import pytest

from src.sensors.encoders import EncoderReading, QuadratureEncoder


class _FakeHardware:
    def __init__(self, steps: int = 0) -> None:
        self.steps = steps
        self.closed = False

    def read_steps(self) -> int:
        return self.steps

    def close(self) -> None:
        self.closed = True


class _FakeTime:
    def __init__(self, start: float = 0.0) -> None:
        self._now = start

    def advance(self, dt: float) -> None:
        self._now += dt

    def __call__(self) -> float:
        return self._now


def test_initial_reading_is_zero() -> None:
    hardware = _FakeHardware(steps=0)
    clock = _FakeTime()
    encoder = QuadratureEncoder(
        hardware=hardware,
        counts_per_revolution=400,
        gear_ratio=1.0,
        wheel_circumference_m=None,
        velocity_cutoff_hz=None,
        time_source=clock,
    )

    reading = encoder.read()

    assert isinstance(reading, EncoderReading)
    assert math.isclose(reading.position_rad, 0.0, abs_tol=1e-9)
    assert math.isclose(reading.velocity_rad_s, 0.0, abs_tol=1e-9)
    assert reading.ticks == 0


def test_position_and_velocity_scaling_without_filter() -> None:
    hardware = _FakeHardware(steps=0)
    clock = _FakeTime()
    encoder = QuadratureEncoder(
        hardware=hardware,
        counts_per_revolution=400,
        gear_ratio=1.0,
        wheel_circumference_m=None,
        velocity_cutoff_hz=None,
        time_source=clock,
    )

    encoder.read()  # initialize baseline
    hardware.steps = 100
    clock.advance(0.1)

    reading = encoder.read()

    expected_revolutions = 100 / 400
    expected_position = expected_revolutions * 2.0 * math.pi
    expected_velocity = expected_position / 0.1

    assert math.isclose(reading.position_rad, expected_position, rel_tol=1e-9)
    assert math.isclose(reading.velocity_rad_s, expected_velocity, rel_tol=1e-9)


def test_gear_ratio_and_inversion_applied() -> None:
    hardware = _FakeHardware(steps=0)
    clock = _FakeTime()
    encoder = QuadratureEncoder(
        hardware=hardware,
        counts_per_revolution=400,
        gear_ratio=8.0,
        wheel_circumference_m=None,
        velocity_cutoff_hz=None,
        invert=True,
        time_source=clock,
    )

    encoder.read()
    hardware.steps = 400
    clock.advance(0.2)

    reading = encoder.read()

    expected_revolutions = -(400 / 400) / 8.0
    expected_position = expected_revolutions * 2.0 * math.pi
    expected_velocity = expected_position / 0.2

    assert math.isclose(reading.position_rad, expected_position, rel_tol=1e-9)
    assert math.isclose(reading.velocity_rad_s, expected_velocity, rel_tol=1e-9)


def test_zero_sets_new_origin() -> None:
    hardware = _FakeHardware(steps=0)
    clock = _FakeTime()
    encoder = QuadratureEncoder(
        hardware=hardware,
        counts_per_revolution=400,
        gear_ratio=1.0,
        wheel_circumference_m=None,
        velocity_cutoff_hz=None,
        time_source=clock,
    )

    encoder.read()
    hardware.steps = 200
    clock.advance(0.05)
    encoder.zero()

    hardware.steps = 260
    clock.advance(0.1)

    reading = encoder.read()

    expected_revolutions = 60 / 400
    expected_position = expected_revolutions * 2.0 * math.pi

    assert math.isclose(reading.position_rad, expected_position, rel_tol=1e-9)
    assert math.isclose(reading.velocity_rad_s, expected_position / 0.1, rel_tol=1e-9)


def test_low_pass_filter_reduces_velocity_spike() -> None:
    hardware = _FakeHardware(steps=0)
    clock = _FakeTime()
    encoder = QuadratureEncoder(
        hardware=hardware,
        counts_per_revolution=400,
        gear_ratio=1.0,
        wheel_circumference_m=None,
        velocity_cutoff_hz=5.0,
        time_source=clock,
    )

    encoder.read()
    hardware.steps = 200
    clock.advance(0.02)

    reading = encoder.read()

    raw_velocity = (200 / 400) * 2.0 * math.pi / 0.02
    assert 0.0 < reading.velocity_rad_s < raw_velocity


def test_close_propagates_to_hardware() -> None:
    hardware = _FakeHardware(steps=0)
    encoder = QuadratureEncoder(
        hardware=hardware,
        counts_per_revolution=400,
        gear_ratio=1.0,
    )

    encoder.close()

    assert hardware.closed is True


def test_linear_units_returned_when_circumference_provided() -> None:
    hardware = _FakeHardware(steps=0)
    clock = _FakeTime()
    encoder = QuadratureEncoder(
        hardware=hardware,
        counts_per_revolution=400,
        gear_ratio=1.0,
        wheel_circumference_m=0.5,
        velocity_cutoff_hz=None,
        time_source=clock,
    )

    encoder.read()
    hardware.steps = 100
    clock.advance(0.2)

    reading = encoder.read()

    expected_revolutions = 100 / 400
    expected_distance = expected_revolutions * 0.5
    expected_speed = expected_distance / 0.2

    assert reading.position_m is not None
    assert reading.velocity_m_s is not None
    assert math.isclose(reading.position_m, expected_distance, rel_tol=1e-9)
    assert math.isclose(reading.velocity_m_s, expected_speed, rel_tol=1e-9)


def test_reading_requires_monotonic_time() -> None:
    hardware = _FakeHardware(steps=0)
    clock = _FakeTime()
    encoder = QuadratureEncoder(
        hardware=hardware,
        counts_per_revolution=400,
        gear_ratio=1.0,
        velocity_cutoff_hz=None,
        time_source=clock,
    )

    encoder.read()
    hardware.steps = 50

    with pytest.raises(RuntimeError):
        encoder.read()
