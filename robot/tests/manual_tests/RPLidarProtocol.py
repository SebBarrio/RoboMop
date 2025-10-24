#!/usr/bin/env python3
"""
RPLidar Protocol Explanation and Implementation

This file explains how the RPLidar communication protocol works
and provides a clean implementation for future use.
"""

import serial
import time
import struct
from typing import Dict, List, Tuple, Optional

# Protocol Constants
SYNC_BYTE = 0xA5
SYNC_BYTE2 = 0x5A


# Command Definitions
class RPLidarCommands:
    """RPLidar command constants."""

    STOP = 0x25  # Stop scanning
    RESET = 0x40  # Reset device
    SCAN = 0x20  # Start standard scan
    EXPRESS_SCAN = 0x82  # Start express scan (faster)
    FORCE_SCAN = 0x21  # Force scan start
    GET_INFO = 0x50  # Get device information
    GET_HEALTH = 0x52  # Get device health status
    GET_SAMPLE_RATE = 0x59  # Get sample rate


# Response Data Types
class ResponseTypes:
    """Response data type constants."""

    DEVICE_INFO = 0x04
    DEVICE_HEALTH = 0x06
    MEASUREMENT = 0x81
    SAMPLE_RATE = 0x15


class RPLidarProtocol:
    """
    Low-level RPLidar protocol implementation.

    This class handles the raw communication with RPLidar hardware
    without using the official library, giving us full control.
    """

    def __init__(self, port: str, baudrate: int = 1000000):
        """Initialize RPLidar protocol handler."""
        self.port = port
        self.baudrate = baudrate
        self.ser: Optional[serial.Serial] = None

    def connect(self) -> bool:
        """Connect to RPLidar device."""
        try:
            self.ser = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                timeout=1.0,
                bytesize=8,
                parity="N",
                stopbits=1,
            )
            print(f"✓ Connected to RPLidar on {self.port}")
            return True
        except Exception as e:
            print(f"✗ Failed to connect: {e}")
            return False

    def disconnect(self):
        """Disconnect from RPLidar device."""
        if self.ser and self.ser.is_open:
            self.ser.close()
            print("✓ Disconnected from RPLidar")

    def send_command(self, cmd: int) -> None:
        """
        Send a command to the RPLidar.

        Args:
            cmd: Command byte to send
        """
        if not self.ser or not self.ser.is_open:
            raise RuntimeError("Not connected to RPLidar")

        # Command format: [SYNC_BYTE] [COMMAND]
        packet = struct.pack("BB", SYNC_BYTE, cmd)
        self.ser.write(packet)
        print(f"Sent command: 0x{cmd:02X}")

    def read_response_descriptor(self, timeout: float = 2.0) -> Tuple[int, int]:
        """
        Read response descriptor from RPLidar.

        Returns:
            Tuple of (data_size, data_type)

        The response descriptor format:
        [SYNC_BYTE] [SYNC_BYTE2] [DATA_SIZE_LOW] [DATA_SIZE_HIGH] [DATA_SIZE_LOW2] [DATA_SIZE_HIGH2] [DATA_TYPE]

        Where DATA_SIZE is repeated twice for verification.
        """
        if not self.ser or not self.ser.is_open:
            raise RuntimeError("Not connected to RPLidar")

        start_time = time.time()

        # Wait for sync bytes
        while time.time() - start_time < timeout:
            if self.ser.in_waiting >= 7:  # Need 7 bytes for descriptor
                header = self.ser.read(7)

                # Check sync bytes
                if header[0] == SYNC_BYTE and header[1] == SYNC_BYTE2:
                    raw_size = struct.unpack("<I", header[2:6])[0]
                    # The two most-significant bits encode response info.
                    data_size = raw_size & 0x3FFFFFFF
                    data_type = header[6]

                    print(f"Response descriptor: size={data_size}, type=0x{data_type:02X}")
                    return data_size, data_type

        raise TimeoutError("No response descriptor received")

    def read_response_data(self, data_size: int) -> bytes:
        """Read response data after descriptor."""
        if not self.ser or not self.ser.is_open:
            raise RuntimeError("Not connected to RPLidar")

        # Wait for data to be available
        start_time = time.time()
        while self.ser.in_waiting < data_size and time.time() - start_time < 2.0:
            time.sleep(0.01)

        if self.ser.in_waiting < data_size:
            raise TimeoutError(f"Expected {data_size} bytes, got {self.ser.in_waiting}")

        return self.ser.read(data_size)

    def get_device_info(self) -> Dict:
        """
        Get device information.

        Returns:
            Dictionary with device info (model, firmware, hardware, serial)
        """
        print("Getting device info...")

        # Send command
        self.send_command(RPLidarCommands.GET_INFO)
        time.sleep(0.1)

        # Read response
        data_size, data_type = self.read_response_descriptor()

        if data_type != ResponseTypes.DEVICE_INFO:
            raise ValueError(f"Expected device info response, got 0x{data_type:02X}")

        data = self.read_response_data(data_size)

        # Parse device info
        info = {
            "model": data[0],
            "firmware_minor": data[1],
            "firmware_major": data[2],
            "hardware": data[3],
            "serial_number": data[4:20].hex().upper(),
        }

        print(
            f"Device Info: Model={info['model']}, "
            f"Firmware={info['firmware_major']}.{info['firmware_minor']}, "
            f"Hardware={info['hardware']}, "
            f"Serial={info['serial_number']}"
        )

        return info

    def get_device_health(self) -> Dict:
        """
        Get device health status.

        Returns:
            Dictionary with health status
        """
        print("Getting device health...")

        # Send command
        self.send_command(RPLidarCommands.GET_HEALTH)
        time.sleep(0.1)

        # Read response
        data_size, data_type = self.read_response_descriptor()

        if data_type != ResponseTypes.DEVICE_HEALTH:
            raise ValueError(f"Expected health response, got 0x{data_type:02X}")

        data = self.read_response_data(data_size)

        # Parse health info
        status = data[0]
        error_code = struct.unpack("<H", data[1:3])[0]

        status_text = {0: "Good", 1: "Warning", 2: "Error"}.get(status, "Unknown")

        health = {"status": status_text, "status_code": status, "error_code": error_code}

        print(f"Device Health: {health['status']} (Error: {health['error_code']})")

        return health

    def start_scan(self) -> None:
        """Start standard scanning mode."""
        print("Starting scan...")

        # Send scan command
        self.send_command(RPLidarCommands.SCAN)
        time.sleep(0.1)

        # Read response descriptor
        try:
            data_size, data_type = self.read_response_descriptor()
            print(f"Scan started: size={data_size}, type=0x{data_type:02X}")
        except TimeoutError:
            print("⚠ No scan response descriptor (this may be normal)")

    def stop_scan(self) -> None:
        """Stop scanning."""
        print("Stopping scan...")
        self.send_command(RPLidarCommands.STOP)
        time.sleep(0.1)

    def reset_device(self) -> None:
        """Reset the RPLidar device."""
        print("Resetting device...")
        self.send_command(RPLidarCommands.RESET)
        time.sleep(2.0)  # Give device time to reset

    def collect_scan_data(self, duration: float = 2.0) -> List[Dict]:
        """
        Collect scan data for specified duration.

        Args:
            duration: How long to collect data (seconds)

        Returns:
            List of measurement dictionaries
        """
        if not self.ser or not self.ser.is_open:
            raise RuntimeError("Not connected to RPLidar")

        print(f"Collecting scan data for {duration} seconds...")

        scan_data = []
        start_time = time.time()

        while time.time() - start_time < duration:
            if self.ser.in_waiting >= 5:  # Each measurement is 5 bytes
                raw = self.ser.read(5)

                # Parse measurement packet
                # Format: [Quality+Start] [Angle_Low] [Angle_High] [Distance_Low] [Distance_High]

                # Byte 0: Quality (bits 2-7) and Start flag (bit 0)
                start_flag = (raw[0] & 0x01) != 0
                quality = (raw[0] >> 2) & 0x3F  # 6 bits of quality

                # Bytes 1-2: Angle (15 bits, little-endian)
                angle_raw = (raw[2] << 8) | raw[1]
                angle = ((angle_raw >> 1) & 0x7FFF) / 64.0  # Convert to degrees

                # Bytes 3-4: Distance (16 bits, little-endian)
                distance_raw = (raw[4] << 8) | raw[3]
                distance = distance_raw / 4.0  # Convert to mm

                # Only keep valid measurements
                if distance > 0 and quality > 0:
                    measurement = {
                        "start": start_flag,
                        "quality": quality,
                        "angle": angle,
                        "distance": distance,
                        "timestamp": time.time(),
                    }
                    scan_data.append(measurement)

        print(f"✓ Collected {len(scan_data)} measurements")
        return scan_data


