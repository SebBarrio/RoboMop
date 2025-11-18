#!/usr/bin/env python3
"""
Triangle Test Live Viewer

A simple WebSocket server that receives real-time updates from the RoboMop
triangle calibration test and visualizes the map, trajectory, and robot pose
using Matplotlib.

Dependencies:
    pip install websockets matplotlib numpy

Usage:
    # Start the viewer server (on your viewing machine):
    python robot/tests/manual_tests/triangle_viewer.py --host 0.0.0.0 --port 8765

    # On the robot, run the triangle test with streaming enabled:
    python -m robot.src.main --triangle-test --triangle-stream-url ws://<viewer-ip>:8765

    # Example for localhost testing:
    python -m robot.src.main --triangle-test --triangle-stream-url ws://localhost:8765

Notes:
    - This is a simple viewer for on-LAN testing only (no authentication)
    - The viewer accepts a single WebSocket connection at a time
    - Press Ctrl+C to stop the server
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import gzip
import json
import logging
import math
import threading
from typing import Any

import matplotlib
matplotlib.use('TkAgg')  # Use TkAgg backend for better async compatibility
import matplotlib.pyplot as plt
import numpy as np


class TriangleViewer:
    """Real-time viewer for triangle calibration test."""

    def __init__(self) -> None:
        self.fig, self.ax = plt.subplots(figsize=(12, 10))
        self.ax.set_xlabel("X (meters)", fontsize=12)
        self.ax.set_ylabel("Y (meters)", fontsize=12)
        self.ax.set_title("Triangle Calibration Test - Live View", fontsize=14, fontweight="bold")
        self.ax.grid(True, alpha=0.3)
        self.ax.set_aspect("equal")
        
        # Initialize plot elements
        self.map_image = None
        self.trajectory_line, = self.ax.plot([], [], "r-", linewidth=2, label="Actual Trajectory")
        self.planned_line, = self.ax.plot([], [], "b--", linewidth=2, label="Planned Path", alpha=0.7)
        self.pose_marker, = self.ax.plot([], [], "go", markersize=12, label="Current Pose")
        self.start_marker, = self.ax.plot([], [], "g^", markersize=15, label="Start")
        self.lidar_scatter = self.ax.scatter([], [], c="cyan", s=10, alpha=0.7, label="LIDAR Scan", zorder=10)
        self.heading_line, = self.ax.plot([], [], color="orange", linewidth=2.5, label="Heading")
        self.heading_text = self.ax.text(
            0.02,
            0.95,
            "Heading: --°",
            transform=self.ax.transAxes,
            fontsize=11,
            color="orange",
            bbox=dict(facecolor="white", alpha=0.6, edgecolor="none"),
        )
        
        self.ax.legend(loc="upper right", fontsize=10)
        
        # Set initial view limits
        self.ax.set_xlim(-0.5, 1.5)
        self.ax.set_ylim(-0.5, 1.5)
        
        plt.ion()
        plt.show(block=False)
        plt.pause(0.1)  # Give the window time to appear
        
        self.logger = logging.getLogger("triangle_viewer")
        self.update_count = 0
        self.lock = threading.Lock()  # Thread-safe updates

    def update(self, data: dict[str, Any]) -> None:
        """Update the visualization with new data from the robot."""
        with self.lock:
            try:
                self.update_count += 1
                
                # Update map if present
                if "map" in data and data["map"]:
                    self._update_map(data["map"])
                
                # Update trajectory
                if "trajectory" in data and data["trajectory"]:
                    trajectory = data["trajectory"]
                    traj_x = [p[0] for p in trajectory]
                    traj_y = [p[1] for p in trajectory]
                    self.trajectory_line.set_data(traj_x, traj_y)
                    
                    # Update start marker (first point)
                    if len(trajectory) > 0:
                        self.start_marker.set_data([traj_x[0]], [traj_y[0]])
                
                # Update planned path
                if "plannedVertices" in data and data["plannedVertices"]:
                    vertices = data["plannedVertices"]
                    planned_x = [v[0] for v in vertices]
                    planned_y = [v[1] for v in vertices]
                    self.planned_line.set_data(planned_x, planned_y)
                
                # Update current pose
                if "pose" in data and data["pose"]:
                    pose = data["pose"]
                    self.pose_marker.set_data([pose["x"]], [pose["y"]])
                    heading_deg = data.get("poseHeadingDeg")
                    self._update_heading_indicator(
                        pose_x=pose["x"],
                        pose_y=pose["y"],
                        heading_rad=pose.get("theta"),
                        heading_deg=heading_deg,
                    )
                    
                    # Update LIDAR scan if present
                    if "lidarScan" in data and data["lidarScan"]:
                        self._update_lidar_scan(data["lidarScan"], pose)
                
                # Auto-adjust view limits if needed
                if self.update_count % 10 == 0:  # Every 10 updates
                    self._auto_adjust_limits(data)
                
                # Refresh display
                self.fig.canvas.draw()
                self.fig.canvas.flush_events()
                
                if self.update_count % 10 == 0:
                    self.logger.info("Received update #%d", self.update_count)
                    
            except Exception as exc:
                self.logger.error("Error updating visualization: %s", exc, exc_info=True)

    def _update_map(self, map_data: dict[str, Any]) -> None:
        """Update the occupancy grid map display."""
        try:
            # Decode map data (supports base64 and gzip+base64)
            encoding = map_data.get("encoding", "base64")
            
            data_bytes = base64.b64decode(map_data["data"])
            
            # Decompress if gzipped
            if encoding == "gzip+base64":
                data_bytes = gzip.decompress(data_bytes)
            elif encoding != "base64":
                self.logger.warning("Unknown encoding: %s", encoding)
                return
            
            width = map_data["width"]
            height = map_data["height"]
            resolution = map_data["resolution"]
            origin = map_data["origin"]
            
            # Reshape to 2D array
            grid_data = np.frombuffer(data_bytes, dtype=np.uint8).reshape((height, width))
            
            # Create extent for world coordinates
            extent = [
                origin["x"],
                origin["x"] + width * resolution,
                origin["y"],
                origin["y"] + height * resolution,
            ]
            
            # Display grid (inverted colormap: white=free, black=occupied)
            # Grid values: 0=unknown, 1-127=free, 128-255=occupied
            display_grid = np.where(grid_data == 0, 128, grid_data)  # Show unknown as gray
            
            if self.map_image is None:
                self.map_image = self.ax.imshow(
                    display_grid,
                    cmap="gray_r",
                    origin="lower",
                    extent=extent,
                    vmin=0,
                    vmax=255,
                    alpha=0.6,
                    zorder=0,
                )
            else:
                self.map_image.set_data(display_grid)
                self.map_image.set_extent(extent)
                
        except Exception as exc:
            self.logger.debug("Error updating map: %s", exc)

    def _update_lidar_scan(self, lidar_scan: list[list[float]], pose: dict[str, float]) -> None:
        """Update the LIDAR scan visualization."""
        try:
            if not lidar_scan:
                # Clear LIDAR points if no scan data
                self.lidar_scatter.set_offsets(np.empty((0, 2)))
                return
            
            # Convert LIDAR measurements from robot frame to world frame
            robot_x = pose["x"]
            robot_y = pose["y"]
            robot_theta = pose["theta"]
            
            # Each measurement is [angle_rad, distance_m]
            world_points = []
            for measurement in lidar_scan:
                angle_rad = measurement[0]
                distance_m = measurement[1]
                
                # Convert polar to Cartesian in robot frame
                local_x = distance_m * np.cos(angle_rad)
                local_y = distance_m * np.sin(angle_rad)
                
                # Transform to world frame
                world_x = robot_x + local_x * np.cos(robot_theta) - local_y * np.sin(robot_theta)
                world_y = robot_y + local_x * np.sin(robot_theta) + local_y * np.cos(robot_theta)
                
                world_points.append([world_x, world_y])
            
            # Update scatter plot
            if world_points:
                self.lidar_scatter.set_offsets(np.array(world_points))
            else:
                self.lidar_scatter.set_offsets(np.empty((0, 2)))
                
        except Exception as exc:
            self.logger.debug("Error updating LIDAR scan: %s", exc)

    def _auto_adjust_limits(self, data: dict[str, Any]) -> None:
        """Automatically adjust axis limits based on trajectory and planned path."""
        try:
            all_x = []
            all_y = []
            
            if "trajectory" in data and data["trajectory"]:
                all_x.extend([p[0] for p in data["trajectory"]])
                all_y.extend([p[1] for p in data["trajectory"]])
            
            if "plannedVertices" in data and data["plannedVertices"]:
                all_x.extend([v[0] for v in data["plannedVertices"]])
                all_y.extend([v[1] for v in data["plannedVertices"]])
            
            if all_x and all_y:
                margin = 0.5  # 0.5m margin
                x_min, x_max = min(all_x) - margin, max(all_x) + margin
                y_min, y_max = min(all_y) - margin, max(all_y) + margin
                
                # Only update if significantly different
                current_xlim = self.ax.get_xlim()
                current_ylim = self.ax.get_ylim()
                
                if (abs(current_xlim[0] - x_min) > 0.2 or abs(current_xlim[1] - x_max) > 0.2 or
                    abs(current_ylim[0] - y_min) > 0.2 or abs(current_ylim[1] - y_max) > 0.2):
                    self.ax.set_xlim(x_min, x_max)
                    self.ax.set_ylim(y_min, y_max)
                    
        except Exception as exc:
            self.logger.debug("Error adjusting limits: %s", exc)

    def _update_heading_indicator(
        self,
        *,
        pose_x: float,
        pose_y: float,
        heading_rad: float | None,
        heading_deg: float | None,
    ) -> None:
        """Update heading arrow and text annotation."""
        if heading_rad is None:
            self.heading_line.set_data([], [])
            self.heading_text.set_text("Heading: --°")
            return

        arrow_length = 0.25  # meters
        end_x = pose_x + arrow_length * math.cos(heading_rad)
        end_y = pose_y + arrow_length * math.sin(heading_rad)
        self.heading_line.set_data([pose_x, end_x], [pose_y, end_y])
        if heading_deg is None:
            heading_deg = math.degrees(heading_rad)
        self.heading_text.set_text(f"Heading: {heading_deg:.1f}°")


async def handle_client(websocket, viewer: TriangleViewer, logger: logging.Logger) -> None:
    """Handle incoming WebSocket connection and process updates."""
    logger.info("Client connected from %s", websocket.remote_address)
    
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                
                if data.get("type") == "triangle_update":
                    viewer.update(data)
                else:
                    logger.warning("Unknown message type: %s", data.get("type"))
                    
            except json.JSONDecodeError as exc:
                logger.error("Failed to decode JSON message: %s", exc)
            except Exception as exc:
                logger.error("Error processing message: %s", exc, exc_info=True)
                
    except Exception as exc:
        logger.error("WebSocket error: %s", exc)
    finally:
        logger.info("Client disconnected")


async def serve(host: str, port: int, logger: logging.Logger) -> None:
    """Start the WebSocket server and viewer."""
    import websockets  # type: ignore
    
    viewer = TriangleViewer()
    logger.info("Triangle viewer initialized")
    
    async def client_handler(websocket):
        await handle_client(websocket, viewer, logger)
    
    async def matplotlib_refresh_loop():
        """Periodically refresh matplotlib to keep window responsive."""
        while True:
            try:
                plt.pause(0.01)  # Process GUI events
                await asyncio.sleep(0.05)  # 20 Hz refresh
            except Exception as exc:
                logger.debug("Matplotlib refresh error: %s", exc)
    
    logger.info("Starting WebSocket server on ws://%s:%d", host, port)
    logger.info("Waiting for robot connection...")
    
    # Start matplotlib refresh task
    refresh_task = asyncio.create_task(matplotlib_refresh_loop())
    
    try:
        # Increase max_size to 10MB to handle large map data
        async with websockets.serve(
            client_handler, host, port, max_size=10 * 1024 * 1024
        ):
            await asyncio.Future()  # Run forever
    finally:
        refresh_task.cancel()
        try:
            await refresh_task
        except asyncio.CancelledError:
            pass


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Triangle calibration test live viewer"
    )
    parser.add_argument(
        "--host",
        type=str,
        default="0.0.0.0",
        help="Host to bind the WebSocket server (default: 0.0.0.0)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8765,
        help="Port for the WebSocket server (default: 8765)",
    )
    parser.add_argument(
        "--log-level",
        type=str,
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level (default: INFO)",
    )
    
    args = parser.parse_args()
    
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper()),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    logger = logging.getLogger("triangle_viewer")
    
    try:
        asyncio.run(serve(args.host, args.port, logger))
    except KeyboardInterrupt:
        logger.info("Viewer stopped by user")
    except Exception as exc:
        logger.error("Fatal error: %s", exc, exc_info=True)


if __name__ == "__main__":
    main()

