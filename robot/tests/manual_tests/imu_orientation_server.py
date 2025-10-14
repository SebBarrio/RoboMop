#!/usr/bin/env python3
"""PC-side server that receives IMU orientation frames and renders a live 3D view."""

from __future__ import annotations

import argparse
import json
import logging
import socket
import sys
import threading
import time
from typing import Dict, Optional, Sequence, Tuple

import matplotlib.animation as animation
import matplotlib.pyplot as plt
import numpy as np
from matplotlib import colors as mcolors
from mpl_toolkits.mplot3d import Axes3D  # noqa: F401


def quaternion_to_matrix(quat: Tuple[float, float, float, float]) -> np.ndarray:
    w, x, y, z = quat
    norm = w * w + x * x + y * y + z * z
    if norm < 1e-8:
        return np.eye(3)
    s = 2.0 / norm
    wx, wy, wz = w * x * s, w * y * s, w * z * s
    xx, xy, xz = x * x * s, x * y * s, x * z * s
    yy, yz, zz = y * y * s, y * z * s, z * z * s
    return np.array([
        [1.0 - (yy + zz), xy - wz, xz + wy],
        [xy + wz, 1.0 - (xx + zz), yz - wx],
        [xz - wy, yz + wx, 1.0 - (xx + yy)],
    ])


class OrientationVisualizer:
    def __init__(self, update_hz: float, axis_length: float) -> None:
        self.update_interval = 1000 / update_hz
        self.axis_length = axis_length
        self.lock = threading.Lock()
        self.latest_frame: Optional[Dict] = None
        self.last_timestamp = 0.0

        bg = "#0a0f14"
        fg = "#8be9fd"
        colors = {"x": "#ff5555", "y": "#50fa7b", "z": "#6272a4"}

        self.fig = plt.figure(figsize=(8, 8), facecolor=bg)
        self.ax = self.fig.add_subplot(111, projection="3d", facecolor=bg)
        self.ax.set_title("RoboMop IMU Orientation", color=fg, fontsize=14, pad=18)
        self.ax.set_xlim(-axis_length, axis_length)
        self.ax.set_ylim(-axis_length, axis_length)
        self.ax.set_zlim(-axis_length, axis_length)
        self.ax.set_xlabel("X", color=fg)
        self.ax.set_ylabel("Y", color=fg)
        self.ax.set_zlabel("Z", color=fg)
        pane_color = (*mcolors.to_rgb(bg), 0.7)
        self.ax.xaxis.set_pane_color(pane_color)
        self.ax.yaxis.set_pane_color(pane_color)
        self.ax.zaxis.set_pane_color(pane_color)
        self.ax.tick_params(colors=fg)

        origin = np.zeros(3)
        unit_axes = np.eye(3) * axis_length
        self.lines = {
            "x": self.ax.plot([origin[0], unit_axes[0, 0]], [origin[1], unit_axes[0, 1]], [origin[2], unit_axes[0, 2]],
                               color=colors["x"], linewidth=2)[0],
            "y": self.ax.plot([origin[0], unit_axes[1, 0]], [origin[1], unit_axes[1, 1]], [origin[2], unit_axes[1, 2]],
                               color=colors["y"], linewidth=2)[0],
            "z": self.ax.plot([origin[0], unit_axes[2, 0]], [origin[1], unit_axes[2, 1]], [origin[2], unit_axes[2, 2]],
                               color=colors["z"], linewidth=2)[0],
        }
        self.status_text = self.fig.text(0.5, 0.05, "Waiting for data...", color=fg, ha="center", fontsize=10)

        self.fig.tight_layout()

    def start(self) -> None:
        self.ani = animation.FuncAnimation(
            self.fig,
            self._animate,
            interval=self.update_interval,
            blit=False,
            cache_frame_data=False,
        )
        plt.show(block=False)
        plt.pause(0.1)

    def stop(self) -> None:
        plt.close(self.fig)

    def update_frame(self, frame: Dict, timestamp: float) -> None:
        with self.lock:
            self.latest_frame = frame
            self.last_timestamp = timestamp

    def _animate(self, _frame_idx: int):
        with self.lock:
            frame = self.latest_frame
            ts = self.last_timestamp

        if not frame:
            return tuple(self.lines.values()) + (self.status_text,)

        quat = frame["orientation"]["quaternion"]
        matrix = quaternion_to_matrix((quat["w"], quat["x"], quat["y"], quat["z"]))
        axes = matrix @ (np.eye(3) * self.axis_length)
        origin = np.zeros(3)

        for key, idx in ("x", 0), ("y", 1), ("z", 2):
            axis = axes[:, idx]
            line = self.lines[key]
            line.set_data([origin[0], axis[0]], [origin[1], axis[1]])
            line.set_3d_properties([origin[2], axis[2]])

        roll_deg = frame["orientation"]["roll_deg"]
        pitch_deg = frame["orientation"]["pitch_deg"]
        yaw_deg = frame["orientation"]["yaw_deg"]
        temp = frame.get("temperature_c")
        self.status_text.set_text(
            f"Roll: {roll_deg:6.2f}°  Pitch: {pitch_deg:6.2f}°  Yaw: {yaw_deg:6.2f}°  "
            f"Temp: {temp:.1f}°C  Updated: {ts:.3f}s"
        )

        return tuple(self.lines.values()) + (self.status_text,)


