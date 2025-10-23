"""Coverage path planner implementing a boustrophedon sweep."""

from __future__ import annotations

from bisect import bisect_left
from collections import deque
import math
from typing import Iterable, Sequence

import numpy as np

from src.slam.occupancy_grid import OccupancyGrid


GridCell = tuple[int, int]


class CoveragePlanner:
    """Generate coverage paths over known free space in an occupancy grid."""

    def __init__(
        self,
        grid: OccupancyGrid,
        *,
        cleaning_width: float,
        overlap_ratio: float = 0.1,
        obstacle_threshold: int = 200,
    ) -> None:
        if cleaning_width <= 0.0:
            raise ValueError("cleaning_width must be positive")
        if not 0.0 <= overlap_ratio < 1.0:
            raise ValueError("overlap_ratio must be in [0.0, 1.0)")
        if not 0 <= obstacle_threshold <= 255:
            raise ValueError("obstacle_threshold must be between 0 and 255")

        self._grid = grid
        self._cleaning_width = float(cleaning_width)
        self._overlap_ratio = float(overlap_ratio)
        self._obstacle_threshold = int(obstacle_threshold)

        spacing = self._cleaning_width * (1.0 - self._overlap_ratio)
        cells = spacing / self._grid.resolution
        self._lane_step = max(1, int(math.floor(cells)))

    def plan(
        self, *, start: Sequence[float] | np.ndarray | None = None
    ) -> list[tuple[float, float]] | None:
        free_mask = self._free_mask()
        if not np.any(free_mask):
            return None

        components = self._connected_components(free_mask)
        if not components:
            return None

        start_cell: GridCell | None = None
        if start is not None:
            start_cell = self._world_to_cell(start)
            if start_cell is not None and not free_mask[start_cell]:
                start_cell = None

        if start_cell is not None:
            components.sort(key=lambda comp: self._component_distance(comp, start_cell))
        else:
            components.sort(key=lambda comp: comp["bounds"][0])

        path_cells: list[GridCell] = []
        for component in components:
            component_path = self._component_path(component)
            if not component_path:
                continue
            if path_cells:
                connection = self._connect_cells(
                    free_mask,
                    path_cells[-1],
                    component_path[0],
                )
                path_cells.extend(connection[1:])
            path_cells.extend(component_path if not path_cells else component_path[1:])

        if not path_cells:
            return None

        path = [self._cell_center(cell) for cell in path_cells]

        if start_cell is not None:
            start_point = self._cell_center(start_cell)
            index = self._find_point_index(path, start_point)
            if index is None:
                path.insert(0, start_point)
            elif index != 0:
                path = path[index:] + path[:index]

        return path

    def _free_mask(self) -> np.ndarray:
        array = self._grid.array
        mask = (array != OccupancyGrid.UNKNOWN_VALUE) & (array < self._obstacle_threshold)
        return mask

    def _connected_components(
        self, free_mask: np.ndarray
    ) -> list[dict[str, object]]:
        visited = np.zeros_like(free_mask, dtype=bool)
        components: list[dict[str, object]] = []

        rows, cols = np.nonzero(free_mask)
        for seed_row, seed_col in zip(rows, cols):
            if visited[seed_row, seed_col]:
                continue

            queue: deque[GridCell] = deque([(seed_row, seed_col)])
            visited[seed_row, seed_col] = True
            cells: list[GridCell] = []

            while queue:
                row, col = queue.popleft()
                cells.append((row, col))
                for neighbor in self._neighbors((row, col)):
                    nr, nc = neighbor
                    if nr < 0 or nr >= self._grid.height or nc < 0 or nc >= self._grid.width:
                        continue
                    if visited[nr, nc] or not free_mask[nr, nc]:
                        continue
                    visited[nr, nc] = True
                    queue.append((nr, nc))

            component_mask = np.zeros_like(free_mask, dtype=bool)
            if cells:
                r_idx, c_idx = zip(*cells)
                component_mask[r_idx, c_idx] = True
                min_row, max_row = min(r_idx), max(r_idx)
                min_col, max_col = min(c_idx), max(c_idx)
            else:
                min_row = max_row = seed_row
                min_col = max_col = seed_col

            components.append(
                {
                    "mask": component_mask,
                    "cells": cells,
                    "bounds": (min_row, max_row, min_col, max_col),
                }
            )

        return components

    def _component_path(self, component: dict[str, object]) -> list[GridCell]:
        mask = component["mask"]
        min_row, max_row, min_col, max_col = component["bounds"]  # type: ignore[assignment]

        rows_with_free = [
            row for row in range(min_row, max_row + 1) if np.any(mask[row, min_col : max_col + 1])
        ]
        if not rows_with_free:
            return []

        lane_rows = self._select_lane_rows(rows_with_free)
        segments = {
            row: self._row_segments(mask, row, min_col, max_col)
            for row in lane_rows
        }

        path: list[GridCell] = []
        direction = 1
        current: GridCell | None = None

        for idx, row in enumerate(lane_rows):
            row_segments = segments[row]
            if not row_segments:
                continue
            ordered_segments = row_segments if direction == 1 else list(reversed(row_segments))

            for segment in ordered_segments:
                start_col, end_col = segment if direction == 1 else (segment[1], segment[0])
                target = (row, start_col)
                if current is None:
                    path.append(target)
                    current = target
                else:
                    connection = self._connect_cells(mask, current, target)
                    path.extend(connection[1:])
                    current = path[-1]

                cols = (
                    range(start_col, end_col + 1)
                    if direction == 1
                    else range(start_col, end_col - 1, -1)
                )
                for col in cols:
                    cell = (row, col)
                    if cell != current:
                        path.append(cell)
                        current = cell

            if idx < len(lane_rows) - 1:
                next_row = lane_rows[idx + 1]
                next_segments = segments[next_row]
                if not next_segments:
                    direction *= -1
                    continue
                next_segment = next_segments[-1] if direction == 1 else next_segments[0]
                target_col = next_segment[1] if direction == 1 else next_segment[0]
                target_cell = (next_row, target_col)
                connection = self._connect_cells(mask, current, target_cell)
                path.extend(connection[1:])
                current = path[-1]
                direction *= -1

        return path

    def _select_lane_rows(self, rows: list[int]) -> list[int]:
        rows = sorted(set(rows))
        if not rows:
            return []

        selected: list[int] = []
        index = 0
        while index < len(rows):
            row = rows[index]
            selected.append(row)
            target = row + self._lane_step
            index = bisect_left(rows, target)
        if selected[-1] != rows[-1]:
            selected.append(rows[-1])
        return selected

    def _row_segments(
        self, mask: np.ndarray, row: int, min_col: int, max_col: int
    ) -> list[tuple[int, int]]:
        segments: list[tuple[int, int]] = []
        in_segment = False
        start = min_col

        for col in range(min_col, max_col + 1):
            if mask[row, col]:
                if not in_segment:
                    start = col
                    in_segment = True
            else:
                if in_segment:
                    segments.append((start, col - 1))
                    in_segment = False
        if in_segment:
            segments.append((start, max_col))
        return segments

    def _connect_cells(
        self, mask: np.ndarray, start: GridCell, goal: GridCell
    ) -> list[GridCell]:
        if start == goal:
            return [start]

        queue: deque[GridCell] = deque([start])
        came_from: dict[GridCell, GridCell | None] = {start: None}

        while queue:
            current = queue.popleft()
            if current == goal:
                break
            for neighbor in self._neighbors(current):
                nr, nc = neighbor
                if nr < 0 or nr >= self._grid.height or nc < 0 or nc >= self._grid.width:
                    continue
                if not mask[nr, nc] or neighbor in came_from:
                    continue
                came_from[neighbor] = current
                queue.append(neighbor)

        if goal not in came_from:
            return [start, goal]

        path: list[GridCell] = []
        cur: GridCell | None = goal
        while cur is not None:
            path.append(cur)
            cur = came_from[cur]
        path.reverse()
        return path

    def _neighbors(self, cell: GridCell) -> Iterable[GridCell]:
        row, col = cell
        return (
            (row - 1, col),
            (row + 1, col),
            (row, col - 1),
            (row, col + 1),
        )

    def _world_to_cell(self, point: Sequence[float] | np.ndarray) -> GridCell | None:
        x, y = float(point[0]), float(point[1])
        origin_x, origin_y, _ = self._grid.origin
        col = int(math.floor((x - origin_x) / self._grid.resolution))
        row = int(math.floor((y - origin_y) / self._grid.resolution))
        if row < 0 or row >= self._grid.height or col < 0 or col >= self._grid.width:
            return None
        return row, col

    def _cell_center(self, cell: GridCell) -> tuple[float, float]:
        row, col = cell
        origin_x, origin_y, _ = self._grid.origin
        x = origin_x + (col + 0.5) * self._grid.resolution
        y = origin_y + (row + 0.5) * self._grid.resolution
        return (x, y)

    def _component_distance(self, component: dict[str, object], cell: GridCell) -> float:
        min_row, max_row, min_col, max_col = component["bounds"]  # type: ignore[assignment]
        row, col = cell
        dr = 0.0
        if row < min_row:
            dr = min_row - row
        elif row > max_row:
            dr = row - max_row
        dc = 0.0
        if col < min_col:
            dc = min_col - col
        elif col > max_col:
            dc = col - max_col
        return dr + dc

    def _find_point_index(
        self, path: list[tuple[float, float]], point: tuple[float, float]
    ) -> int | None:
        for idx, (px, py) in enumerate(path):
            if math.isclose(px, point[0], rel_tol=1e-9, abs_tol=1e-9) and math.isclose(
                py, point[1], rel_tol=1e-9, abs_tol=1e-9
            ):
                return idx
        return None


__all__ = ["CoveragePlanner"]
