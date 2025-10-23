"""Unit tests for the PID controller module."""

from __future__ import annotations

import pytest

from src.control.pid import PIDController


def test_proportional_response() -> None:
    pid = PIDController(kp=2.0)

    output = pid.update(1.5, 0.1)

    assert output == pytest.approx(3.0)


def test_integral_accumulates_and_clamps() -> None:
    pid = PIDController(ki=1.0, integrator_limit=0.5)

    first = pid.update(1.0, 0.2)
    second = pid.update(1.0, 0.2)
    third = pid.update(1.0, 0.2)

    assert first == pytest.approx(0.2)
    assert second == pytest.approx(0.4)
    assert third == pytest.approx(0.5)


def test_derivative_term_uses_previous_error() -> None:
    pid = PIDController(kd=0.5)

    pid.update(1.0, 0.1)
    output = pid.update(2.0, 0.1)

    assert output == pytest.approx(5.0)


def test_output_limits_clamp_result() -> None:
    pid = PIDController(kp=10.0, output_limits=(-2.0, 2.0))

    output = pid.update(1.0, 0.1)

    assert output == pytest.approx(2.0)


def test_reset_clears_integrator_state() -> None:
    pid = PIDController(ki=1.0)

    pid.update(1.0, 0.5)
    pid.reset()

    assert pid.update(0.0, 0.5) == pytest.approx(0.0)


def test_invalid_dt_raises_value_error() -> None:
    pid = PIDController(kp=1.0)

    with pytest.raises(ValueError):
        pid.update(1.0, 0.0)
