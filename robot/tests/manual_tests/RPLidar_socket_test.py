"""RPLidar socket client - streams occupancy grid over TCP using lidar.py."""

import argparse
import asyncio
import base64
import json
import logging
import math
import socket
import struct
import sys
import time
from contextlib import closing
from pathlib import Path
from typing import Sequence

# Add parent directories to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))

from sensors.lidar import RPLidarSerial, LidarMeasurement
from slam.occupancy_grid import OccupancyGrid

MIN_MEASUREMENTS_PER_SCAN = 180


def encode_grid_payload(grid: OccupancyGrid, scan_number: int) -> bytes:
    """Serialize occupancy grid to length-prefixed JSON."""
    grid_data = grid.array
    encoded_data = base64.b64encode(grid_data.tobytes()).decode("ascii")
    
    payload = {
        "timestamp": time.time(),
        "scan_number": scan_number,
        "resolution": float(grid.resolution),
        "width": int(grid.width),
        "height": int(grid.height),
        "origin": {
            "x": float(grid.origin[0]),
            "y": float(grid.origin[1]),
            "theta": float(grid.origin[2]),
        },
        "data": encoded_data,
        "encoding": "base64",
        "completion_ratio": float(grid.completion_ratio),
    }
    message = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return struct.pack("!I", len(message)) + message


def update_occupancy_grid(
    grid: OccupancyGrid,
    scan: list[LidarMeasurement],
    robot_pose: tuple[float, float, float] = (0.0, 0.0, 0.0),
    max_range: float = 5.0,
    occupied_value: int = 220,
    free_value: int = 40,
) -> None:
    """Update occupancy grid with LIDAR scan data.
    
    This implements a simplified version of the SLAM manager's map update logic.
    """
    robot_x, robot_y, robot_theta = robot_pose
    
    for measurement in scan:
        angle = measurement.angle_radians
        distance = measurement.distance_m
        
        if not math.isfinite(distance) or distance <= 0.0:
            continue
        
        clipped_distance = min(distance, max_range)
        
        # Calculate hit point in world coordinates
        world_angle = robot_theta + angle
        hit_x = robot_x + clipped_distance * math.cos(world_angle)
        hit_y = robot_y + clipped_distance * math.sin(world_angle)
        
        # Mark free cells along the ray
        free_cells = _ray_cells(grid, robot_x, robot_y, hit_x, hit_y, include_endpoint=False)
        for row, col in free_cells:
            try:
                current = grid.get_cell(row, col)
                if current >= occupied_value:
                    continue
                if current == OccupancyGrid.UNKNOWN_VALUE or current > free_value:
                    grid.set_cell(row, col, free_value)
            except IndexError:
                pass
        
        # Mark occupied cell at hit point
        if distance <= max_range:
            hit_cell = _world_to_cell(grid, hit_x, hit_y)
            if hit_cell is not None:
                row, col = hit_cell
                try:
                    grid.set_cell(row, col, occupied_value)
                except IndexError:
                    pass


def _world_to_cell(grid: OccupancyGrid, x: float, y: float) -> tuple[int, int] | None:
    """Convert world coordinates to grid cell coordinates."""
    origin_x, origin_y, _ = grid.origin
    col = int(math.floor((x - origin_x) / grid.resolution))
    row = int(math.floor((y - origin_y) / grid.resolution))
    if row < 0 or row >= grid.height or col < 0 or col >= grid.width:
        return None
    return row, col


def _ray_cells(
    grid: OccupancyGrid,
    start_x: float,
    start_y: float,
    end_x: float,
    end_y: float,
    *,
    include_endpoint: bool,
) -> list[tuple[int, int]]:
    """Get all grid cells along a ray using Bresenham-like algorithm."""
    distance = math.hypot(end_x - start_x, end_y - start_y)
    steps = max(1, int(distance / (grid.resolution * 0.5)))
    cells: list[tuple[int, int]] = []
    for i in range(steps if include_endpoint else max(steps - 1, 0)):
        ratio = (i + 1) / steps
        point_x = start_x + (end_x - start_x) * ratio
        point_y = start_y + (end_y - start_y) * ratio
        cell = _world_to_cell(grid, point_x, point_y)
        if cell is not None and (not cells or cell != cells[-1]):
            cells.append(cell)
    return cells


