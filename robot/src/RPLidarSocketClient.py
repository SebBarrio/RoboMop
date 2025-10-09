"""Raspberry Pi client for streaming RPLidar S2L scans over TCP sockets."""

from __future__ import annotations

import argparse
import json
import logging
import socket
import struct
import sys
import time
from contextlib import closing
from typing import Iterable, List, Sequence, Tuple

try:
    from rplidar import RPLidar  # type: ignore
except ImportError as exc:  # pragma: no cover - hardware dependency
    raise SystemExit(
        "rplidar package is required. Install with 'pip install rplidar'."
    ) from exc


SCAN_TYPE = Sequence[Tuple[int, float, float]]  # (quality, angle, distance_mm)


def encode_scan_payload(scan: SCAN_TYPE) -> bytes:
    """Serialize a lidar scan to a length-prefixed JSON payload."""

    payload = {
        "timestamp": time.time(),
        "measurements": [
            {
                "quality": quality,
                "angle": angle,
                "distance_mm": distance,
            }
            for quality, angle, distance in scan
        ],
    }
    message = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return struct.pack("!I", len(message)) + message


def iter_scans(lidar: RPLidar) -> Iterable[SCAN_TYPE]:
    """Yield consecutive scans from the lidar while handling transient errors."""

    while True:
        try:
            for scan in lidar.iter_scans(max_buf_meas=500):
                yield scan
        except RuntimeError as exc:
            logging.warning("Lidar read error: %s", exc)
            lidar.stop()
            lidar.stop_motor()
            time.sleep(0.5)
            lidar.start_motor()


def stream_scans(
    lidar: RPLidar,
    sock: socket.socket,
    scan_limit: int | None,
    log_every: int,
) -> None:
    """Stream scans from the lidar to the socket."""

    with closing(sock):
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        for index, scan in enumerate(iter_scans(lidar), start=1):
            if not scan:
                continue

            payload = encode_scan_payload(scan)
            sock.sendall(payload)

            if index % log_every == 0:
                logging.info("Sent %d scans (%d measurements)", index, len(scan))

            if scan_limit is not None and index >= scan_limit:
                logging.info("Reached scan limit (%d), stopping", scan_limit)
                break


def connect(host: str, port: int, timeout: float) -> socket.socket:
    """Create and connect a TCP socket."""

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    sock.connect((host, port))
    sock.settimeout(None)
    return sock


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("serial_port", help="Serial port exposed by the RPLidar")
    parser.add_argument("host", help="Hostname or IP address of the map server")
    parser.add_argument("port", type=int, help="TCP port of the map server")
    parser.add_argument(
        "--baudrate",
        type=int,
        default=256000,
        help="Serial baud rate for the lidar (default: %(default)s)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=5.0,
        help="Socket connection timeout in seconds (default: %(default)s)",
    )
    parser.add_argument(
        "--scan-limit",
        type=int,
        default=None,
        help="Number of scans to send before exiting (default: unlimited)",
    )
    parser.add_argument(
        "--log-every",
        type=int,
        default=10,
        help="Log progress every N scans (default: %(default)s)",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
        help="Python logging level (default: %(default)s)",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    logging.basicConfig(level=getattr(logging, args.log_level), format="%(asctime)s %(levelname)s: %(message)s")

    logging.info("Connecting to lidar on %s", args.serial_port)
    lidar = RPLidar(args.serial_port, baudrate=args.baudrate)

    try:
        logging.info("Connecting to map server %s:%d", args.host, args.port)
        sock = connect(args.host, args.port, args.timeout)
        logging.info("Connection established, streaming scans")
        stream_scans(lidar, sock, args.scan_limit, args.log_every)
    except KeyboardInterrupt:
        logging.info("Interrupted by user, shutting down")
    finally:
        logging.info("Stopping lidar")
        lidar.stop()
        lidar.stop_motor()
        lidar.disconnect()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
