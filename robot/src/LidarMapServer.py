"""PC-side server that receives RPLidar scans and builds a simple occupancy grid."""

from __future__ import annotations

import argparse
import json
import logging
import math
import socket
import struct
import sys
import threading
import time
from pathlib import Path
from typing import Iterable, List, Sequence


class OccupancyGrid:
    def __init__(self, size_meters: float, resolution: float) -> None:
        if size_meters <= 0:
            raise ValueError("size_meters must be positive")
        if resolution <= 0:
            raise ValueError("resolution must be positive")

        cells = int(size_meters / resolution)
        if cells % 2 != 0:
            cells += 1

        self.resolution = resolution
        self.size_meters = cells * resolution
        self.cells_per_axis = cells
        self.half_cells = cells // 2
        self.grid: List[List[int]] = [
            [0 for _ in range(self.cells_per_axis)] for _ in range(self.cells_per_axis)
        ]
        self.lock = threading.Lock()

    def _xy_to_cell(self, x: float, y: float) -> tuple[int, int] | None:
        col = int(x / self.resolution) + self.half_cells
        row = self.half_cells - int(y / self.resolution)
        if 0 <= row < self.cells_per_axis and 0 <= col < self.cells_per_axis:
            return row, col
        return None

    def insert(self, angle_deg: float, distance_mm: float) -> bool:
        if distance_mm <= 0:
            return False

        distance_m = distance_mm / 1000.0
        angle_rad = math.radians(angle_deg)
        x = distance_m * math.cos(angle_rad)
        y = distance_m * math.sin(angle_rad)
        cell = self._xy_to_cell(x, y)
        if cell is None:
            return False

        row, col = cell
        with self.lock:
            value = self.grid[row][col]
            if value < 255:
                self.grid[row][col] = value + 1
        return True

    def to_ascii(self, downsample: int = 4) -> str:
        with self.lock:
            rows = self.grid[::downsample]
            lines = []
            for row in rows:
                cols = row[::downsample]
                line = ''.join('#' if value > 0 else '.' for value in cols)
                lines.append(line)
        return '\n'.join(lines)

    def save_pgm(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.lock, path.open('w', encoding='ascii') as handle:
            handle.write(f"P2\n{self.cells_per_axis} {self.cells_per_axis}\n255\n")
            for row in self.grid:
                handle.write(' '.join(str(value) for value in row) + '\n')


def recv_exact(sock: socket.socket, num_bytes: int) -> bytes:
    chunks: List[bytes] = []
    remaining = num_bytes
    while remaining > 0:
        chunk = sock.recv(remaining)
        if not chunk:
            raise ConnectionError("Socket closed while reading")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b''.join(chunks)


def handle_client(
    conn: socket.socket,
    grid: OccupancyGrid,
    log_every: int,
    map_dump_interval: float,
    map_dump_path: Path | None,
) -> None:
    with conn:
        conn.settimeout(5.0)
        processed = 0
        last_dump = time.monotonic()
        try:
            while True:
                header = recv_exact(conn, 4)
                (length,) = struct.unpack('!I', header)
                payload = recv_exact(conn, length)
                scan = json.loads(payload.decode('utf-8'))
                measurements = scan.get('measurements', [])
                inserted = 0
                for entry in measurements:
                    angle = float(entry.get('angle', 0.0))
                    distance = float(entry.get('distance_mm', 0.0))
                    if grid.insert(angle, distance):
                        inserted += 1

                processed += 1
                if processed % log_every == 0:
                    logging.info(
                        "Processed %d scans, last contained %d hits (inserted=%d)",
                        processed,
                        len(measurements),
                        inserted,
                    )

                if map_dump_path is not None and map_dump_interval > 0:
                    now = time.monotonic()
                    if now - last_dump >= map_dump_interval:
                        grid.save_pgm(map_dump_path)
                        logging.info("Wrote occupancy grid to %s", map_dump_path)
                        last_dump = now
        except (ConnectionError, json.JSONDecodeError) as exc:
            logging.warning("Client disconnected or invalid data: %s", exc)
        except socket.timeout:
            logging.warning("Socket timeout, closing connection")


def start_server(
    host: str,
    port: int,
    grid: OccupancyGrid,
    log_every: int,
    map_dump_interval: float,
    map_dump_path: Path | None,
) -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind((host, port))
        server.listen(1)
        logging.info("Listening on %s:%d", host, port)
        while True:
            conn, address = server.accept()
            logging.info("Client connected from %s:%d", *address)
            handle_client(conn, grid, log_every, map_dump_interval, map_dump_path)
            logging.info("Ready for a new client")


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("host", help="Interface to bind (use 0.0.0.0 for all)")
    parser.add_argument("port", type=int, help="TCP port to listen on")
    parser.add_argument(
        "--size-meters",
        type=float,
        default=12.0,
        help="Physical width/height covered by the map (default: %(default).1f m)",
    )
    parser.add_argument(
        "--resolution",
        type=float,
        default=0.05,
        help="Grid resolution in meters per cell (default: %(default).2f m)",
    )
    parser.add_argument(
        "--log-every",
        type=int,
        default=10,
        help="Log every N scans (default: %(default)s)",
    )
    parser.add_argument(
        "--map-dump-path",
        type=Path,
        default=None,
        help="Optional path to periodically write an ASCII PGM map",
    )
    parser.add_argument(
        "--map-dump-interval",
        type=float,
        default=30.0,
        help="Seconds between map dumps when enabled (default: %(default).0f)",
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
    grid = OccupancyGrid(args.size_meters, args.resolution)

    logging.info(
        "Created occupancy grid: %.1f m x %.1f m at %.2f m resolution",
        grid.size_meters,
        grid.size_meters,
        grid.resolution,
    )

    try:
        start_server(
            args.host,
            args.port,
            grid,
            args.log_every,
            args.map_dump_interval,
            args.map_dump_path,
        )
    except KeyboardInterrupt:
        logging.info("Interrupted, shutting down")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
