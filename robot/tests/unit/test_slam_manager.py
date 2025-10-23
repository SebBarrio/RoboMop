"""Tests for the SLAM manager integration module."""

from __future__ import annotations

import math
from typing import Callable

import numpy as np
import pytest

from robot.src.slam import OccupancyGrid, ParticleFilter


def create_grid() -> OccupancyGrid:
    return OccupancyGrid(width=50, height=50, resolution=0.1, origin=(0.0, 0.0, 0.0))


def create_filter(particle_count: int = 200) -> ParticleFilter:
    rng = np.random.default_rng(1234)
    pf = ParticleFilter(particle_count=particle_count, rng=rng)
    pf.initialize_gaussian(
        mean=np.array([0.0, 0.0, 0.0]),
        covariance=np.diag([0.02, 0.02, math.radians(3.0) ** 2]),
    )
    return pf


def make_scan() -> np.ndarray:
    # Simple scan: forward hit at 1 m, slight offsets to the sides.
    return np.array(
        [
            [0.0, 1.0],
            [math.radians(20.0), 1.1],
            [math.radians(-20.0), 1.1],
        ],
        dtype=float,
    )


@pytest.fixture()
def manager():
    from robot.src.slam.slam_manager import SlamManager  # Delayed import for TDD

    grid = create_grid()
    pf = create_filter()
    return SlamManager(
        occupancy_grid=grid,
        particle_filter=pf,
        resample_threshold=0.4,
        occupied_value=220,
        free_value=40,
        max_range=4.0,
    )


def test_step_updates_map_and_pose(manager):
    scan = make_scan()
    control = np.array([0.1, 0.0, math.radians(2.0)])
    process_cov = np.diag([0.01, 0.01, math.radians(1.0) ** 2])

    mean, covariance = manager.step(
        control=control,
        process_covariance=process_cov,
        scan=scan,
    )

    assert mean.shape == (3,)
    assert covariance.shape == (3, 3)
    assert math.isfinite(mean[0]) and math.isfinite(mean[1])

    # Check that the occupancy grid recorded an obstacle hit in front of the robot.
    hit_x = mean[0] + scan[0, 1] * math.cos(mean[2] + scan[0, 0])
    hit_y = mean[1] + scan[0, 1] * math.sin(mean[2] + scan[0, 0])
    row = int((hit_y - manager.occupancy_grid.origin[1]) / manager.occupancy_grid.resolution)
    col = int((hit_x - manager.occupancy_grid.origin[0]) / manager.occupancy_grid.resolution)
    value = manager.occupancy_grid.get_cell(row, col)
    assert value == manager.occupied_value

    # Ensure that at least one free cell along the path is marked.
    path_row = int((mean[1]) / manager.occupancy_grid.resolution)
    path_col = int((mean[0] + 0.5 * scan[0, 1]) / manager.occupancy_grid.resolution)
    path_value = manager.occupancy_grid.get_cell(path_row, path_col)
    assert path_value == manager.free_value


def test_step_applies_custom_weight_model():
    from robot.src.slam.slam_manager import SlamManager

    grid = create_grid()
    pf = create_filter(particle_count=120)
    manager = SlamManager(
        occupancy_grid=grid,
        particle_filter=pf,
        resample_threshold=0.05,
        occupied_value=230,
        free_value=30,
        max_range=3.0,
    )

    scan = make_scan()
    weights = np.linspace(1.0, 2.0, pf.particle_count)

    def weight_model(particles: np.ndarray, scan_data: np.ndarray, grid_ref: OccupancyGrid) -> np.ndarray:
        assert scan_data.shape == scan.shape
        assert grid_ref is grid
        return weights

    manager.step(
        control=np.zeros(3),
        process_covariance=np.eye(3) * 1e-6,
        scan=scan,
        weight_model=weight_model,
    )

    expected = weights / weights.sum()
    np.testing.assert_allclose(manager.particle_filter.weights, expected)


def test_step_triggers_resample_when_degenerate():
    from robot.src.slam.slam_manager import SlamManager

    grid = create_grid()
    pf = create_filter(particle_count=150)
    manager = SlamManager(
        occupancy_grid=grid,
        particle_filter=pf,
        resample_threshold=0.9,
        occupied_value=210,
        free_value=25,
        max_range=3.0,
    )

    scan = make_scan()

    def extreme_weights(particles: np.ndarray, _scan: np.ndarray, _grid: OccupancyGrid) -> np.ndarray:
        result = np.zeros(particles.shape[0])
        result[0] = 1.0
        return result

    manager.step(
        control=np.zeros(3),
        process_covariance=np.eye(3) * 1e-6,
        scan=scan,
        weight_model=extreme_weights,
    )

    uniform = np.full(pf.particle_count, 1.0 / pf.particle_count)
    np.testing.assert_allclose(manager.particle_filter.weights, uniform)
