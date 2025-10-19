"""Generic PID controller implementation used across RoboMop control loops."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True, eq=False, repr=False)
class PIDController:
    """Discrete PID controller with anti-windup and output clamping."""

    kp: float = 0.0
    ki: float = 0.0
    kd: float = 0.0
    integrator_limit: float | None = None
    output_limits: tuple[float | None, float | None] | None = None
    _integral: float = field(init=False, default=0.0)
    _prev_error: float | None = field(init=False, default=None)
    _min_output: float | None = field(init=False, default=None)
    _max_output: float | None = field(init=False, default=None)

    def __post_init__(self) -> None:
        low: float | None = None
        high: float | None = None
        if self.output_limits is not None:
            low, high = self.output_limits
            if low is not None and high is not None and low > high:
                raise ValueError("Invalid output_limits: min cannot exceed max")
        self._min_output = low
        self._max_output = high

    def reset(self) -> None:
        self._integral = 0.0
        self._prev_error = None

    def update(self, error: float, dt: float) -> float:
        if dt <= 0.0:
            raise ValueError("dt must be positive")

        if self.ki != 0.0:
            self._integral += error * dt
            if self.integrator_limit is not None:
                limit = abs(self.integrator_limit)
                self._integral = max(-limit, min(self._integral, limit))

        derivative = 0.0
        if self.kd != 0.0 and self._prev_error is not None:
            derivative = (error - self._prev_error) / dt
        self._prev_error = error

        output = (self.kp * error) + (self.ki * self._integral) + (self.kd * derivative)
        clamped_output = output

        if self._min_output is not None:
            clamped_output = max(self._min_output, clamped_output)
        if self._max_output is not None:
            clamped_output = min(self._max_output, clamped_output)

        if clamped_output != output and self.ki != 0.0:
            self._integral -= error * dt
            if self.integrator_limit is not None:
                limit = abs(self.integrator_limit)
                self._integral = max(-limit, min(self._integral, limit))
            clamped_output = (self.kp * error) + (self.ki * self._integral) + (self.kd * derivative)
            if self._min_output is not None:
                clamped_output = max(self._min_output, clamped_output)
            if self._max_output is not None:
                clamped_output = min(self._max_output, clamped_output)

        return clamped_output
