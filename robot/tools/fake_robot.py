#!/usr/bin/env python3
"""Hardware-free RoboMop simulator for testing the relay and the app.

Speaks the same protocol as robot/src/main.py: connects to the relay (or LAN
viewer) as the robot, streams pose/lidar/map telemetry, and obeys estop and
control commands (manual velocity, clean, explore).

Usage:
    pip install websockets
    # Against local wrangler dev:
    python robot/tools/fake_robot.py
    # Against the deployed relay:
    python robot/tools/fake_robot.py --relay-url wss://robomop-relay.<acct>.workers.dev \
        --robot-token <ROBOT_TOKEN>
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import gzip
import json
import logging
import math
import random
import time
from collections import deque
from urllib.parse import quote

import websockets

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("fake_robot")

# Simulated room: 8 m x 6 m, origin at the center.
RES = 0.05
GRID_W, GRID_H = 160, 120
ORIGIN_X, ORIGIN_Y = -4.0, -3.0
UNKNOWN, FREE, OCCUPIED = 0, 40, 220  # matches OccupancyGrid: 0=unknown, >127=occupied
LIDAR_RANGE = 5.0
STATE_HZ = 10.0
MAP_HZ = 1.0


def build_true_map() -> bytearray:
    """Ground-truth occupancy: border walls plus a couch and a table."""
    grid = bytearray(GRID_W * GRID_H)
    for y in range(GRID_H):
        for x in range(GRID_W):
            wall = x == 0 or y == 0 or x == GRID_W - 1 or y == GRID_H - 1
            grid[y * GRID_W + x] = OCCUPIED if wall else FREE
    boxes = [(-3.2, 0.8, -1.8, 2.2), (1.2, -2.2, 2.8, -1.2)]  # (x0, y0, x1, y1) meters
    for x0, y0, x1, y1 in boxes:
        for gy in range(int((y0 - ORIGIN_Y) / RES), int((y1 - ORIGIN_Y) / RES)):
            for gx in range(int((x0 - ORIGIN_X) / RES), int((x1 - ORIGIN_X) / RES)):
                if 0 <= gx < GRID_W and 0 <= gy < GRID_H:
                    grid[gy * GRID_W + gx] = OCCUPIED
    return grid


class FakeRobot:
    def __init__(self) -> None:
        self.true_map = build_true_map()
        self.known = bytearray([UNKNOWN] * (GRID_W * GRID_H))
        self.x, self.y, self.theta = 0.0, 0.0, 0.0
        self.linear, self.angular = 0.0, 0.0
        self.cmd_linear, self.cmd_angular = 0.0, 0.0
        self.mode = "manual"
        self.estop = False
        self.trajectory: deque[tuple[float, float]] = deque(maxlen=2000)
        self.scan: list[list[float]] = []
        self._explore_target: tuple[float, float] | None = None

    # --- world helpers -------------------------------------------------
    def occupied_at(self, wx: float, wy: float) -> bool:
        gx = int((wx - ORIGIN_X) / RES)
        gy = int((wy - ORIGIN_Y) / RES)
        if not (0 <= gx < GRID_W and 0 <= gy < GRID_H):
            return True
        return self.true_map[gy * GRID_W + gx] == OCCUPIED

    def raycast(self, angle_world: float) -> float:
        d = 0.0
        while d < LIDAR_RANGE:
            d += RES
            if self.occupied_at(self.x + d * math.cos(angle_world), self.y + d * math.sin(angle_world)):
                return d
        return LIDAR_RANGE

    def update_lidar_and_map(self) -> None:
        self.scan = []
        for i in range(0, 360, 2):
            a_body = math.radians(i)
            dist = self.raycast(self.theta + a_body)
            self.scan.append([a_body, dist])
            # Reveal the map along the ray
            steps = int(dist / RES)
            for s in range(steps + 1):
                wx = self.x + s * RES * math.cos(self.theta + a_body)
                wy = self.y + s * RES * math.sin(self.theta + a_body)
                gx = int((wx - ORIGIN_X) / RES)
                gy = int((wy - ORIGIN_Y) / RES)
                if 0 <= gx < GRID_W and 0 <= gy < GRID_H:
                    idx = gy * GRID_W + gx
                    self.known[idx] = self.true_map[idx]

    # --- control -------------------------------------------------------
    def step(self, dt: float) -> None:
        if self.estop:
            self.linear = self.angular = 0.0
            return

        if self.mode == "manual":
            target_lin, target_ang = self.cmd_linear, self.cmd_angular
        else:
            target_lin, target_ang = self._autonomous_command()

        # Simple velocity ramp for realism
        self.linear += max(-0.5 * dt, min(0.5 * dt, target_lin - self.linear))
        self.angular += max(-2.0 * dt, min(2.0 * dt, target_ang - self.angular))

        nx = self.x + self.linear * math.cos(self.theta) * dt
        ny = self.y + self.linear * math.sin(self.theta) * dt
        # Block movement into obstacles (with a small body radius)
        if not self.occupied_at(nx + 0.15 * math.cos(self.theta), ny + 0.15 * math.sin(self.theta)):
            self.x, self.y = nx, ny
        self.theta = (self.theta + self.angular * dt + math.pi) % (2 * math.pi) - math.pi
        self.trajectory.append((self.x, self.y))

    def _autonomous_command(self) -> tuple[float, float]:
        # Wander toward a target point; pick a new one when reached or blocked.
        if self._explore_target is None:
            self._explore_target = (random.uniform(-3.4, 3.4), random.uniform(-2.4, 2.4))
        tx, ty = self._explore_target
        dist = math.hypot(tx - self.x, ty - self.y)
        if dist < 0.25:
            self._explore_target = None
            return 0.0, 0.0
        heading = math.atan2(ty - self.y, tx - self.x)
        err = (heading - self.theta + math.pi) % (2 * math.pi) - math.pi
        if abs(err) > 0.4:
            return 0.0, math.copysign(0.6, err)
        # Obstacle directly ahead? pick a new target
        if self.raycast(self.theta) < 0.4:
            self._explore_target = None
            return 0.0, 0.5
        return 0.25, err

    # --- telemetry -----------------------------------------------------
    def state_payload(self) -> dict:
        return {
            "type": "triangle_update",
            "pose": {"x": self.x, "y": self.y, "theta": self.theta},
            "poseHeadingDeg": math.degrees(self.theta),
            "trajectory": list(self.trajectory)[-500:],
            "plannedVertices": [],
            "lidarScan": self.scan,
            "odomPose": {"x": self.x, "y": self.y, "theta": self.theta},
            "ekfPose": {
                "x": self.x, "y": self.y, "theta": self.theta,
                "varX": 0.003, "varY": 0.003, "varTheta": 0.001,
            },
            "controlMode": self.mode,
            "obstacleAvoidanceEnabled": True,
            "robotFootprint": {"width": 0.45, "length": 0.5, "circumscribedRadius": 0.34},
            "estopActive": self.estop,
        }

    def map_payload(self) -> dict:
        compressed = gzip.compress(bytes(self.known), compresslevel=1)
        return {
            "type": "triangle_update",
            "map": {
                "width": GRID_W,
                "height": GRID_H,
                "resolution": RES,
                "origin": {"x": ORIGIN_X, "y": ORIGIN_Y, "theta": 0.0},
                "data": base64.b64encode(compressed).decode("ascii"),
                "encoding": "gzip+base64",
            },
        }

    # --- commands ------------------------------------------------------
    def handle_message(self, data: dict) -> None:
        msg_type = data.get("type")
        if msg_type == "estop":
            self.estop = bool(data.get("enabled", False))
            log.info("E-STOP %s", "ENABLED" if self.estop else "disabled")
        elif msg_type == "control":
            command = data.get("command")
            if command == "set_mode":
                mode = str(data.get("mode", "manual"))
                if mode in ("manual", "clean", "explore"):
                    self.mode = mode
                    self.cmd_linear = self.cmd_angular = 0.0
                    self._explore_target = None
                    log.info("Mode -> %s", mode)
            elif command == "velocity":
                self.cmd_linear = float(data.get("linear", 0.0))
                self.cmd_angular = float(data.get("angular", 0.0))


async def run(url: str) -> None:
    robot = FakeRobot()
    while True:
        try:
            log.info("Connecting to %s", url)
            async with websockets.connect(url, max_size=10 * 1024 * 1024) as ws:
                log.info("Connected")
                await ws.send(json.dumps({
                    "type": "hello",
                    "robot": {"name": "RoboMop S1 (sim)", "startedAt": time.time()},
                }))

                async def recv_loop() -> None:
                    async for message in ws:
                        try:
                            robot.handle_message(json.loads(message))
                        except Exception:
                            pass

                recv_task = asyncio.create_task(recv_loop())
                last = time.perf_counter()
                next_map = 0.0
                try:
                    while True:
                        now = time.perf_counter()
                        dt = min(0.2, now - last)
                        last = now
                        robot.step(dt)
                        robot.update_lidar_and_map()
                        await ws.send(json.dumps(robot.state_payload()))
                        if now >= next_map:
                            await ws.send(json.dumps(robot.map_payload()))
                            next_map = now + 1.0 / MAP_HZ
                        await asyncio.sleep(1.0 / STATE_HZ)
                finally:
                    recv_task.cancel()
        except (OSError, websockets.exceptions.WebSocketException) as exc:
            log.warning("Connection failed (%s); retrying in 3 s", exc)
            await asyncio.sleep(3)


def main() -> None:
    parser = argparse.ArgumentParser(description="RoboMop hardware-free simulator")
    parser.add_argument("--relay-url", default="ws://localhost:8787", help="Relay origin")
    parser.add_argument("--robot-id", default="robomop-s1")
    parser.add_argument("--robot-token", default="dev-robot-token")
    parser.add_argument("--viewer", default="", help="Direct ws:// URL (bypasses relay URL building)")
    args = parser.parse_args()

    if args.viewer:
        url = args.viewer
    else:
        base = args.relay_url.rstrip("/")
        url = f"{base}/ws?robot={quote(args.robot_id)}&role=robot&token={quote(args.robot_token)}"

    try:
        asyncio.run(run(url))
    except KeyboardInterrupt:
        log.info("Stopped")


if __name__ == "__main__":
    main()
