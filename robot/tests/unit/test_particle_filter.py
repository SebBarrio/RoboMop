"""Unit tests for the particle filter SLAM component."""

from __future__ import annotations

import math
from typing import Callable

import numpy as np
import pytest

from src.slam.particle_filter import ParticleFilter


def create_filter(seed: int = 123) -> ParticleFilter:
    rng = np.random.default_rng(seed)
    pf = ParticleFilter(particle_count=200, rng=rng)
    pf.initialize_gaussian(
        mean=(0.0, 0.0, 0.0),
        covariance=np.diag([0.05**2, 0.05**2, math.radians(5.0) ** 2]),
    )
    return pf


def test_initialize_gaussian_samples_expected_distribution() -> None:
    pf = create_filter()

    particles = pf.particles

    assert particles.shape == (200, 3)
    assert np.allclose(particles.mean(axis=0)[:2], (0.0, 0.0), atol=0.02)
    assert pf.weights.shape == (200,)
    assert pytest.approx(1.0, rel=1e-6) == pf.weights.sum()


def test_predict_applies_odometry_increment() -> None:
    pf = create_filter(seed=321)

    pf.predict(
        control=(0.2, 0.0, math.radians(10.0)),
        process_covariance=np.diag([0.01**2, 0.01**2, math.radians(1.0) ** 2]),
    )

    mean, _ = pf.estimate()
    assert mean[0] == pytest.approx(0.2, abs=0.03)
    assert mean[1] == pytest.approx(0.0, abs=0.03)
    assert mean[2] == pytest.approx(math.radians(10.0), abs=math.radians(2.0))


def test_update_normalises_weights_and_shifts_estimate_towards_measurement() -> None:
    pf = create_filter(seed=99)
    pf.predict(
        control=(0.8, 0.0, 0.0),
        process_covariance=np.diag([0.02**2, 0.02**2, math.radians(0.5) ** 2]),
    )

    measurement = np.array([1.0, 0.0])

    def weight_fn(states: np.ndarray) -> np.ndarray:
        delta = states[:, :2] - measurement
        distance_sq = np.sum(delta**2, axis=1)
        return np.exp(-0.5 * distance_sq / (0.1**2))

    pf.update(weight_fn)

    assert pytest.approx(1.0, rel=1e-6) == pf.weights.sum()
    mean, _ = pf.estimate()
    assert mean[0] > 0.8
    assert abs(mean[1]) < 0.05


def test_update_rejects_zero_weight_measurements() -> None:
    pf = create_filter()

    def zero_weights(states: np.ndarray) -> np.ndarray:
        return np.zeros(states.shape[0])

    with pytest.raises(ValueError):
        pf.update(zero_weights)


def test_resample_increases_high_weight_particle_multiplicity() -> None:
    pf = create_filter(seed=2025)

    weights = np.linspace(1.0, 10.0, pf.particle_count)
    pf.update(lambda _states: weights)
    before_resample = pf.particles.copy()

    pf.resample()

    index = int(np.argmax(weights))
    replicated = np.sum(
        np.isclose(pf.particles, before_resample[index], atol=1e-6, rtol=0.0),
        axis=1,
    )
    assert np.max(replicated) > 1  # Highest-weight particle duplicated
    assert np.allclose(pf.weights, np.full(pf.particle_count, 1.0 / pf.particle_count))


def test_effective_particle_count_detects_weight_collapse() -> None:
    pf = create_filter(seed=55)

    def peaked_weights(states: np.ndarray) -> np.ndarray:
        w = np.zeros(states.shape[0])
        w[:5] = 1.0
        return w

    pf.update(peaked_weights)

    assert pf.effective_particle_count < 20
    assert pf.needs_resample(threshold=0.2)


def test_estimate_returns_mean_and_covariance() -> None:
    pf = create_filter(seed=2024)

    mean, covariance = pf.estimate()

    assert mean.shape == (3,)
    assert covariance.shape == (3, 3)
    assert np.all(np.linalg.eigvals(covariance) >= 0.0)
