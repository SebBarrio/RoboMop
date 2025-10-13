"""MPU9250 IMU interface with complementary filter orientation estimation."""

from __future__ import annotations

import asyncio
import math
import threading
import time
from dataclasses import dataclass
from typing import AsyncIterator, Callable, Optional, Protocol


GRAVITY = 9.80665


@dataclass(frozen=True, slots=True)
class Vector3:
    """Simple 3D vector container."""

    x: float
    y: float
    z: float


@dataclass(frozen=True, slots=True)
class Orientation:
    """Roll, pitch, yaw orientation in radians."""

    roll: float
    pitch: float
    yaw: float


@dataclass(frozen=True, slots=True)
class ImuSample:
    """Single IMU sample with derived orientation."""

    acceleration_m_s2: Vector3
    angular_velocity_rad_s: Vector3
    magnetic_field_uT: Optional[Vector3]
    temperature_c: float
    orientation: Orientation
    timestamp_s: float


class MPU9250RegisterIO(Protocol):
    """Minimal protocol for MPU9250 register access."""

    def write(self, register: int, data: bytes) -> None:  # pragma: no cover - protocol definition
        ...

    def read(self, register: int, length: int) -> bytes:  # pragma: no cover - protocol definition
        ...

    def write_mag(self, register: int, data: bytes) -> None:  # pragma: no cover - protocol definition
        ...

    def read_mag(self, register: int, length: int) -> bytes:  # pragma: no cover - protocol definition
        ...


class _I2CRegisterIO:
    """Adapter around ``adafruit_bus_device.i2c_device.I2CDevice``."""

    def __init__(
        self,
        i2c: object,
        address: int,
        magnetometer_address: int,
        i2c_device_cls: Optional[type] = None,
    ) -> None:
        if i2c_device_cls is None:
            from adafruit_bus_device.i2c_device import I2CDevice  # type: ignore

            i2c_device_cls = I2CDevice
        self._device = i2c_device_cls(i2c, address)
        self._mag_device = i2c_device_cls(i2c, magnetometer_address)

    def write(self, register: int, data: bytes) -> None:
        payload = bytes([register]) + bytes(data)
        with self._device as device:
            device.write(payload)

    def read(self, register: int, length: int) -> bytes:
        buffer = bytearray(length)
        with self._device as device:
            device.write_then_readinto(bytes([register]), buffer)
        return bytes(buffer)

    def write_mag(self, register: int, data: bytes) -> None:
        payload = bytes([register]) + bytes(data)
        with self._mag_device as device:
            device.write(payload)

    def read_mag(self, register: int, length: int) -> bytes:
        buffer = bytearray(length)
        with self._mag_device as device:
            device.write_then_readinto(bytes([register]), buffer)
        return bytes(buffer)


class _ComplementaryFilter:
    def __init__(self, sample_rate_hz: float, alpha: float) -> None:
        if not 0.0 < alpha < 1.0:
            raise ValueError("alpha must be between 0 and 1")
        self._alpha = alpha
        self._dt = 1.0 / sample_rate_hz
        self._initialized = False
        self._roll = 0.0
        self._pitch = 0.0
        self._yaw = 0.0

    def update(
        self,
        acceleration: Vector3,
        angular_velocity: Vector3,
        magnetic_field: Optional[Vector3],
    ) -> Orientation:
        if not self._initialized:
            roll = math.atan2(acceleration.y, acceleration.z)
            pitch = math.atan2(-acceleration.x, math.sqrt(acceleration.y**2 + acceleration.z**2))
            yaw = 0.0
            if magnetic_field is not None:
                yaw = _compute_yaw(magnetic_field, roll, pitch)
            self._roll = roll
            self._pitch = pitch
            self._yaw = yaw
            self._initialized = True
            return Orientation(roll=roll, pitch=pitch, yaw=yaw)

        roll_gyro = self._roll + angular_velocity.x * self._dt
        pitch_gyro = self._pitch + angular_velocity.y * self._dt
        yaw_gyro = self._yaw + angular_velocity.z * self._dt

        roll_acc = math.atan2(acceleration.y, acceleration.z)
        pitch_acc = math.atan2(-acceleration.x, math.sqrt(acceleration.y**2 + acceleration.z**2))

        roll = self._alpha * roll_gyro + (1.0 - self._alpha) * roll_acc
        pitch = self._alpha * pitch_gyro + (1.0 - self._alpha) * pitch_acc

        if magnetic_field is not None:
            yaw_mag = _compute_yaw(magnetic_field, roll, pitch)
            yaw = self._alpha * yaw_gyro + (1.0 - self._alpha) * yaw_mag
        else:
            yaw = yaw_gyro

        self._roll = roll
        self._pitch = pitch
        self._yaw = _wrap_angle(yaw)
        return Orientation(roll=self._roll, pitch=self._pitch, yaw=self._yaw)


