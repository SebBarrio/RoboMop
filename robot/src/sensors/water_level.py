"""Water level sensor interface for monitoring cleaning water tank.

TODO: Replace stub implementation when hardware is available (Task T079).
"""

from __future__ import annotations

import asyncio
import random


class WaterLevelSensor:
    """Stub water level sensor that returns mock percentage readings."""

    def __init__(
        self,
        *,
        adc_channel: int = 0,
        empty_voltage: float = 0.5,
        full_voltage: float = 3.3,
    ) -> None:
        self._adc_channel = adc_channel
        self._empty_voltage = empty_voltage
        self._full_voltage = full_voltage
        self._started = False
        self._mock_level = 75.0

    async def start(self) -> None:
        """Initialize the water level sensor hardware."""
        self._started = True

    async def stop(self) -> None:
        """Clean up water level sensor resources."""
        self._started = False

    async def read_percentage(self) -> float:
        """Read water level as percentage.

        Returns:
            Water level percentage (0.0 = empty, 100.0 = full)
        """
        if not self._started:
            raise RuntimeError("Sensor not started")

        await asyncio.sleep(0.001)
        level = self._mock_level + random.uniform(-2.0, -0.5)
        self._mock_level = max(0.0, level)
        return max(0.0, min(self._mock_level, 100.0))


async def create_water_level_sensor(
    *,
    adc_channel: int = 0,
    empty_voltage: float = 0.5,
    full_voltage: float = 3.3,
) -> WaterLevelSensor:
    """Factory function to create and initialize a water level sensor.

    Args:
        adc_channel: ADC channel number for analog reading
        empty_voltage: Voltage reading when tank is empty
        full_voltage: Voltage reading when tank is full

    Returns:
        Initialized WaterLevelSensor instance
    """
    sensor = WaterLevelSensor(
        adc_channel=adc_channel,
        empty_voltage=empty_voltage,
        full_voltage=full_voltage,
    )
    await sensor.start()
    return sensor
