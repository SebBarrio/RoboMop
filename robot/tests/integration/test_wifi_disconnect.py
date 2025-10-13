"""Integration test for Quickstart Scenario 9: WiFi disconnection handling."""

import asyncio
from dataclasses import replace

import pytest

from robot.src.config import MapConfig, RobotConfig
from robot.src.main import RobotApplication

# pylint: disable=duplicate-code


@pytest.mark.asyncio
async def test_wifi_disconnect_behavior(tmp_path):
    config = RobotConfig(
        robot_id="robot-wifi-disconnect",
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
        name="WiFi Map",
        resolution=config.map.resolution,
        width=config.map.width,
        height=config.map.height,
        origin=(config.map.origin_x, config.map.origin_y, config.map.origin_theta),
    )

    await app.mode_manager.set_manual_mode()
    await app.command_bus.send_manual_command(direction="FORWARD", speed=0.3)

    await advance_ticks(app, count=3)

    await app.testkit.simulate_wifi_disconnect()

    await wait_until(lambda: app.motion_controller.is_stopped, timeout_s=5.0)

    manual_state = await app.state_repository.get_latest_state()
    assert manual_state.mode == "IDLE"
    assert manual_state.velocity.linear == pytest.approx(0.0)

    await app.testkit.simulate_wifi_reconnect()

    cleaning_session = await app.start_cleaning_session(map_id=base_map.id)

    await cleaning_session.tick()
    await cleaning_session.tick()

    await app.testkit.simulate_wifi_disconnect()

    await asyncio.sleep(1.0)

    state_during_disconnect = await cleaning_session.tick()
    assert state_during_disconnect.status == "IN_PROGRESS"

    await app.testkit.simulate_wifi_reconnect()

    resumed_state = await wait_for_status(cleaning_session, "IN_PROGRESS")
    assert resumed_state.status == "IN_PROGRESS"

    await cleaning_session.tick()
    await cleaning_session.tick()

    assert resumed_state.distance_traveled_m > 0.0


async def advance_ticks(app: RobotApplication, count: int):
    for _ in range(count):
        await app.scheduler.tick()


async def wait_until(predicate, timeout_s: float):
    deadline = asyncio.get_event_loop().time() + timeout_s
    while asyncio.get_event_loop().time() < deadline:
        if predicate():
            return
        await asyncio.sleep(0.05)
    raise TimeoutError("Condition not satisfied before timeout")


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
