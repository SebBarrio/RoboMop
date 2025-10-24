"""Integration tests for the hardware abstraction layer."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Callable

import pytest

from src.sensors.encoders import EncoderReading
from src.sensors.hardware import HardwareAbstractionLayer, HardwareSnapshot
from src.sensors.imu import ImuSample, Orientation, Vector3
from src.sensors.lidar import LidarMeasurement


class _FakeLidar:
    def __init__(self, scan: list[LidarMeasurement]) -> None:
        self.scan = scan
        self.started = False
        self.stopped = False

    async def start(self) -> None:
        self.started = True

    async def stop(self) -> None:
        self.stopped = True

    async def read_scan(self) -> list[LidarMeasurement]:
        await asyncio.sleep(0)
        return self.scan


class _FakeImu:
    def __init__(self, sample: ImuSample) -> None:
        self.sample = sample
        self.started = False
        self.stopped = False

    async def start(self) -> None:
        self.started = True

    async def stop(self) -> None:
        self.stopped = True

    async def read_sample(self) -> ImuSample:
        await asyncio.sleep(0)
        return self.sample


class _FakeEncoder:
    def __init__(self, reading: EncoderReading) -> None:
        self.reading = reading

    async def read(self) -> EncoderReading:
        await asyncio.sleep(0)
        return self.reading


class _FakeUltrasonic:
    def __init__(self, distance_m: float) -> None:
        self.distance_m = distance_m
        self.started = False
        self.stopped = False

    async def start(self) -> None:
        self.started = True

    async def stop(self) -> None:
        self.stopped = True

    async def read_distance(self) -> float:
        await asyncio.sleep(0)
        return self.distance_m


class _FakeWaterLevel:
    def __init__(self, percentage: float) -> None:
        self.percentage = percentage

    async def read_percentage(self) -> float:
        await asyncio.sleep(0)
        return self.percentage


def _clock_factory(values: list[float]) -> Callable[[], float]:
    iterator = iter(values)

    def _clock() -> float:
        try:
            return next(iterator)
        except StopIteration as exc:  # pragma: no cover - defensive
            raise RuntimeError("Clock exhausted") from exc

    return _clock


def _build_sample() -> ImuSample:
    acceleration = Vector3(0.0, 0.0, 9.81)
    angular_velocity = Vector3(0.0, 0.0, 0.0)
    orientation = Orientation(0.0, 0.0, 0.0)
    return ImuSample(
        acceleration_m_s2=acceleration,
        angular_velocity_rad_s=angular_velocity,
        magnetic_field_uT=None,
        temperature_c=25.0,
        orientation=orientation,
        timestamp_s=123.456,
    )


def _build_encoder_reading(ticks: int) -> EncoderReading:
    return EncoderReading(
        timestamp=1.0,
        ticks=ticks,
        revolutions=0.5,
        position_rad=1.0,
        velocity_rad_s=0.1,
        position_m=0.2,
        velocity_m_s=0.02,
    )


def _build_scan() -> list[LidarMeasurement]:
    return [
        LidarMeasurement(angle_radians=0.0, distance_m=1.2, quality=15, start_flag=True),
        LidarMeasurement(angle_radians=0.1, distance_m=1.1, quality=12, start_flag=False),
    ]


@pytest.mark.asyncio
async def test_hardware_layer_returns_all_sensor_data() -> None:
    lidar = _FakeLidar(_build_scan())
    imu = _FakeImu(_build_sample())
    left_encoder = _FakeEncoder(_build_encoder_reading(120))
    right_encoder = _FakeEncoder(_build_encoder_reading(125))
    ultrasonic = _FakeUltrasonic(distance_m=0.32)
    water_level = _FakeWaterLevel(percentage=82.5)

    hal = HardwareAbstractionLayer(
        lidar_reader=lidar.read_scan,
        imu_reader=imu.read_sample,
        encoder_readers={
            "left": left_encoder.read,
            "right": right_encoder.read,
        },
        ultrasonic_reader=ultrasonic.read_distance,
        water_level_reader=water_level.read_percentage,
        start_hooks=(lidar.start, imu.start, ultrasonic.start),
        stop_hooks=(lidar.stop, imu.stop, ultrasonic.stop),
        clock=_clock_factory([10.0, 11.0]),
    )

    assert hal.started is False

    await hal.start()

    assert hal.started is True
    assert lidar.started is True
    assert imu.started is True
    assert ultrasonic.started is True

    snapshot = await hal.read_all()

    assert isinstance(snapshot, HardwareSnapshot)
    assert snapshot.timestamp == pytest.approx(10.0)
    assert snapshot.lidar_scan == lidar.scan
    assert snapshot.imu_sample == imu.sample
    assert snapshot.encoders["left"].ticks == 120
    assert snapshot.encoders["right"].ticks == 125
    assert snapshot.ultrasonic_distance_m == pytest.approx(0.32)
    assert snapshot.water_level_percentage == pytest.approx(82.5)

    snapshot_again = await hal.read_all()
    assert snapshot_again.timestamp == pytest.approx(11.0)

    await hal.stop()

    assert hal.started is False
    assert lidar.stopped is True
    assert imu.stopped is True
    assert ultrasonic.stopped is True


@pytest.mark.asyncio
async def test_hardware_layer_requires_start_before_read() -> None:
    hal = HardwareAbstractionLayer(
        lidar_reader=lambda: asyncio.sleep(0),
        imu_reader=lambda: asyncio.sleep(0),
        encoder_readers={},
        ultrasonic_reader=lambda: asyncio.sleep(0),
        water_level_reader=lambda: asyncio.sleep(0),
    )

    with pytest.raises(RuntimeError):
        await hal.read_all()


@pytest.mark.asyncio
async def test_hardware_layer_stop_is_idempotent() -> None:
    hal = HardwareAbstractionLayer(
        lidar_reader=lambda: asyncio.sleep(0),
        imu_reader=lambda: asyncio.sleep(0),
        encoder_readers={},
        ultrasonic_reader=lambda: asyncio.sleep(0),
        water_level_reader=lambda: asyncio.sleep(0),
    )

    await hal.start()
    await hal.stop()

    # Should not raise when stopping multiple times
    await hal.stop()