def handle_client(conn: socket.socket, visualizer: OrientationVisualizer | None, log_every: int) -> None:
    with conn:
        conn.settimeout(5.0)
        stream = conn.makefile("r", encoding="utf-8", newline="\n")
        try:
            handshake_line = stream.readline()
            if not handshake_line:
                raise ConnectionError("Client closed during handshake")
            handshake = json.loads(handshake_line)
            if handshake.get("type") != "imu-handshake":
                raise ValueError("Expected imu-handshake message")
            logging.info(
                "Client handshake: rate=%.2f Hz, fields=%s",
                handshake.get("sample_rate_hz", 0.0),
                handshake.get("fields"),
            )

            processed = 0
            for line in stream:
                line = line.strip()
                if not line:
                    continue
                frame = json.loads(line)
                if frame.get("type") != "orientation-frame":
                    continue
                processed += 1
                if visualizer:
                    visualizer.update_frame(
                        {
                            "orientation": frame["orientation"],
                            "temperature_c": frame.get("temperature_c"),
                        },
                        frame.get("timestamp", time.time()),
                    )
                if processed % log_every == 0:
                    logging.info(
                        "Processed %d orientation frames (yaw=%.2f°)",
                        processed,
                        frame["orientation"]["yaw_deg"],
                    )
        except (json.JSONDecodeError, ValueError, ConnectionError) as exc:
            logging.warning("Client error: %s", exc)
        except socket.timeout:
            logging.warning("Socket timeout, closing connection")


def start_server(host: str, port: int, visualizer: OrientationVisualizer | None, log_every: int) -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind((host, port))
        server.listen(1)
        logging.info("Listening on %s:%d", host, port)
        while True:
            conn, address = server.accept()
            logging.info("Client connected from %s:%d", *address)
            handle_client(conn, visualizer, log_every)
            logging.info("Client disconnected, waiting for next connection")


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("host", help="Interface to bind (use 0.0.0.0 for all)")
    parser.add_argument("port", type=int, help="TCP port to listen on")
    parser.add_argument("--log-every", type=int, default=20, help="Log every N frames")
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
        help="Python logging level",
    )
    parser.add_argument("--no-gui", action="store_true", help="Disable visualization window")
    parser.add_argument("--viz-update-hz", type=float, default=30.0, help="GUI refresh rate (Hz)")
    parser.add_argument("--axis-length", type=float, default=1.0, help="Axis length for reference frame")
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    logging.basicConfig(level=getattr(logging, args.log_level), format="%(asctime)s %(levelname)s: %(message)s")

    visualizer: OrientationVisualizer | None = None
    if not args.no_gui:
        logging.info("Starting visualization at %.1f Hz", args.viz_update_hz)
        visualizer = OrientationVisualizer(update_hz=args.viz_update_hz, axis_length=args.axis_length)
        visualizer.start()

    try:
        if visualizer:
            server_thread = threading.Thread(
                target=start_server,
                args=(args.host, args.port, visualizer, args.log_every),
                daemon=True,
            )
            server_thread.start()
            logging.info("Server running. Close the window or press Ctrl+C twice to exit.")
            try:
                plt.show()
            except KeyboardInterrupt:
                logging.info("Interrupted")
        else:
            start_server(args.host, args.port, None, args.log_every)
    except KeyboardInterrupt:
        logging.info("Interrupted, shutting down")
    finally:
        if visualizer:
            visualizer.stop()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
