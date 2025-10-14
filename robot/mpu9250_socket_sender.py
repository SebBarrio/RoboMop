#!/usr/bin/env python3
"""
MPU9250 Sensor Data Socket Sender
Reads accelerometer, gyroscope, and magnetometer data from MPU9250
and sends it over a TCP socket connection.

Requirements:
    pip install mpu9250-jmdev smbus2

Usage:
    python mpu9250_socket_sender.py [--host HOST] [--port PORT]
"""

import socket
import json
import time
import argparse
import sys
from typing import Dict, Any

try:
    from mpu9250_jmdev.mpu_9250 import MPU9250
    from mpu9250_jmdev.registers import (
        AK8963_ADDRESS, 
        MPU9050_ADDRESS_68,
        GFS_250,
        AFS_2G,
        AK8963_BIT_16,
        AK8963_MODE_C100HZ
    )
except ImportError:
    print("Error: mpu9250-jmdev library not found.")
    print("Install with: pip install mpu9250-jmdev smbus2")
    sys.exit(1)


class MPU9250SocketSender:
    """Reads MPU9250 data and sends it over TCP socket."""

    def __init__(self, host: str = '0.0.0.0', port: int = 9250, i2c_bus: int = 1):
        """
        Initialize the MPU9250 sensor and socket server.

        Args:
            host: Host address to bind socket server (0.0.0.0 for all interfaces)
            port: Port number for socket server
            i2c_bus: I2C bus number (typically 1 on Raspberry Pi)
        """
        self.host = host
        self.port = port
        self.i2c_bus = i2c_bus
        self.mpu = None
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
            print(f"Initializing MPU9250 on I2C bus {self.i2c_bus}...")
            self.mpu = MPU9250(
                address_ak=AK8963_ADDRESS,
                address_mpu_master=MPU9050_ADDRESS_68,
                address_mpu_slave=None,
                bus=self.i2c_bus,
                gfs=GFS_250,
                afs=AFS_2G,
                mfs=AK8963_BIT_16,
                mode=AK8963_MODE_C100HZ
            )
            
            # Configure the sensor
            self.mpu.configure()
            
            print("MPU9250 initialized successfully")
            return True
            
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
            # Read accelerometer data (m/s^2)
            accel = self.mpu.readAccelerometerMaster()
            
            # Read gyroscope data (degrees/s)
            gyro = self.mpu.readGyroscopeMaster()
            
            # Read magnetometer data (uT)
            mag = self.mpu.readMagnetometerMaster()
            
            # Read temperature (°C)
            temp = self.mpu.readTemperatureMaster()
            
            data = {
                'timestamp': time.time(),
                'accelerometer': {
                    'x': float(accel[0]),
                    'y': float(accel[1]),
                    'z': float(accel[2])
                },
                'gyroscope': {
                    'x': float(gyro[0]),
                    'y': float(gyro[1]),
                    'z': float(gyro[2])
                },
                'magnetometer': {
                    'x': float(mag[0]),
                    'y': float(mag[1]),
                    'z': float(mag[2])
                },
                'temperature': float(temp)
            }
            
            return data
            
        except Exception as e:
            print(f"Error reading sensor data: {e}")
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

    args = parser.parse_args()

    sender = MPU9250SocketSender(
        host=args.host,
        port=args.port,
        i2c_bus=args.i2c_bus
    )
    
    sender.run(rate_hz=args.rate)


if __name__ == '__main__':
    main()

