"""Simple correlative scan matcher for aligning LIDAR scans to the occupancy grid."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional, Sequence, Tuple

import numpy as np  # type: ignore[import]

from .occupancy_grid import OccupancyGrid


def _wrap_angle(angle: float) -> float:
    return (angle + math.pi) % (2.0 * math.pi) - math.pi


@dataclass(slots=True)
class ScanMatchWindow:
    max_translation: float = 0.25
    translation_step: float = 0.025
    max_rotation: float = math.radians(6.0)
    rotation_step: float = math.radians(1.5)


@dataclass(slots=True)
class ScanMatchResult:
    best_pose: Tuple[float, float, float]
    best_score: float
    initial_score: float
    translation_offset: Tuple[float, float]
    rotation_offset: float

    def improvement(self) -> float:
        return self.best_score - self.initial_score


class CorrelativeScanMatcher:
    """Brute-force correlative scan matcher over a small search window."""

    def __init__(
        self,
        *,
        grid: OccupancyGrid,
        max_range: float,
        window: ScanMatchWindow | None = None,
        out_of_bounds_penalty: float = 0.5,
    ) -> None:
        self._grid = grid
        self._max_range = float(max_range)
        self._window = window or ScanMatchWindow()
        self._oob_penalty = max(0.0, float(out_of_bounds_penalty))

    def match(
        self,
        pose: Sequence[float],
        scan: np.ndarray,
    ) -> Optional[ScanMatchResult]:
        if scan.ndim != 2 or scan.shape[1] != 2:
            raise ValueError("scan must be an (N, 2) angle/distance array")
        points = self._scan_to_points(scan)
        if points.size == 0:
            return None
        init_pose = np.asarray(pose, dtype=float)
        if init_pose.shape != (3,):
            raise ValueError("pose must contain three values")

        translations = self._frange(-self._window.max_translation, self._window.max_translation, self._window.translation_step)
        rotations = self._frange(-self._window.max_rotation, self._window.max_rotation, self._window.rotation_step)

        best_score = -float("inf")
        best_pose = init_pose.copy()
        best_offset = (0.0, 0.0)
        best_rot = 0.0
        initial_score = self._score_pose(init_pose, points)

        for dx in translations:
            for dy in translations:
                candidate_xy = init_pose[:2] + np.array([dx, dy])
                for dtheta in rotations:
                    theta = _wrap_angle(init_pose[2] + dtheta)
                    candidate_pose = np.array([candidate_xy[0], candidate_xy[1], theta])
                    score = self._score_pose(candidate_pose, points)
                    if score > best_score:
                        best_score = score
                        best_pose = candidate_pose
                        best_offset = (float(dx), float(dy))
                        best_rot = float(dtheta)

        return ScanMatchResult(
            best_pose=(float(best_pose[0]), float(best_pose[1]), float(best_pose[2])),
            best_score=float(best_score),
            initial_score=float(initial_score),
            translation_offset=best_offset,
            rotation_offset=best_rot,
        )

    def _scan_to_points(self, scan: np.ndarray) -> np.ndarray:
        valid = np.isfinite(scan[:, 1]) & (scan[:, 1] > 0.0)
        if not np.any(valid):
            return np.empty((0, 2), dtype=float)
        clipped = np.minimum(scan[valid, 1], self._max_range)
        angles = scan[valid, 0]
        xs = clipped * np.cos(angles)
        ys = clipped * np.sin(angles)
        return np.stack([xs, ys], axis=1)

    def _score_pose(self, pose: np.ndarray, points: np.ndarray) -> float:
        world_points = self._transform_points(pose, points)
        rows, cols = self._world_to_cell_indices(world_points)
        h, w = self._grid.height, self._grid.width
        in_bounds = (rows >= 0) & (rows < h) & (cols >= 0) & (cols < w)
        if not np.any(in_bounds):
            return -self._oob_penalty * float(points.shape[0])
        grid_vals = self._grid.array[rows[in_bounds], cols[in_bounds]].astype(float)
        normalized = grid_vals / 255.0
        mean_score = float(np.mean(normalized))
        oob_count = points.shape[0] - int(np.count_nonzero(in_bounds))
        penalty = self._oob_penalty * oob_count
        return mean_score - penalty

    def _transform_points(self, pose: np.ndarray, points: np.ndarray) -> np.ndarray:
        cos_t = math.cos(pose[2])
        sin_t = math.sin(pose[2])
        rot = np.array([[cos_t, -sin_t], [sin_t, cos_t]])
        rotated = points @ rot.T
        translated = rotated + pose[:2]
        return translated

    def _world_to_cell_indices(self, points: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        origin_x, origin_y, _ = self._grid.origin
        cols = np.floor((points[:, 0] - origin_x) / self._grid.resolution).astype(int)
        rows = np.floor((points[:, 1] - origin_y) / self._grid.resolution).astype(int)
        return rows, cols

    def _frange(self, start: float, stop: float, step: float) -> np.ndarray:
        if step <= 0.0:
            raise ValueError("step must be positive")
        count = int(math.floor((stop - start) / step)) + 1
        return np.linspace(start, stop, num=count, dtype=float)


__all__ = ["CorrelativeScanMatcher", "ScanMatchResult", "ScanMatchWindow"]

