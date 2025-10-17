"""RPLidar socket client - streams scans over TCP using direct protocol."""

import argparse
import json
import logging
import socket
import struct
import sys
import time
from contextlib import closing
from typing import Dict, List, Sequence, Tuple

from RPLidarProtocol import RPLidarProtocol

ScanType = List[Tuple[int, float, float]]  # (quality, angle, distance)


def encode_scan_payload(scan: ScanType, scan_number: int) -> bytes:
    """Serialize scan to length-prefixed JSON."""
    payload = {
        "timestamp": time.time(),
        "scan_number": scan_number,
        "measurements": [
            {"quality": q, "angle": a, "distance_mm": d}
            for q, a, d in scan
        ],
    }
    message = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return struct.pack("!I", len(message)) + message


def initialize_lidar(lidar: RPLidarProtocol) -> Dict:
    """Initialize lidar and check health."""
    lidar.reset_device()
    # Clear any residual stream
    if lidar.ser:
        lidar.ser.reset_input_buffer()
    time.sleep(0.1)
    info = lidar.get_device_info()
    health = lidar.get_device_health()
    
    if health['status'] != 'Good':
        logging.warning("Lidar health: %s", health)
    
    return info


def collect_scans(lidar: RPLidarProtocol):
    """Yield complete scans from continuous measurement stream with resync.

    More robust new-scan detection using both header check bits and angle wrap.
    """
    current_scan: ScanType = []
    last_angle: float | None = None
    buffer = bytearray()

    while True:
        try:
            if not lidar.ser:
                time.sleep(0.001)
                continue

            if len(buffer) < 5:
                waiting = lidar.ser.in_waiting
                if waiting:
                    chunk = lidar.ser.read(waiting)
                    if chunk:
                        buffer.extend(chunk)
                        # Try to parse immediately if we now have enough data
                        if len(buffer) < 5:
                            continue
                else:
                    time.sleep(0.001)
                    continue

            while len(buffer) >= 5:
                first_byte = buffer[0]

                # Validate header: bit0 = S (start), bit1 = !S must be complementary
                header_bits = first_byte & 0x03
                if header_bits not in (0x01, 0x02):
                    del buffer[0]
                    continue

                s_bit = header_bits & 0x01
                not_s_bit = (header_bits >> 1) & 0x01
                if s_bit == not_s_bit:
                    del buffer[0]
                    continue

                # Angle check bit (spec requires this to be 1)
                if (buffer[1] & 0x01) != 1:
                    del buffer[0]
                    continue

                if len(buffer) < 5:
                    break

                quality = (first_byte >> 2) & 0x3F
                angle = ((((buffer[2] << 8) | buffer[1]) >> 1) & 0x7FFF) / 64.0
                distance = ((buffer[4] << 8) | buffer[3]) / 4.0
                start_flag = s_bit == 1

                del buffer[:5]

                # Detect new scan either by start flag or by angle wrap-around
                new_scan = False
                if start_flag and current_scan:
                    new_scan = True
                elif (
                    last_angle is not None
                    and last_angle > 300.0
                    and angle < 60.0
                    and current_scan
                ):
                    new_scan = True

                if new_scan:
                    yield current_scan
                    current_scan = []

                if distance > 0 and quality > 0:
                    current_scan.append((quality, angle, distance))

                last_angle = angle

                # Continue parsing remaining buffer without sleeping
                # so fall through to while loop condition
                continue

            # If we exit the inner while because buffer < 5, loop back to read more
            continue

        except Exception as exc:
            logging.error("Measurement error: %s", exc)
            if lidar.ser:
                lidar.ser.reset_input_buffer()
            time.sleep(0.05)


def stream_scans(lidar: RPLidarProtocol, sock: socket.socket, 
                  scan_limit: int | None, log_every: int) -> None:
    """Stream scans from lidar to socket."""
    with closing(sock):
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        # Ensure device is in a clean state before starting scan
        try:
            lidar.stop_scan()
        except Exception:
            pass
        time.sleep(0.05)
        lidar.start_scan()
        
        for scan_number, scan in enumerate(collect_scans(lidar), start=1):
            if scan:
                sock.sendall(encode_scan_payload(scan, scan_number))
                
                if scan_number % log_every == 0:
                    logging.info("Sent %d scans (%d measurements)", scan_number, len(scan))
                
                if scan_limit and scan_number >= scan_limit:
                    break


def connect_socket(host: str, port: int, timeout: float) -> socket.socket:
    """Connect TCP socket to map server."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    sock.connect((host, port))
    sock.settimeout(None)
    return sock


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("serial_port", help="Serial port (e.g., /dev/ttyUSB0)")
    parser.add_argument("host", help="Map server hostname/IP")
    parser.add_argument("port", type=int, help="Map server port")
    parser.add_argument("--baudrate", type=int, default=1000000, help="Baud rate")
    parser.add_argument("--timeout", type=float, default=5.0, help="Connection timeout")
    parser.add_argument("--scan-limit", type=int, help="Max scans to send")
    parser.add_argument("--log-every", type=int, default=10, help="Log frequency")
    parser.add_argument("--log-level", default="INFO", 
                        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
                        help="Logging level")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    """Main entry point."""
    args = parse_args(argv or sys.argv[1:])
    logging.basicConfig(level=getattr(logging, args.log_level),
                        format="%(asctime)s [%(levelname)s] %(message)s")
    
    lidar = RPLidarProtocol(args.serial_port, args.baudrate)
    
    try:
        if not lidar.connect():
            return 1
        
        time.sleep(0.3)
        initialize_lidar(lidar)
        
        logging.info("Connecting to %s:%d", args.host, args.port)
        sock = connect_socket(args.host, args.port, args.timeout)
        
        logging.info("Streaming scans (Ctrl+C to stop)")
        stream_scans(lidar, sock, args.scan_limit, args.log_every)
        
    except KeyboardInterrupt:
        logging.info("Interrupted")
    except Exception as exc:
        logging.error("Error: %s", exc)
        return 1
    finally:
        try:
            lidar.stop_scan()
        except:
            pass
        lidar.disconnect()
    
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