class MPU9250:
    """High-level IMU interface providing calibrated samples at 100 Hz."""

    # Register map
    SMPLRT_DIV = 0x19
    CONFIG = 0x1A
    GYRO_CONFIG = 0x1B
    ACCEL_CONFIG = 0x1C
    ACCEL_CONFIG2 = 0x1D
    INT_PIN_CFG = 0x37
    INT_ENABLE = 0x38
    ACCEL_XOUT_H = 0x3B
    TEMP_OUT_H = 0x41
    GYRO_XOUT_H = 0x43
    USER_CTRL = 0x6A
    PWR_MGMT_1 = 0x6B
    PWR_MGMT_2 = 0x6C

    AK8963_ST1 = 0x02
    AK8963_HXL = 0x03
    AK8963_ST2 = 0x09
    AK8963_CNTL1 = 0x0A
    AK8963_ASAX = 0x10

    DEFAULT_ADDRESS = 0x68
    DEFAULT_MAG_ADDRESS = 0x0C

    def __init__(
        self,
        i2c: Optional[object] = None,
        *,
        register_io: Optional[MPU9250RegisterIO] = None,
        i2c_device_cls: Optional[type] = None,
        sample_rate_hz: float = 100.0,
        filter_alpha: float = 0.98,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if register_io is None:
            if i2c is None:
                raise ValueError("Either register_io or i2c must be provided")
            register_io = _I2CRegisterIO(i2c, self.DEFAULT_ADDRESS, self.DEFAULT_MAG_ADDRESS, i2c_device_cls)

        self._io = register_io
        self._sample_rate_hz = sample_rate_hz
        self._filter_alpha = filter_alpha
        self._sleep = sleep

        self._accel_scale = GRAVITY / 8192.0  # ±4g full-scale
        self._gyro_scale = (math.pi / 180.0) / 65.5  # ±500 °/s
        self._mag_scale = 0.15  # µT per LSB in 16-bit mode

        self._filter = _ComplementaryFilter(sample_rate_hz, filter_alpha)
        self._mag_adjust = Vector3(1.0, 1.0, 1.0)

        self._initialized = False
        self._lock = threading.Lock()

        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._queue: Optional[asyncio.Queue[Optional[ImuSample]]] = None
        self._stop_event = threading.Event()
        self._reader_thread: Optional[threading.Thread] = None

    async def __aenter__(self) -> "MPU9250":
        await self.start()
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.stop()

    def initialize(self) -> None:
        if self._initialized:
            return
        self._reset()
        self._configure()
        self._configure_magnetometer()
        self._initialized = True

    async def start(self) -> None:
        if self._queue is not None:
            return
        self.initialize()
        self._loop = asyncio.get_running_loop()
        self._queue = asyncio.Queue(maxsize=512)
        self._stop_event.clear()
        self._reader_thread = threading.Thread(target=self._reader_main, name="mpu9250-reader", daemon=True)
        self._reader_thread.start()

    async def stop(self) -> None:
        if self._queue is None:
            return
        self._stop_event.set()
        if self._reader_thread is not None:
            self._reader_thread.join(timeout=2.0)
        if self._queue is not None:
            await self._queue.put(None)
        self._queue = None
        self._loop = None
        self._reader_thread = None

    async def iter_samples(self) -> AsyncIterator[ImuSample]:
        if self._queue is None:
            raise RuntimeError("iter_samples() requires an active start()")
        while True:
            sample = await self._queue.get()
            if sample is None:
                break
            yield sample

    def read_sample(self) -> ImuSample:
        self.initialize()
        with self._lock:
            accel_raw, gyro_raw, temperature_c = self._read_accel_gyro()
            magnetic_field = self._read_magnetometer()

            acceleration = Vector3(
                accel_raw.x * self._accel_scale,
                accel_raw.y * self._accel_scale,
                accel_raw.z * self._accel_scale,
            )
            angular_velocity = Vector3(
                gyro_raw.x * self._gyro_scale,
                gyro_raw.y * self._gyro_scale,
                gyro_raw.z * self._gyro_scale,
            )

            magnetic_vector: Optional[Vector3]
            if magnetic_field is not None:
                magnetic_vector = Vector3(
                    magnetic_field.x * self._mag_scale * self._mag_adjust.x,
                    magnetic_field.y * self._mag_scale * self._mag_adjust.y,
                    magnetic_field.z * self._mag_scale * self._mag_adjust.z,
                )
            else:
                magnetic_vector = None

            orientation = self._filter.update(acceleration, angular_velocity, magnetic_vector)
            timestamp = time.perf_counter()

        return ImuSample(
            acceleration_m_s2=acceleration,
            angular_velocity_rad_s=angular_velocity,
            magnetic_field_uT=magnetic_vector,
            temperature_c=temperature_c,
            orientation=orientation,
            timestamp_s=timestamp,
        )

    def _reset(self) -> None:
        self._io.write(self.PWR_MGMT_1, bytes([0x80]))
        self._sleep(0.1)

    def _configure(self) -> None:
        self._io.write(self.PWR_MGMT_1, bytes([0x01]))
        self._sleep(0.01)
        self._io.write(self.PWR_MGMT_2, bytes([0x00]))
        divider = max(0, min(255, int(max(4.0, 1000.0 / self._sample_rate_hz)) - 1))
        self._io.write(self.SMPLRT_DIV, bytes([divider]))
        self._io.write(self.CONFIG, bytes([0x03]))
        self._io.write(self.GYRO_CONFIG, bytes([0x08]))  # ±500 °/s
        self._io.write(self.ACCEL_CONFIG, bytes([0x08]))  # ±4 g
        self._io.write(self.ACCEL_CONFIG2, bytes([0x03]))
        self._io.write(self.USER_CTRL, bytes([0x00]))
        self._io.write(self.INT_PIN_CFG, bytes([0x02]))  # BYPASS_EN to access AK8963 directly
        self._io.write(self.INT_ENABLE, bytes([0x00]))
        self._sleep(0.01)

    def _configure_magnetometer(self) -> None:
        try:
            self._io.write_mag(self.AK8963_CNTL1, bytes([0x00]))
            self._sleep(0.01)
            self._io.write_mag(self.AK8963_CNTL1, bytes([0x0F]))  # Fuse ROM access
            self._sleep(0.01)
            asa = self._io.read_mag(self.AK8963_ASAX, 3)
            self._mag_adjust = Vector3(
                _asa_adjust(asa[0]),
                _asa_adjust(asa[1]),
                _asa_adjust(asa[2]),
            )
            self._io.write_mag(self.AK8963_CNTL1, bytes([0x00]))
            self._sleep(0.01)
        except OSError:
            self._mag_adjust = Vector3(1.0, 1.0, 1.0)

        self._io.write_mag(self.AK8963_CNTL1, bytes([0x16]))  # 16-bit, 100 Hz continuous
        self._sleep(0.01)

    def _read_accel_gyro(self) -> tuple[Vector3, Vector3, float]:
        data = self._io.read(self.ACCEL_XOUT_H, 14)
        ax = _int16_be(data[0], data[1])
        ay = _int16_be(data[2], data[3])
        az = _int16_be(data[4], data[5])
        temp_raw = _int16_be(data[6], data[7])
        gx = _int16_be(data[8], data[9])
        gy = _int16_be(data[10], data[11])
        gz = _int16_be(data[12], data[13])
        temperature_c = (temp_raw / 333.87) + 21.0
        return Vector3(ax, ay, az), Vector3(gx, gy, gz), temperature_c

    def _read_magnetometer(self) -> Optional[Vector3]:
        try:
            status = self._io.read_mag(self.AK8963_ST1, 1)
        except OSError:
            return None
        if not status or (status[0] & 0x01) == 0:
            return None
        data = self._io.read_mag(self.AK8963_HXL, 6)
        status2 = self._io.read_mag(self.AK8963_ST2, 1)
        if status2 and (status2[0] & 0x08):
            return None
        hx = _int16_le(data[0], data[1])
        hy = _int16_le(data[2], data[3])
        hz = _int16_le(data[4], data[5])
        return Vector3(hx, hy, hz)

    def _reader_main(self) -> None:
        assert self._queue is not None
        assert self._loop is not None
        interval = 1.0 / self._sample_rate_hz
        next_deadline = time.perf_counter()
        while not self._stop_event.is_set():
            try:
                sample = self.read_sample()
            except Exception:
                break
            try:
                self._loop.call_soon_threadsafe(self._queue.put_nowait, sample)
            except asyncio.QueueFull:
                pass
            next_deadline += interval
            delay = next_deadline - time.perf_counter()
            if delay > 0:
                time.sleep(delay)
            else:
                next_deadline = time.perf_counter()


def _asa_adjust(raw: int) -> float:
    return ((raw - 128) / 256.0) + 1.0


def _int16_be(msb: int, lsb: int) -> int:
    value = (msb << 8) | lsb
    return value - 0x10000 if value & 0x8000 else value


def _int16_le(lsb: int, msb: int) -> int:
    value = (msb << 8) | lsb
    return value - 0x10000 if value & 0x8000 else value


def _wrap_angle(angle: float) -> float:
    wrapped = (angle + math.pi) % (2.0 * math.pi)
    return wrapped - math.pi


def _compute_yaw(magnetic: Vector3, roll: float, pitch: float) -> float:
    cos_roll = math.cos(roll)
    sin_roll = math.sin(roll)
    cos_pitch = math.cos(pitch)
    sin_pitch = math.sin(pitch)

    mx, my, mz = magnetic.x, magnetic.y, magnetic.z
    x = mx * cos_pitch + mz * sin_pitch
    y = mx * sin_roll * sin_pitch + my * cos_roll - mz * sin_roll * cos_pitch
    return math.atan2(-y, x)
