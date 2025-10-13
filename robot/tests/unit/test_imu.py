"""Unit tests for the MPU9250 IMU interface."""

from __future__ import annotations

import math
import struct
from collections import deque
from dataclasses import dataclass

from src.sensors.imu import MPU9250


G = 9.80665


@dataclass
class _MagFrame:
    st1: int
    data: bytes
    st2: int


class _FakeRegisterIO:
    def __init__(self, accel_gyro_frames: list[bytes], mag_frames: list[_MagFrame]):
        self._frames = deque(accel_gyro_frames)
        self._mag_frames = deque(mag_frames)
        self._pending_mag: _MagFrame | None = None
        self.main_writes: list[tuple[int, bytes]] = []
        self.mag_writes: list[tuple[int, bytes]] = []

    def write(self, register: int, data: bytes) -> None:
        self.main_writes.append((register, bytes(data)))

    def read(self, register: int, length: int) -> bytes:
        if register == MPU9250.ACCEL_XOUT_H and length == 14:
            if not self._frames:
                raise RuntimeError("No accel/gyro frames remaining")
            return self._frames.popleft()
        raise AssertionError(f"Unexpected read register 0x{register:02x}")

    def write_mag(self, register: int, data: bytes) -> None:
        self.mag_writes.append((register, bytes(data)))

    def read_mag(self, register: int, length: int) -> bytes:
        if register == MPU9250.AK8963_ST1 and length == 1:
            if not self._mag_frames:
                return bytes([0])
            self._pending_mag = self._mag_frames[0]
            return bytes([self._pending_mag.st1])
        if register == MPU9250.AK8963_HXL and length == 6:
            if self._pending_mag is None:
                return bytes([0] * length)
            return self._pending_mag.data
        if register == MPU9250.AK8963_ST2 and length == 1:
            if self._pending_mag is None:
                return bytes([0])
            frame = self._mag_frames.popleft()
            self._pending_mag = None
            return bytes([frame.st2])
        if register == MPU9250.AK8963_ASAX and length == 3:
            # Factory sensitivity adjustment values default to 1.0 scaling.
            return bytes([128, 128, 128])
        raise AssertionError(f"Unexpected magnetometer read 0x{register:02x}")


def _frame(ax: int, ay: int, az: int, temp: int, gx: int, gy: int, gz: int) -> bytes:
    return struct.pack(">hhhhhhh", ax, ay, az, temp, gx, gy, gz)


def _mag_frame(hx: int, hy: int, hz: int, st1: int = 0x01, st2: int = 0x00) -> _MagFrame:
    return _MagFrame(st1=st1, data=struct.pack("<hhh", hx, hy, hz), st2=st2)


def test_read_sample_converts_raw_values() -> None:
    accel_frame = _frame(0, 0, 8192, 1335, 0, 0, 0)
    mag_frame = _mag_frame(400, 0, 0)
    io = _FakeRegisterIO([accel_frame], [mag_frame])
    imu = MPU9250(
        register_io=io,
        sample_rate_hz=100.0,
        filter_alpha=0.98,
        sleep=lambda _: None,
    )

    sample = imu.read_sample()

    assert math.isclose(sample.acceleration_m_s2.x, 0.0, abs_tol=1e-6)
    assert math.isclose(sample.acceleration_m_s2.y, 0.0, abs_tol=1e-6)
    assert math.isclose(sample.acceleration_m_s2.z, G, rel_tol=1e-3)
    assert math.isclose(sample.angular_velocity_rad_s.x, 0.0, abs_tol=1e-6)
    assert math.isclose(sample.angular_velocity_rad_s.y, 0.0, abs_tol=1e-6)
    assert math.isclose(sample.angular_velocity_rad_s.z, 0.0, abs_tol=1e-6)
    assert math.isclose(sample.temperature_c, 25.0, rel_tol=1e-3)
    assert sample.magnetic_field_uT is not None
    assert math.isclose(sample.magnetic_field_uT.x, 60.0, rel_tol=1e-3)
    assert math.isclose(sample.magnetic_field_uT.y, 0.0, abs_tol=1e-6)
    assert math.isclose(sample.magnetic_field_uT.z, 0.0, abs_tol=1e-6)
    assert math.isclose(sample.orientation.roll, 0.0, abs_tol=1e-3)
    assert math.isclose(sample.orientation.pitch, 0.0, abs_tol=1e-3)
    assert math.isclose(sample.orientation.yaw, 0.0, abs_tol=1e-3)


def test_filter_integrates_gyro_between_samples() -> None:
    initial = _frame(0, 0, 8192, 1335, 0, 0, 0)
    gyro_step = _frame(0, 0, 8192, 1335, 0, 0, 3754)
    mag = _mag_frame(400, 0, 0)
    io = _FakeRegisterIO([initial, gyro_step], [mag, mag])
    imu = MPU9250(
        register_io=io,
        sample_rate_hz=100.0,
        filter_alpha=0.98,
        sleep=lambda _: None,
    )

    first = imu.read_sample()
    assert math.isclose(first.orientation.yaw, 0.0, abs_tol=1e-3)

    second = imu.read_sample()
    expected_yaw = 0.98 * (1.0 * (1.0 / 100.0))
    assert math.isclose(second.orientation.yaw, expected_yaw, rel_tol=1e-2)


def test_magnetic_field_optional_when_not_ready() -> None:
    frame = _frame(0, 0, 8192, 1335, 0, 0, 0)
    no_mag = _MagFrame(st1=0x00, data=struct.pack("<hhh", 0, 0, 0), st2=0x00)
    io = _FakeRegisterIO([frame], [no_mag])
    imu = MPU9250(
        register_io=io,
        sample_rate_hz=100.0,
        filter_alpha=0.98,
        sleep=lambda _: None,
    )

    sample = imu.read_sample()
    assert sample.magnetic_field_uT is None
