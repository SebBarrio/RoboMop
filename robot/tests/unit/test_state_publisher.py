"""Unit tests for the robot state publisher module."""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any, Callable

import pytest

from src.communication.state_publisher import StatePublisher


@dataclass(slots=True)
class _Emission:
    event: str
    payload: Any
    timestamp: float


class _FakeWebSocket:
    def __init__(self) -> None:
        self._connected = True
        self.emitted: list[_Emission] = []

    @property
    def connected(self) -> bool:
        return self._connected

    def set_connected(self, value: bool) -> None:
        self._connected = value

    async def wait_connected(self, timeout: float | None = None) -> None:  # noqa: ARG002
        return None

    async def emit(self, event: str, payload: Any) -> None:
        self.emitted.append(_Emission(event=event, payload=payload, timestamp=time.perf_counter()))


@pytest.mark.asyncio
async def test_state_publisher_emits_state_at_requested_rate() -> None:
    ws = _FakeWebSocket()
    call_times: list[float] = []

    def build_state() -> dict[str, Any]:
        now = time.perf_counter()
        call_times.append(now)
        return {
            "robotId": "robot-1",
            "timestamp": now,
            "mode": "CLEANING",
            "position": {"x": 0.0, "y": 0.0, "theta": 0.0, "confidence": 1.0},
            "velocity": {"linear": 0.0, "angular": 0.0},
            "batteryLevel": 95.0,
            "waterLevel": 80.0,
            "motorCurrents": {"left": 0.1, "right": 0.1},
            "errors": [],
        }

    publisher = StatePublisher(ws, build_state, state_hz=20.0)

    await publisher.start()
    await asyncio.sleep(0.18)
    await publisher.stop()

    state_events = [em for em in ws.emitted if em.event == "robot:state"]
    assert len(state_events) >= 3

    intervals = [b - a for a, b in zip(call_times, call_times[1:])]
    assert intervals, "Expected multiple state emissions"  # pragma: no cover - defensive
    for interval in intervals:
        assert interval == pytest.approx(0.05, rel=0.5, abs=0.03)


@pytest.mark.asyncio
async def test_map_updates_emitted_with_expected_payload() -> None:
    ws = _FakeWebSocket()
    map_payloads = (
        {"mapId": "map-1", "robotId": "robot-1", "updateType": "delta", "cells": []},
        None,
        {"mapId": "map-1", "robotId": "robot-1", "updateType": "delta", "cells": [(1, 2, 150)]},
    )
    payload_iter = iter(map_payloads)

    def build_state() -> dict[str, Any]:
        return {
            "robotId": "robot-1",
            "timestamp": time.perf_counter(),
            "mode": "IDLE",
            "position": {"x": 0.0, "y": 0.0, "theta": 0.0, "confidence": 1.0},
            "velocity": {"linear": 0.0, "angular": 0.0},
            "batteryLevel": 100.0,
            "waterLevel": 100.0,
            "motorCurrents": {"left": 0.0, "right": 0.0},
            "errors": [],
        }

    def build_map() -> dict[str, Any] | None:
        try:
            return next(payload_iter)
        except StopIteration:  # pragma: no cover - defensive
            return None

    publisher = StatePublisher(ws, build_state, build_map, state_hz=30.0, map_hz=15.0)

    await publisher.start()
    await asyncio.sleep(0.25)
    await publisher.stop()

    map_events = [em for em in ws.emitted if em.event == "robot:map-update"]
    assert len(map_events) >= 2
    assert map_events[0].payload["updateType"] == "delta"
    assert map_events[0].payload["mapId"] == "map-1"


@pytest.mark.asyncio
async def test_emissions_pause_when_disconnected() -> None:
    ws = _FakeWebSocket()

    def build_state() -> dict[str, Any]:
        return {
            "robotId": "robot-1",
            "timestamp": time.perf_counter(),
            "mode": "MANUAL",
            "position": {"x": 0.0, "y": 0.0, "theta": 0.0, "confidence": 1.0},
            "velocity": {"linear": 0.0, "angular": 0.0},
            "batteryLevel": 90.0,
            "waterLevel": 70.0,
            "motorCurrents": {"left": 0.2, "right": 0.2},
            "errors": [],
        }

    publisher = StatePublisher(ws, build_state, state_hz=25.0)

    await publisher.start()
    await asyncio.sleep(0.12)
    initial_count = len(ws.emitted)

    ws.set_connected(False)
    await asyncio.sleep(0.12)

    await publisher.stop()

    assert len(ws.emitted) == initial_count
