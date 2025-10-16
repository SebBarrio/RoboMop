#!/usr/bin/env python3
"""
MPU9250/MPU6500 Sensor Data Socket Sender
Reads accelerometer, gyroscope, magnetometer, and temperature data from MPU9250/MPU6500
and sends it over a TCP socket connection.

Features:
    - Automatic gyroscope calibration to reduce drift
    - Magnetometer support (AK8963) on MPU9250/9255
    - Hardware DLPF (41Hz bandwidth) for noise reduction
    - Software exponential moving average filter
    - Gyroscope deadband to suppress drift
    - Direct I2C communication using smbus2

Requirements:
    pip install smbus2

Usage:
    python mpu9250_socket_sender.py [--host HOST] [--port PORT] [--rate HZ] [--filter ALPHA]
"""

import socket
import json
import time
import argparse
import sys
from typing import Dict, Any, Optional

try:
    from smbus2 import SMBus
except ImportError:
    print("Error: smbus2 library not found.")
    print("Install with: pip install smbus2")
    sys.exit(1)


class MPU9250SocketSender:
    """Reads MPU9250 data and sends it over TCP socket."""
    
    # MPU9250/MPU6500 Registers
    PWR_MGMT_1 = 0x6B
    ACCEL_XOUT_H = 0x3B
    GYRO_XOUT_H = 0x43
    TEMP_OUT_H = 0x41
    WHO_AM_I = 0x75
    INT_PIN_CFG = 0x37
    USER_CTRL = 0x6A
    CONFIG = 0x1A  # DLPF configuration
    GYRO_CONFIG = 0x1B
    ACCEL_CONFIG = 0x1C
    ACCEL_CONFIG2 = 0x1D
    
    # AK8963 (Magnetometer) Registers
    AK8963_ADDRESS = 0x0C
    AK8963_WHO_AM_I = 0x00
    AK8963_CNTL1 = 0x0A
    AK8963_ST1 = 0x02
    AK8963_XOUT_L = 0x03
    
    # Scale factors
    ACCEL_SCALE = 16384.0  # for ±2g
    GYRO_SCALE = 131.0     # for ±250°/s
    TEMP_OFFSET = 21.0
    TEMP_SCALE = 333.87
    MAG_SCALE = 4912.0 / 32760.0  # μT (for 16-bit mode)

    def __init__(self, host: str = '0.0.0.0', port: int = 9250, i2c_bus: int = 1, 
                 mpu_address: int = 0x68):
        """
        Initialize the MPU9250 sensor and socket server.

        Args:
            host: Host address to bind socket server (0.0.0.0 for all interfaces)
            port: Port number for socket server
            i2c_bus: I2C bus number (typically 1 on Raspberry Pi)
            mpu_address: I2C address of MPU9250 (0x68 or 0x69)
        """
        self.host = host
        self.port = port
        self.i2c_bus = i2c_bus
        self.mpu_address = mpu_address
        self.bus = None
        self.server_socket = None
        self.client_socket = None
        self.running = False
        self.magnetometer_enabled = False
        
        # Gyroscope calibration offsets (to reduce drift)
        self.gyro_offset_x = 0.0
        self.gyro_offset_y = 0.0
        self.gyro_offset_z = 0.0
        
        # Software low-pass filter (exponential moving average)
        self.filter_alpha = 0.5  # 0 = no filtering, 1 = no smoothing
        self.gyro_filtered_x = 0.0
        self.gyro_filtered_y = 0.0
        self.gyro_filtered_z = 0.0
        self.accel_filtered_x = 0.0
        self.accel_filtered_y = 0.0
        self.accel_filtered_z = 0.0
        self.filter_initialized = False

    def initialize_sensor(self) -> bool:
        """
        Initialize the MPU9250 sensor.

        Returns:
            True if successful, False otherwise
        """
        try:
            print(f"Initializing MPU9250 on I2C bus {self.i2c_bus} at address 0x{self.mpu_address:02x}...")
            
            # Open I2C bus
            self.bus = SMBus(self.i2c_bus)
            
            # Check WHO_AM_I register
            who_am_i = self.bus.read_byte_data(self.mpu_address, self.WHO_AM_I)
            sensor_types = {
                0x70: "MPU6500",
                0x71: "MPU9250",
                0x73: "MPU9255"
            }
            sensor_name = sensor_types.get(who_am_i, f"Unknown (0x{who_am_i:02x})")
            print(f"Detected sensor: {sensor_name}")
            
            if who_am_i not in sensor_types:
                print(f"Warning: Unexpected WHO_AM_I value: 0x{who_am_i:02x}")
            
            # Wake up sensor (clear sleep bit)
            self.bus.write_byte_data(self.mpu_address, self.PWR_MGMT_1, 0x00)
            time.sleep(0.1)  # Wait for sensor to wake up
            
            # Configure Digital Low Pass Filter (DLPF) for gyroscope
            # DLPF_CFG = 3: Bandwidth 41Hz, Delay 5.9ms (reduces noise significantly)
            self.bus.write_byte_data(self.mpu_address, self.CONFIG, 0x03)
            
            # Configure accelerometer low-pass filter
            # A_DLPF_CFG = 3: Bandwidth 41Hz (accel)
            self.bus.write_byte_data(self.mpu_address, self.ACCEL_CONFIG2, 0x03)
            
            time.sleep(0.01)
            
            # Try to initialize magnetometer (only on MPU9250/9255)
            if who_am_i in [0x71, 0x73]:
                self._initialize_magnetometer()
            else:
                print("Magnetometer not available on this sensor model")
            
            # Calibrate gyroscope to reduce drift
            print("Calibrating gyroscope... Keep sensor still for 3 seconds!")
            self._calibrate_gyroscope(samples=300)  # More samples for better calibration
            
            mag_status = "with magnetometer" if self.magnetometer_enabled else "accel/gyro only"
            print(f"{sensor_name} initialized successfully ({mag_status})")
            return True
            
        except OSError as e:
            if e.errno == 121:
                print(f"Error: I2C Remote I/O error (errno 121) - Device not responding")
            else:
                print(f"Error: I/O error - {e}")
            return False
            
        except Exception as e:
            print(f"Error initializing MPU9250: {e}")
            return False
    
    def _initialize_magnetometer(self):
        """Initialize the AK8963 magnetometer."""
        try:
            # Enable I2C bypass to access magnetometer directly
            self.bus.write_byte_data(self.mpu_address, self.INT_PIN_CFG, 0x02)
            time.sleep(0.01)
            
            # Check magnetometer WHO_AM_I
            mag_id = self.bus.read_byte_data(self.AK8963_ADDRESS, self.AK8963_WHO_AM_I)
            if mag_id != 0x48:
                print(f"Warning: Magnetometer not found (WHO_AM_I: 0x{mag_id:02x})")
                return
            
            # Set magnetometer to continuous measurement mode (100Hz, 16-bit)
            self.bus.write_byte_data(self.AK8963_ADDRESS, self.AK8963_CNTL1, 0x16)
            time.sleep(0.01)
            
            self.magnetometer_enabled = True
            
        except Exception as e:
            print(f"Magnetometer initialization failed: {e}")
            self.magnetometer_enabled = False
    
    def _calibrate_gyroscope(self, samples: int = 100):
        """
        Calibrate gyroscope by measuring bias while stationary.
        
        Args:
            samples: Number of samples to average
        """
        try:
            sum_x = 0.0
            sum_y = 0.0
            sum_z = 0.0
            
            for _ in range(samples):
                data_bytes = self.bus.read_i2c_block_data(self.mpu_address, self.GYRO_XOUT_H, 6)
                
                gyro_x_raw = self._bytes_to_int16(data_bytes[0], data_bytes[1])
                gyro_y_raw = self._bytes_to_int16(data_bytes[2], data_bytes[3])
                gyro_z_raw = self._bytes_to_int16(data_bytes[4], data_bytes[5])
                
                sum_x += gyro_x_raw / self.GYRO_SCALE
                sum_y += gyro_y_raw / self.GYRO_SCALE
                sum_z += gyro_z_raw / self.GYRO_SCALE
                
                time.sleep(0.01)
            
            self.gyro_offset_x = sum_x / samples
            self.gyro_offset_y = sum_y / samples
            self.gyro_offset_z = sum_z / samples
            
            print(f"Gyro offsets: X={self.gyro_offset_x:.2f} Y={self.gyro_offset_y:.2f} Z={self.gyro_offset_z:.2f} °/s")
            
        except Exception as e:
            print(f"Warning: Gyroscope calibration failed: {e}")

    def setup_socket(self) -> bool:
        """
        Set up the TCP socket server.

        Returns:
            True if successful, False otherwise
        """
        try:
            self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.server_socket.bind((self.host, self.port))
            self.server_socket.listen(1)
            print(f"Socket server listening on {self.host}:{self.port}")
            return True
            
        except Exception as e:
            print(f"Error setting up socket: {e}")
            return False

    def wait_for_client(self) -> bool:
        """
        Wait for a client connection.

        Returns:
            True if client connected, False otherwise
        """
        try:
            print("Waiting for client connection...")
            self.client_socket, address = self.server_socket.accept()
            print(f"Client connected from {address}")
            return True
            
        except Exception as e:
            print(f"Error accepting client: {e}")
            return False

    def read_sensor_data(self) -> Dict[str, Any]:
        """
        Read data from MPU9250 sensor.

        Returns:
            Dictionary containing sensor data
        """
        try:
            # Read all sensor data in one burst (14 bytes: accel, temp, gyro)
            data_bytes = self.bus.read_i2c_block_data(self.mpu_address, self.ACCEL_XOUT_H, 14)
            
            # Parse accelerometer data (registers 0-5)
            accel_x_raw = self._bytes_to_int16(data_bytes[0], data_bytes[1])
            accel_y_raw = self._bytes_to_int16(data_bytes[2], data_bytes[3])
            accel_z_raw = self._bytes_to_int16(data_bytes[4], data_bytes[5])
            
            # Parse temperature data (registers 6-7)
            temp_raw = self._bytes_to_int16(data_bytes[6], data_bytes[7])
            
            # Parse gyroscope data (registers 8-13)
            gyro_x_raw = self._bytes_to_int16(data_bytes[8], data_bytes[9])
            gyro_y_raw = self._bytes_to_int16(data_bytes[10], data_bytes[11])
            gyro_z_raw = self._bytes_to_int16(data_bytes[12], data_bytes[13])
            
            # Convert to physical units
            accel_x = (accel_x_raw / self.ACCEL_SCALE) * 9.80665  # m/s^2
            accel_y = (accel_y_raw / self.ACCEL_SCALE) * 9.80665
            accel_z = (accel_z_raw / self.ACCEL_SCALE) * 9.80665
            
            # Apply calibration offsets to reduce drift
            gyro_x = (gyro_x_raw / self.GYRO_SCALE) - self.gyro_offset_x  # degrees/s
            gyro_y = (gyro_y_raw / self.GYRO_SCALE) - self.gyro_offset_y
            gyro_z = (gyro_z_raw / self.GYRO_SCALE) - self.gyro_offset_z
            
            # Apply software low-pass filter (exponential moving average)
            if not self.filter_initialized:
                # Initialize filter with first reading
                self.accel_filtered_x = accel_x
                self.accel_filtered_y = accel_y
                self.accel_filtered_z = accel_z
                self.gyro_filtered_x = gyro_x
                self.gyro_filtered_y = gyro_y
                self.gyro_filtered_z = gyro_z
                self.filter_initialized = True
            else:
                # Apply exponential moving average: filtered = alpha * new + (1-alpha) * old
                self.accel_filtered_x = self.filter_alpha * accel_x + (1 - self.filter_alpha) * self.accel_filtered_x
                self.accel_filtered_y = self.filter_alpha * accel_y + (1 - self.filter_alpha) * self.accel_filtered_y
                self.accel_filtered_z = self.filter_alpha * accel_z + (1 - self.filter_alpha) * self.accel_filtered_z
                self.gyro_filtered_x = self.filter_alpha * gyro_x + (1 - self.filter_alpha) * self.gyro_filtered_x
                self.gyro_filtered_y = self.filter_alpha * gyro_y + (1 - self.filter_alpha) * self.gyro_filtered_y
                self.gyro_filtered_z = self.filter_alpha * gyro_z + (1 - self.filter_alpha) * self.gyro_filtered_z
            
            # Use filtered values
            accel_x = self.accel_filtered_x
            accel_y = self.accel_filtered_y
            accel_z = self.accel_filtered_z
            gyro_x = self.gyro_filtered_x
            gyro_y = self.gyro_filtered_y
            gyro_z = self.gyro_filtered_z
            
            # Apply deadband to gyroscope (suppress very small noise values)
            deadband = 0.05  # degrees/s
            if abs(gyro_x) < deadband:
                gyro_x = 0.0
            if abs(gyro_y) < deadband:
                gyro_y = 0.0
            if abs(gyro_z) < deadband:
                gyro_z = 0.0
            
            temp = (temp_raw / self.TEMP_SCALE) + self.TEMP_OFFSET  # °C
            
            # Read magnetometer if available
            mag_data = None
            if self.magnetometer_enabled:
                mag_data = self._read_magnetometer()
            
            data = {
                'timestamp': time.time(),
                'accelerometer': {
                    'x': float(accel_x),
                    'y': float(accel_y),
                    'z': float(accel_z)
                },
                'gyroscope': {
                    'x': float(gyro_x),
                    'y': float(gyro_y),
                    'z': float(gyro_z)
                },
                'magnetometer': mag_data,
                'temperature': float(temp)
            }
            
            return data
            
        except Exception as e:
            print(f"Error reading sensor data: {e}")
            return None
    
    def _bytes_to_int16(self, high_byte: int, low_byte: int) -> int:
        """
        Convert two bytes to signed 16-bit integer.
        
        Args:
            high_byte: High byte
            low_byte: Low byte
            
        Returns:
            Signed 16-bit integer
        """
        value = (high_byte << 8) | low_byte
        # Convert to signed
        if value >= 0x8000:
            value = -((65535 - value) + 1)
        return value
    
    def _read_magnetometer(self) -> Optional[Dict[str, float]]:
        """
        Read magnetometer data from AK8963.
        
        Returns:
            Dictionary with x, y, z magnetic field values in μT, or None if read fails
        """
        try:
            # Check if data is ready
            status = self.bus.read_byte_data(self.AK8963_ADDRESS, self.AK8963_ST1)
            if not (status & 0x01):  # Data not ready
                return None
            
            # Read 7 bytes: mag x, y, z (6 bytes) + status2 (1 byte)
            mag_bytes = self.bus.read_i2c_block_data(self.AK8963_ADDRESS, self.AK8963_XOUT_L, 7)
            
            # Check overflow bit in status2
            if mag_bytes[6] & 0x08:  # Magnetic sensor overflow
                return None
            
            # Parse magnetometer data (note: low byte first for AK8963!)
            mag_x_raw = self._bytes_to_int16(mag_bytes[1], mag_bytes[0])
            mag_y_raw = self._bytes_to_int16(mag_bytes[3], mag_bytes[2])
            mag_z_raw = self._bytes_to_int16(mag_bytes[5], mag_bytes[4])
            
            # Convert to μT
            mag_x = mag_x_raw * self.MAG_SCALE
            mag_y = mag_y_raw * self.MAG_SCALE
            mag_z = mag_z_raw * self.MAG_SCALE
            
            return {
                'x': float(mag_x),
                'y': float(mag_y),
                'z': float(mag_z)
            }
            
        except Exception:
            return None

    def send_data(self, data: Dict[str, Any]) -> bool:
        """
        Send data to connected client.

        Args:
            data: Dictionary containing sensor data

        Returns:
            True if successful, False otherwise
        """
        try:
            # Convert to JSON and append newline delimiter
            json_data = json.dumps(data) + '\n'
            self.client_socket.sendall(json_data.encode('utf-8'))
            return True
            
        except (BrokenPipeError, ConnectionResetError):
            print("Client disconnected")
            return False
            
        except Exception as e:
            print(f"Error sending data: {e}")
            return False

    def run(self, rate_hz: float = 50.0):
        """
        Main loop to read and send sensor data.

        Args:
            rate_hz: Data transmission rate in Hz
        """
        if not self.initialize_sensor():
            return

        if not self.setup_socket():
            return

        self.running = True
        period = 1.0 / rate_hz

        try:
            while self.running:
                # Wait for client connection
                if not self.wait_for_client():
                    break

                # Send data while client is connected
                while self.running:
                    start_time = time.time()

                    # Read sensor data
                    data = self.read_sensor_data()
                    
                    if data:
                        # Send data to client
                        if not self.send_data(data):
                            # Client disconnected, wait for new connection
                            self.client_socket.close()
                            self.client_socket = None
                            break

                    # Maintain consistent rate
                    elapsed = time.time() - start_time
                    sleep_time = max(0, period - elapsed)
                    time.sleep(sleep_time)

        except KeyboardInterrupt:
            print("\nShutting down...")

        finally:
            self.cleanup()

    def cleanup(self):
        """Clean up resources."""
        self.running = False
        
        if self.client_socket:
            self.client_socket.close()
            
        if self.server_socket:
            self.server_socket.close()
        
        if self.bus:
            self.bus.close()
            
        print("Cleanup complete")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description='Read MPU9250 sensor data and send over TCP socket'
    )
    parser.add_argument(
        '--host',
        type=str,
        default='0.0.0.0',
        help='Host address to bind (default: 0.0.0.0)'
    )
    parser.add_argument(
        '--port',
        type=int,
        default=9250,
        help='Port number (default: 9250)'
    )
    parser.add_argument(
        '--rate',
        type=float,
        default=50.0,
        help='Data transmission rate in Hz (default: 50.0)'
    )
    parser.add_argument(
        '--i2c-bus',
        type=int,
        default=1,
        help='I2C bus number (default: 1)'
    )
    parser.add_argument(
        '--address',
        type=lambda x: int(x, 0),  # Accepts hex (0x68) or decimal (104)
        default=0x68,
        help='I2C address of MPU9250: 0x68 or 0x69 (default: 0x68)'
    )
    parser.add_argument(
        '--filter',
        type=float,
        default=0.5,
        help='Software filter alpha (0.0-1.0): 0=max smoothing, 1=no filtering (default: 0.5)'
    )

    args = parser.parse_args()

    sender = MPU9250SocketSender(
        host=args.host,
        port=args.port,
        i2c_bus=args.i2c_bus,
        mpu_address=args.address
    )
    
    # Set filter alpha
    sender.filter_alpha = max(0.0, min(1.0, args.filter))  # Clamp to [0, 1]
    
    sender.run(rate_hz=args.rate)


if __name__ == '__main__':
    main()

