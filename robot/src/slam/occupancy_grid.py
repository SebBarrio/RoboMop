"""Occupancy grid map representation for the RoboMop SLAM pipeline."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence, Tuple

import numpy as np


GridCoordinate = Tuple[int, int]
GridOrigin = Tuple[float, float, float]
CellUpdate = Tuple[int, int, int]


@dataclass(frozen=True, slots=True)
class GridBounds:
    width: int
    height: int
    resolution: float


class OccupancyGrid:
    """2D occupancy grid stored as an 8-bit numpy array."""

    UNKNOWN_VALUE = 0
    MIN_VALUE = 0
    MAX_VALUE = 255

    def __init__(
        self,
        *,
        width: int,
        height: int,
        resolution: float,
        origin: GridOrigin = (0.0, 0.0, 0.0),
        data: np.ndarray | None = None,
    ) -> None:
        if width <= 0:
            raise ValueError("width must be positive")
        if height <= 0:
            raise ValueError("height must be positive")
        if resolution <= 0.0:
            raise ValueError("resolution must be positive")
        if len(origin) != 3:
            raise ValueError("origin must be a 3-tuple of (x, y, theta)")

        self._bounds = GridBounds(width=width, height=height, resolution=resolution)
        self._origin = (float(origin[0]), float(origin[1]), float(origin[2]))

        if data is None:
            self._array = np.full(
                (height, width),
                fill_value=self.UNKNOWN_VALUE,
                dtype=np.uint8,
            )
        else:
            self._array = self._validate_array(data)

    @property
    def width(self) -> int:
        return self._bounds.width

    @property
    def height(self) -> int:
        return self._bounds.height

    @property
    def resolution(self) -> float:
        return self._bounds.resolution

    @property
    def origin(self) -> GridOrigin:
        return self._origin

    @property
    def array(self) -> np.ndarray:
        return self._array

    @property
    def cell_count(self) -> int:
        return self.width * self.height

    @property
    def completion_ratio(self) -> float:
        known = int(np.count_nonzero(self._array != self.UNKNOWN_VALUE))
        return 0.0 if self.cell_count == 0 else known / self.cell_count

    def copy(self) -> "OccupancyGrid":
        return OccupancyGrid(
            width=self.width,
            height=self.height,
            resolution=self.resolution,
            origin=self.origin,
            data=self._array.copy(),
        )

    def get_cell(self, row: int, col: int) -> int:
        self._validate_indices(row, col)
        return int(self._array[row, col])

    def set_cell(self, row: int, col: int, value: int) -> None:
        self._validate_indices(row, col)
        self._validate_value(value)
        self._array[row, col] = value

    def update_cells(self, cells: Iterable[CellUpdate]) -> None:
        for row, col, value in cells:
            self.set_cell(row, col, value)

    def clear(self) -> None:
        self._array.fill(self.UNKNOWN_VALUE)

    def neighbourhood(self, *, row: int, col: int, radius: int = 1) -> np.ndarray:
        self._validate_indices(row, col)
        if radius < 0:
            raise ValueError("radius must be non-negative")
        r0 = max(0, row - radius)
        r1 = min(self.height, row + radius + 1)
        c0 = max(0, col - radius)
        c1 = min(self.width, col + radius + 1)
        return self._array[r0:r1, c0:c1]

    def to_bytes(self) -> bytes:
        return self._array.tobytes(order="C")

    @classmethod
    def from_bytes(
        cls,
        *,
        width: int,
        height: int,
        resolution: float,
        origin: GridOrigin,
        payload: bytes,
    ) -> "OccupancyGrid":
        expected = width * height
        if len(payload) != expected:
            raise ValueError(
                f"Payload length {len(payload)} does not match grid size {expected}"
            )
        array = np.frombuffer(payload, dtype=np.uint8).reshape((height, width))
        return cls(width=width, height=height, resolution=resolution, origin=origin, data=array)

    def to_bytes_with_metadata(self) -> Tuple[GridBounds, GridOrigin, bytes]:
        return self._bounds, self._origin, self.to_bytes()

    def apply_mask(self, mask: np.ndarray, value: int) -> None:
        self._validate_value(value)
        if mask.shape != self._array.shape:
            raise ValueError("mask must match grid dimensions")
        self._array[mask] = value

    def _validate_indices(self, row: int, col: int) -> None:
        if row < 0 or row >= self.height:
            raise IndexError(f"row {row} out of bounds [0, {self.height})")
        if col < 0 or col >= self.width:
            raise IndexError(f"col {col} out of bounds [0, {self.width})")

    def _validate_value(self, value: int) -> None:
        if not self.MIN_VALUE <= value <= self.MAX_VALUE:
            raise ValueError("cell value must be between 0 and 255")

    def _validate_array(self, data: np.ndarray) -> np.ndarray:
        if data.shape != (self.height, self.width):
            raise ValueError("data array shape does not match grid dimensions")
        if data.dtype != np.uint8:
            raise ValueError("data array must have dtype uint8")
        return data


__all__ = ["OccupancyGrid"]
