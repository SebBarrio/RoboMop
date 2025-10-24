"""Entry point for the RoboMop robot application."""

from __future__ import annotations

import argparse
import asyncio
import logging
import signal
from typing import Any, Mapping

from communication.command_receiver import CommandReceiver
from communication.state_publisher import StatePublisher
from communication.websocket_client import ConnectionConfig, WebSocketClient
from config import AppConfig, load_config


class RobotApp:
    """Coordinates communication between the robot and backend services."""

    def __init__(self, config: AppConfig, logger: logging.Logger) -> None:
        self._config = config
        self._logger = logger

        connection = ConnectionConfig(
            url=config.websocket.url,
            robot_id=config.websocket.robot_id,
            api_key=config.websocket.api_key,
            namespace=config.websocket.namespace,
            socketio_path=config.websocket.socketio_path,
            transports=config.websocket.transports,
        )
        self._ws = WebSocketClient(
            connection,
            ack_timeout=config.ack_timeout,
            logger=logger.getChild("ws"),
        )

        map_hz = config.publish.map_hz if config.publish.map_hz is not None else 5.0
        self._publisher = StatePublisher(
            self._ws,
            self._state_provider,
            map_provider=None,
            state_hz=config.publish.state_hz,
            map_hz=map_hz,
            logger=logger.getChild("publisher"),
        )

        self._receiver = CommandReceiver(
            self._ws,
            on_move=self._on_move,
            on_set_mode=self._on_set_mode,
            on_e_stop=self._on_e_stop,
            on_set_speed=self._on_set_speed,
            on_config_update=self._on_config_update,
            logger=logger.getChild("commands"),
        )

        self._mode = config.robot.mode
        self._speed_multiplier = config.robot.speed_multiplier
        self._velocity = {"linear": 0.0, "angular": 0.0}
        self._pose = {"x": 0.0, "y": 0.0, "theta": 0.0}
        self._battery_level = 100
        self._water_level = 100
        self._errors: list[str] = []

    async def start(self) -> None:
        self._logger.info("Connecting to backend at %s", self._config.websocket.url)
        await self._ws.connect()
        await self._receiver.start()
        await self._publisher.start()
        self._logger.info("Robot connection established (mode=%s)", self._mode)

    async def stop(self) -> None:
        self._logger.info("Shutting down robot application")
        self._receiver.stop()
        await self._publisher.stop()
        await self._ws.disconnect()

    def _state_provider(self) -> Mapping[str, Any]:
        return {
            "mode": self._mode,
            "position": self._pose,
            "velocity": self._velocity,
            "batteryLevel": self._battery_level,
            "waterLevel": self._water_level,
            "motorCurrents": [],
            "errors": list(self._errors),
        }

    async def _on_move(self, command_id: str, params: Mapping[str, Any]) -> None:
        direction = str(params.get("direction", "STOP")).upper()
        speed = float(params.get("speed", 0.0)) * self._speed_multiplier
        duration = float(params.get("duration", 0.0))

        self._logger.debug(
            "Received move command %s direction=%s speed=%.3f duration=%.2f",
            command_id,
            direction,
            speed,
            duration,
        )

        if direction == "FORWARD":
            self._velocity = {"linear": speed, "angular": 0.0}
        elif direction == "BACKWARD":
            self._velocity = {"linear": -speed, "angular": 0.0}
        elif direction == "LEFT":
            self._velocity = {"linear": 0.0, "angular": speed}
        elif direction == "RIGHT":
            self._velocity = {"linear": 0.0, "angular": -speed}
        else:
            self._velocity = {"linear": 0.0, "angular": 0.0}

    async def _on_set_mode(
        self,
        command_id: str,
        mode: str,
        parameters: Mapping[str, Any],
    ) -> None:
        self._logger.info("Mode changed via command %s: %s", command_id, mode)
        self._mode = mode

    async def _on_e_stop(self, command_id: str) -> None:
        self._logger.warning("Emergency stop triggered by command %s", command_id)
        self._velocity = {"linear": 0.0, "angular": 0.0}
        self._mode = "IDLE"

    async def _on_set_speed(self, command_id: str, multiplier: float) -> None:
        self._speed_multiplier = float(multiplier)
        self._logger.info("Speed multiplier updated to %.2f", self._speed_multiplier)

    async def _on_config_update(self, command_id: str, patch: Mapping[str, Any]) -> None:
        if "speedMultiplier" in patch:
            await self._on_set_speed(command_id, float(patch["speedMultiplier"]))
        if "mode" in patch:
            self._mode = str(patch["mode"]).upper()


