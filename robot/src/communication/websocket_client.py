"""Socket.IO client wrapper for robot communication with the backend."""

from __future__ import annotations

import asyncio
import inspect
import logging
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Optional

import socketio

EventHandler = Callable[[Any], Awaitable[Any] | Any]
AckCallback = Callable[[Any], None]


@dataclass(slots=True)
class ConnectionConfig:
    """Static configuration required to establish a WebSocket connection."""

    url: str
    robot_id: str
    api_key: str | None = None
    namespace: str = "/"
    socketio_path: str = "socket.io"
    transports: tuple[str, ...] = ("websocket",)


@dataclass(slots=True)
class ReconnectOptions:
    """Parameters controlling automatic reconnection behaviour."""

    enabled: bool = True
    initial_delay: float = 1.0
    max_delay: float = 30.0
    attempts: int | None = None


class WebSocketClient:
    """Asynchronous Socket.IO client with auto-reconnect and typed helpers."""

    def __init__(
        self,
        config: ConnectionConfig,
        *,
        reconnect: ReconnectOptions | None = None,
        ack_timeout: float = 5.0,
        logger: logging.Logger | None = None,
    ) -> None:
        self._config = config
        self._ack_timeout = float(ack_timeout)
        self._logger = logger or logging.getLogger(__name__)
        self._listeners: Dict[str, set[Callable[..., Awaitable[None]]]] = {}
        self._connect_lock = asyncio.Lock()
        self._connected_event = asyncio.Event()
        options = reconnect or ReconnectOptions()

        self._client = socketio.AsyncClient(
            reconnection=options.enabled,
            reconnection_delay=options.initial_delay,
            reconnection_delay_max=options.max_delay,
            reconnection_attempts=options.attempts,
        )

        namespace = self._config.namespace
        self._client.on("connect", self._handle_connect, namespace=namespace)
        self._client.on("disconnect", self._handle_disconnect, namespace=namespace)
        self._client.on("connect_error", self._handle_connect_error, namespace=namespace)

    @property
    def ack_timeout(self) -> float:
        return self._ack_timeout

    @property
    def connected(self) -> bool:
        return self._client.connected

    async def connect(self, *, timeout: float | None = None) -> None:
        async with self._connect_lock:
            if self.connected:
                self._connected_event.set()
                return

            wait_timeout = timeout or 10.0
            auth = {"robotId": self._config.robot_id}
            if self._config.api_key:
                auth["apiKey"] = self._config.api_key

            transports = list(self._config.transports)
            await self._client.connect(
                self._config.url,
                auth=auth,
                transports=transports,
                namespaces=[self._config.namespace],
                socketio_path=self._config.socketio_path,
                wait=True,
                wait_timeout=wait_timeout,
            )

        await self.wait_connected(timeout=timeout)

    async def wait_connected(self, *, timeout: float | None = None) -> None:
        wait_timeout = timeout or 10.0
        await asyncio.wait_for(self._connected_event.wait(), timeout=wait_timeout)

    async def disconnect(self) -> None:
        async with self._connect_lock:
            if not self.connected:
                self._connected_event.clear()
                return

            await self._client.disconnect()
            self._connected_event.clear()

    async def emit(self, event: str, payload: Any) -> None:
        await self._client.emit(event, payload, namespace=self._config.namespace)

    async def emit_with_ack(self, event: str, payload: Any, *, timeout: float | None = None) -> Any:
        ack_timeout = timeout or self._ack_timeout
        return await self._client.call(
            event,
            payload,
            namespace=self._config.namespace,
            timeout=ack_timeout,
        )

    def on(self, event: str, handler: EventHandler) -> None:
        namespace = self._config.namespace

        async def wrapper(payload: Any | None = None, ack: AckCallback | None = None) -> None:
            try:
                try:
                    parameters = tuple(inspect.signature(handler).parameters.values())
                except (TypeError, ValueError):  # pragma: no cover - handler without signature
                    parameters = ()

                expects_payload = len(parameters) >= 1
                expects_ack = len(parameters) >= 2

                if expects_ack:
                    result = handler(payload, ack)
                elif expects_payload:
                    result = handler(payload)
                else:
                    result = handler()

                if inspect.isawaitable(result):
                    result = await result
                if not expects_ack and callable(ack) and result is not None:
                    ack(result)
            except Exception as exc:  # noqa: BLE001 - downstream handler errors logged
                self._logger.exception("WebSocket handler for %s failed", event, exc_info=exc)
                if callable(ack):
                    ack({"error": str(exc)})

        self._client.on(event, wrapper, namespace=namespace)
        self._listeners.setdefault(event, set()).add(wrapper)

    def off(self, event: str) -> None:
        namespace = self._config.namespace
        wrappers = self._listeners.pop(event, set())
        for wrapper in wrappers:
            self._client.off(event, wrapper, namespace=namespace)

    async def trigger_local(self, event: str, payload: Any | None = None) -> None:
        namespace = self._config.namespace
        wrappers = self._listeners.get(event, set())
        for wrapper in wrappers:
            await wrapper(payload, None)

    def _handle_connect(self) -> None:
        self._logger.info("Robot WebSocket connected: namespace=%s", self._config.namespace)
        self._connected_event.set()

    def _handle_disconnect(self) -> None:
        self._logger.info("Robot WebSocket disconnected: namespace=%s", self._config.namespace)
        self._connected_event.clear()

    def _handle_connect_error(self, error: Exception) -> None:  # pragma: no cover - informational
        self._logger.error("Failed to connect robot WebSocket: %s", error)
