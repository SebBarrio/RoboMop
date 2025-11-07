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

    DEFAULT_TIMEOUT = 2.0  # Increased from 1.0 to 2.0 for more reliable reads
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
        self._last_start_bit: Optional[bool] = None

    async def __aenter__(self) -> "RPLidarSerial":
        await self.start()
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.stop()

    async def start(self) -> None:
        """Open the serial port, reset device, and start measurement streaming."""

        if self._serial is not None:
            print(f"LIDAR already started on {self._port}")
            return

        print(f"Starting RPLIDAR on {self._port} at {self._baud_rate} baud")
        self._loop = asyncio.get_running_loop()
        await asyncio.to_thread(self._open_serial)
        print("✓ Serial port opened")
        
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
        
        # Note: Motor PWM is auto-managed by most RPLIDAR models when scan starts
        # No need to explicitly control it
        
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
            # For standard scan mode, packet size is always 5 bytes
            # (the descriptor's data_length field is not used for continuous scan)
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

    async def stop(self) -> None:
        """Stop scanning and close the serial connection."""

        if self._serial is None:
            return

        print("Stopping RPLIDAR scan...")
        await asyncio.to_thread(self._send_command, self.CMD_STOP)
        # Motor will stop automatically when scan stops
        
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
            # Detect new scan by start-bit toggle (per SDK, start bit toggles each revolution)
            new_scan_by_toggle = (
                prev_start_bit is not None and measurement.start_flag != prev_start_bit
            )
            # Also detect by angle wrap-around for robustness
            new_scan_by_angle = (
                prev_angle is not None and measurement.angle_radians < (prev_angle - 1.0)
            )
            if current and (new_scan_by_toggle or new_scan_by_angle):
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
            new_scan_by_toggle = (
                prev_start_bit is not None and measurement.start_flag != prev_start_bit
            )
            new_scan_by_angle = (
                prev_angle is not None and measurement.angle_radians < (prev_angle - 1.0)
            )
            if current and (new_scan_by_toggle or new_scan_by_angle):
                return current
            current.append(measurement)
            prev_start_bit = measurement.start_flag
            prev_angle = measurement.angle_radians

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
        """Set motor PWM to control LIDAR spinning speed.
        
        For RPLidar A1/A2 models, the motor needs to be controlled via PWM.
        PWM value range: 0-1023 (0 = stop, 600-700 = typical operating speed)
        """
        if pwm == 0:
            # Stop motor - just send the command without waiting for response
            pwm_clamped = 0
            payload = bytes([pwm_clamped & 0xFF, pwm_clamped >> 8])
            self._send_command_with_payload(self.CMD_SET_MOTOR_PWM, payload)
        else:
            # Start motor - for A1/A2, we can just send a simple command
            # Many RPLidar models will auto-start the motor when scan begins
            # But we'll try to explicitly set it just to be sure
            pwm_clamped = max(0, min(1023, pwm))
            payload = bytes([pwm_clamped & 0xFF, pwm_clamped >> 8])
            self._send_command_with_payload(self.CMD_SET_MOTOR_PWM, payload)

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
        """Background thread that continuously reads LIDAR measurement packets."""
        assert self._queue is not None
        assert self._loop is not None
        
        def _safe_enqueue(item: LidarMeasurement) -> None:
            """Enqueue item, dropping it silently if queue is full."""
            try:
                self._queue.put_nowait(item)
            except asyncio.QueueFull:
                pass  # Drop measurement when queue is full
        
        measurement_count = 0
        error_count = 0
        
        while not self._stop_event.is_set():
            try:
                packet = self._read_packet_with_resync()
                measurement = self._decode_measurement(packet)
                if measurement is None:
                    # Failed to decode even after resync: count as error and continue
                    error_count += 1
                    if error_count < 5:
                        print("Failed to decode measurement packet after resync; skipping")
                    # Try auto-recover if persistent errors accumulate
                    if error_count in (20, 50):
                        try:
                            print("Attempting to recover scan stream...")
                            self._attempt_recover_scan()
                            print("Recover attempt finished")
                        except Exception as rec_exc:
                            print(f"Recover attempt failed: {rec_exc}")
                    if error_count > 100:
                        print(f"Too many LIDAR errors ({error_count}), stopping reader thread")
                        break
                    continue
                    
                self._loop.call_soon_threadsafe(_safe_enqueue, measurement)
                measurement_count += 1
                # Reset error counter on successful decode
                error_count = 0
                
            except RPLidarProtocolError as exc:
                error_count += 1
                if error_count < 5:  # Log first few errors
                    print(f"RPLidar protocol error in reader thread: {exc}")
                if error_count > 100:  # Too many errors, give up
                    print(f"Too many LIDAR errors ({error_count}), stopping reader thread")
                    break
            except Exception as exc:
                error_count += 1
                if error_count < 5:
                    print(f"Unexpected error in LIDAR reader thread: {exc}")
                if error_count > 100:
                    print(f"Too many LIDAR errors ({error_count}), stopping reader thread")
                    break
        
        print(f"LIDAR reader thread exiting (read {measurement_count} measurements, {error_count} errors)")

    def _read_descriptor(self) -> _ResponseDescriptor:
        """Read response descriptor (7 bytes) from RPLIDAR.
        
        Format:
        - Bytes 0-1: Sync bytes (0xA5 0x5A)
        - Bytes 2-5: Data length (32-bit little-endian)
        - Byte 6: Data type
        """
        # Try to read with timeout
        raw = self._read_exact(7)
        if len(raw) != 7:
            raise RPLidarProtocolError(f"Expected 7 bytes for descriptor, got {len(raw)}")
        
        # Check sync bytes
        if raw[0] != self.SYNC_BYTE or raw[1] != self.RESPONSE_SYNC_BYTE:
            raise RPLidarProtocolError(
                f"Invalid descriptor sync: got 0x{raw[0]:02x} 0x{raw[1]:02x}, "
                f"expected 0x{self.SYNC_BYTE:02x} 0x{self.RESPONSE_SYNC_BYTE:02x}"
            )
        
        # Parse data length (30 bits) and send mode (2 bits in byte 5 upper bits)
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
    
    def _send_command_with_payload(self, command: int, payload: bytes) -> None:
        """Send command with payload (e.g., motor PWM control).
        
        Format: [SYNC_BYTE, COMMAND, PAYLOAD_LENGTH, ...PAYLOAD, CHECKSUM]
        """
        frame = bytearray([self.SYNC_BYTE, command, len(payload)])
        frame.extend(payload)
        # Calculate checksum (XOR of all payload bytes)
        checksum = 0
        for byte in payload:
            checksum ^= byte
        frame.append(checksum)
        
        with self._serial_lock:
            if self._serial is None:
                raise RuntimeError("Serial port not open")
            self._serial.write(frame)
            self._serial.flush()

    def _read_exact(self, size: int) -> bytes:
        """Read exactly `size` bytes from the serial port.
        
        Uses blocking read with timeout. If timeout occurs, raises RPLidarProtocolError.
        """
        if size <= 0:
            return b""
        with self._serial_lock:
            if self._serial is None:
                raise RuntimeError("Serial port not open")
            
            # For more reliable reading, wait a bit if no data is immediately available
            if self._serial.in_waiting == 0:
                time.sleep(0.001)  # 1ms wait to allow data to arrive
            
            remaining = size
            chunks = bytearray()
            retry_count = 0
            max_retries = 3
            
            while remaining > 0:
                chunk = self._serial.read(remaining)
                if not chunk:
                    retry_count += 1
                    if retry_count >= max_retries:
                        raise RPLidarProtocolError(
                            f"Timed out while reading from sensor "
                            f"(expected {size} bytes, got {len(chunks)})"
                        )
                    time.sleep(0.01)  # Short wait before retry
                    continue
                chunks.extend(chunk)
                remaining -= len(chunk)
                retry_count = 0  # Reset retry count on successful read
            return bytes(chunks)

    def _read_packet_with_resync(self) -> bytes:
        """Read one 5-byte standard measurement packet with on-the-fly resynchronization.
        
        The standard node format requires:
        - Byte0 bit0 = start bit, Byte0 bit1 = inverted start bit (XOR must be 1)
        - Angle word LSB (bit0 of (b2<<8|b1)) must be 1 (check bit)
        """
        # Initial read
        window = bytearray(self._read_exact(5))
        # Fast path: window already looks like a valid packet
        if self._looks_like_valid_packet(window):
            return bytes(window)
        # Slow path: shift-by-one resync scan
        attempts = 0
        # Limit the resync scan to a reasonable number of bytes to avoid getting stuck
        max_attempt_bytes = 100
        while attempts < max_attempt_bytes:
            # Read one more byte and slide
            nxt = self._read_exact(1)
            if not nxt:
                attempts += 1
                continue
            window.pop(0)
            window.append(nxt[0])
            if self._looks_like_valid_packet(window):
                return bytes(window)
            attempts += 1
        raise RPLidarProtocolError("Unable to resynchronize to measurement packet boundary")

    @staticmethod
    def _looks_like_valid_packet(packet: bytes) -> bool:
        """Heuristic validation for a 5-byte standard measurement packet."""
        if len(packet) != 5:
            return False
        # Byte0: start bit and its inverse in bit1
        start_bit = (packet[0] & 0x01) != 0
        inv_start_bit = ((packet[0] >> 1) & 0x01) != 0
        if (start_bit ^ inv_start_bit) != True:
            return False
        # Angle word check bit (bit0) must be 1
        angle_word = (packet[2] << 8) | packet[1]
        if (angle_word & 0x01) == 0:
            return False
        return True

    def _attempt_recover_scan(self) -> None:
        """Try to recover from a desynchronized or stalled stream."""
        # Stop current stream
        self._send_command(self.CMD_STOP)
        time.sleep(0.05)
        # Flush input
        with self._serial_lock:
            if self._serial is not None:
                self._serial.reset_input_buffer()
        time.sleep(0.05)
        # Restart scan
        self._send_command(self.CMD_SCAN)
        time.sleep(0.1)
        # Read and validate descriptor (best-effort; ignore mismatch but keep running)
        try:
            desc = self._read_descriptor()
            if desc.data_type != self.RESP_MEASUREMENT_TYPE_STANDARD:
                # For S2/S2L we still expect standard node type in this code path
                # If not, we raise to trigger outer error handling
                raise RPLidarProtocolError(
                    f"Unexpected measurement type 0x{desc.data_type:02x} during recovery"
                )
        except Exception as exc:
            # If descriptor read fails, let the caller handle escalation
            raise

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
        
        # Validate start bits (bit0 vs inverted bit1), and angle check bit
        start_bit = (packet[0] & 0x01) != 0
        inv_start_bit = ((packet[0] >> 1) & 0x01) != 0
        if (start_bit ^ inv_start_bit) != True:
            return None
        quality = (packet[0] >> 2) & 0x3F
        
        # Parse angle (15-bit value in 1/64 degree units)
        angle_raw = (packet[2] << 8) | packet[1]
        # angle check bit (bit0) must be 1
        if (angle_raw & 0x01) == 0:
            return None
        angle_deg = ((angle_raw >> 1) & 0x7FFF) / 64.0
        angle_rad = math.radians(angle_deg) % (2.0 * math.pi)
        
        # Parse distance (16-bit value in 1/4 mm units)
        distance_raw = (packet[4] << 8) | packet[3]
        distance_m = (distance_raw / 4.0) / 1000.0
        
        # Do not reject zero-quality or zero-distance here; they are still useful for
        # scan boundary detection. Downstream consumers can ignore distance<=0.
        
        return LidarMeasurement(
            angle_radians=angle_rad,
            distance_m=distance_m,
            quality=quality,
            start_flag=start_bit,
        )
