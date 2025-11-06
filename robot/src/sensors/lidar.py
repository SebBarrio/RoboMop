"""RPLIDAR S2L serial interface implemented with raw protocol commands."""

from __future__ import annotations

import asyncio
import math
import threading
import time
from dataclasses import dataclass
from typing import AsyncIterator, Optional

import serial


class RPLidarProtocolError(RuntimeError):
    """Raised when the sensor replies with data that cannot be parsed."""


@dataclass(frozen=True, slots=True)
class LidarMeasurement:
    """Normalized reading returned by the LIDAR sensor."""

    angle_radians: float
    distance_m: float
    quality: int
    start_flag: bool


@dataclass(frozen=True, slots=True)
class _ResponseDescriptor:
    data_length: int
    data_type: int
    sub_type: int


class RPLidarSerial:
    """Async controller for the RPLIDAR S2L using the native serial protocol."""

    SYNC_BYTE = 0xA5
    RESPONSE_SYNC_BYTE = 0x5A

    CMD_STOP = 0x25
    CMD_RESET = 0x40
    CMD_SCAN = 0x20
    CMD_GET_INFO = 0x50
    CMD_GET_HEALTH = 0x52
    CMD_SET_MOTOR_PWM = 0xF0

    RESP_MEASUREMENT_TYPE_STANDARD = 0x81

    DEFAULT_TIMEOUT = 1.0
    DEFAULT_BAUD_RATE = 1_000_000
    DEFAULT_MOTOR_PWM = 660

    def __init__(
        self,
        port: str,
        *,
        baud_rate: int = DEFAULT_BAUD_RATE,
        motor_pwm: int = DEFAULT_MOTOR_PWM,
        serial_timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        self._port = port
        self._baud_rate = baud_rate
        self._motor_pwm = motor_pwm
        self._serial_timeout = serial_timeout
        self._serial: Optional[serial.Serial] = None
        self._serial_lock = threading.Lock()
        self._reader_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._queue: Optional[asyncio.Queue[LidarMeasurement | None]] = None
        self._packet_size = 0

    async def __aenter__(self) -> "RPLidarSerial":
        await self.start()
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.stop()

    async def start(self) -> None:
        """Open the serial port, reset device, and start measurement streaming."""

        if self._serial is not None:
            return

        self._loop = asyncio.get_running_loop()
        await asyncio.to_thread(self._open_serial)
        
        # Reset device to ensure clean state
        await asyncio.to_thread(self._send_command, self.CMD_RESET)
        await asyncio.sleep(2.0)  # Wait for reset to complete
        
        # Clear any stale data
        with self._serial_lock:
            if self._serial is not None:
                self._serial.reset_input_buffer()
        
        # Motor PWM is typically auto-managed by the LIDAR
        await asyncio.to_thread(self._set_motor_pwm, self._motor_pwm)
        
        # Start scanning
        descriptor = await asyncio.to_thread(self._begin_scan)
        if descriptor.data_type != self.RESP_MEASUREMENT_TYPE_STANDARD:
            raise RPLidarProtocolError(f"Unsupported measurement type 0x{descriptor.data_type:02x}")
        self._packet_size = descriptor.data_length
        if self._packet_size <= 0:
            raise RPLidarProtocolError("Invalid packet size reported by descriptor")

        self._queue = asyncio.Queue(maxsize=8192)
        self._stop_event.clear()
        self._reader_thread = threading.Thread(
            target=self._reader_main,
            name="rplidar-reader",
            daemon=True,
        )
        self._reader_thread.start()

    async def stop(self) -> None:
        """Stop scanning and close the serial connection."""

        if self._serial is None:
            return

        await asyncio.to_thread(self._send_command, self.CMD_STOP)
        await asyncio.to_thread(self._set_motor_pwm, 0)
        self._stop_event.set()
        if self._reader_thread is not None:
            self._reader_thread.join(timeout=2.0)
        await asyncio.to_thread(self._close_serial)
        if self._queue is not None:
            await self._queue.put(None)
        self._packet_size = 0
        self._queue = None
        self._loop = None
        self._reader_thread = None

    async def iter_scans(self) -> AsyncIterator[list[LidarMeasurement]]:
        """Yield scans grouped per revolution."""

        if self._queue is None:
            raise RuntimeError("iter_scans() requires an active connection")

        current: list[LidarMeasurement] = []
        while True:
            measurement = await self._queue.get()
            if measurement is None:
                if current:
                    yield current
                break
            if measurement.start_flag and current:
                yield current
                current = [measurement]
            else:
                current.append(measurement)

    async def read_scan(self) -> list[LidarMeasurement]:
        """Read and return a single complete scan (one revolution)."""

        if self._queue is None:
            raise RuntimeError("read_scan() requires an active connection")

        current: list[LidarMeasurement] = []
        while True:
            measurement = await self._queue.get()
            if measurement is None:
                return current if current else []
            if measurement.start_flag and current:
                return current
            current.append(measurement)

    async def get_device_info(self) -> bytes:
        """Return the raw payload from the get info command."""

        await asyncio.to_thread(self._send_command, self.CMD_GET_INFO)
        return await asyncio.to_thread(self._read_payload, expected_length=20)

    async def get_health(self) -> bytes:
        """Return the raw payload from the get health command."""

        await asyncio.to_thread(self._send_command, self.CMD_GET_HEALTH)
        return await asyncio.to_thread(self._read_payload, expected_length=3)

    def _open_serial(self) -> None:
        ser = serial.Serial(
            self._port,
            baudrate=self._baud_rate,
            timeout=self._serial_timeout,
            parity=serial.PARITY_NONE,
            bytesize=serial.EIGHTBITS,
            stopbits=serial.STOPBITS_ONE,
        )
        ser.reset_input_buffer()
        ser.reset_output_buffer()
        with self._serial_lock:
            self._serial = ser

    def _close_serial(self) -> None:
        with self._serial_lock:
            if self._serial is not None:
                try:
                    self._serial.close()
                finally:
                    self._serial = None

    def _set_motor_pwm(self, pwm: int) -> None:
        """Set motor PWM. For simplicity, we skip this as most RPLIDAR models auto-control motor."""
        # Motor control is typically handled by the LIDAR internally for A1/A2 models
        pass

    def _begin_scan(self) -> _ResponseDescriptor:
        """Begin scanning with proper reset and buffer clearing."""
        # Stop any ongoing scan
        self._send_command(self.CMD_STOP)
        time.sleep(0.1)
        
        # Clear buffers
        with self._serial_lock:
            if self._serial is not None:
                self._serial.reset_input_buffer()
        time.sleep(0.1)
        
        # Start scan
        self._send_command(self.CMD_SCAN)
        time.sleep(0.1)
        
        return self._read_descriptor()

    def _reader_main(self) -> None:
        assert self._queue is not None
        assert self._loop is not None
        
        def _safe_enqueue(item: LidarMeasurement) -> None:
            """Enqueue item, dropping it silently if queue is full."""
            try:
                self._queue.put_nowait(item)
            except asyncio.QueueFull:
                pass  # Drop measurement when queue is full
        
        while not self._stop_event.is_set():
            try:
                packet = self._read_exact(self._packet_size)
            except RPLidarProtocolError:
                break
            if not packet:
                continue
            measurement = self._decode_measurement(packet)
            if measurement is None:
                continue
            self._loop.call_soon_threadsafe(_safe_enqueue, measurement)

    def _read_descriptor(self) -> _ResponseDescriptor:
        raw = self._read_exact(7)
        if len(raw) != 7 or raw[0] != self.SYNC_BYTE or raw[1] != self.RESPONSE_SYNC_BYTE:
            raise RPLidarProtocolError("Invalid descriptor sync sequence")
        size = raw[2] | (raw[3] << 8) | (raw[4] << 16) | ((raw[5] & 0x3F) << 24)
        sub_type = (raw[5] >> 6) & 0x03
        data_type = raw[6]
        return _ResponseDescriptor(size, data_type, sub_type)

    def _read_payload(self, *, expected_length: int) -> bytes:
        descriptor = self._read_descriptor()
        if descriptor.data_length != expected_length:
            raise RPLidarProtocolError("Unexpected payload length")
        return self._read_exact(expected_length)

    def _send_command(self, command: int, payload: bytes | None = None) -> None:
        """Send command to RPLidar using simple 2-byte format for standard commands."""
        # Standard scan commands (STOP, RESET, SCAN, GET_INFO, GET_HEALTH) use 2-byte format
        frame = bytes([self.SYNC_BYTE, command])
        with self._serial_lock:
            if self._serial is None:
                raise RuntimeError("Serial port not open")
            self._serial.write(frame)
            self._serial.flush()

    def _read_exact(self, size: int) -> bytes:
        if size <= 0:
            return b""
        with self._serial_lock:
            if self._serial is None:
                raise RuntimeError("Serial port not open")
            remaining = size
            chunks = bytearray()
            while remaining > 0:
                chunk = self._serial.read(remaining)
                if not chunk:
                    raise RPLidarProtocolError("Timed out while reading from sensor")
                chunks.extend(chunk)
                remaining -= len(chunk)
            return bytes(chunks)

    @staticmethod
    def _decode_measurement(packet: bytes) -> Optional[LidarMeasurement]:
        """Decode 5-byte RPLIDAR measurement packet.
        
        Packet format (standard scan mode):
        - Byte 0: Start flag (bit 0) and Quality (bits 2-7)
        - Bytes 1-2: Angle (15 bits, in 1/64 degree units)
        - Bytes 3-4: Distance (16 bits, in 1/4 mm units)
        """
        if len(packet) != 5:
            return None
        
        # Parse start flag and quality
        start_flag = (packet[0] & 0x01) != 0
        quality = (packet[0] >> 2) & 0x3F
        
        # Parse angle (15-bit value in 1/64 degree units)
        angle_raw = (packet[2] << 8) | packet[1]
        angle_deg = ((angle_raw >> 1) & 0x7FFF) / 64.0
        angle_rad = math.radians(angle_deg) % (2.0 * math.pi)
        
        # Parse distance (16-bit value in 1/4 mm units)
        distance_raw = (packet[4] << 8) | packet[3]
        distance_m = (distance_raw / 4.0) / 1000.0
        
        # Filter out invalid measurements (matching test_lidar_direct.py behavior)
        if distance_m <= 0.0 or quality == 0:
            return None
        
        return LidarMeasurement(
            angle_radians=angle_rad,
            distance_m=distance_m,
            quality=quality,
            start_flag=start_flag,
        )
