"""Unit tests for the A* navigation planner."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import pytest

from src.slam.occupancy_grid import OccupancyGrid


def build_grid(
    *,
    width: int = 10,
    height: int = 10,
    resolution: float = 1.0,
    origin: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> OccupancyGrid:
    grid = OccupancyGrid(width=width, height=height, resolution=resolution, origin=origin)
    return grid


def mark_cells(grid: OccupancyGrid, cells: Iterable[tuple[int, int]], value: int) -> None:
    for row, col in cells:
        grid.set_cell(row, col, value)


def cell_center(grid: OccupancyGrid, row: int, col: int) -> tuple[float, float]:
    origin_x, origin_y, _ = grid.origin
    x = origin_x + (col + 0.5) * grid.resolution
    y = origin_y + (row + 0.5) * grid.resolution
    return x, y


@dataclass(frozen=True, slots=True)
class PlannerFixture:
    grid: OccupancyGrid
    planner: "AStarPlanner"


def create_planner_fixture() -> PlannerFixture:
    grid = build_grid(width=8, height=8, resolution=0.5)

    from src.navigation.astar import AStarPlanner

    planner = AStarPlanner(grid, obstacle_threshold=200)
    return PlannerFixture(grid=grid, planner=planner)


def test_plan_returns_straight_path_on_clear_floor() -> None:
    fixture = create_planner_fixture()
    grid, planner = fixture.grid, fixture.planner

    start = cell_center(grid, 1, 1)
    goal = cell_center(grid, 1, 6)

    corridor = [(1, c) for c in range(1, 7)]
    mark_cells(grid, corridor, 40)

    path = planner.plan(start, goal)

    assert path is not None
    assert path[0] == pytest.approx(start, rel=1e-6)
    assert path[-1] == pytest.approx(goal, rel=1e-6)
    steps = [cell_center(grid, 1, c) for c in range(1, 7)]
    assert path == steps


def test_plan_avoids_obstacles_and_detours() -> None:
    fixture = create_planner_fixture()
    grid, planner = fixture.grid, fixture.planner

    obstacle_cells = [(1, 3), (2, 3), (3, 3)]
    mark_cells(grid, obstacle_cells, 230)

    # Create vertical corridor around obstacle
    detour_cells = [
        (1, 1),
        (1, 2),
        (1, 4),
        (1, 5),
        (2, 1),
        (2, 2),
        (2, 4),
        (2, 5),
        (3, 1),
        (3, 2),
        (3, 4),
        (3, 5),
        (4, 1),
        (4, 2),
        (4, 3),
        (4, 4),
        (4, 5),
    ]
    mark_cells(grid, detour_cells, 40)

    start = cell_center(grid, 1, 1)
    goal = cell_center(grid, 4, 5)

    path = planner.plan(start, goal)

    assert path is not None
    for row, col in obstacle_cells:
        obstacle = cell_center(grid, row, col)
        assert obstacle not in path
    assert path[-1] == pytest.approx(goal, rel=1e-6)


def test_plan_returns_none_for_blocked_goal() -> None:
    fixture = create_planner_fixture()
    grid, planner = fixture.grid, fixture.planner

    start = cell_center(grid, 0, 0)
    goal = cell_center(grid, 2, 2)
    mark_cells(grid, [(0, 0), (0, 1), (1, 0), (1, 1)], 40)
    mark_cells(grid, [(2, 2)], 240)

    assert planner.plan(start, goal) is None


def test_find_frontiers_detects_unknown_boundary() -> None:
    fixture = create_planner_fixture()
    grid, planner = fixture.grid, fixture.planner

    from src.navigation.astar import Frontier

    known_cells = [(r, c) for r in range(2, 5) for c in range(2, 6)]
    mark_cells(grid, known_cells, 50)

    frontiers = planner.find_frontiers()

    assert frontiers
    frontier_cells = {frontier.cell for frontier in frontiers}
    # Expect unknown cells touching known area inside the square
    expected = {(1, 2), (1, 3), (1, 4), (1, 5)}
    assert expected.issubset(frontier_cells)


def test_plan_to_nearest_frontier_returns_path() -> None:
    fixture = create_planner_fixture()
    grid, planner = fixture.grid, fixture.planner

    from src.navigation.astar import Frontier

    known_cells = [(r, c) for r in range(2, 5) for c in range(2, 6)]
    mark_cells(grid, known_cells, 50)

    start = cell_center(grid, 3, 3)
    result = planner.plan_to_nearest_frontier(start)

    assert result is not None
    frontier, path = result
    assert isinstance(frontier, Frontier)
    assert path[0] == pytest.approx(start, rel=1e-6)
    assert frontier.cell in planner.frontier_cells
    # Path should end adjacent to the frontier cell
    end_x, end_y = path[-1]
    end_cell = None
    for r in range(grid.height):
        for c in range(grid.width):
            cx, cy = cell_center(grid, r, c)
            if end_x == pytest.approx(cx, rel=1e-6) and end_y == pytest.approx(cy, rel=1e-6):
                end_cell = (r, c)
                break
        if end_cell is not None:
            break
    assert end_cell is not None

    fr_row, fr_col = frontier.cell
    end_row, end_col = end_cell
    assert abs(fr_row - end_row) + abs(fr_col - end_col) == 1
