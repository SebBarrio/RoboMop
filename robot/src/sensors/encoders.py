"""Quadrature encoder interface with velocity filtering and unit conversion."""

from __future__ import annotations

import math
import time
from dataclasses import dataclass
from typing import Callable, Optional, Protocol


class EncoderHardware(Protocol):
    """Protocol describing the minimal encoder hardware interface."""

    def read_steps(self) -> int:  # pragma: no cover - protocol definition
        ...

    def close(self) -> None:  # pragma: no cover - protocol definition
        ...


@dataclass(frozen=True, slots=True)
class EncoderReading:
    """Snapshot of encoder position and velocity."""

    timestamp: float
    ticks: int
    revolutions: float
    position_rad: float
    velocity_rad_s: float
    position_m: Optional[float]
    velocity_m_s: Optional[float]


class QuadratureEncoder:
    """High-level encoder wrapper computing angular and linear motion."""

    def __init__(
        self,
        *,
        hardware: EncoderHardware,
        counts_per_revolution: int,
        gear_ratio: float = 1.0,
        wheel_circumference_m: Optional[float] = None,
        invert: bool = False,
        velocity_cutoff_hz: Optional[float] = 12.0,
        min_dt: float = 1e-4,
        time_source: Callable[[], float] = time.perf_counter,
    ) -> None:
        if counts_per_revolution <= 0:
            raise ValueError("counts_per_revolution must be positive")
        if gear_ratio <= 0.0:
            raise ValueError("gear_ratio must be positive")
        if wheel_circumference_m is not None and wheel_circumference_m <= 0.0:
            raise ValueError("wheel_circumference_m must be positive when provided")
        if min_dt <= 0.0:
            raise ValueError("min_dt must be positive")
        if velocity_cutoff_hz is not None and velocity_cutoff_hz <= 0.0:
            raise ValueError("velocity_cutoff_hz must be positive when provided")

        self._hardware = hardware
        self._counts_per_revolution = float(counts_per_revolution)
        self._gear_ratio = gear_ratio
        self._circumference = wheel_circumference_m
        self._invert_factor = -1 if invert else 1
        self._velocity_cutoff_hz = velocity_cutoff_hz
        self._min_dt = min_dt
        self._time_source = time_source

        self._zero_steps: Optional[int] = None
        self._last_steps: Optional[int] = None
        self._last_time: Optional[float] = None
        self._filtered_velocity: float = 0.0

    def __enter__(self) -> "QuadratureEncoder":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def zero(self) -> None:
        """Reset accumulated position to the current hardware steps."""

        steps = self._hardware.read_steps()
        self._zero_steps = steps
        self._last_steps = steps
        self._last_time = self._time_source()
        self._filtered_velocity = 0.0

    def read(self) -> EncoderReading:
        """Return the current encoder reading."""

        now = self._time_source()
        steps = self._hardware.read_steps()

        if self._zero_steps is None:
            self._zero_steps = steps
            self._last_steps = steps
            self._last_time = now
            self._filtered_velocity = 0.0
            position_m = 0.0 if self._circumference is not None else None
            return EncoderReading(
                timestamp=now,
                ticks=0,
                revolutions=0.0,
                position_rad=0.0,
                velocity_rad_s=0.0,
                position_m=position_m,
                velocity_m_s=0.0 if position_m is not None else None,
            )

        if self._last_time is None:
            self._last_time = now

        dt = now - self._last_time
        if dt <= 0.0:
            raise RuntimeError("time_source must be strictly increasing between reads")

        previous_steps = self._last_steps if self._last_steps is not None else steps
        delta_steps = (steps - previous_steps) * self._invert_factor
        ticks_from_zero = (steps - self._zero_steps) * self._invert_factor
        revolutions = ticks_from_zero / self._counts_per_revolution / self._gear_ratio

        raw_velocity = self._compute_raw_velocity(delta_steps, dt)
        velocity = self._apply_low_pass(raw_velocity, dt)
        position_rad = revolutions * 2.0 * math.pi

        linear_position = None
        linear_velocity = None
        if self._circumference is not None:
            linear_position = revolutions * self._circumference
            linear_velocity = velocity * (self._circumference / (2.0 * math.pi))

        self._filtered_velocity = velocity
        self._last_steps = steps
        self._last_time = now

        return EncoderReading(
            timestamp=now,
            ticks=int(ticks_from_zero),
            revolutions=revolutions,
            position_rad=position_rad,
            velocity_rad_s=velocity,
            position_m=linear_position,
            velocity_m_s=linear_velocity,
        )

    def close(self) -> None:
        """Release hardware resources."""

        self._hardware.close()

    def _compute_raw_velocity(self, delta_steps: int, dt: float) -> float:
        if dt < self._min_dt:
            return self._filtered_velocity
        delta_revolutions = delta_steps / self._counts_per_revolution / self._gear_ratio
        return (delta_revolutions * 2.0 * math.pi) / dt

    def _apply_low_pass(self, raw_velocity: float, dt: float) -> float:
        if self._velocity_cutoff_hz is None:
            return raw_velocity
        rc = 1.0 / (2.0 * math.pi * self._velocity_cutoff_hz)
        alpha = dt / (rc + dt)
        return self._filtered_velocity + alpha * (raw_velocity - self._filtered_velocity)

class GpioZeroEncoderHardware:
    """Adapter for gpiozero.RotaryEncoder."""

    def __init__(self, pin_a: int, pin_b: int, *, max_steps: int = 0, rotary_cls: Optional[type] = None) -> None:
        if rotary_cls is None:
            from gpiozero import RotaryEncoder  # type: ignore

            rotary_cls = RotaryEncoder
        self._encoder = rotary_cls(pin_a, pin_b, max_steps=max_steps)

    def read_steps(self) -> int:
        return int(self._encoder.steps)

    def close(self) -> None:
        self._encoder.close()