async def _serve(app: RobotApp) -> None:
    await app.start()
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop_event.set)
        except NotImplementedError:
            continue

    try:
        await stop_event.wait()
    except asyncio.CancelledError:
        raise
    finally:
        await app.stop()


def _build_overrides(args: argparse.Namespace) -> dict[str, Any]:
    overrides: dict[str, Any] = {}

    def nested(section: str) -> dict[str, Any]:
        entry = overrides.setdefault(section, {})
        assert isinstance(entry, dict)
        return entry

    if args.robot_id:
        nested("websocket")["robotId"] = args.robot_id
    if args.server_url:
        nested("websocket")["url"] = args.server_url
    if args.api_key:
        nested("websocket")["apiKey"] = args.api_key
    if args.namespace:
        nested("websocket")["namespace"] = args.namespace
    if args.socketio_path:
        nested("websocket")["socketioPath"] = args.socketio_path
    if args.transports:
        nested("websocket")["transports"] = args.transports
    if args.state_hz is not None:
        nested("publish")["stateHz"] = args.state_hz
    if args.map_hz is not None:
        nested("publish")["mapHz"] = args.map_hz
    if args.mode:
        nested("robot")["mode"] = args.mode
    if args.speed_multiplier is not None:
        nested("robot")["speedMultiplier"] = args.speed_multiplier
    if args.log_level:
        overrides["logLevel"] = args.log_level
    if args.ack_timeout is not None:
        overrides["ackTimeout"] = args.ack_timeout

    return overrides


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the RoboMop robot control client")
    parser.add_argument("--config", type=str, help="Path to YAML configuration file")
    parser.add_argument("--robot-id", type=str, help="Override the robot identifier")
    parser.add_argument("--server-url", type=str, help="Override the backend server URL")
    parser.add_argument("--api-key", type=str, help="API key used for authentication")
    parser.add_argument("--namespace", type=str, help="Socket.IO namespace override")
    parser.add_argument(
        "--socketio-path",
        type=str,
        help="Custom Socket.IO path on the backend (default: socket.io)",
    )
    parser.add_argument(
        "--transports",
        nargs="+",
        help="Comma separated list of allowed Socket.IO transports",
    )
    parser.add_argument(
        "--state-hz",
        type=float,
        help="State publication frequency in Hz",
    )
    parser.add_argument(
        "--map-hz",
        type=float,
        help="Map publication frequency in Hz (set to 0 to disable)",
    )
    parser.add_argument("--mode", type=str, help="Initial robot mode override")
    parser.add_argument(
        "--speed-multiplier",
        type=float,
        help="Speed multiplier override between 0.1 and 1.0",
    )
    parser.add_argument("--log-level", type=str, help="Logging level override")
    parser.add_argument(
        "--ack-timeout",
        type=float,
        help="Command acknowledgement timeout in seconds",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    overrides = _build_overrides(args)
    config_path = args.config

    config = load_config(config_path, overrides=overrides if overrides else None)
    logging.basicConfig(
        level=getattr(logging, config.log_level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    logger = logging.getLogger("robomop")
    logger.info("Loaded configuration (robotId=%s)", config.websocket.robot_id)

    app = RobotApp(config, logger)
    try:
        asyncio.run(_serve(app))
    except KeyboardInterrupt:
        logger.info("Interrupted by user, shutting down")


if __name__ == "__main__":
    main()
