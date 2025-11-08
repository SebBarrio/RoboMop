"""SLAM manager coordinating occupancy grid mapping and particle filter localisation."""

from __future__ import annotations

import math
from typing import Callable, Sequence

import numpy as np

from .occupancy_grid import OccupancyGrid
from .particle_filter import ParticleFilter


ScanArray = np.ndarray
WeightModel = Callable[[np.ndarray, np.ndarray, OccupancyGrid], np.ndarray]


def _as_pose(sequence: Sequence[float] | np.ndarray) -> np.ndarray:
    pose = np.asarray(sequence, dtype=float)
    if pose.shape != (3,):
        raise ValueError("pose must be a sequence of three elements")
    return pose


class SlamManager:
    """Integrates particle filter localisation with occupancy grid mapping."""

    def __init__(
        self,
        *,
        occupancy_grid: OccupancyGrid,
        particle_filter: ParticleFilter,
        resample_threshold: float = 0.5,
        occupied_value: int = 220,
        free_value: int = 40,
        max_range: float = 5.0,
        sensor_pose: Sequence[float] | np.ndarray = (0.0, 0.0, 0.0),
        weight_model: WeightModel | None = None,
    ) -> None:
        if not 0.0 < resample_threshold <= 1.0:
            raise ValueError("resample_threshold must be in the range (0, 1]")
        if not 0 <= occupied_value <= 255:
            raise ValueError("occupied_value must be between 0 and 255")
        if not 0 <= free_value <= 255:
            raise ValueError("free_value must be between 0 and 255")
        if occupied_value <= free_value:
            raise ValueError("occupied_value must be greater than free_value")
        if max_range <= 0.0:
            raise ValueError("max_range must be positive")

        self._grid = occupancy_grid
        self._filter = particle_filter
        self._resample_threshold = float(resample_threshold)
        self._occupied_value = int(occupied_value)
        self._free_value = int(free_value)
        self._max_range = float(max_range)
        self._sensor_pose = _as_pose(sensor_pose)
        self._weight_model = weight_model
        self._last_estimate: np.ndarray | None = None

    @property
    def occupancy_grid(self) -> OccupancyGrid:
        return self._grid

    @property
    def particle_filter(self) -> ParticleFilter:
        return self._filter

    @property
    def occupied_value(self) -> int:
        return self._occupied_value

    @property
    def free_value(self) -> int:
        return self._free_value

    @property
    def resample_threshold(self) -> float:
        return self._resample_threshold

    def step(
        self,
        *,
        control: Sequence[float] | np.ndarray,
        process_covariance: np.ndarray | Sequence[Sequence[float]],
        scan: Sequence[Sequence[float]] | np.ndarray,
        weight_model: WeightModel | None = None,
        sensor_pose: Sequence[float] | np.ndarray | None = None,
    ) -> tuple[np.ndarray, np.ndarray]:
        """Execute a prediction-update cycle and integrate the LIDAR scan."""

        self._filter.predict(control=control, process_covariance=process_covariance)
        scan_array = self._validate_scan(scan)
        weights = self._compute_measurement_weights(scan_array, weight_model)
        self._filter.update(weights)

        if self._filter.needs_resample(self._resample_threshold):
            self._filter.resample()

        mean, covariance = self._filter.estimate()
        active_sensor_pose = _as_pose(sensor_pose) if sensor_pose is not None else self._sensor_pose
        self._update_map(mean, scan_array, active_sensor_pose)
        self._last_estimate = mean
        return mean, covariance

    def _validate_scan(self, scan: Sequence[Sequence[float]] | np.ndarray) -> ScanArray:
        scan_array = np.asarray(scan, dtype=float)
        if scan_array.ndim != 2 or scan_array.shape[1] != 2:
            raise ValueError("scan must be an array of shape (n, 2) containing angle and distance")
        return scan_array

    def _compute_measurement_weights(
        self,
        scan: ScanArray,
        override_weight_model: WeightModel | None,
    ) -> np.ndarray:
        model = override_weight_model or self._weight_model
        if model is not None:
            weights = np.asarray(model(self._filter.particles, scan, self._grid), dtype=float)
        else:
            weights = self._default_weight_model(scan)

        if weights.shape != (self._filter.particle_count,):
            raise ValueError("weight model must return an array matching particle count")
        if np.any(weights < 0.0):
            raise ValueError("measurement weights must be non-negative")
        if float(np.sum(weights)) <= 0.0:
            raise ValueError("measurement weights must sum to a positive value")
        return weights

    def _default_weight_model(self, scan: ScanArray) -> np.ndarray:
        particles = self._filter.particles
        scores = np.zeros(particles.shape[0], dtype=float)
        for index, pose in enumerate(particles):
            scores[index] = self._score_particle(pose, scan)

        # Shift scores to ensure strictly positive weights and avoid underflow.
        minimum = float(np.min(scores))
        adjusted = scores - minimum + 1.0
        return adjusted

    def _score_particle(self, pose: np.ndarray, scan: ScanArray) -> float:
        sensor_x, sensor_y, sensor_heading = self._sensor_in_world(pose, self._sensor_pose)
        score = 0.0
        for angle, distance in scan:
            if not math.isfinite(distance) or distance <= 0.0:
                continue
            clipped_distance = min(distance, self._max_range)
            hit_x = sensor_x + clipped_distance * math.cos(sensor_heading + angle)
            hit_y = sensor_y + clipped_distance * math.sin(sensor_heading + angle)
            cell = self._world_to_cell(hit_x, hit_y)
            if cell is None:
                score -= 0.5
                continue
            row, col = cell
            occupancy = self._grid.get_cell(row, col)
            if occupancy >= self._occupied_value:
                score += 1.0
            elif occupancy == OccupancyGrid.UNKNOWN_VALUE:
                score += 0.4
            else:
                score += 0.1
        return score

    def _sensor_in_world(
        self, pose: np.ndarray, sensor_pose: np.ndarray
    ) -> tuple[float, float, float]:
        base_x, base_y, heading = pose
        offset_x, offset_y, offset_heading = sensor_pose
        cos_heading = math.cos(heading)
        sin_heading = math.sin(heading)
        world_x = base_x + offset_x * cos_heading - offset_y * sin_heading
        world_y = base_y + offset_x * sin_heading + offset_y * cos_heading
        return world_x, world_y, heading + offset_heading

    def _update_map(self, pose: np.ndarray, scan: ScanArray, sensor_pose: np.ndarray) -> None:
        sensor_x, sensor_y, sensor_heading = self._sensor_in_world(pose, sensor_pose)
        for angle, distance in scan:
            if not math.isfinite(distance) or distance <= 0.0:
                continue

            clipped_distance = min(distance, self._max_range)
            hit_x = sensor_x + clipped_distance * math.cos(sensor_heading + angle)
            hit_y = sensor_y + clipped_distance * math.sin(sensor_heading + angle)

            free_cells = self._ray_cells(sensor_x, sensor_y, hit_x, hit_y, include_endpoint=False)
            for row, col in free_cells:
                current = self._grid.get_cell(row, col)
                # Only write free space to previously unknown cells; do not overwrite known cells
                if current == OccupancyGrid.UNKNOWN_VALUE:
                    self._grid.set_cell(row, col, self._free_value)

            if distance <= self._max_range:
                hit_cell = self._world_to_cell(hit_x, hit_y)
                if hit_cell is not None:
                    row, col = hit_cell
                    current = self._grid.get_cell(row, col)
                    # Only write occupied to previously unknown cells; do not overwrite known cells
                    if current == OccupancyGrid.UNKNOWN_VALUE:
                        self._grid.set_cell(row, col, self._occupied_value)

    def _ray_cells(
        self,
        start_x: float,
        start_y: float,
        end_x: float,
        end_y: float,
        *,
        include_endpoint: bool,
    ) -> list[tuple[int, int]]:
        distance = math.hypot(end_x - start_x, end_y - start_y)
        steps = max(1, int(distance / (self._grid.resolution * 0.5)))
        cells: list[tuple[int, int]] = []
        for i in range(steps if include_endpoint else max(steps - 1, 0)):
            ratio = (i + 1) / steps
            point_x = start_x + (end_x - start_x) * ratio
            point_y = start_y + (end_y - start_y) * ratio
            cell = self._world_to_cell(point_x, point_y)
            if cell is not None and (not cells or cell != cells[-1]):
                cells.append(cell)
        return cells

    def _world_to_cell(self, x: float, y: float) -> tuple[int, int] | None:
        origin_x, origin_y, _ = self._grid.origin
        col = int(math.floor((x - origin_x) / self._grid.resolution))
        row = int(math.floor((y - origin_y) / self._grid.resolution))
        if row < 0 or row >= self._grid.height or col < 0 or col >= self._grid.width:
            return None
        return row, col


__all__ = ["SlamManager"]
