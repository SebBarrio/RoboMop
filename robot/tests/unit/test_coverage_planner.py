"""Unit tests for the coverage path planner."""

from __future__ import annotations

from collections import defaultdict
from typing import Iterable

import pytest

from src.slam.occupancy_grid import OccupancyGrid


def build_grid(
    *,
    width: int = 8,
    height: int = 8,
    resolution: float = 0.5,
    origin: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> OccupancyGrid:
    return OccupancyGrid(width=width, height=height, resolution=resolution, origin=origin)


def mark_cells(grid: OccupancyGrid, cells: Iterable[tuple[int, int]], value: int) -> None:
    for row, col in cells:
        grid.set_cell(row, col, value)


def cell_center(grid: OccupancyGrid, row: int, col: int) -> tuple[float, float]:
    origin_x, origin_y, _ = grid.origin
    x = origin_x + (col + 0.5) * grid.resolution
    y = origin_y + (row + 0.5) * grid.resolution
    return x, y


def test_plan_generates_boustrophedon_path_across_open_area() -> None:
    grid = build_grid(width=4, height=4, resolution=0.5)
    free_cells = [(r, c) for r in range(4) for c in range(4)]
    mark_cells(grid, free_cells, 40)

    start = cell_center(grid, 0, 0)

    from src.navigation.coverage_planner import CoveragePlanner

    planner = CoveragePlanner(grid, cleaning_width=0.5, overlap_ratio=0.1)
    path = planner.plan(start=start)

    assert path is not None
    expected_path = [
        cell_center(grid, 0, 0),
        cell_center(grid, 0, 1),
        cell_center(grid, 0, 2),
        cell_center(grid, 0, 3),
        cell_center(grid, 1, 3),
        cell_center(grid, 1, 2),
        cell_center(grid, 1, 1),
        cell_center(grid, 1, 0),
        cell_center(grid, 2, 0),
        cell_center(grid, 2, 1),
        cell_center(grid, 2, 2),
        cell_center(grid, 2, 3),
        cell_center(grid, 3, 3),
        cell_center(grid, 3, 2),
        cell_center(grid, 3, 1),
        cell_center(grid, 3, 0),
    ]
    assert path == pytest.approx(expected_path, rel=1e-6)


def test_plan_avoids_obstacle_cells() -> None:
    grid = build_grid(width=5, height=4, resolution=0.5)
    free_cells = [(r, c) for r in range(4) for c in range(5)]
    mark_cells(grid, free_cells, 40)
    obstacle_column = [(r, 2) for r in range(4)]
    mark_cells(grid, obstacle_column, 240)

    start = cell_center(grid, 0, 0)

    from src.navigation.coverage_planner import CoveragePlanner

    planner = CoveragePlanner(grid, cleaning_width=0.5, overlap_ratio=0.1)
    path = planner.plan(start=start)

    assert path is not None
    obstacle_centers = {cell_center(grid, r, 2) for r in range(4)}
    assert all(point not in obstacle_centers for point in path)


def test_plan_returns_none_when_no_free_cells() -> None:
    grid = build_grid(width=3, height=3, resolution=0.5)

    from src.navigation.coverage_planner import CoveragePlanner

    planner = CoveragePlanner(grid, cleaning_width=0.5, overlap_ratio=0.1)
    assert planner.plan(start=(0.25, 0.25)) is None


def test_lane_spacing_respects_overlap_ratio() -> None:
    resolution = 0.2
    grid = build_grid(width=6, height=6, resolution=resolution)
    free_cells = [(r, c) for r in range(6) for c in range(6)]
    mark_cells(grid, free_cells, 60)

    cleaning_width = 0.5
    overlap_ratio = 0.1

    from src.navigation.coverage_planner import CoveragePlanner

    planner = CoveragePlanner(
        grid,
        cleaning_width=cleaning_width,
        overlap_ratio=overlap_ratio,
    )
    path = planner.plan(start=cell_center(grid, 0, 0))

    assert path is not None

    # Group path points by lane (unique y positions while moving laterally)
    points_by_y: dict[float, list[tuple[float, float]]] = defaultdict(list)
    for x, y in path:
        points_by_y[round(y, 6)].append((x, y))

    lane_ys = sorted(points_by_y)
    assert len(lane_ys) >= 2

    max_spacing = cleaning_width * (1 - overlap_ratio) + 1e-6
    spacings = [abs(lane_ys[i + 1] - lane_ys[i]) for i in range(len(lane_ys) - 1)]
    assert all(spacing <= max_spacing for spacing in spacings)
