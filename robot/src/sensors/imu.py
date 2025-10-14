"""MPU9250 IMU interface with complementary filter orientation estimation."""

from __future__ import annotations

import asyncio
import math
import threading
import time
from dataclasses import dataclass
from typing import AsyncIterator, Callable, Optional

try:
    from mpu9250_jmdev.mpu_9250 import MPU9250 as MPU9250Driver
    from mpu9250_jmdev.registers import GFS_500, AFS_4G, MFS_16BITS, AK8963_MODE_C100HZ
except ImportError:
    MPU9250Driver = None  # type: ignore
    GFS_500 = None  # type: ignore
    AFS_4G = None  # type: ignore
    MFS_16BITS = None  # type: ignore
    AK8963_MODE_C100HZ = None  # type: ignore


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


class _ComplementaryFilter:
    """Complementary filter for sensor fusion."""

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
    """High-level IMU interface providing calibrated samples using mpu9250-jmdev library."""

    def __init__(
        self,
        i2c: Optional[object] = None,
        *,
        bus: int = 1,
        address: int = 0x68,
        sample_rate_hz: float = 100.0,
        filter_alpha: float = 0.98,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if MPU9250Driver is None:
            raise ImportError(
                "mpu9250-jmdev library not found. Install with: pip install mpu9250-jmdev"
            )

        self._sample_rate_hz = sample_rate_hz
        self._filter_alpha = filter_alpha
        self._sleep = sleep

        # Initialize the MPU9250 driver
        self._driver = MPU9250Driver(
            address_ak=address,
            address_mpu_master=address,
            address_mpu_slave=None,
            bus=bus,
            gfs=GFS_500,  # ±500 °/s
            afs=AFS_4G,   # ±4g
            mfs=MFS_16BITS,  # 16-bit magnetometer
            mode=AK8963_MODE_C100HZ,  # 100 Hz continuous
        )

        self._filter = _ComplementaryFilter(sample_rate_hz, filter_alpha)

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
        """Initialize the sensor."""
        if self._initialized:
            return
        
        # Configure the sensor
        self._driver.configure()
        
        # Calibrate accelerometer and gyroscope
        self._driver.calibrate()
        
        # Configure magnetometer
        self._driver.configure_mag()
        
        # Calibrate magnetometer
        self._driver.calibrateMag()
        
        self._initialized = True

    async def start(self) -> None:
        """Start async sampling."""
        if self._queue is not None:
            return
        self.initialize()
        self._loop = asyncio.get_running_loop()
        self._queue = asyncio.Queue(maxsize=512)
        self._stop_event.clear()
        self._reader_thread = threading.Thread(
            target=self._reader_main, name="mpu9250-reader", daemon=True
        )
        self._reader_thread.start()

    async def stop(self) -> None:
        """Stop async sampling."""
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
        """Iterate over samples asynchronously."""
        if self._queue is None:
            raise RuntimeError("iter_samples() requires an active start()")
        while True:
            sample = await self._queue.get()
            if sample is None:
                break
            yield sample

    def read_sample(self) -> ImuSample:
        """Read a single IMU sample with orientation."""
        self.initialize()
        with self._lock:
            # Read raw sensor data
            accel = self._driver.readAccelerometerMaster()
            gyro = self._driver.readGyroscopeMaster()
            mag = self._driver.readMagnetometerMaster()
            temp = self._driver.readTemperatureMaster()

            # Convert to our data structures
            acceleration = Vector3(
                accel[0] * GRAVITY,  # Convert g to m/s²
                accel[1] * GRAVITY,
                accel[2] * GRAVITY,
            )
            
            angular_velocity = Vector3(
                math.radians(gyro[0]),  # Convert deg/s to rad/s
                math.radians(gyro[1]),
                math.radians(gyro[2]),
            )

            magnetic_vector: Optional[Vector3]
            if mag is not None and len(mag) == 3:
                magnetic_vector = Vector3(
                    mag[0],  # Already in µT
                    mag[1],
                    mag[2],
                )
            else:
                magnetic_vector = None

            # Update complementary filter
            orientation = self._filter.update(acceleration, angular_velocity, magnetic_vector)
            timestamp = time.perf_counter()

        return ImuSample(
            acceleration_m_s2=acceleration,
            angular_velocity_rad_s=angular_velocity,
            magnetic_field_uT=magnetic_vector,
            temperature_c=temp,
            orientation=orientation,
            timestamp_s=timestamp,
        )

    def _reader_main(self) -> None:
        """Background thread for continuous sampling."""
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


def _wrap_angle(angle: float) -> float:
    """Wrap angle to [-π, π]."""
    wrapped = (angle + math.pi) % (2.0 * math.pi)
    return wrapped - math.pi


def _compute_yaw(magnetic: Vector3, roll: float, pitch: float) -> float:
    """Compute yaw from magnetometer reading compensated for tilt."""
    cos_roll = math.cos(roll)
    sin_roll = math.sin(roll)
    cos_pitch = math.cos(pitch)
    sin_pitch = math.sin(pitch)

    mx, my, mz = magnetic.x, magnetic.y, magnetic.z
    x = mx * cos_pitch + mz * sin_pitch
    y = mx * sin_roll * sin_pitch + my * cos_roll - mz * sin_roll * cos_pitch
    return math.atan2(-y, x)
