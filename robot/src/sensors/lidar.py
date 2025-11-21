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

    DEFAULT_TIMEOUT = 2.0
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

    async def connect(self) -> None:
        """Open the serial port without starting scanning."""
        if self._serial is not None:
            return
            
        print(f"Opening RPLIDAR serial port {self._port} at {self._baud_rate} baud")
        self._loop = asyncio.get_running_loop()
        await asyncio.to_thread(self._open_serial)
        print("✓ Serial port opened")

    async def start(self) -> None:
        """Open the serial port (if needed), reset device, and start measurement streaming."""

        if self._serial is None:
            await self.connect()
            
        if self._reader_thread is not None:
            print(f"LIDAR scan already running on {self._port}")
            return

        # Reset device to ensure clean state
        print("Resetting LIDAR device...")
        await asyncio.to_thread(self._send_command, self.CMD_RESET)
        await asyncio.sleep(2.0)  # Wait for reset to complete
        print("✓ Device reset complete")
        
        # Clear any stale data
        with self._serial_lock:
            if self._serial is not None:
                self._serial.reset_input_buffer()
        print("✓ Input buffer cleared")
        
        # Start scanning
        print("Starting scan...")
        try:
            descriptor = await asyncio.to_thread(self._begin_scan)
            print(f"✓ Scan started: data_type=0x{descriptor.data_type:02x}, "
                  f"data_length={descriptor.data_length}, sub_type={descriptor.sub_type}")
            if descriptor.data_type != self.RESP_MEASUREMENT_TYPE_STANDARD:
                raise RPLidarProtocolError(
                    f"Unsupported measurement type 0x{descriptor.data_type:02x}"
                )
            self._packet_size = 5
        except Exception as exc:
            print(f"✗ Failed to start scan: {exc}")
            raise RPLidarProtocolError(f"Failed to start scan: {exc}") from exc

        # Give the LIDAR motor time to spin up before reading measurements
        print("Waiting for LIDAR motor to spin up...")
        await asyncio.sleep(1.0)
        
        print(f"Starting reader thread (packet_size={self._packet_size})...")
        self._queue = asyncio.Queue()
        self._stop_event.clear()
        self._reader_thread = threading.Thread(
            target=self._reader_main,
            name="rplidar-reader",
            daemon=True,
        )
        self._reader_thread.start()
        print("✓ RPLIDAR reader thread started")

    async def stop(self, close_serial: bool = True) -> None:
        """Stop scanning and optionally close the serial connection."""

        if self._serial is None:
            return

        print("Stopping RPLIDAR scan...")
        await asyncio.to_thread(self._send_command, self.CMD_STOP)
        
        self._stop_event.set()
        if self._reader_thread is not None:
            self._reader_thread.join(timeout=2.0)
        
        if close_serial:
            await asyncio.to_thread(self._close_serial)
            
        if self._queue is not None:
            await self._queue.put(None)
        self._packet_size = 0
        self._queue = None
        if close_serial:
            self._loop = None
        self._reader_thread = None
        print("✓ RPLIDAR stopped")

    async def iter_scans(self) -> AsyncIterator[list[LidarMeasurement]]:
        """Yield scans grouped per revolution."""

        if self._queue is None:
            raise RuntimeError("iter_scans() requires an active connection")

        current: list[LidarMeasurement] = []
        prev_angle: Optional[float] = None
        prev_start_bit: Optional[bool] = None
        while True:
            measurement = await self._queue.get()
            if measurement is None:
                if current:
                    yield current
                break
            new_scan_by_flag = measurement.start_flag and prev_start_bit is not None
            new_scan_by_angle = (
                prev_angle is not None and measurement.angle_radians < (prev_angle - 1.0)
            )
            if current and (new_scan_by_flag or new_scan_by_angle):
                yield current
                current = []
            current.append(measurement)
            prev_angle = measurement.angle_radians
            prev_start_bit = measurement.start_flag

    async def read_scan(self) -> list[LidarMeasurement]:
        """Read and return a single complete scan (one revolution)."""

        if self._queue is None:
            raise RuntimeError("read_scan() requires an active connection")

        current: list[LidarMeasurement] = []
        prev_start_bit: Optional[bool] = None
        prev_angle: Optional[float] = None
        while True:
            measurement = await self._queue.get()
            if measurement is None:
                return current if current else []
            new_scan_by_flag = measurement.start_flag and prev_start_bit is not None
            new_scan_by_angle = (
                prev_angle is not None and measurement.angle_radians < (prev_angle - 1.0)
            )
            if current and (new_scan_by_flag or new_scan_by_angle):
                return current
            current.append(measurement)
            prev_start_bit = measurement.start_flag
            prev_angle = measurement.angle_radians

    async def get_device_info(self) -> bytes:
        await asyncio.to_thread(self._send_command, self.CMD_GET_INFO)
        return await asyncio.to_thread(self._read_payload, expected_length=20)

    async def get_health(self) -> bytes:
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

    def _begin_scan(self) -> _ResponseDescriptor:
        self._send_command(self.CMD_STOP)
        time.sleep(0.1)
        with self._serial_lock:
            if self._serial is not None:
                self._serial.reset_input_buffer()
        time.sleep(0.1)
        self._send_command(self.CMD_SCAN)
        time.sleep(0.1)
        return self._read_descriptor()

    def _reader_main(self) -> None:
        """Background thread that continuously reads LIDAR measurement packets using bulk reads."""
        assert self._queue is not None
        assert self._loop is not None
        
        def _safe_enqueue(item: LidarMeasurement) -> None:
            try:
                self._queue.put_nowait(item)
            except asyncio.QueueFull:
                pass 

        measurement_count = 0
        buffer = bytearray()
        PACKET_SIZE = 5
        READ_CHUNK_SIZE = 4096

        while not self._stop_event.is_set():
            try:
                # 1. Bulk Read from Serial
                if self._serial is None:
                    break
                
                # Check waiting bytes to avoid blocking heavily in 'read'
                waiting = self._serial.in_waiting
                if waiting > 0:
                    # Read all available data up to a safe chunk size
                    chunk = self._serial.read(min(waiting, READ_CHUNK_SIZE))
                    if chunk:
                        buffer.extend(chunk)
                else:
                    # No data waiting, small sleep to yield CPU
                    time.sleep(0.001)
                    continue

                # 2. Process Buffer
                # We need at least 5 bytes for a packet
                while len(buffer) >= PACKET_SIZE:
                    # Optimistically check if the front of the buffer is a valid packet
                    if self._looks_like_valid_packet(buffer, 0):
                        # Decode packet
                        packet = buffer[:PACKET_SIZE]
                        measurement = self._decode_measurement(packet)
                        
                        if measurement:
                            self._loop.call_soon_threadsafe(_safe_enqueue, measurement)
                            measurement_count += 1
                        
                        # Remove consumed packet
                        del buffer[:PACKET_SIZE]
                    else:
                        # Synchronization lost or noise: skip one byte and retry
                        # (Sliding window search)
                        del buffer[0]
                        
            except Exception as exc:
                print(f"Error in LIDAR reader thread: {exc}")
                time.sleep(0.1)  # Brief pause on error to prevent log spam
        
        print(f"LIDAR reader thread exiting (read {measurement_count} measurements)")

    def _read_descriptor(self) -> _ResponseDescriptor:
        raw = self._read_exact(7)
        if len(raw) != 7:
            raise RPLidarProtocolError(f"Expected 7 bytes for descriptor, got {len(raw)}")
        
        if raw[0] != self.SYNC_BYTE or raw[1] != self.RESPONSE_SYNC_BYTE:
            raise RPLidarProtocolError(
                f"Invalid descriptor sync: got 0x{raw[0]:02x} 0x{raw[1]:02x}, "
                f"expected 0x{self.SYNC_BYTE:02x} 0x{self.RESPONSE_SYNC_BYTE:02x}"
            )
        
        size = raw[2] | (raw[3] << 8) | (raw[4] << 16) | ((raw[5] & 0x3F) << 24)
        sub_type = (raw[5] >> 6) & 0x03
        data_type = raw[6]
        
        return _ResponseDescriptor(size, data_type, sub_type)

    def _read_payload(self, *, expected_length: int) -> bytes:
        descriptor = self._read_descriptor()
        if descriptor.data_length != expected_length:
            raise RPLidarProtocolError("Unexpected payload length")
        return self._read_exact(expected_length)

    def _send_command(self, command: int) -> None:
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
            return self._serial.read(size)

    @staticmethod
    def _looks_like_valid_packet(buffer: bytearray, offset: int) -> bool:
        """Heuristic validation for a 5-byte standard measurement packet."""
        if len(buffer) < offset + 5:
            return False
        
        # Byte0: start bit (bit 0) and its inverse (bit 1)
        b0 = buffer[offset]
        start_bit = (b0 & 0x01) != 0
        inv_start_bit = ((b0 >> 1) & 0x01) != 0
        
        if (start_bit ^ inv_start_bit) is not True:
            return False
            
        # Byte1-2: Check bit in angle LSB
        b1 = buffer[offset + 1]
        if (b1 & 0x01) == 0:
            return False
            
        return True

    @staticmethod
    def _decode_measurement(packet: bytes | bytearray) -> Optional[LidarMeasurement]:
        """Decode 5-byte RPLIDAR measurement packet."""
        if len(packet) != 5:
            return None
        
        start_bit = (packet[0] & 0x01) != 0
        quality = (packet[0] >> 2) & 0x3F
        
        angle_raw = (packet[2] << 8) | packet[1]
        angle_deg = ((angle_raw >> 1) & 0x7FFF) / 64.0
        angle_rad = math.radians(angle_deg)
        
        distance_raw = (packet[4] << 8) | packet[3]
        distance_m = (distance_raw / 4.0) / 1000.0
        
        return LidarMeasurement(
            angle_radians=angle_rad,
            distance_m=distance_m,
            quality=quality,
            start_flag=start_bit,
        )