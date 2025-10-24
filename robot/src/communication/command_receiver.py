"""Command receiver for backend-issued robot commands."""

from __future__ import annotations

import asyncio
import logging
import math
from typing import Any, Awaitable, Callable, Mapping, MutableMapping

from .websocket_client import WebSocketClient

MoveHandler = Callable[[str, Mapping[str, Any]], Awaitable[None] | None]
ModeHandler = Callable[[str, str, Mapping[str, Any]], Awaitable[None] | None]
EStopHandler = Callable[[str], Awaitable[None] | None]
SpeedHandler = Callable[[str, float], Awaitable[None] | None]
ConfigHandler = Callable[[str, Mapping[str, Any]], Awaitable[None] | None]


class CommandReceiver:
    """Handles Socket.IO command events and dispatches them to callbacks."""

    _MOVE_EVENTS = {"FORWARD", "BACKWARD", "LEFT", "RIGHT", "STOP"}
    _MODE_EVENTS = {"IDLE", "EXPLORATION", "CLEANING", "MANUAL", "RETURNING"}

    def __init__(
        self,
        websocket: WebSocketClient,
        *,
        on_move: MoveHandler | None = None,
        on_set_mode: ModeHandler | None = None,
        on_e_stop: EStopHandler | None = None,
        on_set_speed: SpeedHandler | None = None,
        on_config_update: ConfigHandler | None = None,
        logger: logging.Logger | None = None,
    ) -> None:
        self._ws = websocket
        self._on_move = on_move
        self._on_set_mode = on_set_mode
        self._on_e_stop = on_e_stop
        self._on_set_speed = on_set_speed
        self._on_config_update = on_config_update
        self._logger = logger or logging.getLogger(__name__)
        self._started = False
        self._tasks: set[asyncio.Task[None]] = set()

    async def start(self) -> None:
        if self._started:
            return

        self._ws.on("command:move", self._handle_move)
        self._ws.on("command:set-mode", self._handle_set_mode)
        self._ws.on("command:e-stop", self._handle_e_stop)
        self._ws.on("command:set-speed", self._handle_set_speed)
        self._ws.on("command:config-update", self._handle_config_update)
        self._started = True

    def stop(self) -> None:
        if not self._started:
            return

        self._ws.off("command:move")
        self._ws.off("command:set-mode")
        self._ws.off("command:e-stop")
        self._ws.off("command:set-speed")
        self._ws.off("command:config-update")
        self._started = False

        tasks = list(self._tasks)
        self._tasks.clear()
        for task in tasks:
            task.cancel()
        for task in tasks:
            try:
                task.result()
            except asyncio.CancelledError:  # pragma: no cover - expected
                continue
            except Exception:  # pragma: no cover - defensive logging
                self._logger.exception("Command handler task raised during shutdown")

    async def _handle_move(
        self, payload: Mapping[str, Any] | None, ack: Any | None = None
    ) -> None:  # noqa: ANN401
        await self._process_command(payload, self._validate_move, self._dispatch_move)

    async def _handle_set_mode(
        self, payload: Mapping[str, Any] | None, ack: Any | None = None
    ) -> None:  # noqa: ANN401
        await self._process_command(payload, self._validate_set_mode, self._dispatch_set_mode)

    async def _handle_e_stop(
        self, payload: Mapping[str, Any] | None, ack: Any | None = None
    ) -> None:  # noqa: ANN401
        await self._process_command(payload, self._validate_e_stop, self._dispatch_e_stop)

    async def _handle_set_speed(
        self, payload: Mapping[str, Any] | None, ack: Any | None = None
    ) -> None:  # noqa: ANN401
        await self._process_command(payload, self._validate_set_speed, self._dispatch_set_speed)

    async def _handle_config_update(
        self, payload: Mapping[str, Any] | None, ack: Any | None = None
    ) -> None:  # noqa: ANN401
        await self._process_command(
            payload, self._validate_config_update, self._dispatch_config_update
        )

    async def _process_command(
        self,
        payload: Mapping[str, Any] | None,
        validator: Callable[[Mapping[str, Any]], tuple[str, Mapping[str, Any]]],
        dispatcher: Callable[[str, Mapping[str, Any]], Awaitable[None] | None],
    ) -> None:
        data = payload or {}
        try:
            command_id, params = validator(data)
        except _ValidationError as exc:
            await self._emit_failed_ack(exc.command_id, exc.code, exc.message)
            return

        await self._emit_ack(command_id, "ACKNOWLEDGED")
        if dispatcher is None:
            return
        self._spawn_handler(dispatcher, command_id, params)

    def _spawn_handler(
        self,
        handler: Callable[[str, Mapping[str, Any]], Awaitable[None] | None],
        command_id: str,
        params: Mapping[str, Any],
    ) -> None:
        if handler is None:
            return

        async def runner() -> None:
            try:
                result = handler(command_id, params)
                if asyncio.iscoroutine(result):
                    await result
            except Exception as exc:  # noqa: BLE001 - log and report failure
                self._logger.exception("Command handler failed for %s", command_id)
                await self._emit_failed_ack(command_id, "HANDLER_ERROR", str(exc))
            else:
                await self._emit_ack(command_id, "EXECUTED")

        task = asyncio.create_task(runner())
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _emit_ack(self, command_id: str, status: str, **extra: Any) -> None:
        payload: dict[str, Any] = {"commandId": command_id, "status": status}
        payload.update(extra)
        await self._ws.emit("command:ack", payload)

    async def _emit_failed_ack(self, command_id: str, code: str, message: str) -> None:
        await self._emit_ack(command_id, "FAILED", code=code, message=message)

    def _validate_move(self, payload: Mapping[str, Any]) -> tuple[str, Mapping[str, Any]]:
        command_id = _require_command_id(payload)
        direction = _require_str(payload, "direction").upper()
        if direction not in self._MOVE_EVENTS:
            raise _ValidationError(
                command_id, "INVALID_DIRECTION", f"Unsupported direction: {direction}"
            )

        speed = payload.get("speed", 0.0)
        if direction != "STOP":
            speed = _require_number(payload, "speed")
        else:
            speed = float(speed) if isinstance(speed, (float, int)) else 0.0

        duration = float(payload.get("duration", 0.0))
        if duration < 0.0:
            raise _ValidationError(command_id, "INVALID_DURATION", "duration must be non-negative")

        params: MutableMapping[str, Any] = {
            "direction": direction,
            "speed": float(speed),
            "duration": duration,
        }
        return command_id, params

    def _validate_set_mode(self, payload: Mapping[str, Any]) -> tuple[str, Mapping[str, Any]]:
        command_id = _require_command_id(payload)
        mode = _require_str(payload, "mode").upper()
        if mode not in self._MODE_EVENTS:
            raise _ValidationError(command_id, "INVALID_MODE", f"Unsupported mode: {mode}")

        parameters = payload.get("parameters", {})
        if parameters and not isinstance(parameters, Mapping):
            raise _ValidationError(command_id, "INVALID_PARAMETERS", "parameters must be an object")

        params: MutableMapping[str, Any] = {"mode": mode, "parameters": dict(parameters or {})}
        return command_id, params

    def _validate_e_stop(self, payload: Mapping[str, Any]) -> tuple[str, Mapping[str, Any]]:
        command_id = _require_command_id(payload)
        return command_id, {}

    def _validate_set_speed(self, payload: Mapping[str, Any]) -> tuple[str, Mapping[str, Any]]:
        command_id = _require_command_id(payload)
        multiplier = _require_number(payload, "speedMultiplier")
        if not (0.1 <= multiplier <= 1.0):
            raise _ValidationError(
                command_id, "INVALID_SPEED", "speedMultiplier must be between 0.1 and 1.0"
            )
        return command_id, {"speedMultiplier": float(multiplier)}

    def _validate_config_update(self, payload: Mapping[str, Any]) -> tuple[str, Mapping[str, Any]]:
        command_id = _require_command_id(payload)
        config = payload.get("config")
        if not isinstance(config, Mapping):
            raise _ValidationError(command_id, "INVALID_CONFIG", "config must be an object")
        return command_id, dict(config)

    def _dispatch_move(self, command_id: str, params: Mapping[str, Any]) -> Awaitable[None] | None:
        if self._on_move is None:
            return None
        return self._on_move(command_id, params)

    def _dispatch_set_mode(
        self, command_id: str, params: Mapping[str, Any]
    ) -> Awaitable[None] | None:
        if self._on_set_mode is None:
            return None
        return self._on_set_mode(command_id, params["mode"], params["parameters"])

    def _dispatch_e_stop(
        self, command_id: str, params: Mapping[str, Any]
    ) -> Awaitable[None] | None:
        if self._on_e_stop is None:
            return None
        return self._on_e_stop(command_id)

    def _dispatch_set_speed(
        self, command_id: str, params: Mapping[str, Any]
    ) -> Awaitable[None] | None:
        if self._on_set_speed is None:
            return None
        return self._on_set_speed(command_id, params["speedMultiplier"])

    def _dispatch_config_update(
        self, command_id: str, params: Mapping[str, Any]
    ) -> Awaitable[None] | None:
        if self._on_config_update is None:
            return None
        return self._on_config_update(command_id, params)


class _ValidationError(Exception):
    def __init__(self, command_id: str, code: str, message: str) -> None:
        super().__init__(message)
        self.command_id = command_id or ""
        self.code = code
        self.message = message


def _require_command_id(payload: Mapping[str, Any]) -> str:
    identifier = payload.get("commandId")
    if not isinstance(identifier, str) or not identifier:
        raise _ValidationError("", "INVALID_PAYLOAD", "commandId is required")
    return identifier


def _require_str(payload: Mapping[str, Any], field: str) -> str:
    value = payload.get(field)
    if not isinstance(value, str) or not value:
        raise _ValidationError(
            payload.get("commandId", ""), "INVALID_PAYLOAD", f"{field} must be a non-empty string"
        )
    return value


def _require_number(payload: Mapping[str, Any], field: str) -> float:
    value = payload.get(field)
    if not isinstance(value, (int, float)) or math.isnan(float(value)) or math.isinf(float(value)):
        raise _ValidationError(
            payload.get("commandId", ""), "INVALID_PAYLOAD", f"{field} must be a finite number"
        )
    return float(value)


__all__ = ["CommandReceiver"]
