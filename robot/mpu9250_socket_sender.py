#!/usr/bin/env python3
"""
MPU9250 Sensor Data Socket Sender
Reads accelerometer, gyroscope, and temperature data from MPU9250
and sends it over a TCP socket connection.

Requirements:
    pip install smbus2

Usage:
    python mpu9250_socket_sender.py [--host HOST] [--port PORT] [--rate HZ]
"""

import socket
import json
import time
import argparse
import sys
from typing import Dict, Any

try:
    from smbus2 import SMBus
except ImportError:
    print("Error: smbus2 library not found.")
    print("Install with: pip install smbus2")
    sys.exit(1)


class MPU9250SocketSender:
    """Reads MPU9250 data and sends it over TCP socket."""
    
    # MPU9250 Registers
    PWR_MGMT_1 = 0x6B
    ACCEL_XOUT_H = 0x3B
    GYRO_XOUT_H = 0x43
    TEMP_OUT_H = 0x41
    WHO_AM_I = 0x75
    
    # Scale factors
    ACCEL_SCALE = 16384.0  # for ±2g
    GYRO_SCALE = 131.0     # for ±250°/s
    TEMP_OFFSET = 21.0
    TEMP_SCALE = 333.87

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
            if who_am_i not in [0x71, 0x73]:  # MPU9250/MPU9255
                print(f"Warning: Unexpected WHO_AM_I value: 0x{who_am_i:02x} (expected 0x71 or 0x73)")
            
            # Wake up MPU9250 (clear sleep bit)
            self.bus.write_byte_data(self.mpu_address, self.PWR_MGMT_1, 0x00)
            time.sleep(0.1)  # Wait for sensor to wake up
            
            print(f"MPU9250 initialized successfully (WHO_AM_I: 0x{who_am_i:02x})")
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
            
            gyro_x = gyro_x_raw / self.GYRO_SCALE  # degrees/s
            gyro_y = gyro_y_raw / self.GYRO_SCALE
            gyro_z = gyro_z_raw / self.GYRO_SCALE
            
            temp = (temp_raw / self.TEMP_SCALE) + self.TEMP_OFFSET  # °C
            
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
                'magnetometer': None,  # Not reading magnetometer
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

    args = parser.parse_args()

    sender = MPU9250SocketSender(
        host=args.host,
        port=args.port,
        i2c_bus=args.i2c_bus,
        mpu_address=args.address
    )
    
    sender.run(rate_hz=args.rate)


if __name__ == '__main__':
    main()

