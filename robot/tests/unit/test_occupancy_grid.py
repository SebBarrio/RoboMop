"""Unit tests for the occupancy grid mapping utilities."""

from __future__ import annotations

import numpy as np
import pytest

from src.slam.occupancy_grid import OccupancyGrid


def create_grid() -> OccupancyGrid:
    return OccupancyGrid(
        width=6,
        height=4,
        resolution=0.05,
        origin=(-1.0, 2.0, 0.1),
    )


def test_grid_initialises_with_unknown_values() -> None:
    grid = create_grid()

    assert grid.width == 6
    assert grid.height == 4
    assert grid.resolution == pytest.approx(0.05)
    assert grid.origin == (-1.0, 2.0, 0.1)
    assert grid.cell_count == 24

    data = grid.array
    assert data.shape == (4, 6)
    assert np.all(data == grid.UNKNOWN_VALUE)


def test_invalid_dimensions_raise_value_error() -> None:
    with pytest.raises(ValueError):
        OccupancyGrid(width=0, height=10, resolution=0.05)

    with pytest.raises(ValueError):
        OccupancyGrid(width=10, height=-1, resolution=0.05)

    with pytest.raises(ValueError):
        OccupancyGrid(width=10, height=10, resolution=0.0)


def test_get_and_set_cell() -> None:
    grid = create_grid()

    grid.set_cell(row=1, col=2, value=200)

    assert grid.get_cell(row=1, col=2) == 200


def test_set_cell_validates_indices() -> None:
    grid = create_grid()

    with pytest.raises(IndexError):
        grid.set_cell(row=-1, col=0, value=10)

    with pytest.raises(IndexError):
        grid.set_cell(row=grid.height, col=0, value=10)

    with pytest.raises(IndexError):
        grid.set_cell(row=0, col=grid.width, value=10)


def test_set_cell_validates_value_range() -> None:
    grid = create_grid()

    with pytest.raises(ValueError):
        grid.set_cell(row=0, col=0, value=-1)

    with pytest.raises(ValueError):
        grid.set_cell(row=0, col=0, value=256)


def test_update_cells_bulk_operation() -> None:
    grid = create_grid()

    grid.update_cells(
        (
            (0, 0, 100),
            (0, 1, 101),
            (3, 5, 200),
        )
    )

    assert grid.get_cell(0, 0) == 100
    assert grid.get_cell(0, 1) == 101
    assert grid.get_cell(3, 5) == 200


def test_update_cells_rejects_invalid_entries() -> None:
    grid = create_grid()

    with pytest.raises(IndexError):
        grid.update_cells(((grid.height, 0, 1),))

    with pytest.raises(ValueError):
        grid.update_cells(((0, 0, 999),))


def test_completion_ratio_tracks_known_cells() -> None:
    grid = create_grid()

    # Initially unknown
    assert grid.completion_ratio == 0.0

    grid.update_cells(((0, 0, 1), (1, 1, 200)))

    expected_ratio = 2 / grid.cell_count
    assert grid.completion_ratio == pytest.approx(expected_ratio)


def test_clear_resets_all_cells_to_unknown() -> None:
    grid = create_grid()
    grid.update_cells(((0, 0, 1), (1, 1, 2), (2, 2, 3)))

    grid.clear()

    assert np.all(grid.array == grid.UNKNOWN_VALUE)
    assert grid.completion_ratio == 0.0


def test_to_bytes_and_from_bytes_round_trip() -> None:
    grid = create_grid()
    grid.update_cells(((0, 0, 1), (0, 1, 2), (3, 5, 255)))

    payload = grid.to_bytes()

    restored = OccupancyGrid.from_bytes(
        width=grid.width,
        height=grid.height,
        resolution=grid.resolution,
        origin=grid.origin,
        payload=payload,
    )

    assert restored.origin == grid.origin
    np.testing.assert_array_equal(restored.array, grid.array)


def test_from_bytes_validates_payload_length() -> None:
    with pytest.raises(ValueError):
        OccupancyGrid.from_bytes(
            width=4,
            height=4,
            resolution=0.05,
            origin=(0.0, 0.0, 0.0),
            payload=b"short",
        )
