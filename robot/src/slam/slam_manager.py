"""SLAM manager coordinating occupancy grid mapping and particle filter localisation."""

from __future__ import annotations

import math
from collections import deque
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
        # Log-odds mapping parameters (with hysteresis)
        l_occ_increment: float = 0.9,
        l_free_increment: float = -0.7,
        l_min: float = -3.0,
        l_max: float = 3.0,
        l_occ_threshold: float = 0.6,
        l_free_threshold: float = -0.6,
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
        # Log-odds state and thresholds
        self._l_occ_increment = float(l_occ_increment)
        self._l_free_increment = float(l_free_increment)
        self._l_min = float(l_min)
        self._l_max = float(l_max)
        self._l_occ_threshold = float(l_occ_threshold)
        self._l_free_threshold = float(l_free_threshold)
        # Backing log-odds grid (0 means unknown / 0.5 probability)
        self._log_odds = np.zeros(
            (self._grid.height, self._grid.width), dtype=np.float32
        )
        # Seed log-odds from any existing grid content
        grid_arr = self._grid.array
        occupied_mask = grid_arr >= self._occupied_value
        # Treat any non-zero and below occupied threshold as free
        free_mask = (grid_arr > 0) & (grid_arr < self._occupied_value)
        # Use moderate confidence so hysteresis remains effective
        self._log_odds[occupied_mask] = min(self._l_max, 2.0)
        self._log_odds[free_mask] = max(self._l_min, -2.0)
        # Distance-field cache for likelihood weighting
        self._distance_cache: np.ndarray | None = None
        self._distance_cache_dirty: bool = True
        self._distance_hit_sigma = max(self._grid.resolution * 3.0, 0.05)
        self._measurement_weight_cap = 720
        self._occupied_hit_boost = 1.2
        self._free_hit_penalty = 0.35
        self._unknown_hit_prior = 0.85
        self._oob_likelihood = 0.05

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
        """Compute measurement likelihoods using a likelihood-field model."""
        particles = self._filter.particles  # (P, 3)

        valid_mask = (scan[:, 1] > 0) & (scan[:, 1] <= self._max_range)
        valid_scan = scan[valid_mask]
        if valid_scan.shape[0] == 0:
            return np.ones(particles.shape[0], dtype=float)

        if (
            self._measurement_weight_capv
            and valid_scan.shape[0] > self._measurement_weight_cap
        ):
            step = max(
                1, int(math.ceil(valid_scan.shape[0] / self._measurement_weight_cap))
            )
            valid_scan = valid_scan[::step]

        sx, sy, stheta = self._sensor_pose
        p_theta = particles[:, 2]
        cos_h = np.cos(p_theta)
        sin_h = np.sin(p_theta)

        sensor_x = particles[:, 0] + sx * cos_h - sy * sin_h
        sensor_y = particles[:, 1] + sx * sin_h + sy * cos_h

        scan_angles = valid_scan[:, 0]
        distances = valid_scan[:, 1]
        global_angles = p_theta[:, np.newaxis] + stheta + scan_angles[np.newaxis, :]

        hit_x = sensor_x[:, np.newaxis] + distances[np.newaxis, :] * np.cos(global_angles)
        hit_y = sensor_y[:, np.newaxis] + distances[np.newaxis, :] * np.sin(global_angles)

        ox, oy, _ = self._grid.origin
        res = self._grid.resolution
        cols = np.floor((hit_x - ox) / res).astype(int)
        rows = np.floor((hit_y - oy) / res).astype(int)

        h, w = self._grid.height, self._grid.width
        in_bounds = (rows >= 0) & (rows < h) & (cols >= 0) & (cols < w)

        distance_field = self._get_distance_field()
        if distance_field is not None:
            return self._likelihood_field_weights(rows, cols, in_bounds, distance_field)
        return self._occupancy_weight_from_cells(rows, cols, in_bounds)

    def _likelihood_field_weights(
        self,
        rows: np.ndarray,
        cols: np.ndarray,
        in_bounds: np.ndarray,
        distance_field: np.ndarray,
    ) -> np.ndarray:
        """Compute weights using pre-computed distance field."""
        likelihood = np.full(rows.shape, self._oob_likelihood, dtype=float)
        if np.any(in_bounds):
            valid_rows = rows[in_bounds]
            valid_cols = cols[in_bounds]
            distances = distance_field[valid_rows, valid_cols]
            sigma = max(self._distance_hit_sigma, 1e-3)
            gaussian = np.exp(-0.5 * np.square(distances / sigma))

            grid_vals = self._grid.array[valid_rows, valid_cols]
            multipliers = np.ones_like(gaussian)
            multipliers[grid_vals >= self._occupied_value] = self._occupied_hit_boost
            multipliers[
                (grid_vals > 0) & (grid_vals < self._occupied_value)
            ] = self._free_hit_penalty
            multipliers[grid_vals == OccupancyGrid.UNKNOWN_VALUE] = (
                self._unknown_hit_prior
            )

            likelihood[in_bounds] = np.clip(
                gaussian * multipliers, 1e-4, self._occupied_hit_boost
            )

        log_likelihood = np.log(likelihood)
        particle_logs = np.sum(log_likelihood, axis=1)
        particle_logs -= np.max(particle_logs)
        weights = np.exp(particle_logs)
        weights[weights <= 0.0] = 1e-6
        return weights

    def _occupancy_weight_from_cells(
        self, rows: np.ndarray, cols: np.ndarray, in_bounds: np.ndarray
    ) -> np.ndarray:
        """Fallback scoring that only considers discrete occupancy values."""
        scores = np.full(rows.shape, -0.5, dtype=float)
        if np.any(in_bounds):
            cell_vals = self._grid.array[rows[in_bounds], cols[in_bounds]]
            point_scores = np.full(cell_vals.shape, -0.1, dtype=float)
            point_scores[cell_vals >= self._occupied_value] = 1.0
            point_scores[cell_vals == OccupancyGrid.UNKNOWN_VALUE] = 0.4
            scores[in_bounds] = point_scores

        total_scores = np.sum(scores, axis=1)
        minimum = np.min(total_scores)
        adjusted = total_scores - minimum + 1.0
        return adjusted

    def _get_distance_field(self) -> np.ndarray | None:
        if not self._distance_cache_dirty and self._distance_cache is not None:
            return self._distance_cache

        grid_arr = self._grid.array
        occupied = grid_arr >= self._occupied_value
        if not np.any(occupied):
            self._distance_cache = None
            self._distance_cache_dirty = False
            return None

        try:
            from scipy.ndimage import distance_transform_edt
        except ImportError:
            self._distance_cache = self._compute_distance_field_fallback(occupied)
            self._distance_cache_dirty = False
            return self._distance_cache

        free = ~occupied
        distances = distance_transform_edt(free).astype(np.float32) * self._grid.resolution
        distances[occupied] = 0.0
        self._distance_cache = distances
        self._distance_cache_dirty = False
        return self._distance_cache

    def _compute_distance_field_fallback(self, occupied: np.ndarray) -> np.ndarray | None:
        if not np.any(occupied):
            return None

        h, w = occupied.shape
        distances = np.full((h, w), np.inf, dtype=np.float32)
        queue: deque[tuple[int, int]] = deque()
        occ_rows, occ_cols = np.nonzero(occupied)
        for r, c in zip(occ_rows, occ_cols):
            distances[r, c] = 0.0
            queue.append((r, c))

        if not queue:
            return None

        directions = (
            (1, 0, self._grid.resolution),
            (-1, 0, self._grid.resolution),
            (0, 1, self._grid.resolution),
            (0, -1, self._grid.resolution),
        )

        while queue:
            r, c = queue.popleft()
            base = distances[r, c]
            for dr, dc, cost in directions:
                nr, nc = r + dr, c + dc
                if 0 <= nr < h and 0 <= nc < w:
                    new_dist = base + cost
                    if new_dist < distances[nr, nc]:
                        distances[nr, nc] = new_dist
                        queue.append((nr, nc))

        distances[np.isinf(distances)] = self._max_range
        return distances

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
        self._distance_cache_dirty = True
        sensor_x, sensor_y, sensor_heading = self._sensor_in_world(pose, sensor_pose)
        for angle, distance in scan:
            if not math.isfinite(distance) or distance <= 0.0:
                continue

            clipped_distance = min(distance, self._max_range)
            hit_x = sensor_x + clipped_distance * math.cos(sensor_heading + angle)
            hit_y = sensor_y + clipped_distance * math.sin(sensor_heading + angle)

            free_cells = self._ray_cells(sensor_x, sensor_y, hit_x, hit_y, include_endpoint=False)
            for row, col in free_cells:
                self._apply_log_odds_update(row, col, self._l_free_increment)

            if distance <= self._max_range:
                hit_cell = self._world_to_cell(hit_x, hit_y)
                if hit_cell is not None:
                    row, col = hit_cell
                    self._apply_log_odds_update(row, col, self._l_occ_increment)

    def _apply_log_odds_update(self, row: int, col: int, delta: float) -> None:
        # Integrate evidence with clamping
        updated = float(self._log_odds[row, col] + delta)
        if updated > self._l_max:
            updated = self._l_max
        elif updated < self._l_min:
            updated = self._l_min
        self._log_odds[row, col] = updated

        # Hysteresis classification: only change discrete state when thresholds are crossed
        prev_val = self._grid.get_cell(row, col)
        is_prev_occupied = prev_val >= self._occupied_value
        is_prev_free = (prev_val > 0) and (prev_val < self._occupied_value)

        if is_prev_occupied:
            # Switch to free only with strong contrary evidence
            if updated <= self._l_free_threshold:
                self._grid.set_cell(row, col, self._free_value)
            else:
                # Remain occupied
                pass
        elif is_prev_free:
            # Switch to occupied only with strong evidence
            if updated >= self._l_occ_threshold:
                self._grid.set_cell(row, col, self._occupied_value)
            else:
                # Remain free
                pass
        else:
            # Unknown: adopt classification once evidence is strong enough
            if updated >= self._l_occ_threshold:
                self._grid.set_cell(row, col, self._occupied_value)
            elif updated <= self._l_free_threshold:
                self._grid.set_cell(row, col, self._free_value)
            else:
                # Stay unknown in the gray zone
                pass

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
