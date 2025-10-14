#!/usr/bin/env python3
"""MPU9250 orientation socket streamer for manual visualization tests.

Reads orientation estimates from the onboard MPU9250 IMU and streams them over
TCP as newline-delimited JSON messages suitable for driving a remote 3D viewer.
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import socket
import sys
import time
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict, Optional, Sequence

ROBOT_ROOT = Path(__file__).resolve().parents[2]
SRC_ROOT = ROBOT_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

import board  # type: ignore
import busio  # type: ignore

from sensors.imu import ImuSample, MPU9250


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("host", help="Visualization server hostname or IP")
    parser.add_argument("port", type=int, help="Visualization server TCP port")
    parser.add_argument(
        "--sample-rate",
        type=float,
        default=50.0,
        help="Sampling rate in Hz (must be <= sensor rate)",
    )
    parser.add_argument(
        "--alpha",
        type=float,
        default=0.98,
        help="Complementary filter alpha (0-1 weighting gyro integration)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=5.0,
        help="Socket connection timeout in seconds",
    )
    parser.add_argument(
        "--include-raw",
        action="store_true",
        help="Include raw accelerometer/gyro/magnetometer data in payload",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging verbosity",
    )
    return parser.parse_args(argv)


def euler_to_quaternion(roll: float, pitch: float, yaw: float) -> Dict[str, float]:
    cr = math.cos(roll * 0.5)
    sr = math.sin(roll * 0.5)
    cp = math.cos(pitch * 0.5)
    sp = math.sin(pitch * 0.5)
    cy = math.cos(yaw * 0.5)
    sy = math.sin(yaw * 0.5)

    w = cr * cp * cy + sr * sp * sy
    x = sr * cp * cy - cr * sp * sy
    y = cr * sp * cy + sr * cp * sy
    z = cr * cp * sy - sr * sp * cy
    return {"w": w, "x": x, "y": y, "z": z}


def vector_to_dict(vector: Any) -> Dict[str, float]:
    data = asdict(vector)
    return {"x": float(data["x"]), "y": float(data["y"]), "z": float(data["z"])}


def build_payload(sample: ImuSample, include_raw: bool) -> Dict[str, Any]:
    orientation = sample.orientation
    payload: Dict[str, Any] = {
        "type": "orientation-frame",
        "timestamp": sample.timestamp_s,
        "orientation": {
            "roll_rad": orientation.roll,
            "pitch_rad": orientation.pitch,
            "yaw_rad": orientation.yaw,
            "roll_deg": math.degrees(orientation.roll),
            "pitch_deg": math.degrees(orientation.pitch),
            "yaw_deg": math.degrees(orientation.yaw),
            "quaternion": euler_to_quaternion(orientation.roll, orientation.pitch, orientation.yaw),
        },
        "temperature_c": sample.temperature_c,
    }

    if include_raw:
        payload["acceleration_m_s2"] = vector_to_dict(sample.acceleration_m_s2)
        payload["angular_velocity_rad_s"] = vector_to_dict(sample.angular_velocity_rad_s)
        if sample.magnetic_field_uT is not None:
            payload["magnetic_field_uT"] = vector_to_dict(sample.magnetic_field_uT)
        else:
            payload["magnetic_field_uT"] = None

    return payload


def send_json(sock: socket.socket, message: Dict[str, Any]) -> None:
    serialized = json.dumps(message, separators=(",", ":"), ensure_ascii=False)
    sock.sendall(serialized.encode("utf-8") + b"\n")


def initialize_imu(sample_rate_hz: float, alpha: float) -> MPU9250:
    i2c = busio.I2C(board.SCL, board.SDA)
    return MPU9250(i2c=i2c, sample_rate_hz=sample_rate_hz, filter_alpha=alpha)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    try:
        imu = initialize_imu(args.sample_rate, args.alpha)
    except Exception as exc:  # pylint: disable=broad-except
        logging.error("Failed to initialize IMU: %s", exc)
        return 1

    try:
        sock = socket.create_connection((args.host, args.port), timeout=args.timeout)
    except OSError as exc:
        logging.error("Failed to connect to %s:%d (%s)", args.host, args.port, exc)
        return 1

    with sock:
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        handshake = {
            "type": "imu-handshake",
            "protocol": "robomop-imu-v1",
            "sample_rate_hz": args.sample_rate,
            "fields": {
                "orientation": "roll/pitch/yaw/quaternion",
                "includes_raw": args.include_raw,
            },
        }
        send_json(sock, handshake)

        logging.info("Streaming IMU orientation to %s:%d", args.host, args.port)
        period = 1.0 / args.sample_rate if args.sample_rate > 0 else 0.0
        next_deadline = time.perf_counter()

        try:
            while True:
                sample = imu.read_sample()
                send_json(sock, build_payload(sample, args.include_raw))

                if period > 0:
                    next_deadline += period
                    delay = next_deadline - time.perf_counter()
                    if delay > 0:
                        time.sleep(delay)
                    else:
                        next_deadline = time.perf_counter()
        except KeyboardInterrupt:
            logging.info("Interrupted by user")
        except (BrokenPipeError, ConnectionResetError) as exc:
            logging.error("Connection lost: %s", exc)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
