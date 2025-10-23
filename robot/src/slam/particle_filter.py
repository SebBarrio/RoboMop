"""Particle filter localisation for the RoboMop SLAM pipeline."""

from __future__ import annotations

import math
from typing import Callable, Iterable, Sequence

import numpy as np


StateArray = np.ndarray
WeightArray = np.ndarray


def _as_state_vector(values: Sequence[float] | np.ndarray) -> np.ndarray:
    array = np.asarray(values, dtype=float)
    if array.shape != (3,):
        raise ValueError("state vector must be a sequence of three elements")
    return array


def _as_covariance(matrix: np.ndarray | Sequence[Sequence[float]]) -> np.ndarray:
    cov = np.asarray(matrix, dtype=float)
    if cov.shape != (3, 3):
        raise ValueError("covariance matrix must be 3x3")
    if not np.allclose(cov, cov.T, atol=1e-9):
        raise ValueError("covariance matrix must be symmetric")
    try:
        np.linalg.cholesky(cov)
    except np.linalg.LinAlgError as exc:
        raise ValueError("covariance matrix must be positive definite") from exc
    return cov


def _wrap_angle(angle: np.ndarray | float) -> np.ndarray | float:
    return (angle + math.pi) % (2.0 * math.pi) - math.pi


class ParticleFilter:
    """Particle filter for planar localisation with SE(2) state."""

    def __init__(self, *, particle_count: int, rng: np.random.Generator | None = None) -> None:
        if particle_count < 100 or particle_count > 500:
            raise ValueError("particle_count must be between 100 and 500")
        self._particle_count = int(particle_count)
        self._rng = rng or np.random.default_rng()
        self._states: StateArray = np.zeros((self._particle_count, 3), dtype=float)
        self._weights: WeightArray = np.full(self._particle_count, 1.0 / self._particle_count, dtype=float)
        self._initialised = False

    @property
    def particle_count(self) -> int:
        return self._particle_count

    @property
    def particles(self) -> np.ndarray:
        return self._states.copy()

    @property
    def weights(self) -> np.ndarray:
        return self._weights.copy()

    @property
    def rng(self) -> np.random.Generator:
        return self._rng

    def initialize_gaussian(
        self,
        *,
        mean: Sequence[float] | np.ndarray,
        covariance: np.ndarray | Sequence[Sequence[float]],
    ) -> None:
        mu = _as_state_vector(mean)
        cov = _as_covariance(covariance)
        self._states = self._rng.multivariate_normal(mu, cov, size=self._particle_count)
        self._weights.fill(1.0 / self._particle_count)
        self._initialised = True

    def initialize_particles(self, particles: Iterable[Sequence[float]]) -> None:
        states = np.asarray(list(particles), dtype=float)
        if states.shape != (self._particle_count, 3):
            raise ValueError("particles must have shape (particle_count, 3)")
        self._states = states
        self._weights.fill(1.0 / self._particle_count)
        self._initialised = True

    def predict(
        self,
        *,
        control: Sequence[float] | np.ndarray,
        process_covariance: np.ndarray | Sequence[Sequence[float]],
    ) -> None:
        if not self._initialised:
            raise RuntimeError("particle filter must be initialised before prediction")
        delta = _as_state_vector(control)
        cov = _as_covariance(process_covariance)

        noise = self._rng.multivariate_normal(np.zeros(3), cov, size=self._particle_count)
        headings = self._states[:, 2]

        dx_body, dy_body, dtheta = delta
        cos_heading = np.cos(headings)
        sin_heading = np.sin(headings)

        dx_world = dx_body * cos_heading - dy_body * sin_heading
        dy_world = dx_body * sin_heading + dy_body * cos_heading

        self._states[:, 0] += dx_world + noise[:, 0]
        self._states[:, 1] += dy_world + noise[:, 1]
        self._states[:, 2] = _wrap_angle(self._states[:, 2] + dtheta + noise[:, 2])

    def update(self, measurement_weights: Callable[[np.ndarray], np.ndarray] | Sequence[float] | np.ndarray) -> None:
        if not self._initialised:
            raise RuntimeError("particle filter must be initialised before update")

        if callable(measurement_weights):
            weights = np.asarray(measurement_weights(self._states.copy()), dtype=float)
        else:
            weights = np.asarray(measurement_weights, dtype=float)

        if weights.shape != (self._particle_count,):
            raise ValueError("measurement weights must match particle count")
        if np.any(weights < 0.0):
            raise ValueError("measurement weights must be non-negative")

        updated = self._weights * weights
        total = float(np.sum(updated))
        if total <= 0.0:
            raise ValueError("measurement weights must sum to a positive value")

        self._weights = updated / total

    def resample(self) -> None:
        if not self._initialised:
            raise RuntimeError("particle filter must be initialised before resampling")

        cumulative = np.cumsum(self._weights)
        positions = (self._rng.random() + np.arange(self._particle_count)) / self._particle_count
        indexes = np.searchsorted(cumulative, positions, side="left")
        indexes = np.clip(indexes, 0, self._particle_count - 1)
        self._states = self._states[indexes].copy()
        self._weights.fill(1.0 / self._particle_count)

    @property
    def effective_particle_count(self) -> float:
        return 1.0 / float(np.sum(np.square(self._weights)))

    def needs_resample(self, threshold: float = 0.5) -> bool:
        if threshold <= 0.0 or threshold > 1.0:
            raise ValueError("threshold must be in the range (0, 1]")
        return self.effective_particle_count / self._particle_count < threshold

    def estimate(self) -> tuple[np.ndarray, np.ndarray]:
        if not self._initialised:
            raise RuntimeError("particle filter must be initialised before estimating")

        weights = self._weights
        mean_xy = np.average(self._states[:, :2], axis=0, weights=weights)
        sin_mean = np.average(np.sin(self._states[:, 2]), weights=weights)
        cos_mean = np.average(np.cos(self._states[:, 2]), weights=weights)
        heading_mean = math.atan2(sin_mean, cos_mean)
        mean = np.array([mean_xy[0], mean_xy[1], heading_mean])

        centred = self._states.copy()
        centred[:, 0] -= mean[0]
        centred[:, 1] -= mean[1]
        centred[:, 2] = _wrap_angle(centred[:, 2] - heading_mean)
        covariance = (centred.T * weights) @ centred
        return mean, covariance


__all__ = ["ParticleFilter"]