def demonstrate_protocol():
    """Demonstrate the RPLidar protocol usage."""
    import sys

    if len(sys.argv) != 2:
        print("Usage: python rplidar_protocol_explained.py /dev/ttyUSB0")
        sys.exit(1)

    port = sys.argv[1]

    # Create protocol handler
    lidar = RPLidarProtocol(port)

    try:
        # Connect
        if not lidar.connect():
            return

        # Reset device
        lidar.reset_device()

        # Get device info
        info = lidar.get_device_info()

        # Get device health
        health = lidar.get_device_health()

        # Start scanning
        lidar.start_scan()

        # Collect data
        scan_data = lidar.collect_scan_data(duration=2.0)

        # Stop scanning
        lidar.stop_scan()

        # Print results
        if scan_data:
            angles = [m["angle"] for m in scan_data]
            distances = [m["distance"] for m in scan_data]
            qualities = [m["quality"] for m in scan_data]

            print(f"\n=== Scan Results ===")
            print(f"Measurements: {len(scan_data)}")
            print(f"Distance range: {min(distances):.1f} - {max(distances):.1f} mm")
            print(f"Angle range: {min(angles):.1f}° - {max(angles):.1f}°")
            print(f"Quality range: {min(qualities)} - {max(qualities)}")

    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback

        traceback.print_exc()

    finally:
        lidar.disconnect()


if __name__ == "__main__":
    demonstrate_protocol()