async def stream_grid_updates(
    lidar: RPLidarSerial,
    sock: socket.socket,
    grid: OccupancyGrid,
    scan_limit: int | None,
    log_every: int,
) -> None:
    """Stream occupancy grid updates from lidar to socket."""
    sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    
    scan_count = 0
    logging.info("Waiting for LIDAR scans...")
    
    async for scan in lidar.iter_scans():
        if not scan or len(scan) < MIN_MEASUREMENTS_PER_SCAN:
            continue
        
        scan_count += 1
        
        # Update occupancy grid with scan
        update_occupancy_grid(grid, scan)
        
        # Send grid update (use asyncio.to_thread to avoid blocking the event loop)
        payload = encode_grid_payload(grid, scan_count)
        try:
            await asyncio.to_thread(sock.sendall, payload)
        except Exception as e:
            logging.error("Failed to send grid update: %s", e)
            break
        
        if scan_count == 1:
            logging.info("First grid sent successfully (%d measurements)", len(scan))
        elif scan_count % log_every == 0:
            logging.info(
                "Sent %d grids (%d measurements, %.1f%% complete)",
                scan_count,
                len(scan),
                grid.completion_ratio * 100,
            )
        
        if scan_limit and scan_count >= scan_limit:
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
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level",
    )
    parser.add_argument("--grid-resolution", type=float, default=0.05, help="Grid resolution (m)")
    parser.add_argument("--grid-width", type=int, default=400, help="Grid width (cells)")
    parser.add_argument("--grid-height", type=int, default=400, help="Grid height (cells)")
    return parser.parse_args(argv)


async def async_main(args: argparse.Namespace) -> int:
    """Async main entry point."""
    # Create occupancy grid
    grid = OccupancyGrid(
        resolution=args.grid_resolution,
        width=args.grid_width,
        height=args.grid_height,
        origin=(-args.grid_width * args.grid_resolution / 2, 
                -args.grid_height * args.grid_resolution / 2, 
                0.0),
    )
    logging.info(
        "Created occupancy grid: %dx%d cells at %.3f m/cell (%.1fx%.1f m)",
        grid.width,
        grid.height,
        grid.resolution,
        grid.width * grid.resolution,
        grid.height * grid.resolution,
    )
    
    # Initialize LIDAR
    lidar = RPLidarSerial(args.serial_port, baud_rate=args.baudrate)
    
    try:
        logging.info("Starting LIDAR on %s...", args.serial_port)
        await lidar.start()
        logging.info("LIDAR started successfully")
        
        logging.info("Connecting to %s:%d", args.host, args.port)
        sock = connect_socket(args.host, args.port, args.timeout)
        logging.info("Connected to server successfully")
        
        logging.info("Streaming occupancy grid updates (Ctrl+C to stop)")
        with closing(sock):
            await stream_grid_updates(lidar, sock, grid, args.scan_limit, args.log_every)
    
    except KeyboardInterrupt:
        logging.info("Interrupted")
    except Exception as exc:
        logging.error("Error: %s", exc, exc_info=True)
        return 1
    finally:
        logging.info("Stopping LIDAR...")
        await lidar.stop()
        logging.info("LIDAR stopped")
    
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    """Main entry point."""
    args = parse_args(argv or sys.argv[1:])
    logging.basicConfig(
        level=getattr(logging, args.log_level), format="%(asctime)s [%(levelname)s] %(message)s"
    )
    
    return asyncio.run(async_main(args))


if __name__ == "__main__":
    raise SystemExit(main())
