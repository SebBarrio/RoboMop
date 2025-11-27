"""A* path planning utilities for navigating occupancy grids.

This module provides path planning that accounts for robot physical dimensions
by inflating obstacles based on the robot's footprint.
"""

from __future__ import annotations

import heapq
import math
from dataclasses import dataclass
from typing import Iterable, Optional, Sequence, TYPE_CHECKING

import numpy as np

from src.slam.occupancy_grid import OccupancyGrid

if TYPE_CHECKING:
    from src.navigation.robot_safety import RobotFootprint


GridCell = tuple[int, int]


@dataclass(frozen=True, slots=True)
class Frontier:
    """Represents an unknown cell adjacent to known free space."""

    cell: GridCell
    world: tuple[float, float]
    distance: float


class AStarPlanner:
    """Plan collision-free paths on an occupancy grid using the A* algorithm.
    
    The planner supports robot footprint-aware inflation to ensure paths are
    traversable by the actual robot dimensions, not just a point.
    
    Attributes:
        grid: The occupancy grid to plan on.
        obstacle_threshold: Cell value above which a cell is considered occupied.
        inflation_radius: Number of cells to inflate around obstacles.
        robot_footprint: Optional robot footprint for automatic inflation calculation.
        allow_diagonal: Whether diagonal movement is allowed.
    """

    def __init__(
        self,
        grid: OccupancyGrid,
        *,
        obstacle_threshold: int = 200,
        inflation_radius: int = 0,
        robot_footprint: Optional["RobotFootprint"] = None,
        allow_diagonal: bool = False,
    ) -> None:
        """Initialize the A* path planner.
        
        Args:
            grid: Occupancy grid to plan paths on.
            obstacle_threshold: Cells with values >= this are obstacles (0-255).
            inflation_radius: Manual inflation radius in cells. If robot_footprint
                is provided, this value is computed automatically and this
                parameter is ignored.
            robot_footprint: Robot physical dimensions for automatic inflation.
            allow_diagonal: Enable 8-connected movement instead of 4-connected.
        """
        if not 0 <= obstacle_threshold <= 255:
            raise ValueError("obstacle_threshold must be between 0 and 255")
        if inflation_radius < 0:
            raise ValueError("inflation_radius must be non-negative")

        self._grid = grid
        self._obstacle_threshold = int(obstacle_threshold)
        self._robot_footprint = robot_footprint
        self._allow_diagonal = bool(allow_diagonal)
        self._frontier_cells: set[GridCell] = set()
        self._frontier_neighbors: dict[GridCell, set[GridCell]] = {}
        
        # Compute inflation radius from robot footprint if provided
        if robot_footprint is not None:
            self._inflation_radius = robot_footprint.inflation_cells(grid.resolution)
        else:
            self._inflation_radius = int(inflation_radius)
        
        # Cache for inflated obstacle map (invalidated when grid changes)
        self._inflated_map: Optional[np.ndarray] = None
        self._inflated_map_version: int = 0

    @property
    def obstacle_threshold(self) -> int:
        return self._obstacle_threshold

    @property
    def inflation_radius(self) -> int:
        """Current inflation radius in grid cells."""
        return self._inflation_radius
    
    @property
    def robot_footprint(self) -> Optional["RobotFootprint"]:
        """Robot footprint used for inflation calculation."""
        return self._robot_footprint
    
    def set_robot_footprint(self, footprint: Optional["RobotFootprint"]) -> None:
        """Update the robot footprint and recalculate inflation radius.
        
        Args:
            footprint: New robot footprint, or None to disable footprint-based inflation.
        """
        self._robot_footprint = footprint
        if footprint is not None:
            self._inflation_radius = footprint.inflation_cells(self._grid.resolution)
        # Invalidate cached inflated map
        self._inflated_map = None

    @property
    def frontier_cells(self) -> frozenset[GridCell]:
        return frozenset(self._frontier_cells)
    
    def _get_inflated_map(self) -> np.ndarray:
        """Get or compute the inflated obstacle map.
        
        This method caches the inflated map for performance. The cache is
        invalidated when the inflation radius changes.
        
        Returns:
            Boolean array where True indicates a cell is blocked (obstacle or
            within inflation radius of an obstacle).
        """
        if self._inflated_map is not None:
            return self._inflated_map
        
        # Create base obstacle mask
        obstacles = self._grid.array >= self._obstacle_threshold
        
        if self._inflation_radius == 0:
            self._inflated_map = obstacles
            return self._inflated_map
        
        # Inflate obstacles using morphological dilation
        # Create a circular structuring element for the inflation
        radius = self._inflation_radius
        y, x = np.ogrid[-radius:radius + 1, -radius:radius + 1]
        structuring_element = x * x + y * y <= radius * radius
        
        # Use scipy if available, otherwise fall back to manual dilation
        try:
            from scipy.ndimage import binary_dilation
            inflated = binary_dilation(obstacles, structure=structuring_element)
        except ImportError:
            # Manual dilation fallback
            inflated = self._manual_dilate(obstacles, structuring_element)
        
        self._inflated_map = inflated
        return self._inflated_map
    
    def _manual_dilate(
        self,
        image: np.ndarray,
        structuring_element: np.ndarray,
    ) -> np.ndarray:
        """Manually dilate a binary image (fallback if scipy unavailable)."""
        h, w = image.shape
        sh, sw = structuring_element.shape
        pad_h, pad_w = sh // 2, sw // 2
        
        # Pad the image
        padded = np.pad(image, ((pad_h, pad_h), (pad_w, pad_w)), mode='constant')
        
        result = np.zeros_like(image, dtype=bool)
        
        # Find all obstacle cells
        obstacle_rows, obstacle_cols = np.where(image)
        
        # Expand each obstacle cell by the structuring element
        for r, c in zip(obstacle_rows, obstacle_cols):
            for dr in range(sh):
                for dc in range(sw):
                    if structuring_element[dr, dc]:
                        nr = r + dr - pad_h
                        nc = c + dc - pad_w
                        if 0 <= nr < h and 0 <= nc < w:
                            result[nr, nc] = True
        
        return result
    
    def invalidate_cache(self) -> None:
        """Invalidate the cached inflated map.
        
        Call this method after the occupancy grid has been updated to ensure
        the next path planning operation uses fresh obstacle data.
        """
        self._inflated_map = None

    def plan(
        self,
        start: Sequence[float] | np.ndarray,
        goal: Sequence[float] | np.ndarray,
        *,
        allow_unknown: bool = False,
    ) -> list[tuple[float, float]] | None:
        """Plan a path from ``start`` to ``goal`` returning waypoints in world coordinates."""

        start_cell = self._world_to_cell(start)
        goal_cell = self._world_to_cell(goal)
        if start_cell is None or goal_cell is None:
            return None

        if not self._is_traversable(start_cell, allow_unknown=True):
            return None
        if not self._is_traversable(goal_cell, allow_unknown=allow_unknown):
            return None

        path_cells = self._search(start_cell, goal_cell, allow_unknown=allow_unknown)
        if path_cells is None:
            return None
        return [self._cell_center(cell) for cell in path_cells]

    def find_frontiers(self) -> list[Frontier]:
        """Identify frontier cells (unknown cells adjacent to known free space)."""

        frontiers: list[Frontier] = []
        frontier_neighbors: dict[GridCell, set[GridCell]] = {}
        for row in range(self._grid.height):
            for col in range(self._grid.width):
                if self._grid.get_cell(row, col) != OccupancyGrid.UNKNOWN_VALUE:
                    continue

                neighbors = self._traversable_neighbors((row, col))
                if not neighbors:
                    continue

                cell = (row, col)
                frontier_neighbors[cell] = neighbors
                frontiers.append(
                    Frontier(
                        cell=cell,
                        world=self._cell_center(cell),
                        distance=0.0,
                    )
                )

        self._frontier_cells = {frontier.cell for frontier in frontiers}
        self._frontier_neighbors = frontier_neighbors
        return frontiers

    def plan_to_nearest_frontier(
        self, start: Sequence[float] | np.ndarray
    ) -> tuple[Frontier, list[tuple[float, float]]] | None:
        """Plan a path from ``start`` to the closest reachable frontier."""

        start_cell = self._world_to_cell(start)
        if start_cell is None or not self._is_traversable(start_cell, allow_unknown=True):
            return None

        frontiers = self.find_frontiers()
        if not frontiers:
            return None

        best_cost = math.inf
        best_path: list[GridCell] | None = None
        best_frontier: Frontier | None = None

        for frontier in frontiers:
            neighbor_cells = self._frontier_neighbors.get(frontier.cell, set())
            for neighbor in neighbor_cells:
                path_cells = self._search(start_cell, neighbor, allow_unknown=False)
                if path_cells is None:
                    continue
                cost = self._path_cost(path_cells)
                if cost < best_cost:
                    best_cost = cost
                    best_path = path_cells
                    best_frontier = frontier

        if best_frontier is None or best_path is None:
            return None

        world_path = [self._cell_center(cell) for cell in best_path]
        distance = best_cost * self._grid.resolution
        resolved_frontier = Frontier(
            cell=best_frontier.cell,
            world=best_frontier.world,
            distance=distance,
        )
        return resolved_frontier, world_path

    def _search(
        self,
        start: GridCell,
        goal: GridCell,
        *,
        allow_unknown: bool,
    ) -> list[GridCell] | None:
        if start == goal:
            return [start]

        open_set: list[tuple[float, float, GridCell]] = []
        heapq.heappush(open_set, (self._heuristic(start, goal), 0.0, start))

        came_from: dict[GridCell, GridCell] = {}
        g_score: dict[GridCell, float] = {start: 0.0}
        visited: set[GridCell] = set()

        while open_set:
            _, current_cost, current = heapq.heappop(open_set)
            if current in visited:
                continue
            visited.add(current)

            if current == goal:
                return self._reconstruct_path(came_from, current)

            for neighbor in self._neighbors(current):
                if not self._is_traversable(neighbor, allow_unknown=allow_unknown):
                    continue
                tentative = current_cost + self._movement_cost(current, neighbor)
                if tentative >= g_score.get(neighbor, math.inf):
                    continue
                came_from[neighbor] = current
                g_score[neighbor] = tentative
                priority = tentative + self._heuristic(neighbor, goal)
                heapq.heappush(open_set, (priority, tentative, neighbor))

        return None

    def _neighbors(self, cell: GridCell) -> Iterable[GridCell]:
        row, col = cell
        deltas = [(-1, 0), (1, 0), (0, -1), (0, 1)]
        if self._allow_diagonal:
            deltas += [(-1, -1), (-1, 1), (1, -1), (1, 1)]
        for dr, dc in deltas:
            nr, nc = row + dr, col + dc
            if 0 <= nr < self._grid.height and 0 <= nc < self._grid.width:
                yield nr, nc

    def _movement_cost(self, a: GridCell, b: GridCell) -> float:
        ax, ay = a
        bx, by = b
        return math.hypot(ax - bx, ay - by)

    def _heuristic(self, a: GridCell, b: GridCell) -> float:
        ax, ay = a
        bx, by = b
        return math.hypot(ax - bx, ay - by)

    def _reconstruct_path(
        self, came_from: dict[GridCell, GridCell], current: GridCell
    ) -> list[GridCell]:
        path = [current]
        while current in came_from:
            current = came_from[current]
            path.append(current)
        path.reverse()
        return path

    def _path_cost(self, path: Sequence[GridCell]) -> float:
        if len(path) < 2:
            return 0.0
        total = 0.0
        for idx in range(1, len(path)):
            total += self._movement_cost(path[idx - 1], path[idx])
        return total

    def _is_traversable(self, cell: GridCell, *, allow_unknown: bool) -> bool:
        """Check if a cell is traversable considering robot footprint inflation.
        
        Args:
            cell: (row, col) grid cell to check.
            allow_unknown: If True, unknown cells are considered traversable.
            
        Returns:
            True if the robot can safely occupy this cell.
        """
        row, col = cell
        value = self._grid.get_cell(row, col)
        
        # Check unknown status first
        if value == OccupancyGrid.UNKNOWN_VALUE and not allow_unknown:
            return False
        
        # Use the inflated map for obstacle checking (includes robot footprint)
        if self._inflation_radius > 0:
            inflated = self._get_inflated_map()
            if inflated[row, col]:
                return False
        elif value >= self._obstacle_threshold:
            return False
        
        return True

    def _has_nearby_obstacle(self, row: int, col: int) -> bool:
        """Check if there's an obstacle within inflation radius of a cell.
        
        This method is maintained for backward compatibility but the main
        traversability check now uses the cached inflated map.
        """
        if self._inflation_radius == 0:
            return False
        
        # Use cached inflated map for efficiency
        inflated = self._get_inflated_map()
        return bool(inflated[row, col])

    def _traversable_neighbors(self, cell: GridCell) -> set[GridCell]:
        neighbors: set[GridCell] = set()
        for neighbor in self._neighbors(cell):
            if self._grid.get_cell(*neighbor) == OccupancyGrid.UNKNOWN_VALUE:
                continue
            if self._is_traversable(neighbor, allow_unknown=False):
                neighbors.add(neighbor)
        return neighbors

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


__all__ = ["AStarPlanner", "Frontier", "GridCell"]

