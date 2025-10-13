"""Integration test for Quickstart Scenario 2: Exploration mode map building."""

import asyncio
from dataclasses import replace

import pytest

from robot.src.config import MapConfig, RobotConfig
from robot.src.main import RobotApplication
from robot.src.slam.occupancy_grid import OccupancyGrid

# pylint: disable=duplicate-code


@pytest.mark.asyncio
async def test_exploration_mode_completes_map(tmp_path):
    config = RobotConfig(
        robot_id="robot-integration-test",
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

    exploration_session = await app.start_exploration_session()

    result = await wait_for_completion(exploration_session)

    assert result.status == "COMPLETED"

    grid = result.map
    assert isinstance(grid, OccupancyGrid)
    assert pytest.approx(grid.resolution, rel=1e-6) == config.map.resolution
    assert grid.width == config.map.width
    assert grid.height == config.map.height
    assert grid.completion_ratio >= 0.95

    stats = result.statistics
    assert stats.distance_traveled_m > 0.0
    assert stats.duration_s > 0.0
    assert stats.frontiers_remaining == 0

    # Robot state should transition back to IDLE after exploration completes
    robot_state = await app.state_repository.get_latest_state()
    assert robot_state.mode == "IDLE"
    assert robot_state.map_id == result.map_id


async def wait_for_completion(session, timeout_s: float = 300.0):
    deadline = asyncio.get_event_loop().time() + timeout_s

    last_state = None
    while asyncio.get_event_loop().time() < deadline:
        state = await session.tick()
        if state.status in {"COMPLETED", "FAILED"}:
            return state
        last_state = state
    message = (
        "Exploration session did not complete within "
        f"{timeout_s} seconds; last state={replace(last_state)}"
    )
    raise TimeoutError(message)
