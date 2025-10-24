"""Hardware abstraction layer that coordinates individual sensor drivers."""

from __future__ import annotations

import asyncio
import inspect
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Iterable, Mapping, Sequence, TypeVar

from .encoders import EncoderReading
from .imu import ImuSample
from .lidar import LidarMeasurement


T = TypeVar("T")


async def _maybe_await(func: Callable[[], T | Awaitable[T]]) -> T:
    """Invoke *func* and await the result if it returns an awaitable."""

    result = func()
    if inspect.isawaitable(result):
        return await result  # type: ignore[arg-type]
    return result


async def _concurrent_gather(callables: Iterable[Callable[[], Awaitable[T]]]) -> list[T]:
    """Execute *callables* concurrently and return their results in order."""

    tasks = [asyncio.create_task(coro()) for coro in callables]
    try:
        return [await task for task in tasks]
    finally:
        for task in tasks:
            if not task.done():  # pragma: no cover - defensive cleanup
                task.cancel()


AsyncFactory = Callable[[], Awaitable[T]]


@dataclass(slots=True)
class HardwareSnapshot:
    """Single synchronous snapshot of the robot's primary sensors."""

    timestamp: float
    lidar_scan: list[LidarMeasurement]
    imu_sample: ImuSample
    encoders: Dict[str, EncoderReading]
    ultrasonic_distance_m: float
    water_level_percentage: float


class HardwareAbstractionLayer:
    """Coordinates asynchronous access to heterogeneous robot sensors."""

    def __init__(
        self,
        *,
        lidar_reader: AsyncFactory[list[LidarMeasurement]],
        imu_reader: AsyncFactory[ImuSample],
        encoder_readers: Mapping[str, AsyncFactory[EncoderReading]] | None = None,
        ultrasonic_reader: AsyncFactory[float],
        water_level_reader: AsyncFactory[float],
        start_hooks: Sequence[Callable[[], Any]] | None = None,
        stop_hooks: Sequence[Callable[[], Any]] | None = None,
        clock: Callable[[], float] = time.perf_counter,
    ) -> None:
        self._lidar_reader = lidar_reader
        self._imu_reader = imu_reader
        self._encoder_readers = dict(encoder_readers or {})
        self._ultrasonic_reader = ultrasonic_reader
        self._water_level_reader = water_level_reader
        self._start_hooks = tuple(start_hooks or ())
        self._stop_hooks = tuple(stop_hooks or ())
        self._clock = clock
        self._started = False

    @property
    def started(self) -> bool:
        """Return ``True`` when the hardware layer has been started."""

        return self._started

    async def __aenter__(self) -> "HardwareAbstractionLayer":
        await self.start()
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:  # noqa: ARG002
        await self.stop()

    async def start(self) -> None:
        """Initialize hardware resources and mark the layer as running."""

        if self._started:
            return

        for hook in self._start_hooks:
            await _maybe_await(hook)

        self._started = True

    async def stop(self) -> None:
        """Release hardware resources (idempotent)."""

        if not self._started:
            return

        try:
            for hook in self._stop_hooks:
                await _maybe_await(hook)
        finally:
            self._started = False

    async def read_all(self) -> HardwareSnapshot:
        """Collect a synchronous snapshot from all configured sensors."""

        if not self._started:
            raise RuntimeError("HardwareAbstractionLayer.start() must be called before read_all().")

        encoder_names = list(self._encoder_readers.keys())
        encoder_results: list[EncoderReading] = []
        if encoder_names:
            encoder_factories = [self._encoder_readers[name] for name in encoder_names]
            encoder_results = await _concurrent_gather(encoder_factories)

        lidar_scan, imu_sample, ultrasonic_distance, water_level = await asyncio.gather(
            self._lidar_reader(),
            self._imu_reader(),
            self._ultrasonic_reader(),
            self._water_level_reader(),
        )

        encoders = {name: reading for name, reading in zip(encoder_names, encoder_results)}

        return HardwareSnapshot(
            timestamp=self._clock(),
            lidar_scan=lidar_scan,
            imu_sample=imu_sample,
            encoders=encoders,
            ultrasonic_distance_m=ultrasonic_distance,
            water_level_percentage=water_level,
        )


__all__ = ["HardwareAbstractionLayer", "HardwareSnapshot"]
