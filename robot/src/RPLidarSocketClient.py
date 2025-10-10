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
    from rplidar import RPLidar, RPLidarException  # type: ignore
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


def initialize_lidar(lidar: RPLidar) -> None:
    """Initialize and reset the lidar device."""
    
    logging.info("Initializing lidar...")
    
    # Stop any ongoing operations
    try:
        lidar.stop()
    except Exception:
        pass
    
    try:
        lidar.stop_motor()
    except Exception:
        pass
    
    time.sleep(1.0)
    
    # Aggressively clear the serial buffer
    logging.info("Clearing serial buffer...")
    for i in range(5):
        try:
            lidar.clear_input()
            time.sleep(0.2)
        except Exception as exc:
            logging.debug("Buffer clear attempt %d: %s", i + 1, exc)
    
    # Perform health check
    logging.info("Performing health check...")
    try:
        health = lidar.get_health()
        print(f"LIDAR HEALTH CHECK: Status={health[0]}, Error Code={health[1]}")
        logging.info("Lidar health: status=%s, error_code=%s", health[0], health[1])
    except Exception as exc:
        print(f"LIDAR HEALTH CHECK FAILED: {exc}")
        logging.error("Health check failed: %s", exc)
        raise
    
    # Get device info
    logging.info("Getting device info...")
    try:
        info = lidar.get_info()
        logging.info("Lidar info: %s", info)
    except Exception as exc:
        logging.error("Failed to get device info: %s", exc)
        raise
    
    # Start the motor
    logging.info("Starting motor...")
    lidar.start_motor()
    time.sleep(2.0)
    
    logging.info("Lidar initialized successfully")


def iter_scans(lidar: RPLidar, scan_type: str = 'normal') -> Iterable[SCAN_TYPE]:
    """Yield consecutive scans from the lidar while handling transient errors.
    
    Args:
        lidar: RPLidar instance
        scan_type: Scan mode - 'normal', 'express', or 'force' (default: 'normal')
    """

    while True:
        try:
            for scan in lidar.iter_scans(scan_type=scan_type, max_buf_meas=500):
                yield scan
        except (RPLidarException, RuntimeError) as exc:
            logging.warning("Lidar read error: %s", exc)
            lidar.stop()
            lidar.stop_motor()
            time.sleep(0.5)
            lidar.clear_input()
            time.sleep(0.1)
            lidar.start_motor()
            time.sleep(1.0)


def stream_scans(
    lidar: RPLidar,
    sock: socket.socket,
    scan_limit: int | None,
    log_every: int,
    scan_type: str = 'normal',
) -> None:
    """Stream scans from the lidar to the socket."""

    with closing(sock):
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        for index, scan in enumerate(iter_scans(lidar, scan_type), start=1):
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
        default=1000000,
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
        "--scan-type",
        default="normal",
        choices=["normal", "express", "force"],
        help="Scan mode type (default: %(default)s). Use 'express' if getting descriptor mismatch errors.",
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

    logging.info("Connecting to lidar on %s at %d baud", args.serial_port, args.baudrate)
    lidar = RPLidar(args.serial_port, baudrate=args.baudrate, timeout=2.0)
    
    # Give serial port time to settle
    time.sleep(1.0)
    
    # Print initial health check before any initialization
    print("\n" + "="*60)
    print("INITIAL LIDAR HEALTH CHECK (before initialization)")
    print("="*60)
    try:
        health = lidar.get_health()
        print(f"✓ SUCCESS: Status={health[0]}, Error Code={health[1]}")
        logging.info("Initial health check successful: status=%s, error_code=%s", health[0], health[1])
    except Exception as exc:
        print(f"✗ FAILED: {type(exc).__name__}: {exc}")
        logging.warning("Initial health check failed: %s", exc)
        print("Attempting to clear buffer and retry...")
        # Clear buffer and try once more
        try:
            lidar.clear_input()
            time.sleep(0.5)
            health = lidar.get_health()
            print(f"✓ SUCCESS (after buffer clear): Status={health[0]}, Error Code={health[1]}")
        except Exception as exc2:
            print(f"✗ STILL FAILED: {type(exc2).__name__}: {exc2}")
    print("="*60 + "\n")

    try:
        # Initialize the lidar device
        initialize_lidar(lidar)
        
        logging.info("Connecting to map server %s:%d", args.host, args.port)
        sock = connect(args.host, args.port, args.timeout)
        logging.info("Connection established, streaming scans with scan_type='%s'", args.scan_type)
        stream_scans(lidar, sock, args.scan_limit, args.log_every, args.scan_type)
    except KeyboardInterrupt:
        logging.info("Interrupted by user, shutting down")
    finally:
        logging.info("Stopping lidar")
        try:
            lidar.stop()
            lidar.stop_motor()
        except Exception as exc:
            logging.warning("Error stopping lidar: %s", exc)
        lidar.disconnect()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
