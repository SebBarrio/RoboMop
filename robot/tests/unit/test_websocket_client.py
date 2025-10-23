"""Unit tests for the robot WebSocket client abstraction."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
import inspect
from typing import Any, Awaitable, Callable, Dict, Optional

import pytest


HandlerType = Callable[[Any], Awaitable[Any] | Any]


class FakeAsyncClient:
    """Test double for ``socketio.AsyncClient``."""

    instances: list["FakeAsyncClient"] = []

    def __init__(self, **kwargs: Any) -> None:
        self.kwargs = kwargs
        self.handlers: Dict[tuple[str, str], HandlerType] = {}
        self.connected = False
        self.connect_kwargs: Dict[str, Any] | None = None
        self.disconnect_called = False
        self.emit_calls: list[tuple[str, Any, str | None]] = []
        self.call_calls: list[tuple[str, Any, str | None, Optional[float]]] = []
        self.call_return_value: Any = None
        FakeAsyncClient.instances.append(self)

    def on(self, event: str, handler: HandlerType, namespace: str | None = None) -> None:
        key = (namespace or "/", event)
        self.handlers[key] = handler

    def off(self, event: str, handler: HandlerType | None = None, namespace: str | None = None) -> None:
        key = (namespace or "/", event)
        if key in self.handlers:
            del self.handlers[key]

    async def connect(self, url: str, **kwargs: Any) -> None:
        self.connect_kwargs = {"url": url, **kwargs}
        self.connected = True
        namespaces = kwargs.get("namespaces")
        namespace = namespaces[0] if namespaces else "/"
        await self._trigger_event("connect", namespace=namespace)

    async def disconnect(self) -> None:
        self.disconnect_called = True
        self.connected = False
        await self._trigger_event("disconnect")

    async def emit(self, event: str, data: Any, namespace: str | None = None) -> None:
        self.emit_calls.append((event, data, namespace))

    async def call(
        self,
        event: str,
        data: Any,
        *,
        namespace: str | None = None,
        timeout: float | None = None,
    ) -> Any:
        self.call_calls.append((event, data, namespace, timeout))
        return self.call_return_value

    async def _trigger_event(
        self,
        event: str,
        payload: Any | None = None,
        namespace: str | None = None,
        ack: Callable[[Any], None] | None = None,
    ) -> None:
        key = (namespace or "/", event)
        handler = self.handlers.get(key)
        if handler is None:
            return

        args: tuple[Any, ...]
        if ack is None:
            args = (payload,) if payload is not None else tuple()
        else:
            args = (payload, ack)

        try:
            signature = inspect.signature(handler)
        except (TypeError, ValueError):  # pragma: no cover - fallback for builtins
            signature = None

        if signature is None or len(signature.parameters) == 0:
            result = handler()  # type: ignore[misc]
        else:
            limited_args = args[: len(signature.parameters)]
            result = handler(*limited_args)
        if asyncio.iscoroutine(result):
            await result

    async def trigger(self, event: str, payload: Any | None = None, *, namespace: str | None = None, ack: Callable[[Any], None] | None = None) -> None:
        await self._trigger_event(event, payload, namespace, ack)


@dataclass(slots=True)
class ClientFactory:
    monkeypatch: pytest.MonkeyPatch

    def install(self) -> None:
        FakeAsyncClient.instances.clear()
        self.monkeypatch.setattr("src.communication.websocket_client.socketio.AsyncClient", FakeAsyncClient)

    @property
    def instance(self) -> FakeAsyncClient:
        assert FakeAsyncClient.instances, "FakeAsyncClient was not instantiated"
        return FakeAsyncClient.instances[-1]


@pytest.fixture()
def client_factory(monkeypatch: pytest.MonkeyPatch) -> ClientFactory:
    factory = ClientFactory(monkeypatch)
    factory.install()
    return factory


@pytest.mark.asyncio
async def test_connect_supplies_authentication(client_factory: ClientFactory) -> None:
    from src.communication.websocket_client import ConnectionConfig, WebSocketClient

    client = WebSocketClient(ConnectionConfig(url="http://localhost:3000", robot_id="robot-123", api_key="secret"))

    await client.connect()

    fake = client_factory.instance
    assert fake.connect_kwargs is not None
    assert fake.connect_kwargs["auth"] == {"robotId": "robot-123", "apiKey": "secret"}
    assert client.connected is True

    await client.disconnect()


@pytest.mark.asyncio
async def test_emit_with_ack_uses_call_and_returns_payload(client_factory: ClientFactory) -> None:
    from src.communication.websocket_client import ConnectionConfig, WebSocketClient

    client = WebSocketClient(ConnectionConfig(url="http://localhost:3000", robot_id="robot-456", api_key="secret"))

    await client.connect()

    fake = client_factory.instance
    fake.call_return_value = {"status": "accepted"}

    response = await client.emit_with_ack("robot:heartbeat", {"uptimeSeconds": 10})

    assert response == {"status": "accepted"}
    assert fake.call_calls == [("robot:heartbeat", {"uptimeSeconds": 10}, "/", client.ack_timeout)]

    await client.disconnect()


@pytest.mark.asyncio
async def test_emit_without_ack_uses_emit(client_factory: ClientFactory) -> None:
    from src.communication.websocket_client import ConnectionConfig, WebSocketClient

    client = WebSocketClient(ConnectionConfig(url="http://localhost:3000", robot_id="robot-789", api_key="secret"))

    await client.connect()

    fake = client_factory.instance

    await client.emit("robot:log", {"message": "hello"})

    assert fake.emit_calls == [("robot:log", {"message": "hello"}, "/")]

    await client.disconnect()


@pytest.mark.asyncio
async def test_event_handler_invoked_and_ack_sent(client_factory: ClientFactory) -> None:
    from src.communication.websocket_client import ConnectionConfig, WebSocketClient

    client = WebSocketClient(ConnectionConfig(url="http://localhost:3000", robot_id="robot-321", api_key="secret"))

    await client.connect()

    received: list[dict[str, Any]] = []
    acks: list[Any] = []

    async def handler(payload: dict[str, Any]) -> dict[str, Any]:
        received.append(payload)
        return {"handled": True, "commandId": payload["commandId"]}

    client.on("command:move", handler)

    payload = {"commandId": "cmd-1", "direction": "FORWARD"}

    fake = client_factory.instance
    await fake.trigger("command:move", payload, ack=acks.append)

    assert received == [payload]
    assert acks == [{"handled": True, "commandId": "cmd-1"}]

    await client.disconnect()


@pytest.mark.asyncio
async def test_disconnect_clears_connection_state(client_factory: ClientFactory) -> None:
    from src.communication.websocket_client import ConnectionConfig, WebSocketClient

    client = WebSocketClient(ConnectionConfig(url="http://localhost:3000", robot_id="robot-000", api_key="secret"))

    await client.connect()
    await client.disconnect()

    assert client.connected is False


@pytest.mark.asyncio
async def test_reconnect_options_passed_to_client(client_factory: ClientFactory) -> None:
    from src.communication.websocket_client import ConnectionConfig, ReconnectOptions, WebSocketClient

    options = ReconnectOptions(enabled=True, initial_delay=2.0, max_delay=10.0, attempts=5)
    client = WebSocketClient(
        ConnectionConfig(url="http://localhost:3000", robot_id="robot-111", api_key="secret"),
        reconnect=options,
    )

    fake = client_factory.instance
    assert fake.kwargs == {
        "reconnection": True,
        "reconnection_delay": 2.0,
        "reconnection_delay_max": 10.0,
        "reconnection_attempts": 5,
    }

    await client.connect()
    await client.disconnect()
