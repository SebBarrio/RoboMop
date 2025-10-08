"""Integration test for Quickstart Scenario 3: Cleaning mode full area coverage."""

import asyncio
from dataclasses import replace

import pytest

from robot.src.config import MapConfig, RobotConfig
from robot.src.main import RobotApplication

# pylint: disable=duplicate-code


@pytest.mark.asyncio
async def test_cleaning_mode_covers_accessible_area(tmp_path):
    config = RobotConfig(
        robot_id="robot-cleaning-integration",
        api_key="test-api-key",
        telemetry_rate_hz=10,
        map_update_rate_hz=5,
        map=MapConfig(
            resolution=0.05,
            width=400,
            height=400,
            origin_x=-10.0,
            origin_y=-10.0,
            origin_theta=0.0,
        ),
    )

    app = RobotApplication(config=config, data_directory=tmp_path)

    base_map = await app.map_repository.create_map(
        robot_id=config.robot_id,
        name="Integration Cleaning Map",
        resolution=config.map.resolution,
        width=config.map.width,
        height=config.map.height,
        origin=(config.map.origin_x, config.map.origin_y, config.map.origin_theta),
    )

    cleaning_session = await app.start_cleaning_session(map_id=base_map.id)

    result = await wait_for_completion(cleaning_session)

    assert result.status == "COMPLETED"
    assert result.map_id == base_map.id

    stats = result.statistics
    assert stats.coverage_ratio >= 0.95
    assert stats.path_overlap_ratio <= 0.1
    assert stats.distance_traveled_m > 0.0
    assert stats.duration_s > 0.0
    assert stats.water_used_percent > 0.0
    assert stats.completion_reason == "FINISHED"

    final_robot_state = await app.state_repository.get_latest_state()
    assert final_robot_state.mode == "IDLE"
    assert final_robot_state.battery_level > 0.0
    assert final_robot_state.map_id == base_map.id


async def wait_for_completion(session, timeout_s: float = 300.0):
    deadline = asyncio.get_event_loop().time() + timeout_s

    last_state = None
    while asyncio.get_event_loop().time() < deadline:
        state = await session.tick()
        if state.status in {"COMPLETED", "FAILED"}:
            return state
        last_state = state
    message = (
        "Cleaning session did not complete within "
        f"{timeout_s} seconds; last state={replace(last_state)}"
    )
    raise TimeoutError(message)
