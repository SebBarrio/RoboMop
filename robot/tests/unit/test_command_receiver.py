"""Unit tests for the robot command receiver module."""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Optional

import pytest

from src.communication.command_receiver import CommandReceiver


@dataclass(slots=True)
class _Emission:
    event: str
    payload: Dict[str, Any]
    timestamp: float


class _FakeWebSocket:
    def __init__(self) -> None:
        self._handlers: dict[str, Callable[[Dict[str, Any]], Awaitable[None]]] = {}
        self.emitted: list[_Emission] = []

    def on(self, event: str, handler: Callable[..., Awaitable[None] | None]) -> None:
        async def wrapper(payload: Optional[Dict[str, Any]] = None, ack: Any | None = None) -> None:  # noqa: ANN401
            result = handler(payload or {}, ack)
            if asyncio.iscoroutine(result):
                await result

        self._handlers[event] = wrapper

    def off(self, event: str) -> None:
        self._handlers.pop(event, None)

    async def emit(self, event: str, payload: Dict[str, Any]) -> None:
        self.emitted.append(_Emission(event=event, payload=payload, timestamp=time.perf_counter()))

    async def trigger(self, event: str, payload: Optional[Dict[str, Any]] = None) -> None:
        handler = self._handlers[event]
        await handler(payload or {}, None)


def _find_ack(emissions: list[_Emission], command_id: str, status: str) -> Dict[str, Any]:
    for emission in emissions:
        if emission.event == "command:ack" and emission.payload.get("commandId") == command_id:
            if emission.payload.get("status") == status:
                return emission.payload
    raise AssertionError(f"Ack with status {status!r} for command {command_id!r} not found")


@pytest.mark.asyncio
async def test_move_ack_and_dispatch() -> None:
    ws = _FakeWebSocket()
    received: list[tuple[str, dict[str, Any]]] = []

    async def on_move(command_id: str, params: dict[str, Any]) -> None:
        received.append((command_id, params))

    receiver = CommandReceiver(
        ws,
        on_move=on_move,
    )

    await receiver.start()

    payload = {
        "commandId": "cmd-123",
        "direction": "FORWARD",
        "speed": 0.4,
        "duration": 1.0,
    }

    await ws.trigger("command:move", payload)
    await asyncio.sleep(0)

    ack = _find_ack(ws.emitted, "cmd-123", "ACKNOWLEDGED")
    assert ack["commandId"] == "cmd-123"

    assert received
    command_id, params = received[0]
    assert command_id == "cmd-123"
    assert params == {"direction": "FORWARD", "speed": 0.4, "duration": 1.0}

    receiver.stop()


@pytest.mark.asyncio
async def test_estop_ack_within_500ms() -> None:
    ws = _FakeWebSocket()
    called = asyncio.Event()

    async def on_e_stop(command_id: str) -> None:
        called.set()

    receiver = CommandReceiver(ws, on_e_stop=on_e_stop)
    await receiver.start()

    payload = {"commandId": "cmd-estop"}

    start = time.perf_counter()
    await ws.trigger("command:e-stop", payload)
    ack_event = _find_ack(ws.emitted, "cmd-estop", "ACKNOWLEDGED")
    ack_time = next(em.timestamp for em in ws.emitted if em.payload is ack_event)

    assert (ack_time - start) < 0.5

    await asyncio.wait_for(called.wait(), timeout=1.0)

    receiver.stop()


@pytest.mark.asyncio
async def test_invalid_payload_yields_failed_ack() -> None:
    ws = _FakeWebSocket()
    receiver = CommandReceiver(ws)
    await receiver.start()

    payload = {"direction": "FORWARD"}

    await ws.trigger("command:move", payload)
    failed_ack = _find_ack(ws.emitted, "", "FAILED")
    assert failed_ack["code"] == "INVALID_PAYLOAD"

    receiver.stop()
