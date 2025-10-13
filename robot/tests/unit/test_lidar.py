"""Unit tests for the raw RPLIDAR serial interface."""

from __future__ import annotations

import asyncio
import math

from src.sensors.lidar import LidarMeasurement, RPLidarSerial


def test_decode_measurement_parses_standard_packet() -> None:
    packet = bytes([0x3D, 0x01, 0x2D, 0x48, 0x13])
    measurement = RPLidarSerial._decode_measurement(packet)
    assert measurement is not None
    assert measurement.start_flag is True
    assert measurement.quality == 15
    assert math.isclose(measurement.angle_radians, math.radians(90.0), rel_tol=1e-4)
    assert math.isclose(measurement.distance_m, 1.234, rel_tol=1e-3)


def test_decode_measurement_rejects_invalid_start_bits() -> None:
    packet = bytes([0x3C, 0x01, 0xD0, 0x48, 0x13])
    measurement = RPLidarSerial._decode_measurement(packet)
    assert measurement is None


def test_iter_scans_groups_measurements_by_revolution() -> None:
    async def run() -> tuple[list[list[LidarMeasurement]], LidarMeasurement, LidarMeasurement, LidarMeasurement]:
        lidar = RPLidarSerial("/dev/null")
        lidar._queue = asyncio.Queue()
        scan_a = LidarMeasurement(
            angle_radians=0.1,
            distance_m=1.0,
            quality=30,
            start_flag=True,
        )
        scan_b = LidarMeasurement(
            angle_radians=0.2,
            distance_m=1.2,
            quality=25,
            start_flag=False,
        )
        scan_c = LidarMeasurement(
            angle_radians=0.3,
            distance_m=0.8,
            quality=40,
            start_flag=True,
        )
        assert lidar._queue is not None
        await lidar._queue.put(scan_a)
        await lidar._queue.put(scan_b)
        await lidar._queue.put(scan_c)
        await lidar._queue.put(None)

        scans: list[list[LidarMeasurement]] = []
        async for grouped in lidar.iter_scans():
            scans.append(grouped)
        return scans, scan_a, scan_b, scan_c

    scans, scan_a, scan_b, scan_c = asyncio.run(run())
    assert len(scans) == 2
    assert scans[0] == [scan_a, scan_b]
    assert scans[1] == [scan_c]
