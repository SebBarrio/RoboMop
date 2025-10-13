"""Integration test for Quickstart Scenario 8: Low battery behavior."""

import asyncio
from dataclasses import replace
from datetime import datetime, timezone

import pytest

from robot.src.config import MapConfig, RobotConfig
from robot.src.main import RobotApplication

# pylint: disable=duplicate-code


@pytest.mark.asyncio
async def test_low_battery_triggers_return_to_start(tmp_path):
    config = RobotConfig(
        robot_id="robot-low-battery",
        api_key="test-api-key",
        telemetry_rate_hz=10,
        map_update_rate_hz=5,
        map=MapConfig(
            resolution=0.05,
            width=200,
            height=200,
            origin_x=-5.0,
            origin_y=-5.0,
            origin_theta=0.0,
        ),
    )

    app = RobotApplication(config=config, data_directory=tmp_path)

    base_map = await app.map_repository.create_map(
        robot_id=config.robot_id,
        name="Low Battery Map",
        resolution=config.map.resolution,
        width=config.map.width,
        height=config.map.height,
        origin=(config.map.origin_x, config.map.origin_y, config.map.origin_theta),
    )

    cleaning_session = await app.start_cleaning_session(map_id=base_map.id)

    await cleaning_session.tick()
    await cleaning_session.tick()

    await app.testkit.publish_sensor_event(
        sensor="battery",
        payload={
            "percentage": 14.5,
            "voltage": 21.8,
            "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        },
    )

    interrupted_state = await wait_for_status(cleaning_session, "INTERRUPTED")

    assert interrupted_state.status == "INTERRUPTED"
    assert interrupted_state.completion_reason == "LOW_BATTERY"

    latest_state = await app.state_repository.get_latest_state()
    assert latest_state.mode == "IDLE"
    assert latest_state.battery_level == pytest.approx(14.5, rel=1e-2)
    assert latest_state.position.is_near(config.map.origin_x, config.map.origin_y, tolerance=0.1)

    path_history = await app.navigation_logger.get_recent_path()
    assert path_history[-1].is_dock_position is True

    notifications = await app.notification_bus.drain()
    assert any(
        notification.type == "battery_low" and notification.level == "critical"
        for notification in notifications
    )


async def wait_for_status(session, expected_status: str, timeout_s: float = 120.0):
    deadline = asyncio.get_event_loop().time() + timeout_s

    last_state = None
    while asyncio.get_event_loop().time() < deadline:
        state = await session.tick()
        if state.status == expected_status:
            return state
        last_state = state
    message = (
        "Session did not reach status "
        f"{expected_status} before timeout; last state={replace(last_state)}"
    )
    raise TimeoutError(message)
