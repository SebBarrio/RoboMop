"""Periodic publisher for robot state and map updates."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Awaitable, Callable, Mapping

from .websocket_client import WebSocketClient

StateProvider = Callable[[], Mapping[str, Any]]
MapProvider = Callable[[], Mapping[str, Any] | None]


class StatePublisher:
    """Publishes robot telemetry to the backend at fixed frequencies."""

    def __init__(
        self,
        websocket: WebSocketClient,
        state_provider: StateProvider,
        map_provider: MapProvider | None = None,
        *,
        state_hz: float = 10.0,
        map_hz: float = 5.0,
        logger: logging.Logger | None = None,
    ) -> None:
        if state_hz <= 0.0:
            raise ValueError("state_hz must be positive")
        if map_provider is not None and map_hz <= 0.0:
            raise ValueError("map_hz must be positive when map_provider is supplied")

        self._ws = websocket
        self._state_provider = state_provider
        self._map_provider = map_provider
        self._state_period = 1.0 / float(state_hz)
        self._map_period = 1.0 / float(map_hz) if map_provider is not None else None
        self._logger = logger or logging.getLogger(__name__)
        self._tasks: list[asyncio.Task[None]] = []

    async def start(self) -> None:
        """Start publishing once the WebSocket connection is available."""

        if self._tasks:
            return

        await self._ws.wait_connected()

        state_task = asyncio.create_task(
            self._run_periodic(self._state_period, self._publish_state)
        )
        self._tasks.append(state_task)

        if self._map_period is not None:
            map_task = asyncio.create_task(self._run_periodic(self._map_period, self._publish_map))
            self._tasks.append(map_task)

    async def stop(self) -> None:
        """Stop publishing and await task cancellation."""

        if not self._tasks:
            return

        for task in self._tasks:
            task.cancel()

        for task in self._tasks:
            try:
                await task
            except asyncio.CancelledError:  # pragma: no cover - cancellation is expected
                pass
            except Exception:  # pragma: no cover - defensive logging
                self._logger.exception("State publisher task failed during shutdown")

        self._tasks.clear()

    async def _run_periodic(
        self,
        period: float,
        callback: Callable[[], Awaitable[None]],
    ) -> None:
        loop = asyncio.get_running_loop()
        next_run = loop.time()
        try:
            while True:
                delay = next_run - loop.time()
                if delay > 0:
                    await asyncio.sleep(delay)
                else:
                    next_run = loop.time()

                try:
                    await callback()
                except Exception:  # pragma: no cover - defensive logging
                    self._logger.exception("State publisher callback raised an error")

                next_run += period
        except asyncio.CancelledError:
            raise

    async def _publish_state(self) -> None:
        if not self._ws.connected:
            return

        payload = dict(self._state_provider())
        if not payload:
            return

        await self._ws.emit("robot:state", payload)

    async def _publish_map(self) -> None:
        if self._map_provider is None or not self._ws.connected:
            return

        payload = self._map_provider()
        if not payload:
            return

        await self._ws.emit("robot:map-update", dict(payload))


__all__ = ["StatePublisher"]
