"""Configuration management utilities for the RoboMop robot."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

try:
    import yaml  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    yaml = None  # type: ignore[assignment]


class ConfigError(ValueError):
    """Raised when a configuration file contains invalid values."""


@dataclass(slots=True)
class WebSocketConfig:
    """Settings required to establish the Socket.IO connection."""

    url: str = "http://localhost:3000"
    robot_id: str = "robomop-dev"
    api_key: str | None = None
    namespace: str = "/"
    socketio_path: str = "socket.io"
    transports: tuple[str, ...] = ("websocket",)


@dataclass(slots=True)
class PublishConfig:
    """Frequencies for state and map publishing."""

    state_hz: float = 10.0
    map_hz: float | None = 5.0


@dataclass(slots=True)
class RobotConfig:
    """Robot control defaults and limits."""

    mode: str = "IDLE"
    speed_multiplier: float = 1.0
    run_triangle_test: bool = False


@dataclass(slots=True)
class HardwareConfig:
    """Hardware sensor configuration and parameters."""

    lidar_port: str = "/dev/ttyUSB0"
    lidar_baud_rate: int = 1_000_000
    lidar_motor_pwm: int = 660
    imu_i2c_bus: int = 1
    imu_address: int = 0x68
    ultrasonic_trigger_pin: int = 23
    ultrasonic_echo_pin: int = 24
    water_level_adc_channel: int = 0
    encoder_left_pins: tuple[int, int] = (17, 18)
    encoder_right_pins: tuple[int, int] = (22, 27)
    encoder_counts_per_rev: int = 1440
    wheel_diameter_m: float = 0.2


@dataclass(slots=True)
class SlamConfig:
    """SLAM algorithm configuration parameters."""

    grid_resolution: float = 0.05
    grid_width: int = 2000
    grid_height: int = 2000
    grid_origin_x: float = -50.0
    grid_origin_y: float = -50.0
    particle_count: int = 200
    resample_threshold: float = 0.5
    max_lidar_range: float = 5.0
    sensor_pose_x: float = 0.0
    sensor_pose_y: float = 0.0
    sensor_pose_theta: float = 0.0


@dataclass(slots=True)
class NavigationConfig:
    """Navigation and path planning configuration."""

    update_hz: float = 5.0
    cleaning_width: float = 0.4
    overlap_ratio: float = 0.1
    obstacle_threshold: int = 200
    inflation_radius: int = 2
    path_tolerance: float = 0.05
    heading_tolerance_deg: float = 5.0
    track_width: float = 0.3
    max_linear_speed: float = 0.5
    max_angular_speed: float = 1.0
    position_kp: float = 0.8
    position_ki: float = 0.05
    position_kd: float = 0.1
    heading_kp: float = 2.0
    heading_ki: float = 0.1
    heading_kd: float = 0.2


@dataclass(slots=True)
class AppConfig:
    """Top-level configuration object used by the robot application."""

    websocket: WebSocketConfig
    publish: PublishConfig
    robot: RobotConfig
    hardware: HardwareConfig
    slam: SlamConfig
    navigation: NavigationConfig
    log_level: str = "INFO"
    ack_timeout: float = 5.0


def load_config(
    path: str | Path | None,
    *,
    overrides: Mapping[str, Any] | None = None,
) -> AppConfig:
    """Load configuration from *path* and apply optional overrides.

    The configuration file must be a YAML mapping. Unknown sections are ignored.
    """

    data: Mapping[str, Any]
    if path is None:
        data = {}
    else:
        config_path = Path(path).expanduser().resolve()
        if not config_path.is_file():
            raise FileNotFoundError(f"Configuration file not found: {config_path}")
        yaml = _import_yaml()
        loaded = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
        if not isinstance(loaded, Mapping):
            raise ConfigError("Configuration root must be a mapping")
        data = loaded

    websocket = _build_websocket_config(_get_section(data, "websocket"))
    publish = _build_publish_config(_get_section(data, "publish"))
    robot = _build_robot_config(_get_section(data, "robot"))
    hardware = _build_hardware_config(_get_section(data, "hardware"))
    slam = _build_slam_config(_get_section(data, "slam"))
    navigation = _build_navigation_config(_get_section(data, "navigation"))
    log_level = _ensure_log_level(data.get("logLevel", "INFO"))
    ack_timeout = _ensure_positive_float(data.get("ackTimeout", 5.0), "ackTimeout")

    config = AppConfig(
        websocket=websocket,
        publish=publish,
        robot=robot,
        hardware=hardware,
        slam=slam,
        navigation=navigation,
        log_level=log_level,
        ack_timeout=ack_timeout,
    )

    if overrides:
        apply_overrides(config, overrides)

    return config


def apply_overrides(config: AppConfig, overrides: Mapping[str, Any]) -> None:
    """Mutate *config* by applying nested dictionary overrides."""

    for section, values in overrides.items():
        if section == "websocket" and isinstance(values, Mapping):
            _apply_simple_overrides(config.websocket, values)
        elif section == "publish" and isinstance(values, Mapping):
            _apply_simple_overrides(config.publish, values)
            config.publish.state_hz = _ensure_positive_float(
                config.publish.state_hz, "publish.state_hz"
            )
            adjusted = _normalize_map_hz(config.publish.map_hz)
            if adjusted is not None:
                adjusted = _ensure_positive_float(adjusted, "publish.map_hz")
            config.publish.map_hz = adjusted
        elif section == "robot" and isinstance(values, Mapping):
            _apply_simple_overrides(config.robot, values)
            config.robot.mode = config.robot.mode.upper()
            config.robot.speed_multiplier = _ensure_speed_multiplier(config.robot.speed_multiplier)
        elif section == "hardware" and isinstance(values, Mapping):
            _apply_simple_overrides(config.hardware, values)
        elif section == "slam" and isinstance(values, Mapping):
            _apply_simple_overrides(config.slam, values)
        elif section == "navigation" and isinstance(values, Mapping):
            _apply_simple_overrides(config.navigation, values)
        elif section == "logLevel":
            config.log_level = _ensure_log_level(values)
        elif section == "ackTimeout":
            config.ack_timeout = _ensure_positive_float(values, "ackTimeout")


def create_default_config() -> AppConfig:
    """Return a configuration populated with default values."""

    return AppConfig(
        websocket=WebSocketConfig(),
        publish=PublishConfig(),
        robot=RobotConfig(),
        hardware=HardwareConfig(),
        slam=SlamConfig(),
        navigation=NavigationConfig(),
    )


def _get_section(data: Mapping[str, Any], key: str) -> Mapping[str, Any]:
    value = data.get(key, {})
    if value is None:
        return {}
    if not isinstance(value, Mapping):
        raise ConfigError(f"Section '{key}' must be a mapping")
    return value


def _build_websocket_config(section: Mapping[str, Any]) -> WebSocketConfig:
    cfg = WebSocketConfig()
    if "url" in section:
        cfg.url = _ensure_non_empty_str(section["url"], "websocket.url")
    if "robotId" in section:
        cfg.robot_id = _ensure_non_empty_str(section["robotId"], "websocket.robotId")
    if "robot_id" in section:
        cfg.robot_id = _ensure_non_empty_str(section["robot_id"], "websocket.robot_id")
    if "apiKey" in section:
        cfg.api_key = _ensure_optional_str(section["apiKey"], "websocket.apiKey")
    if "api_key" in section:
        cfg.api_key = _ensure_optional_str(section["api_key"], "websocket.api_key")
    if "namespace" in section:
        cfg.namespace = _ensure_non_empty_str(section["namespace"], "websocket.namespace")
    if "socketioPath" in section:
        cfg.socketio_path = _ensure_non_empty_str(section["socketioPath"], "websocket.socketioPath")
    if "socketio_path" in section:
        cfg.socketio_path = _ensure_non_empty_str(
            section["socketio_path"], "websocket.socketio_path"
        )
    if "transports" in section:
        cfg.transports = _ensure_transports(section["transports"])
    return cfg


def _build_publish_config(section: Mapping[str, Any]) -> PublishConfig:
    state_hz = _ensure_positive_float(section.get("stateHz", 10.0), "publish.stateHz")
    map_hz_value = section.get("mapHz", 5.0)
    map_hz = _normalize_map_hz(map_hz_value)
    if map_hz is not None:
        map_hz = _ensure_positive_float(map_hz, "publish.mapHz")
    return PublishConfig(state_hz=state_hz, map_hz=map_hz)


def _build_robot_config(section: Mapping[str, Any]) -> RobotConfig:
    mode = _ensure_non_empty_str(section.get("mode", "IDLE"), "robot.mode").upper()
    speed_multiplier = _ensure_speed_multiplier(section.get("speedMultiplier", 1.0))
    return RobotConfig(mode=mode, speed_multiplier=speed_multiplier)


def _build_hardware_config(section: Mapping[str, Any]) -> HardwareConfig:
    cfg = HardwareConfig()
    _apply_simple_overrides(cfg, section)
    return cfg


def _build_slam_config(section: Mapping[str, Any]) -> SlamConfig:
    cfg = SlamConfig()
    _apply_simple_overrides(cfg, section)
    if cfg.grid_resolution <= 0.0:
        raise ConfigError("slam.grid_resolution must be positive")
    if cfg.grid_width <= 0 or cfg.grid_height <= 0:
        raise ConfigError("slam grid dimensions must be positive")
    if cfg.particle_count < 1:
        raise ConfigError("slam.particle_count must be at least 1")
    return cfg


def _build_navigation_config(section: Mapping[str, Any]) -> NavigationConfig:
    cfg = NavigationConfig()
    _apply_simple_overrides(cfg, section)
    if cfg.update_hz <= 0.0:
        raise ConfigError("navigation.update_hz must be positive")
    if cfg.cleaning_width <= 0.0:
        raise ConfigError("navigation.cleaning_width must be positive")
    if not 0.0 <= cfg.overlap_ratio < 1.0:
        raise ConfigError("navigation.overlap_ratio must be in [0.0, 1.0)")
    if cfg.track_width <= 0.0:
        raise ConfigError("navigation.track_width must be positive")
    return cfg


def _ensure_non_empty_str(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ConfigError(f"{field} must be a non-empty string")
    return value.strip()


def _ensure_optional_str(value: Any, field: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ConfigError(f"{field} must be a string or null")
    trimmed = value.strip()
    return trimmed or None


def _ensure_positive_float(value: Any, field: str) -> float:
    if isinstance(value, bool):
        raise ConfigError(f"{field} must be a positive number")
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise ConfigError(f"{field} must be a positive number") from exc
    if result <= 0.0:
        raise ConfigError(f"{field} must be greater than zero")
    return result


def _ensure_speed_multiplier(value: Any) -> float:
    result = _ensure_positive_float(value, "robot.speedMultiplier")
    if not 0.1 <= result <= 1.0:
        raise ConfigError("robot.speedMultiplier must be between 0.1 and 1.0")
    return result


def _ensure_transports(value: Any) -> tuple[str, ...]:
    if isinstance(value, tuple):
        sequence = value
    elif isinstance(value, list):
        sequence = tuple(value)
    else:
        raise ConfigError("websocket.transports must be a list or tuple of strings")
    transports: list[str] = []
    for item in sequence:
        if not isinstance(item, str) or not item:
            raise ConfigError("websocket.transports entries must be non-empty strings")
        transports.append(item)
    if not transports:
        raise ConfigError("websocket.transports must contain at least one transport")
    return tuple(transports)


def _ensure_log_level(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ConfigError("logLevel must be a non-empty string")
    return value.strip().upper()


def _apply_simple_overrides(target: Any, values: Mapping[str, Any]) -> None:
    for key, raw_value in values.items():
        attribute = _normalize_key(key)
        if not hasattr(target, attribute):
            continue
        setattr(target, attribute, raw_value)


def _normalize_key(key: str) -> str:
    if "_" in key:
        return key
    buffer: list[str] = []
    for char in key:
        if char.isupper():
            buffer.append("_")
            buffer.append(char.lower())
        else:
            buffer.append(char)
    normalized = "".join(buffer)
    if normalized.startswith("_"):
        normalized = normalized[1:]
    return normalized


def _import_yaml() -> Any:
    if yaml is None:
        raise RuntimeError("PyYAML is required for YAML configuration support.")
    return yaml


def _normalize_map_hz(value: Any) -> float | None:
    if value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError) as exc:
        raise ConfigError("publish.mapHz must be a number") from exc
    if numeric <= 0.0:
        return None
    return numeric


__all__ = [
    "AppConfig",
    "ConfigError",
    "HardwareConfig",
    "NavigationConfig",
    "PublishConfig",
    "RobotConfig",
    "SlamConfig",
    "WebSocketConfig",
    "apply_overrides",
    "create_default_config",
    "load_config",
]
