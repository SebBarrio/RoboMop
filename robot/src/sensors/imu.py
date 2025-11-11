"""MPU9250 IMU interface with complementary filter orientation estimation."""

from __future__ import annotations

import asyncio
import math
import threading
import time
from dataclasses import dataclass
from typing import AsyncIterator, Callable, Optional

from smbus2 import SMBus


GRAVITY = 9.80665

# MPU9250/MPU6500 Registers and constants (subset)
PWR_MGMT_1 = 0x6B
ACCEL_XOUT_H = 0x3B
GYRO_XOUT_H = 0x43
TEMP_OUT_H = 0x41
WHO_AM_I = 0x75
INT_PIN_CFG = 0x37
USER_CTRL = 0x6A
CONFIG = 0x1A  # DLPF configuration
GYRO_CONFIG = 0x1B  # Scale, not changed here (use defaults)
ACCEL_CONFIG = 0x1C
ACCEL_CONFIG2 = 0x1D  # Accel DLPF

# AK8963 (Magnetometer) Registers
AK8963_ADDRESS = 0x0C
AK8963_WHO_AM_I = 0x00
AK8963_CNTL1 = 0x0A
AK8963_ST1 = 0x02
AK8963_XOUT_L = 0x03

# Scale factors for default full-scale settings (±2g accel, ±250°/s gyro, 16-bit mag)
ACCEL_SCALE = 16384.0  # LSB/g for ±2g
GYRO_SCALE = 131.0  # LSB/(°/s) for ±250°/s
TEMP_OFFSET = 21.0
TEMP_SCALE = 333.87
MAG_SCALE = 4912.0 / 32760.0  # μT per LSB


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

    def set_alpha(self, alpha: float) -> None:
        if not 0.0 < alpha < 1.0:
            raise ValueError("alpha must be between 0 and 1")
        self._alpha = alpha

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
    """High-level IMU interface providing calibrated samples using direct I2C (smbus2)."""

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
        self._sample_rate_hz = sample_rate_hz
        self._filter_alpha = filter_alpha
        self._sleep = sleep

        # I2C bus and addressing
        self._bus_num = bus
        self._mpu_address = address
        self._bus: Optional[SMBus] = None
        self._magnetometer_enabled = False

        # Gyroscope calibration offsets (deg/s)
        self._gyro_offset_x = 0.0
        self._gyro_offset_y = 0.0
        self._gyro_offset_z = 0.0

        # Software low-pass filter (EMA) state
        self._filter_initialized = False
        self._ema_alpha = 0.5  # 0 = max smoothing, 1 = no smoothing
        self._accel_fx = 0.0
        self._accel_fy = 0.0
        self._accel_fz = 0.0
        self._gyro_fx = 0.0
        self._gyro_fy = 0.0
        self._gyro_fz = 0.0
        self._gyro_deadband = 0.5  # deg/s

        # Orientation filter and init/reference logic
        self._filter = _ComplementaryFilter(sample_rate_hz, filter_alpha)
        self._orientation_initialized = False
        self._init_buffer: list[Vector3] = []
        self._init_samples_needed = 100
        self._reference_orientation: Optional[Orientation] = None
        self._frame_count = 0
        self._init_alpha = 0.5
        self._convergence_frames = 100

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
        """Initialize the sensor and I2C bus, configure registers, and calibrate gyro."""
        if self._initialized:
            return

        # Open SMBus
        self._bus = SMBus(self._bus_num)

        # WHO_AM_I check (non-fatal if unexpected)
        try:
            who_am_i = self._bus.read_byte_data(self._mpu_address, WHO_AM_I)
            _ = who_am_i  # silence unused
        except Exception:
            pass

        # Wake device and configure DLPF for gyro and accel
        self._bus.write_byte_data(self._mpu_address, PWR_MGMT_1, 0x00)
        self._sleep(0.1)
        self._bus.write_byte_data(self._mpu_address, CONFIG, 0x03)  # Gyro DLPF 41Hz
        self._bus.write_byte_data(self._mpu_address, ACCEL_CONFIG2, 0x03)  # Accel DLPF 41Hz
        self._sleep(0.01)

        # Enable I2C bypass for direct AK8963 access and try to init magnetometer
        try:
            self._bus.write_byte_data(self._mpu_address, INT_PIN_CFG, 0x02)
            self._sleep(0.01)
            mag_id = self._bus.read_byte_data(AK8963_ADDRESS, AK8963_WHO_AM_I)
            if mag_id == 0x48:
                # 100Hz, 16-bit
                self._bus.write_byte_data(AK8963_ADDRESS, AK8963_CNTL1, 0x16)
                self._sleep(0.01)
                self._magnetometer_enabled = True
            else:
                self._magnetometer_enabled = False
        except Exception:
            self._magnetometer_enabled = False

        # Calibrate gyro while stationary
        self.calibrate_gyroscope(samples=300)

        # Reset EMA state
        self._filter_initialized = False

        self._initialized = True

    async def start(self) -> None:
        """Start async sampling."""
        if self._queue is not None:
            return
        self.initialize()
        self._loop = asyncio.get_running_loop()
        self._queue = asyncio.Queue(maxsize=2048)
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
        # Close SMBus
        if self._bus is not None:
            try:
                self._bus.close()
            except Exception:
                pass
            self._bus = None

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
            assert self._bus is not None
            # Burst read accel(6), temp(2), gyro(6)
            data_bytes = self._bus.read_i2c_block_data(self._mpu_address, ACCEL_XOUT_H, 14)

            # Parse raw values
            ax_raw = _bytes_to_int16(data_bytes[0], data_bytes[1])
            ay_raw = _bytes_to_int16(data_bytes[2], data_bytes[3])
            az_raw = _bytes_to_int16(data_bytes[4], data_bytes[5])
            temp_raw = _bytes_to_int16(data_bytes[6], data_bytes[7])
            gx_raw = _bytes_to_int16(data_bytes[8], data_bytes[9])
            gy_raw = _bytes_to_int16(data_bytes[10], data_bytes[11])
            gz_raw = _bytes_to_int16(data_bytes[12], data_bytes[13])

            # Convert to physical units
            ax = (ax_raw / ACCEL_SCALE) * GRAVITY
            ay = (ay_raw / ACCEL_SCALE) * GRAVITY
            az = (az_raw / ACCEL_SCALE) * GRAVITY

            gx = (gx_raw / GYRO_SCALE) - self._gyro_offset_x  # deg/s
            gy = (gy_raw / GYRO_SCALE) - self._gyro_offset_y
            gz = (gz_raw / GYRO_SCALE) - self._gyro_offset_z

            # EMA smoothing
            if not self._filter_initialized:
                self._accel_fx, self._accel_fy, self._accel_fz = ax, ay, az
                self._gyro_fx, self._gyro_fy, self._gyro_fz = gx, gy, gz
                self._filter_initialized = True
            else:
                a = self._ema_alpha
                self._accel_fx = a * ax + (1 - a) * self._accel_fx
                self._accel_fy = a * ay + (1 - a) * self._accel_fy
                self._accel_fz = a * az + (1 - a) * self._accel_fz
                self._gyro_fx = a * gx + (1 - a) * self._gyro_fx
                self._gyro_fy = a * gy + (1 - a) * self._gyro_fy
                self._gyro_fz = a * gz + (1 - a) * self._gyro_fz

            # Apply deadband to gyro (deg/s)
            def _apply_deadband(v: float) -> float:
                return 0.0 if abs(v) < self._gyro_deadband else v

            gx_db = _apply_deadband(self._gyro_fx)
            gy_db = _apply_deadband(self._gyro_fy)
            gz_db = _apply_deadband(self._gyro_fz)

            # Convert gyro to rad/s for filter
            angular_velocity = Vector3(
                math.radians(gx_db),
                math.radians(gy_db),
                math.radians(gz_db),
            )

            acceleration = Vector3(self._accel_fx, self._accel_fy, self._accel_fz)

            # Magnetometer (optional)
            magnetic_vector = self._read_magnetometer()

            # Dynamic alpha during convergence
            self._frame_count += 1
            if not self._orientation_initialized:
                # Initialization buffer with accelerometer only for initial tilt
                self._init_buffer.append(acceleration)
                if len(self._init_buffer) >= self._init_samples_needed:
                    # Average acceleration and compute initial roll/pitch
                    avg_ax = sum(v.x for v in self._init_buffer) / len(self._init_buffer)
                    avg_ay = sum(v.y for v in self._init_buffer) / len(self._init_buffer)
                    avg_az = sum(v.z for v in self._init_buffer) / len(self._init_buffer)
                    acc_norm = math.sqrt(avg_ax * avg_ax + avg_ay * avg_ay + avg_az * avg_az)
                    if acc_norm > 1e-3:
                        ax_n, ay_n, az_n = avg_ax / acc_norm, avg_ay / acc_norm, avg_az / acc_norm
                    else:
                        ax_n, ay_n, az_n = 0.0, 0.0, -1.0
                    init_roll = math.atan2(ay_n, az_n)
                    init_pitch = math.atan2(-ax_n, math.sqrt(ay_n * ay_n + az_n * az_n))
                    init_yaw = 0.0
                    if magnetic_vector is not None:
                        init_yaw = _compute_yaw(magnetic_vector, init_roll, init_pitch)
                    # Seed filter state directly
                    self._filter._initialized = True
                    self._filter._roll = init_roll
                    self._filter._pitch = init_pitch
                    self._filter._yaw = init_yaw
                    self._reference_orientation = Orientation(init_roll, init_pitch, init_yaw)
                    self._orientation_initialized = True
            # Set current alpha depending on convergence window
            if (
                self._orientation_initialized
                and (self._frame_count - self._init_samples_needed) < self._convergence_frames
            ):
                self._filter.set_alpha(self._init_alpha)
            else:
                self._filter.set_alpha(self._filter_alpha)

            # Update complementary filter
            orientation_abs = self._filter.update(acceleration, angular_velocity, magnetic_vector)

            # Report orientation relative to reference
            if self._reference_orientation is not None:
                rel_roll = _wrap_angle(orientation_abs.roll - self._reference_orientation.roll)
                rel_pitch = _wrap_angle(orientation_abs.pitch - self._reference_orientation.pitch)
                rel_yaw = _wrap_angle(orientation_abs.yaw - self._reference_orientation.yaw)
                orientation = Orientation(rel_roll, rel_pitch, rel_yaw)
            else:
                orientation = orientation_abs

            temp_c = (temp_raw / TEMP_SCALE) + TEMP_OFFSET
            timestamp = time.perf_counter()

        return ImuSample(
            acceleration_m_s2=acceleration,
            angular_velocity_rad_s=angular_velocity,
            magnetic_field_uT=magnetic_vector,
            temperature_c=temp_c,
            orientation=orientation,
            timestamp_s=timestamp,
        )

    def _reader_main(self) -> None:
        """Background thread for continuous sampling."""
        assert self._queue is not None
        assert self._loop is not None
        
        def _safe_enqueue(item: ImuSample) -> None:
            """Enqueue item, dropping it silently if queue is full."""
            try:
                self._queue.put_nowait(item)
                try:
                    # Debug: print queue size each time a sample is enqueued
                    print(f"[IMU DEBUG] enqueued sample; queue size={self._queue.qsize()}")
                except Exception:
                    pass
            except asyncio.QueueFull:
                pass  # Drop sample when queue is full
        
        interval = 1.0 / self._sample_rate_hz
        next_deadline = time.perf_counter()
        while not self._stop_event.is_set():
            try:
                sample = self.read_sample()
            except Exception:
                break
            # Check if loop is closed before trying to use it
            if self._loop.is_closed():
                break
            self._loop.call_soon_threadsafe(_safe_enqueue, sample)
            next_deadline += interval
            delay = next_deadline - time.perf_counter()
            if delay > 0:
                time.sleep(delay)
            else:
                next_deadline = time.perf_counter()

    def calibrate_gyroscope(self, samples: int = 300) -> None:
        """Calibrate gyroscope by averaging readings while stationary."""
        assert self._bus is not None
        sum_x = 0.0
        sum_y = 0.0
        sum_z = 0.0
        count = max(1, samples)
        for _ in range(count):
            data = self._bus.read_i2c_block_data(self._mpu_address, GYRO_XOUT_H, 6)
            gx_raw = _bytes_to_int16(data[0], data[1])
            gy_raw = _bytes_to_int16(data[2], data[3])
            gz_raw = _bytes_to_int16(data[4], data[5])
            sum_x += gx_raw / GYRO_SCALE
            sum_y += gy_raw / GYRO_SCALE
            sum_z += gz_raw / GYRO_SCALE
            self._sleep(0.01)
        self._gyro_offset_x = sum_x / count
        self._gyro_offset_y = sum_y / count
        self._gyro_offset_z = sum_z / count

    def _read_magnetometer(self) -> Optional[Vector3]:
        """Read AK8963 magnetometer if available and return in µT; else None."""
        if not self._magnetometer_enabled or self._bus is None:
            return None
        try:
            status = self._bus.read_byte_data(AK8963_ADDRESS, AK8963_ST1)
            if (status & 0x01) == 0:
                return None
            mag_bytes = self._bus.read_i2c_block_data(AK8963_ADDRESS, AK8963_XOUT_L, 7)
            if mag_bytes[6] & 0x08:
                return None
            mx_raw = _bytes_to_int16(mag_bytes[1], mag_bytes[0])
            my_raw = _bytes_to_int16(mag_bytes[3], mag_bytes[2])
            mz_raw = _bytes_to_int16(mag_bytes[5], mag_bytes[4])
            mx = mx_raw * MAG_SCALE
            my = my_raw * MAG_SCALE
            mz = mz_raw * MAG_SCALE
            return Vector3(mx, my, mz)
        except Exception:
            return None


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


def _bytes_to_int16(high_byte: int, low_byte: int) -> int:
    """Convert two bytes to a signed 16-bit integer."""
    value = (high_byte << 8) | low_byte
    if value >= 0x8000:
        value = -((65535 - value) + 1)
    return value
