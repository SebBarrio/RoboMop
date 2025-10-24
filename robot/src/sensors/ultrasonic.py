"""Ultrasonic distance sensor interface (HC-SR04) for cliff detection.

TODO: Replace stub implementation when hardware is available (Task T078).
"""

from __future__ import annotations

import asyncio
import random


class UltrasonicSensor:
    """Stub ultrasonic sensor that returns mock distance readings."""

    def __init__(
        self,
        *,
        trigger_pin: int = 23,
        echo_pin: int = 24,
        max_distance: float = 4.0,
    ) -> None:
        self._trigger_pin = trigger_pin
        self._echo_pin = echo_pin
        self._max_distance = max_distance
        self._started = False
        self._mock_distance = 0.3

    async def start(self) -> None:
        """Initialize the ultrasonic sensor hardware."""
        self._started = True

    async def stop(self) -> None:
        """Clean up ultrasonic sensor resources."""
        self._started = False

    async def read_distance(self) -> float:
        """Read distance measurement in meters.

        Returns:
            Distance in meters (0.02 to max_distance).
            Returns max_distance if no echo detected.
        """
        if not self._started:
            raise RuntimeError("Sensor not started")

        await asyncio.sleep(0.001)
        distance = self._mock_distance + random.uniform(-0.05, 0.05)
        return max(0.02, min(distance, self._max_distance))


async def create_ultrasonic_sensor(
    *,
    trigger_pin: int = 23,
    echo_pin: int = 24,
    max_distance: float = 4.0,
) -> UltrasonicSensor:
    """Factory function to create and initialize an ultrasonic sensor.

    Args:
        trigger_pin: GPIO pin for trigger signal
        echo_pin: GPIO pin for echo signal
        max_distance: Maximum measurable distance in meters

    Returns:
        Initialized UltrasonicSensor instance
    """
    sensor = UltrasonicSensor(
        trigger_pin=trigger_pin,
        echo_pin=echo_pin,
        max_distance=max_distance,
    )
    await sensor.start()
    return sensor
