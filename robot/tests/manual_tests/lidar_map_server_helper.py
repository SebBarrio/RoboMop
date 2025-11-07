"""PC-side server that receives occupancy grid and shows a dark-themed live 2D map view."""

from __future__ import annotations

import argparse
import base64
import json
import logging

import socket
import struct
import sys
import threading
import time
from typing import List, Sequence

import matplotlib.pyplot as plt
import matplotlib.animation as animation
import numpy as np


class LiveVisualizer:
    """Real-time dark-themed visualization of occupancy grid."""

    def __init__(self, update_hz: float = 5.0):
        self.update_interval = 1000 / update_hz  # milliseconds
        self.current_grid: np.ndarray | None = None
        self.grid_metadata: dict | None = None
        self.grid_lock = threading.Lock()
        self.grid_count = 0
        self.running = True

        # Create figure and axis (dark futuristic theme)
        bg = "#0a0f14"  # deep space background
        fg = "#8be9fd"  # neon cyan labels

        self.fig = plt.figure(figsize=(12, 10), facecolor=bg)
        self.ax_grid = plt.subplot(111, facecolor=bg)
        self.ax_grid.set_title(
            "RoboMop Occupancy Grid", pad=20, fontsize=14, color=fg, fontweight="bold"
        )
        self.ax_grid.set_xlabel("X (meters)", fontsize=11, color=fg)
        self.ax_grid.set_ylabel("Y (meters)", fontsize=11, color=fg)
        self.ax_grid.grid(color="#1e2a36", alpha=0.3, linewidth=0.5)
        for spine in self.ax_grid.spines.values():
            spine.set_color("#1e2a36")
        self.ax_grid.tick_params(colors=fg, labelsize=9)
        self.ax_grid.set_aspect("equal")

        # Image layer (will be initialized on first grid)
        self.grid_image = None

        # Stats text
        self.stats_text = self.fig.text(
            0.5, 0.02, "", ha="center", va="bottom", fontsize=10, color=fg
        )

        plt.tight_layout()

    def update_grid(self, grid_data: np.ndarray, metadata: dict):
        with self.grid_lock:
            self.current_grid = grid_data
            self.grid_metadata = metadata
            self.grid_count += 1

    def animate(self, frame):
        if not self.running:
            return (self.grid_image,) if self.grid_image else ()

        # Update grid visualization
        with self.grid_lock:
            if self.current_grid is not None and self.grid_metadata is not None:
                # Prepare grid for display
                # 0=unknown (gray), 1-127=free (white), 128-255=occupied (black)
                display_grid = np.where(
                    self.current_grid == 0, 128, self.current_grid
                )  # Show unknown as gray
                
                # Calculate extent in world coordinates
                origin_x = self.grid_metadata["origin"]["x"]
                origin_y = self.grid_metadata["origin"]["y"]
                resolution = self.grid_metadata["resolution"]
                width = self.grid_metadata["width"]
                height = self.grid_metadata["height"]
                
                extent = [
                    origin_x,
                    origin_x + width * resolution,
                    origin_y,
                    origin_y + height * resolution,
                ]
                
                if self.grid_image is None:
                    # First time: create image
                    self.grid_image = self.ax_grid.imshow(
                        display_grid,
                        cmap="gray_r",  # white=free, black=occupied
                        origin="lower",
                        extent=extent,
                        vmin=0,
                        vmax=255,
                        alpha=0.9,
                        interpolation="nearest",
                    )
                    # Add colorbar
                    cbar = plt.colorbar(self.grid_image, ax=self.ax_grid, pad=0.02)
                    cbar.set_label("Occupancy", rotation=270, labelpad=15, color="#8be9fd")
                    cbar.ax.tick_params(colors="#8be9fd", labelsize=8)
                else:
                    # Update existing image
                    self.grid_image.set_data(display_grid)
                    self.grid_image.set_extent(extent)
                
                # Update stats
                completion = self.grid_metadata.get("completion_ratio", 0.0)
                self.stats_text.set_text(
                    f"Grids: {self.grid_count}  |  Size: {width}x{height}  |  "
                    f"Resolution: {resolution:.3f} m  |  Completion: {completion*100:.1f}%"
                )

        return (self.grid_image,) if self.grid_image else ()

    def start(self):
        self.ani = animation.FuncAnimation(
            self.fig,
            self.animate,
            interval=self.update_interval,
            blit=False,
            cache_frame_data=False,
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
    return b"".join(chunks)


def handle_client(
    conn: socket.socket,
    log_every: int,
    visualizer: LiveVisualizer | None = None,
) -> None:
    with conn:
        conn.settimeout(5.0)
        processed = 0
        try:
            while True:
                header = recv_exact(conn, 4)
                (length,) = struct.unpack("!I", header)
                payload = recv_exact(conn, length)
                grid_message = json.loads(payload.decode("utf-8"))
                
                # Decode base64 grid data
                encoded_data = grid_message.get("data", "")
                grid_bytes = base64.b64decode(encoded_data)
                width = grid_message["width"]
                height = grid_message["height"]
                
                # Reconstruct grid array
                grid_data = np.frombuffer(grid_bytes, dtype=np.uint8).reshape((height, width))
                
                processed += 1

                if visualizer:
                    visualizer.update_grid(grid_data, grid_message)

                if processed % log_every == 0:
                    completion = grid_message.get("completion_ratio", 0.0)
                    logging.info(
                        "Processed %d grids (%.1f%% complete)",
                        processed,
                        completion * 100,
                    )
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
    parser.add_argument("--log-every", type=int, default=10, help="Log every N grids")
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
        help="Python logging level",
    )
    parser.add_argument("--visualize", action="store_true", help="Enable real-time GUI")
    parser.add_argument("--viz-update-hz", type=float, default=5.0, help="GUI update rate (Hz)")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    logging.basicConfig(
        level=getattr(logging, args.log_level), format="%(asctime)s %(levelname)s: %(message)s"
    )

    # Optional visualizer
    visualizer = None
    if args.visualize:
        logging.info("Starting live visualization at %.1f Hz", args.viz_update_hz)
        visualizer = LiveVisualizer(update_hz=args.viz_update_hz)
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
