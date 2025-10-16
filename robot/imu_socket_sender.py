#!/usr/bin/env python3
"""
IMU Socket Sender (using src/sensors/imu.py)

Reads IMU data via the high-level MPU9250 class and sends it to a TCP client
as newline-delimited JSON messages. The schema matches the existing
mpu9250_visualizer.py expectations:

{
  "timestamp": <epoch seconds>,
  "accelerometer": {"x": m/s^2, "y": m/s^2, "z": m/s^2},
  "gyroscope": {"x": deg/s, "y": deg/s, "z": deg/s},
  "magnetometer": {"x": uT, "y": uT, "z": uT} | null,
  "temperature": C
}

Usage:
  python robot/imu_socket_sender.py --host 0.0.0.0 --port 9250 --rate 50
"""

from __future__ import annotations

import argparse
import json
import math
import socket
import time
from typing import Optional

from src.sensors.imu import MPU9250, ImuSample


class ImuSocketSender:
    """Reads IMU via high-level API and streams to a TCP client as JSON."""

    def __init__(self, host: str = "0.0.0.0", port: int = 9250, rate_hz: float = 50.0,
                 bus: int = 1, address: int = 0x68) -> None:
        self.host = host
        self.port = port
        self.rate_hz = rate_hz
        self.bus = bus
        self.address = address

        self.server_socket: Optional[socket.socket] = None
        self.client_socket: Optional[socket.socket] = None
        self.running = False

        # Initialize IMU instance. Use filter/sample rate aligned to stream rate.
        self.imu = MPU9250(bus=self.bus, address=self.address, sample_rate_hz=self.rate_hz)

    def setup_socket(self) -> bool:
        try:
            self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.server_socket.bind((self.host, self.port))
            self.server_socket.listen(1)
            print(f"Socket server listening on {self.host}:{self.port}")
            return True
        except Exception as exc:
            print(f"Error setting up socket: {exc}")
            return False

    def wait_for_client(self) -> bool:
        try:
            assert self.server_socket is not None
            print("Waiting for client connection...")
            self.client_socket, address = self.server_socket.accept()
            print(f"Client connected from {address}")
            return True
        except Exception as exc:
            print(f"Error accepting client: {exc}")
            return False

    def send_json(self, data: dict) -> bool:
        try:
            assert self.client_socket is not None
            self.client_socket.sendall((json.dumps(data) + "\n").encode("utf-8"))
            return True
        except (BrokenPipeError, ConnectionResetError):
            print("Client disconnected")
            return False
        except Exception as exc:
            print(f"Error sending data: {exc}")
            return False

    def sample_to_payload(self, sample: ImuSample) -> dict:
        # Convert gyro rad/s -> deg/s to match existing visualizer
        gx_dps = math.degrees(sample.angular_velocity_rad_s.x)
        gy_dps = math.degrees(sample.angular_velocity_rad_s.y)
        gz_dps = math.degrees(sample.angular_velocity_rad_s.z)

        magnetometer = None
        if sample.magnetic_field_uT is not None:
            magnetometer = {
                "x": float(sample.magnetic_field_uT.x),
                "y": float(sample.magnetic_field_uT.y),
                "z": float(sample.magnetic_field_uT.z),
            }

        return {
            "timestamp": time.time(),  # epoch seconds for compatibility
            "accelerometer": {
                "x": float(sample.acceleration_m_s2.x),
                "y": float(sample.acceleration_m_s2.y),
                "z": float(sample.acceleration_m_s2.z),
            },
            "gyroscope": {
                "x": float(gx_dps),
                "y": float(gy_dps),
                "z": float(gz_dps),
            },
            "magnetometer": magnetometer,
            "temperature": float(sample.temperature_c),
        }

    def run(self) -> None:
        # Initialize IMU (opens I2C, configures, calibrates gyro)
        self.imu.initialize()

        if not self.setup_socket():
            return

        self.running = True
        period = 1.0 / self.rate_hz

        try:
            while self.running:
                if not self.wait_for_client():
                    break

                # Stream sensor data while client connected
                while self.running:
                    loop_start = time.time()
                    try:
                        sample = self.imu.read_sample()
                    except Exception as exc:
                        print(f"Error reading IMU sample: {exc}")
                        time.sleep(0.1)
                        continue

                    payload = self.sample_to_payload(sample)
                    if not self.send_json(payload):
                        # Client gone; close and break to accept new
                        try:
                            assert self.client_socket is not None
                            self.client_socket.close()
                        except Exception:
                            pass
                        self.client_socket = None
                        break

                    # Rate control
                    elapsed = time.time() - loop_start
                    sleep_time = max(0.0, period - elapsed)
                    time.sleep(sleep_time)

        except KeyboardInterrupt:
            print("\nShutting down...")
        finally:
            self.cleanup()

    def cleanup(self) -> None:
        self.running = False
        try:
            if self.client_socket is not None:
                self.client_socket.close()
        finally:
            self.client_socket = None
        try:
            if self.server_socket is not None:
                self.server_socket.close()
        finally:
            self.server_socket = None
        # Ensure IMU stops and I2C closed
        try:
            # stop() only relevant if start() used; safe to call initialize/stop order
            # Here, we only used read_sample() so close via context
            pass
        finally:
            # No explicit close method; bus is managed inside imu on stop().
            # We can reinitialize a temp loop to close if needed on future extension.
            pass


def main() -> None:
    parser = argparse.ArgumentParser(description="Read IMU via API and send over TCP socket")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Bind host (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=9250, help="Port (default: 9250)")
    parser.add_argument("--rate", type=float, default=50.0, help="Send rate Hz (default: 50.0)")
    parser.add_argument("--bus", type=int, default=1, help="I2C bus (default: 1)")
    parser.add_argument("--address", type=lambda x: int(x, 0), default=0x68,
                        help="MPU address 0x68/0x69 (default: 0x68)")

    args = parser.parse_args()

    sender = ImuSocketSender(host=args.host, port=args.port, rate_hz=args.rate,
                             bus=args.bus, address=args.address)
    sender.run()


if __name__ == "__main__":
    main()


