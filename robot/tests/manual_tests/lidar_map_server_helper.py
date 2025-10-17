"""PC-side server that receives RPLidar scans and shows a dark-themed live polar view."""

from __future__ import annotations

import argparse
import json
import logging
 
import socket
import struct
import sys
import threading
import time
from typing import Iterable, List, Sequence

import matplotlib.pyplot as plt
import matplotlib.animation as animation
import numpy as np
 

class LiveVisualizer:
    """Real-time dark-themed visualization of lidar scans."""

    def __init__(self, update_hz: float = 5.0, max_range_mm: float = 6000.0):
        self.update_interval = 1000 / update_hz  # milliseconds
        self.max_range_mm = max_range_mm
        self.current_scan: List[dict] = []
        self.scan_lock = threading.Lock()
        self.scan_count = 0
        self.running = True

        # Create figure and polar axis (dark futuristic theme)
        bg = '#0a0f14'            # deep space background
        fg = '#8be9fd'            # neon cyan labels
        accent = '#00e5ff'        # bright accent for points

        self.fig = plt.figure(figsize=(9, 9), facecolor=bg)
        self.ax_scan = plt.subplot(111, projection='polar', facecolor=bg)
        self.ax_scan.set_title('RoboMop LIDAR', pad=20, fontsize=14, color=fg, fontweight='bold')
        self.ax_scan.set_theta_zero_location('N')
        self.ax_scan.set_theta_direction(-1)
        self.ax_scan.set_ylim(0, self.max_range_mm)
        self.ax_scan.grid(color='#1e2a36', alpha=0.5)
        for spine in self.ax_scan.spines.values():
            spine.set_color('#1e2a36')
        self.ax_scan.tick_params(colors=fg, labelsize=9)
        self.ax_scan.set_rlabel_position(225)

        # Scatter layer
        self.scan_scatter = self.ax_scan.scatter([], [], s=6, c=accent, alpha=0.85)

        # Stats text
        self.stats_text = self.fig.text(
            0.5, 0.02, '', ha='center', va='bottom', fontsize=10, color=fg
        )

        plt.tight_layout()

    def update_scan(self, measurements: List[dict]):
        with self.scan_lock:
            self.current_scan = measurements
            self.scan_count += 1

    def animate(self, frame):
        if not self.running:
            return self.scan_scatter, self.stats_text

        # Update scan points
        with self.scan_lock:
            if self.current_scan:
                angles = np.deg2rad([m['angle'] for m in self.current_scan])
                distances = [m['distance_mm'] for m in self.current_scan]
                self.scan_scatter.set_offsets(np.c_[angles, distances])

                num_pts = len(distances)
                max_dist = max(distances) if num_pts else 0
                self.stats_text.set_text(
                    f'Scans: {self.scan_count}  |  Points: {num_pts}  |  Max: {max_dist:.0f} mm'
                )

        return self.scan_scatter, self.stats_text

    def start(self):
        self.ani = animation.FuncAnimation(
            self.fig, self.animate, interval=self.update_interval,
            blit=False, cache_frame_data=False
        )
        plt.show(block=False)
        plt.pause(0.1)

    def stop(self):
        self.running = False
        plt.close(self.fig)


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
    log_every: int,
    visualizer: LiveVisualizer | None = None,
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

                processed += 1

                if visualizer:
                    visualizer.update_scan(measurements)

                if processed % log_every == 0:
                    logging.info("Processed %d scans (%d points)", processed, len(measurements))
        except (ConnectionError, json.JSONDecodeError) as exc:
            logging.warning("Client disconnected or invalid data: %s", exc)
        except socket.timeout:
            logging.warning("Socket timeout, closing connection")


def start_server(
    host: str,
    port: int,
    log_every: int,
    visualizer: LiveVisualizer | None = None,
) -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind((host, port))
        server.listen(1)
        logging.info("Listening on %s:%d", host, port)
        while True:
            conn, address = server.accept()
            logging.info("Client connected from %s:%d", *address)
            handle_client(conn, log_every, visualizer)
            logging.info("Ready for a new client")


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("host", help="Interface to bind (use 0.0.0.0 for all)")
    parser.add_argument("port", type=int, help="TCP port to listen on")
    parser.add_argument("--log-every", type=int, default=10, help="Log every N scans")
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
        help="Python logging level",
    )
    parser.add_argument("--visualize", action="store_true", help="Enable real-time GUI")
    parser.add_argument("--viz-update-hz", type=float, default=5.0, help="GUI update rate (Hz)")
    parser.add_argument("--max-range-mm", type=float, default=6000.0, help="Polar radius limit (mm)")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    logging.basicConfig(level=getattr(logging, args.log_level), format="%(asctime)s %(levelname)s: %(message)s")

    # Optional visualizer
    visualizer = None
    if args.visualize:
        logging.info("Starting live visualization at %.1f Hz", args.viz_update_hz)
        visualizer = LiveVisualizer(update_hz=args.viz_update_hz, max_range_mm=args.max_range_mm)
        visualizer.start()

    try:
        if visualizer:
            server_thread = threading.Thread(
                target=start_server,
                args=(args.host, args.port, args.log_every, visualizer),
                daemon=True,
            )
            server_thread.start()
            logging.info("Server started in background, visualization active")
            try:
                plt.show()
            except KeyboardInterrupt:
                logging.info("Interrupted")
        else:
            start_server(args.host, args.port, args.log_every, None)
    except KeyboardInterrupt:
        logging.info("Interrupted, shutting down")
    finally:
        if visualizer:
            visualizer.stop()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
