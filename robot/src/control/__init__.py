"""Control subsystem package for RoboMop robot."""

from __future__ import annotations

__all__ = [
    "MotorController",
    "MotorChannelConfig",
]

from .pwm_controller import MotorChannelConfig, MotorController
