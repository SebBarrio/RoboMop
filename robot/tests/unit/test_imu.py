"""Unit tests for the MPU9250 IMU interface."""

from __future__ import annotations

import math
from unittest.mock import MagicMock, patch

from src.sensors.imu import MPU9250, Vector3


G = 9.80665


class _FakeMPU9250Driver:
    """Mock MPU9250 driver for testing."""

    def __init__(self, **kwargs):
        self.accel_data = [0.0, 0.0, 1.0]  # 1g on z-axis
        self.gyro_data = [0.0, 0.0, 0.0]  # No rotation
        self.mag_data = [40.0, 0.0, 0.0]  # µT
        self.temp_data = 25.0  # Celsius
        self.configured = False
        self.calibrated = False
        self.mag_configured = False
        self.mag_calibrated = False

    def configure(self) -> None:
        self.configured = True

    def calibrate(self) -> None:
        self.calibrated = True

    def configure_mag(self) -> None:
        self.mag_configured = True

    def calibrateMag(self) -> None:
        self.mag_calibrated = True

    def readAccelerometerMaster(self) -> list[float]:
        return self.accel_data

    def readGyroscopeMaster(self) -> list[float]:
        return self.gyro_data

    def readMagnetometerMaster(self) -> list[float] | None:
        return self.mag_data

    def readTemperatureMaster(self) -> float:
        return self.temp_data


def test_read_sample_converts_raw_values() -> None:
    """Test that raw sensor values are correctly converted."""
    with patch("src.sensors.imu.MPU9250Driver", _FakeMPU9250Driver):
        imu = MPU9250(
            bus=1,
            sample_rate_hz=100.0,
            filter_alpha=0.98,
            sleep=lambda _: None,
        )

        sample = imu.read_sample()

        # Check acceleration (0, 0, 1g) -> (0, 0, 9.8 m/s²)
        assert math.isclose(sample.acceleration_m_s2.x, 0.0, abs_tol=1e-6)
        assert math.isclose(sample.acceleration_m_s2.y, 0.0, abs_tol=1e-6)
        assert math.isclose(sample.acceleration_m_s2.z, G, rel_tol=1e-3)

        # Check angular velocity (all zero)
        assert math.isclose(sample.angular_velocity_rad_s.x, 0.0, abs_tol=1e-6)
        assert math.isclose(sample.angular_velocity_rad_s.y, 0.0, abs_tol=1e-6)
        assert math.isclose(sample.angular_velocity_rad_s.z, 0.0, abs_tol=1e-6)

        # Check temperature
        assert math.isclose(sample.temperature_c, 25.0, rel_tol=1e-3)

        # Check magnetic field
        assert sample.magnetic_field_uT is not None
        assert math.isclose(sample.magnetic_field_uT.x, 40.0, rel_tol=1e-3)
        assert math.isclose(sample.magnetic_field_uT.y, 0.0, abs_tol=1e-6)
        assert math.isclose(sample.magnetic_field_uT.z, 0.0, abs_tol=1e-6)

        # Check orientation (level, no rotation)
        assert math.isclose(sample.orientation.roll, 0.0, abs_tol=1e-3)
        assert math.isclose(sample.orientation.pitch, 0.0, abs_tol=1e-3)
        assert math.isclose(sample.orientation.yaw, 0.0, abs_tol=1e-3)


def test_filter_integrates_gyro_between_samples() -> None:
    """Test that the complementary filter integrates gyroscope data."""
    driver = _FakeMPU9250Driver()
    
    with patch("src.sensors.imu.MPU9250Driver", return_value=driver):
        imu = MPU9250(
            bus=1,
            sample_rate_hz=100.0,
            filter_alpha=0.98,
            sleep=lambda _: None,
        )

        # First sample: no rotation
        first = imu.read_sample()
        assert math.isclose(first.orientation.yaw, 0.0, abs_tol=1e-3)

        # Second sample: constant yaw rate of 57.3 deg/s (1 rad/s)
        driver.gyro_data = [0.0, 0.0, 57.3]
        second = imu.read_sample()
        
        # At 100 Hz, dt = 0.01s, so yaw should be approximately 0.98 * 1.0 * 0.01 = 0.0098 rad
        expected_yaw = 0.98 * (1.0 * (1.0 / 100.0))
        assert math.isclose(second.orientation.yaw, expected_yaw, rel_tol=1e-2)


def test_magnetic_field_optional_when_not_ready() -> None:
    """Test that magnetic field can be None when magnetometer is not ready."""
    driver = _FakeMPU9250Driver()
    driver.mag_data = None  # Magnetometer not ready
    
    with patch("src.sensors.imu.MPU9250Driver", return_value=driver):
        imu = MPU9250(
            bus=1,
            sample_rate_hz=100.0,
            filter_alpha=0.98,
            sleep=lambda _: None,
        )

        sample = imu.read_sample()
        assert sample.magnetic_field_uT is None


def test_initialization_configures_and_calibrates() -> None:
    """Test that initialization properly configures and calibrates the sensor."""
    driver = _FakeMPU9250Driver()
    
    with patch("src.sensors.imu.MPU9250Driver", return_value=driver):
        imu = MPU9250(
            bus=1,
            sample_rate_hz=100.0,
            filter_alpha=0.98,
            sleep=lambda _: None,
        )

        # Initialize should trigger configuration and calibration
        imu.initialize()
        
        assert driver.configured
        assert driver.calibrated
        assert driver.mag_configured
        assert driver.mag_calibrated


def test_complementary_filter_alpha_validation() -> None:
    """Test that filter alpha is validated."""
    from src.sensors.imu import _ComplementaryFilter
    import pytest

    # Alpha must be between 0 and 1
    with pytest.raises(ValueError, match="alpha must be between 0 and 1"):
        _ComplementaryFilter(100.0, 0.0)
    
    with pytest.raises(ValueError, match="alpha must be between 0 and 1"):
        _ComplementaryFilter(100.0, 1.0)
    
    with pytest.raises(ValueError, match="alpha must be between 0 and 1"):
        _ComplementaryFilter(100.0, -0.5)
    
    with pytest.raises(ValueError, match="alpha must be between 0 and 1"):
        _ComplementaryFilter(100.0, 1.5)
    
    # Valid alpha should work
    filter = _ComplementaryFilter(100.0, 0.98)
    assert filter is not None
