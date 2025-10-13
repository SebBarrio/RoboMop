"""Integration test for Quickstart Scenario 7: Water level monitoring."""

import asyncio
from dataclasses import replace
from datetime import datetime, timezone

import pytest

from robot.src.config import MapConfig, RobotConfig
from robot.src.main import RobotApplication

# pylint: disable=duplicate-code


@pytest.mark.asyncio
async def test_low_water_level_pauses_cleaning(tmp_path):
    config = RobotConfig(
        robot_id="robot-water-level",
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
        name="Water Level Map",
        resolution=config.map.resolution,
        width=config.map.width,
        height=config.map.height,
        origin=(config.map.origin_x, config.map.origin_y, config.map.origin_theta),
    )

    cleaning_session = await app.start_cleaning_session(map_id=base_map.id)

    # Simulate normal operation for a few ticks
    await cleaning_session.tick()
    await cleaning_session.tick()

    await app.testkit.publish_sensor_event(
        sensor="water_level",
        payload={
            "percentage": 15.0,
            "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        },
    )

    paused_state = await wait_for_status(cleaning_session, "PAUSED")

    assert paused_state.status == "PAUSED"
    assert paused_state.pause_reason == "LOW_WATER"
    assert paused_state.pending_actions == ["REFILL_TANK"]

    latest_state = await app.state_repository.get_latest_state()
    assert latest_state.mode == "IDLE"
    assert latest_state.water_level == pytest.approx(15.0)

    alerts = await app.alert_repository.list_active_alerts()
    assert any(alert.code == "WATER_LOW" for alert in alerts)

    notifications = await app.notification_bus.drain()
    assert any(
        notification.type == "water_low" and notification.level == "warning"
        for notification in notifications
    )


async def wait_for_status(session, expected_status: str, timeout_s: float = 60.0):
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
