#!/usr/bin/env python3
"""
SLAM Navigation Triangle Manual  (main program)

This integration test uses the real hardware modules in src/slam, src/control, and src/sensors
to drive the robot along a triangular path while performing SLAM, and streams live updates to
the triangle viewer server (robot/tests/manual_tests/triangle_viewer.py).

Requirements:
    pip install websockets numpy
    sudo apt-get install -y i2c-tools
    pip install adafruit-circuitpython-pca9685 gpiozero smbus2 pyserial

Usage:
    # Start the viewer on a laptop (or this machine):
    python robot/tests/manual_tests/triangle_viewer.py --host 0.0.0.0 --port 8765

    # Run the robot integration test with streaming enabled:
    sudo python robot/tests/manual_tests/slam_navigation_triangle_test.py ^
      --viewer ws://<viewer-ip>:8765 --lidar-port COM3

Notes:
    - This test is intended for on-robot use with real hardware.
    - Emergency stop: Ctrl+C will stop all motors and shut down sensors.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import gzip
import json
import logging
import math
import signal
import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from collections import deque
from typing import Any, Callable, Deque, Dict, List, Optional, Sequence, Tuple

import numpy as np

# Make 'src' importable when running this script directly
_THIS_FILE = Path(__file__).resolve()
# _THIS_FILE is robot/src/main.py, so parents[1] is robot/
_ROBOT_DIR = _THIS_FILE.parents[1]  # .../RoboMop/robot
if str(_ROBOT_DIR) not in sys.path:
    sys.path.insert(0, str(_ROBOT_DIR))

# Hardware libraries (import guarded to give nice errors if missing)
try:
    import board  # type: ignore
    import busio  # type: ignore
except Exception as exc:  # pragma: no cover - hardware-only
    raise ImportError("board/busio are required (Adafruit Blinka). Install: pip install adafruit-blinka") from exc

try:
    from adafruit_pca9685 import PCA9685  # type: ignore
except Exception as exc:  # pragma: no cover - hardware-only
    raise ImportError("PCA9685 driver is required. Install: pip install adafruit-circuitpython-pca9685") from exc

try:
    from gpiozero import RotaryEncoder  # type: ignore
except Exception as exc:  # pragma: no cover - hardware-only
    raise ImportError("gpiozero is required for encoder reading. Install: pip install gpiozero") from exc

import websockets  # type: ignore

# Project modules
from src.control.motor_controller import (
    EncoderFeedback,
    MotorController,
    MotorControllerConfig,
    PIDSettings,
)
from src.control.pwm_controller import MotorChannelConfig, MotorDriver
from src.control.pid import PIDController
from src.control.robot_controller import Pose2D, RobotController
from src.sensors.encoders import EncoderReading, GpioZeroEncoderHardware, QuadratureEncoder
from src.sensors.imu import MPU9250
from src.sensors.lidar import LidarMeasurement, RPLidarSerial
from src.slam.occupancy_grid import OccupancyGrid
from src.slam.particle_filter import ParticleFilter
from src.slam.slam_manager import SlamManager
from src.navigation.astar import AStarPlanner, Frontier


# -----------------------------
# Constants and configurations
# -----------------------------

# Motor/encoder wiring from motor_encoder_test.py
MOTOR_CHANNELS: Tuple[Tuple[int, int], ...] = ((0, 1), (2, 3), (5, 4), (7, 6))
ENCODER_PINS: Tuple[Tuple[int, int], ...] = ((5, 6), (13, 26))  # two encoders
EXPECTED_MOTOR_TO_ENCODER: Dict[int, int] = {0: 0, 1: 0, 2: 1, 3: 1}
ENCODER_PPR: int = 400
PWM_FREQUENCY_HZ: int = 1000

DEFAULT_SUPPLY_VOLTAGE: float = 12.0
DEFAULT_LOOP_INTERVAL: float = 0.02  # 50 Hz motor loop

DEFAULT_WHEEL_RADIUS_M: float = 0.0762
DEFAULT_TRACK_WIDTH_M: float = 0.3

DEFAULT_MAX_LINEAR: float = 0.3
DEFAULT_MAX_ANGULAR: float = 0.8

DEFAULT_TRIANGLE_SIDE_M: float = 1.0

DEFAULT_GRID_RESOLUTION: float = 0.20  # 20 cm
DEFAULT_GRID_WIDTH: int = 300  # Reduced from 800 for performance (20m x 20m coverage)
DEFAULT_GRID_HEIGHT: int = 300  # Reduced from 800 for performance
DEFAULT_GRID_ORIGIN: Tuple[float, float, float] = (-10.0, -10.0, 0.0)  # Adjusted for smaller grid

DEFAULT_PARTICLES: int = 100  # Reduced from 200 for performance
DEFAULT_LIDAR_MAX_RANGE: float = 5.0

DEFAULT_MAP_WARMUP_SECONDS: float = 5.0

STATE_HZ: float = 10.0
MAP_HZ: float = 1.0
SLAM_HZ: float = 5.0

# Optimization settings
SLAM_SCAN_DOWNSAMPLE: int = 360  # Max points to process in SLAM (reduces CPU)
TRAJECTORY_STORE_INTERVAL: int = 5  # Store trajectory every N control iterations
SLAM_MOTION_THRESHOLD_M: float = 0.01  # Skip SLAM if moved less than this (meters)
SLAM_ROTATION_THRESHOLD_RAD: float = 0.02  # Skip SLAM if rotated less than this (radians)

# Exploration settings
EXPLORATION_REPLAN_INTERVAL: float = 3.0  # Seconds between frontier re-planning
EXPLORATION_INFLATION_RADIUS: int = 2  # Cells to inflate around obstacles

# To keep WebSocket payloads bounded, only publish this many frontier samples
EXPLORATION_FRONTIER_PUBLISH_LIMIT: int = 300

# -----------------------------
# Utility data structures
# -----------------------------

@dataclass(slots=True)
class ViewerClient:
    url: str
    websocket: Optional[Any] = None
    logger: logging.Logger = logging.getLogger("triangle_stream")
    _callback: Optional[Callable[[Dict[str, Any]], None]] = None
    _recv_task: Optional[asyncio.Task] = None

    def set_callback(self, callback: Callable[[Dict[str, Any]], None]) -> None:
        self._callback = callback

    async def connect(self) -> None:
        # If we have a stale connection reference, close it before reconnecting
        if self.websocket is not None and not self._is_open(self.websocket):
            try:
                await self.websocket.close()
            except Exception:
                pass
            self.websocket = None
        self.logger.info("Connecting to triangle viewer at %s", self.url)
        self.websocket = await websockets.connect(self.url, max_size=10 * 1024 * 1024)
        self.logger.info("Connected to triangle viewer")
        
        if self._recv_task:
            self._recv_task.cancel()
        self._recv_task = asyncio.create_task(self._receive_loop())

    async def _receive_loop(self) -> None:
        while True:
            if self.websocket is None or not self._is_open(self.websocket):
                await asyncio.sleep(1)
                continue
            try:
                async for message in self.websocket:
                    if self._callback:
                        try:
                            data = json.loads(message)
                            self._callback(data)
                        except Exception:
                            pass
            except Exception:
                pass
            await asyncio.sleep(1)

    async def send_update(self, payload: Dict[str, Any]) -> None:
        if self.websocket is None or not self._is_open(self.websocket):
            await self.connect()
        assert self.websocket is not None
        try:
            await self.websocket.send(json.dumps(payload))
        except Exception as exc:
            self.logger.warning("Viewer send failed: %s; reconnecting...", exc)
            try:
                await self.connect()
                await self.websocket.send(json.dumps(payload))
            except Exception as exc2:
                self.logger.error("Viewer reconnection/send failed: %s", exc2)

    async def close(self) -> None:
        if self.websocket is not None:
            try:
                await self.websocket.close()
            except Exception:
                pass
            self.websocket = None

    @staticmethod
    def _is_open(ws: Any) -> bool:
        """Compat check across websockets versions to determine if the connection is open."""
        try:
            closed = getattr(ws, "closed", None)
            if isinstance(closed, bool):
                return not closed
        except Exception:
            pass
        try:
            is_open = getattr(ws, "open", None)
            if isinstance(is_open, bool):
                return is_open
        except Exception:
            pass
        try:
            state = getattr(ws, "state", None)
            if isinstance(state, str):
                return state.upper() == "OPEN"
            name = getattr(state, "name", None)
            if isinstance(name, str):
                return name.upper() == "OPEN"
        except Exception:
            pass
        # Fallback: assume open; send() will raise if it's not
        return True


class EncoderFeedbackAdapter(EncoderFeedback):
    def __init__(self, encoders: Sequence[QuadratureEncoder]) -> None:
        self._encoders = list(encoders)

    def get_reading(self, encoder_index: int) -> EncoderReading:
        if encoder_index < 0 or encoder_index >= len(self._encoders):
            raise KeyError(f"Unknown encoder index {encoder_index}")
        return self._encoders[encoder_index].read()


class HeadingFusion:
    """Blends IMU yaw with wheel-odometry heading for improved estimates."""

    def __init__(self, *, blend: float, yaw_bias: float = 0.0, invert: bool = False) -> None:
        self._blend = max(0.0, min(1.0, blend))
        self._yaw_bias = yaw_bias
        self._invert = invert
        self._latest_yaw: Optional[float] = None
        self._lock = threading.Lock()

    def set_yaw_bias(self, bias: float) -> None:
        self._yaw_bias = bias

    def update_from_imu(self, raw_yaw: float) -> None:
        if self._invert:
            raw_yaw = -raw_yaw
        corrected = _wrap_angle(raw_yaw - self._yaw_bias)
        with self._lock:
            self._latest_yaw = corrected

    def fuse(self, odom_theta: float) -> float:
        with self._lock:
            imu_yaw = self._latest_yaw
        if imu_yaw is None:
            return odom_theta
        # Calculate shortest angular difference from odom to IMU
        diff = _wrap_angle(imu_yaw - odom_theta)
        # Apply blend factor to the difference
        blended = odom_theta + self._blend * diff
        return _wrap_angle(blended)

    def latest_heading(self) -> Optional[float]:
        with self._lock:
            return self._latest_yaw


def _mean_angle(values: Sequence[float]) -> float:
    if not values:
        return 0.0
    sin_sum = sum(math.sin(v) for v in values)
    cos_sum = sum(math.cos(v) for v in values)
    if sin_sum == 0.0 and cos_sum == 0.0:
        return 0.0
    return math.atan2(sin_sum, cos_sum)


async def _initialize_and_warmup_imu(
    imu: MPU9250,
    *,
    warmup_seconds: float,
    sample_rate_hz: float,
    logger: logging.Logger,
    invert: bool = False,
) -> float:
    """Initialize the IMU, run calibration, and collect samples to estimate yaw bias."""

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, imu.initialize)
    if warmup_seconds <= 0.0:
        return 0.0

    total_samples = max(10, int(warmup_seconds * sample_rate_hz))
    logger.info("Warming up IMU for %.1f s (%d samples)...", warmup_seconds, total_samples)
    yaw_samples: list[float] = []
    for _ in range(total_samples):
        sample = await loop.run_in_executor(None, imu.read_sample)
        yaw = sample.orientation.yaw
        if invert:
            yaw = -yaw
        yaw_samples.append(yaw)
        await asyncio.sleep(max(0.0, 1.0 / sample_rate_hz))
    bias = _mean_angle(yaw_samples)
    logger.info("IMU warmup complete (yaw bias %.3f rad)", bias)
    return bias


async def _warmup_map(
    *,
    lidar: RPLidarSerial,
    slam: SlamManager,
    warmup_seconds: float,
    logger: logging.Logger,
) -> int:
    """Integrate a few stationary scans into the map before navigation starts."""

    if warmup_seconds <= 0.0:
        return 0

    logger.info(
        "Warming up occupancy grid: integrating scans for %.1f s",
        warmup_seconds,
    )
    loop = asyncio.get_running_loop()
    scans_integrated = 0
    deadline = time.time() + warmup_seconds if warmup_seconds > 0.0 else None

    while True:
        if deadline is not None and time.time() >= deadline:
            break
        scan = await lidar.read_scan()
        filtered = [m for m in scan if m.quality > 0]
        if not filtered:
            continue
        if len(filtered) > SLAM_SCAN_DOWNSAMPLE:
            step = len(filtered) / SLAM_SCAN_DOWNSAMPLE
            filtered = [filtered[int(i * step)] for i in range(SLAM_SCAN_DOWNSAMPLE)]
        scan_array = np.array(
            [[m.angle_radians, max(0.0, float(m.distance_m))] for m in filtered],
            dtype=float,
        )
        control = np.zeros(3, dtype=float)
        covariance = np.diag(np.array([1e-5, 1e-5, 1e-4], dtype=float))
        try:
            await loop.run_in_executor(
                None,
                lambda: slam.step(
                    control=control,
                    process_covariance=covariance,
                    scan=scan_array,
                ),
            )
            scans_integrated += 1
        except Exception:
            logger.exception("Map warmup SLAM step failed; continuing")
    logger.info("Map warmup complete (%d scans integrated)", scans_integrated)
    return scans_integrated


class ImuSampler(threading.Thread):
    """Dedicated thread that samples the IMU at a fixed cadence."""

    def __init__(
        self,
        imu: MPU9250,
        fusion: HeadingFusion,
        *,
        sample_rate_hz: float,
        logger: logging.Logger,
    ) -> None:
        super().__init__(name="imu-sampler", daemon=True)
        self._imu = imu
        self._fusion = fusion
        self._logger = logger
        self._period = 1.0 / sample_rate_hz if sample_rate_hz > 0.0 else 0.05
        self._stop_event = threading.Event()
        self._last_heading: Optional[float] = None
        self._last_update: float = 0.0

    def run(self) -> None:
        next_deadline = time.perf_counter()
        while not self._stop_event.is_set():
            try:
                sample = self._imu.read_sample()
            except Exception as exc:  # pragma: no cover - hardware error path
                self._logger.warning("IMU read failed: %s", exc)
                time.sleep(0.1)
                next_deadline = time.perf_counter() + self._period
                continue

            heading = sample.orientation.yaw
            self._fusion.update_from_imu(heading)
            self._last_heading = heading
            self._last_update = time.time()

            next_deadline += self._period
            sleep_time = next_deadline - time.perf_counter()
            if sleep_time > 0.0:
                time.sleep(sleep_time)
            else:
                next_deadline = time.perf_counter() + self._period

    def stop(self) -> None:
        self._stop_event.set()
        self.join(timeout=1.0)
        _close_imu_bus(self._imu, self._logger)

    def latest_heading_deg(self) -> Optional[float]:
        if self._last_heading is None:
            return None
        return math.degrees(self._last_heading)

    def seconds_since_update(self) -> Optional[float]:
        if self._last_update <= 0.0:
            return None
        return time.time() - self._last_update


def _close_imu_bus(imu: MPU9250, logger: logging.Logger) -> None:
    """Best-effort closure of the underlying SMBus."""

    try:
        bus = getattr(imu, "_bus", None)
        if bus is not None:
            try:
                bus.close()
            finally:
                setattr(imu, "_bus", None)
    except Exception as exc:  # pragma: no cover - hardware cleanup path
        logger.warning("Failed to close IMU bus: %s", exc)


# -----------------------------
# High-level test controller
# -----------------------------

class TriangleSlamNavigator:
    def __init__(
        self,
        *,
        lidar: RPLidarSerial,
        motor_controller: MotorController,
        robot_controller: RobotController,
        slam: SlamManager,
        planned_vertices: Sequence[Tuple[float, float]],
        viewer: Optional[ViewerClient],
        heading_fusion: Optional[HeadingFusion],
        imu_sampler: Optional[ImuSampler],
        lidar_max_range: float,
        slam_update_hz: float,
        map_hz: float,
        state_hz: float,
        logger: logging.Logger,
    ) -> None:
        self._lidar = lidar
        self._motor = motor_controller
        self._robot = robot_controller
        self._slam = slam
        self._viewer = viewer
        self._heading_fusion = heading_fusion
        self._imu_sampler = imu_sampler
        self._logger = logger
        self._lidar_max_range = float(lidar_max_range)
        self._slam_period = 1.0 / float(slam_update_hz)
        self._map_period = 1.0 / float(map_hz)
        self._state_period = 1.0 / float(state_hz)

        self._nav_path: List[Tuple[float, float]] = list(planned_vertices)
        self._nav_waypoint_index: int = 0
        self._trajectory: Deque[Tuple[float, float]] = deque(maxlen=2000)
        self._trajectory_lock = threading.Lock()
        self._pose_lock = threading.Lock()
        self._pose_snapshot: Pose2D = Pose2D()
        self._slam_pose: Optional[Pose2D] = None
        self._last_pose_for_slam: Optional[Pose2D] = None
        self._latest_scan: List[LidarMeasurement] = []
        self._running = False
        self._estop_active = False
        
        # Control mode state
        self._control_mode: str = "navigation"  # "navigation", "exploration", or "manual"
        self._manual_cmd: Tuple[float, float] = (0.0, 0.0)  # linear, angular
        self._control_lock = threading.Lock()
        
        # Optimization: trajectory storage counter to reduce lock contention
        self._trajectory_store_counter: int = 0
        
        # Exploration mode state
        self._astar_planner: AStarPlanner = AStarPlanner(
            grid=slam.occupancy_grid,
            obstacle_threshold=200,
            inflation_radius=EXPLORATION_INFLATION_RADIUS,
            allow_diagonal=False,
        )
        self._exploration_path: List[Tuple[float, float]] = []
        self._exploration_waypoint_idx: int = 0
        self._current_frontier: Optional[Frontier] = None
        self._last_replan_time: float = 0.0
        self._exploration_complete: bool = False
        self._frontier_points: List[Tuple[float, float]] = []
        self._frontier_lock = threading.Lock()

    def set_control_mode(self, mode: str) -> None:
        with self._control_lock:
            if mode not in ("navigation", "exploration", "manual"):
                self._logger.warning("Invalid control mode: %s", mode)
                return
            if mode != self._control_mode:
                self._logger.info("Switching control mode: %s -> %s", self._control_mode, mode)
                old_mode = self._control_mode
                self._control_mode = mode
                # Reset commands when switching
                self._manual_cmd = (0.0, 0.0)
                if mode == "manual":
                    # Cancel any active goals
                    self._robot.cancel_goal()
                    self._robot.set_velocity_command(linear=0.0, angular=0.0)
                if mode == "exploration":
                    # Reset exploration state for fresh start
                    self._exploration_path = []
                    self._exploration_waypoint_idx = 0
                    self._current_frontier = None
                    self._last_replan_time = 0.0
                    self._exploration_complete = False
                    self._clear_frontiers()
                elif old_mode == "exploration":
                    # Clear exploration state when leaving exploration mode
                    self._exploration_path = []
                    self._exploration_waypoint_idx = 0
                    self._current_frontier = None
                    self._clear_frontiers()

    def set_manual_velocity(self, linear: float, angular: float) -> None:
        with self._control_lock:
            self._manual_cmd = (linear, angular)

    def set_estop(self, enabled: bool) -> None:
        if enabled == self._estop_active:
            return
        self._estop_active = enabled
        if enabled:
            self._logger.warning("E-STOP ENABLED! Stopping motors.")
            try:
                self._motor.stop_all()
            except Exception as e:
                self._logger.error(f"Failed to stop motors on E-stop: {e}")
        else:
            self._logger.info("E-STOP DISABLED. Resuming.")

    async def run(self) -> None:
        self._running = True
        try:
            await self._run_all_tasks()
        finally:
            self._running = False

    async def _run_all_tasks(self) -> None:
        tasks = [
            asyncio.create_task(self._run_control_thread(), name="control-loop"),
            asyncio.create_task(self._slam_loop(), name="slam-loop"),
            asyncio.create_task(self._viewer_loop(), name="viewer-loop"),
        ]
        try:
            await asyncio.wait(tasks, return_when=asyncio.FIRST_EXCEPTION)
        finally:
            self._running = False
            for task in tasks:
                if not task.done():
                    task.cancel()
            for task in tasks:
                try:
                    await task
                except asyncio.CancelledError:
                    pass
                except Exception:
                    self._logger.exception("Task %s failed", task.get_name())

    async def _run_control_thread(self) -> None:
        await asyncio.to_thread(self._control_loop_thread)

    def _control_loop_thread(self) -> None:
        """High-rate robot control loop running in a dedicated OS thread."""
        loop_interval = self._motor.loop_interval
        self._logger.info("Starting control loop thread at %.1f Hz", 1.0 / loop_interval)
        
        # Initial fused pose update
        self._update_fused_pose_and_reset_robot()
        
        last_time = time.perf_counter()
        next_tick = last_time + loop_interval
        while self._running:
            now = time.perf_counter()
            
            if self._estop_active:
                try:
                     self._motor.stop_all()
                except Exception:
                     pass
                # Maintain loop timing but skip PID update
                last_time = now
                sleep_time = next_tick - time.perf_counter()
                if sleep_time > 0.0:
                    time.sleep(sleep_time)
                    next_tick += loop_interval
                else:
                    next_tick = time.perf_counter() + loop_interval
                continue

            dt = max(1e-4, now - last_time)
            last_time = now

            try:
                # Update fusion and FORCE the robot controller to adopt the fused heading
                self._update_fused_pose_and_reset_robot()
                
                # Determine control source based on mode
                is_manual = False
                manual_linear, manual_angular = 0.0, 0.0
                
                with self._control_lock:
                    if self._control_mode == "manual":
                        is_manual = True
                        manual_linear, manual_angular = self._manual_cmd
                
                if is_manual:
                    self._robot.set_velocity_command(linear=manual_linear, angular=manual_angular)
                elif self._control_mode == "exploration":
                    self._update_exploration_control()
                elif self._control_mode == "navigation" and self._nav_path:
                    self._update_pure_pursuit_control()
                    
                self._robot.update(dt=dt)
            except Exception:
                self._logger.exception("Control/Navigation update failed")

            sleep_time = next_tick - time.perf_counter()
            if sleep_time > 0.0:
                time.sleep(sleep_time)
                next_tick += loop_interval
            else:
                next_tick = time.perf_counter() + loop_interval

    def _update_fused_pose_and_reset_robot(self) -> None:
        """
        Get current robot odometry, fuse it with IMU, and then
        OVERWRITE the robot's internal pose with the fused result.
        This ensures navigation decisions use the fused heading.
        """
        pose = self._robot.pose
        theta = pose.theta
        if self._heading_fusion is not None:
            theta = self._heading_fusion.fuse(theta)
        
        # Create the fused pose
        fused = Pose2D(pose.x, pose.y, theta)
        
        # CRITICAL: Update the robot controller's internal state so it knows its true heading
        # We preserve x/y from odometry but force the fused theta
        self._robot.reset_pose(fused)
        
        self._set_pose_snapshot(fused)
        
        # Optimization: Only store trajectory every N iterations to reduce lock contention
        self._trajectory_store_counter += 1
        if self._trajectory_store_counter >= TRAJECTORY_STORE_INTERVAL:
            self._trajectory_store_counter = 0
            self._append_trajectory(fused)

    def _update_pure_pursuit_control(
        self,
        path: Optional[Sequence[Tuple[float, float]]] = None,
        *,
        waypoint_attr: str = "_nav_waypoint_index",
        loop_path: bool = True,
        lookahead: float = 0.3,
        cruise_speed: float = 0.2,
        log_advances: bool = True,
    ) -> None:
        """Generic pure-pursuit follower used by both navigation and exploration."""

        if path is None:
            path = self._nav_path
        if not path or len(path) < 2:
            self._robot.set_velocity_command(linear=0.0, angular=0.0)
            return

        path_len = len(path)
        target_idx = getattr(self, waypoint_attr)

        if target_idx >= path_len:
            if loop_path and path_len > 1:
                target_idx = 1
            else:
                setattr(self, waypoint_attr, path_len)
                self._robot.set_velocity_command(linear=0.0, angular=0.0)
                return

        if not loop_path and target_idx <= 0 and path_len > 1:
            target_idx = 1

        pose = self._robot.pose
        p_robot = np.array([pose.x, pose.y])

        prev_idx = (target_idx - 1) % path_len if loop_path else max(0, target_idx - 1)
        p_start = np.array(path[prev_idx])
        p_end = np.array(path[target_idx])

        segment_vec = p_end - p_start
        segment_len = np.linalg.norm(segment_vec)

        if segment_len < 1e-3:
            # Degenerate segment; advance to next waypoint
            old_idx = target_idx
            target_idx += 1
            if loop_path and target_idx >= path_len and path_len > 1:
                target_idx = 1
            setattr(self, waypoint_attr, target_idx)
            if log_advances:
                self._logger.info("Advancing waypoint: %d -> %d (degenerate)", old_idx, target_idx)
            return

        segment_dir = segment_vec / segment_len

        # Project robot onto line segment
        robot_vec = p_robot - p_start
        proj_dist = np.dot(robot_vec, segment_dir)

        # Lookahead point logic
        lookahead_dist_on_line = proj_dist + lookahead

        # Check distance to target vertex
        dist_to_end = np.linalg.norm(p_end - p_robot)

        if dist_to_end < lookahead:
            old_idx = target_idx
            target_idx += 1
            if target_idx >= path_len:
                if loop_path and path_len > 1:
                    target_idx = 1
                    if log_advances:
                        self._logger.info("Advancing waypoint: %d -> %d", old_idx, target_idx)
                else:
                    setattr(self, waypoint_attr, path_len)
                    self._robot.set_velocity_command(linear=0.0, angular=0.0)
                    return
            else:
                if log_advances:
                    self._logger.info("Advancing waypoint: %d -> %d", old_idx, target_idx)
            setattr(self, waypoint_attr, target_idx)
            return

        # Clamp lookahead to segment length
        clamp_dist = max(0.0, min(lookahead_dist_on_line, segment_len))
        lookahead_pt = p_start + segment_dir * clamp_dist

        # Calculate curvature to lookahead point
        dx = lookahead_pt[0] - pose.x
        dy = lookahead_pt[1] - pose.y

        # Transform to robot frame
        sin_t = math.sin(pose.theta)
        cos_t = math.cos(pose.theta)
        local_x = cos_t * dx + sin_t * dy
        local_y = -sin_t * dx + cos_t * dy

        # Curvature = 2*y / L^2
        l_sq = local_x**2 + local_y**2
        if l_sq < 1e-4:
            omega = 0.0
            linear_cmd = cruise_speed
        else:
            curvature = 2.0 * local_y / l_sq

            # Calculate heading error to lookahead point
            heading_error = math.atan2(local_y, local_x)

            # Scale linear speed based on heading error (slow down for turns)
            if abs(heading_error) > math.pi / 3.0:
                linear_cmd = 0.0
                omega = math.copysign(0.5, heading_error)
            else:
                scale = max(0.1, math.cos(heading_error) ** 2)
                linear_cmd = cruise_speed * scale
                omega = cruise_speed * curvature

        # Clamp omega for safety
        max_omega = self._robot.max_angular_speed
        omega = max(-max_omega, min(max_omega, omega))

        self._robot.set_velocity_command(linear=linear_cmd, angular=omega)
        setattr(self, waypoint_attr, target_idx)

    def _update_exploration_control(self) -> None:
        """Control loop for exploration mode - reuse navigation controller with frontier paths."""
        if self._exploration_complete:
            self._robot.set_velocity_command(linear=0.0, angular=0.0)
            return

        now = time.time()
        path_ready = (
            len(self._exploration_path) >= 2
            and self._exploration_waypoint_idx < len(self._exploration_path)
        )
        need_replan = (not path_ready) or (now - self._last_replan_time > EXPLORATION_REPLAN_INTERVAL)

        if need_replan:
            self._replan_exploration()
            path_ready = (
                len(self._exploration_path) >= 2
                and self._exploration_waypoint_idx < len(self._exploration_path)
            )
            if not path_ready:
                self._robot.set_velocity_command(linear=0.0, angular=0.0)
                return

        self._update_pure_pursuit_control(
            path=self._exploration_path,
            waypoint_attr="_exploration_waypoint_idx",
            loop_path=False,
            log_advances=False,
        )
    
    def _replan_exploration(self) -> None:
        """Plan a path to the nearest frontier."""
        pose = self._robot.pose
        start = (pose.x, pose.y)
        
        result = self._astar_planner.plan_to_nearest_frontier(start)
        self._capture_frontiers_from_planner()
        
        if result is None:
            # No reachable frontiers - exploration complete
            self._exploration_path = []
            self._exploration_waypoint_idx = 0
            self._current_frontier = None
            self._exploration_complete = True
            self._logger.info("Exploration complete - no more reachable frontiers")
            return
        
        frontier, path = result
        self._current_frontier = frontier
        full_path: List[Tuple[float, float]] = [start]
        full_path.extend(path)
        if len(full_path) < 2:
            self._exploration_path = []
            self._exploration_waypoint_idx = 0
            return
        self._exploration_path = full_path
        self._exploration_waypoint_idx = 1
        self._exploration_complete = False
        self._last_replan_time = time.time()
        self._logger.info(
            "Exploration: replanned to frontier at (%.2f, %.2f), path has %d waypoints",
            frontier.world[0],
            frontier.world[1],
            len(full_path),
        )

    # _update_fused_pose is replaced by _update_fused_pose_and_reset_robot
    
    def _set_pose_snapshot(self, pose: Pose2D) -> None:
        with self._pose_lock:
            self._pose_snapshot = pose

    def _get_pose_snapshot(self) -> Pose2D:
        with self._pose_lock:
            snapshot = self._pose_snapshot
        return Pose2D(snapshot.x, snapshot.y, snapshot.theta)

    def _append_trajectory(self, pose: Pose2D) -> None:
        with self._trajectory_lock:
            self._trajectory.append((pose.x, pose.y))

    def _get_recent_trajectory(self) -> List[Tuple[float, float]]:
        with self._trajectory_lock:
            return list(self._trajectory)

    def _set_frontiers(self, points: Sequence[Tuple[float, float]]) -> None:
        with self._frontier_lock:
            self._frontier_points = list(points)

    def _get_frontiers(self) -> List[Tuple[float, float]]:
        with self._frontier_lock:
            return list(self._frontier_points)

    def _clear_frontiers(self) -> None:
        self._set_frontiers([])

    def _capture_frontiers_from_planner(self) -> None:
        """Convert planner frontier cells into world coordinates for visualization."""
        cells = sorted(self._astar_planner.frontier_cells)
        if not cells:
            self._clear_frontiers()
            return

        grid = self._slam.occupancy_grid
        origin_x, origin_y, _ = grid.origin
        resolution = grid.resolution

        points: List[Tuple[float, float]] = []
        for row, col in cells:
            x = origin_x + (col + 0.5) * resolution
            y = origin_y + (row + 0.5) * resolution
            points.append((x, y))

        if len(points) > EXPLORATION_FRONTIER_PUBLISH_LIMIT:
            step = len(points) / EXPLORATION_FRONTIER_PUBLISH_LIMIT
            sampled: List[Tuple[float, float]] = []
            for idx in range(EXPLORATION_FRONTIER_PUBLISH_LIMIT):
                sampled.append(points[int(idx * step)])
            points = sampled

        self._set_frontiers(points)

    async def _slam_loop(self) -> None:
        """Lower-rate loop that waits for full LIDAR scans and updates SLAM."""
        self._logger.info("Starting SLAM loop at %.1f Hz (scan-blocking)", 1.0 / self._slam_period)
        # Initialize last pose for odometry delta
        fused = self._get_pose_snapshot()
        self._last_pose_for_slam = Pose2D(fused.x, fused.y, fused.theta)
        
        loop = asyncio.get_running_loop()
        
        while self._running:
            # Read one full revolution
            scan = await self._lidar.read_scan()
            self._latest_scan = scan
            if not scan:
                continue
            
            # Build scan array with quality filter
            # Filter out low-quality measurements (quality=0) to avoid "ghost" obstacles/rays
            filtered_scan = [m for m in scan if m.quality > 0]
            if not filtered_scan:
                continue
            
            # Optimization: Downsample scan to reduce SLAM computation
            if len(filtered_scan) > SLAM_SCAN_DOWNSAMPLE:
                step = len(filtered_scan) / SLAM_SCAN_DOWNSAMPLE
                filtered_scan = [filtered_scan[int(i * step)] for i in range(SLAM_SCAN_DOWNSAMPLE)]
            
            scan_array = np.array(
                [[m.angle_radians, max(0.0, float(m.distance_m))] for m in filtered_scan],
                dtype=float,
            )
            
            # Compute body-frame odometry delta since last SLAM step
            assert self._last_pose_for_slam is not None
            prev = self._last_pose_for_slam
            curr = self._get_pose_snapshot()
            dx_world = curr.x - prev.x
            dy_world = curr.y - prev.y
            dtheta = _wrap_angle(curr.theta - prev.theta)
            
            # Optimization: Skip SLAM update if robot hasn't moved significantly
            linear_motion = math.hypot(dx_world, dy_world)
            angular_motion = abs(dtheta)
            if linear_motion < SLAM_MOTION_THRESHOLD_M and angular_motion < SLAM_ROTATION_THRESHOLD_RAD:
                # Still update latest scan for visualization, but skip heavy SLAM computation
                await asyncio.sleep(0.01)  # Small yield
                continue
            
            # Rotate world delta into body frame using previous heading
            cos_h = math.cos(prev.theta)
            sin_h = math.sin(prev.theta)
            dx_body = cos_h * dx_world + sin_h * dy_world
            dy_body = -sin_h * dx_world + cos_h * dy_world

            control = np.array([dx_body, dy_body, dtheta], dtype=float)
            # Process covariance (scaled by motion to prevent diffusion when stationary)
            lin_sigma = max(1e-4, 0.2 * abs(dx_body))
            side_sigma = max(1e-4, 0.1 * abs(dx_body))
            ang_sigma = max(1e-3, 0.2 * abs(dtheta))
            cov = np.diag([lin_sigma**2, side_sigma**2, ang_sigma**2])
            
            # Capture variables for lambda closure
            ctrl = control
            covariance = cov
            scan_data = scan_array
            
            # Optimization: Run SLAM step in thread pool to not block event loop
            try:
                slam_mean, _ = await loop.run_in_executor(
                    None,  # Use default thread pool
                    lambda: self._slam.step(
                        control=ctrl,
                        process_covariance=covariance,
                        scan=scan_data,
                    )
                )
                # Update SLAM pose for visualization
                self._slam_pose = Pose2D(slam_mean[0], slam_mean[1], slam_mean[2])
                self._last_pose_for_slam = Pose2D(curr.x, curr.y, curr.theta)
            except Exception:
                self._logger.exception("SLAM step failed")
            # Rate pacing (we already block on scan; small sleep to avoid tight loop if scan is fast)
            await asyncio.sleep(0.0)

    async def _viewer_loop(self) -> None:
        if self._viewer is None:
            return
        state_period = self._state_period
        map_period = self._map_period
        loop = asyncio.get_running_loop()
        next_state = loop.time()
        next_map = next_state
        self._logger.info("Starting viewer loop: state=%.1f Hz, map=%.1f Hz", 1.0 / state_period, 1.0 / map_period)
        while self._running:
            now = loop.time()
            if now >= next_state:
                await self._send_state_update()
                next_state = now + state_period
            if now >= next_map:
                await self._send_map_update()
                next_map = now + map_period
            
            # Optimization: Calculate exact sleep time instead of busy-polling
            time_to_state = max(0.0, next_state - loop.time())
            time_to_map = max(0.0, next_map - loop.time())
            sleep_time = min(time_to_state, time_to_map)
            # Ensure minimum sleep to prevent busy loop, but allow event loop to process
            await asyncio.sleep(max(0.001, sleep_time))

    async def _send_state_update(self) -> None:
        if self._viewer is None:
            return
        pose = self._get_pose_snapshot()
        # Use SLAM pose if available for visualization alignment with map
        display_pose = self._slam_pose if self._slam_pose is not None else pose
        scan_subset = self._downsample_scan(self._latest_scan, max_samples=360)
        with self._control_lock:
            control_mode = self._control_mode
        
        payload: Dict[str, Any] = {
            "type": "triangle_update",
            "pose": {"x": display_pose.x, "y": display_pose.y, "theta": display_pose.theta},
            "poseHeadingDeg": math.degrees(display_pose.theta),
            "trajectory": self._get_recent_trajectory(),
            "plannedVertices": list(self._nav_path),
            "lidarScan": [
                [float(m.angle_radians), float(max(0.0, m.distance_m))] for m in scan_subset
            ],
            "odomPose": {"x": pose.x, "y": pose.y, "theta": pose.theta},
            "controlMode": control_mode,
        }
        
        # Add exploration data
        payload["explorationPath"] = list(self._exploration_path)
        payload["explorationComplete"] = self._exploration_complete
        if self._current_frontier is not None:
            payload["frontierTarget"] = {
                "x": self._current_frontier.world[0],
                "y": self._current_frontier.world[1],
            }
        
        payload["frontiers"] = self._get_frontiers() if control_mode == "exploration" else []
        
        if self._imu_sampler is not None:
            imu_heading = self._imu_sampler.latest_heading_deg()
            if imu_heading is not None:
                payload["imuHeadingDeg"] = imu_heading
                age = self._imu_sampler.seconds_since_update()
                if age is not None:
                    payload["imuHeadingAgeSec"] = age
        await self._viewer.send_update(payload)

    async def _send_map_update(self) -> None:
        if self._viewer is None:
            return
        grid: OccupancyGrid = self._slam.occupancy_grid
        
        # Optimization: Run compression in thread pool to not block event loop
        # 800x800 grid = 640KB, gzip is CPU-intensive
        loop = asyncio.get_running_loop()
        
        def _compress_map() -> str:
            data_bytes = grid.array.tobytes(order="C")
            compressed = gzip.compress(data_bytes, compresslevel=1)  # Faster compression
            return base64.b64encode(compressed).decode("ascii")
        
        b64 = await loop.run_in_executor(None, _compress_map)
        
        payload: Dict[str, Any] = {
            "type": "triangle_update",
            "map": {
                "width": grid.width,
                "height": grid.height,
                "resolution": grid.resolution,
                "origin": {"x": grid.origin[0], "y": grid.origin[1], "theta": grid.origin[2]},
                "data": b64,
                "encoding": "gzip+base64",
            },
        }
        await self._viewer.send_update(payload)

    def _downsample_scan(
        self, scan: Sequence[LidarMeasurement], *, max_samples: int = 360
    ) -> list[LidarMeasurement]:
        if max_samples <= 0:
            raise ValueError("max_samples must be positive")
        if not scan:
            return []
        if len(scan) <= max_samples:
            return list(scan)
        if max_samples == 1:
            return [scan[0]]
        step = (len(scan) - 1) / float(max_samples - 1)
        downsampled: list[LidarMeasurement] = []
        for i in range(max_samples):
            idx = min(len(scan) - 1, int(round(i * step)))
            downsampled.append(scan[idx])
        return downsampled


# -----------------------------
# Main setup/teardown
# -----------------------------

def _wrap_angle(angle: float) -> float:
    return (angle + math.pi) % (2.0 * math.pi) - math.pi


def build_triangle_vertices(side_m: float) -> List[Tuple[float, float]]:
    h = math.sqrt(3) / 2.0 * side_m
    return [(0.0, 0.0), (side_m, 0.0), (0.5 * side_m, h)]


def _build_motor_driver_and_controller(
    *,
    supply_voltage: float,
    loop_interval: float,
    wheel_radius_m: float,
    track_width_m: float,
    max_linear: float,
    max_angular: float,
) -> Tuple[MotorDriver, MotorController, RobotController, List[QuadratureEncoder]]:
    # PCA9685
    i2c = busio.I2C(board.SCL, board.SDA)
    pwm = PCA9685(i2c)
    pwm.frequency = PWM_FREQUENCY_HZ
    # Motor channel configs (indices 0..3)
    motor_configs = [
        MotorChannelConfig(index=0, forward_channel=MOTOR_CHANNELS[0][0], reverse_channel=MOTOR_CHANNELS[0][1]),
        MotorChannelConfig(index=1, forward_channel=MOTOR_CHANNELS[1][0], reverse_channel=MOTOR_CHANNELS[1][1]),
        MotorChannelConfig(index=2, forward_channel=MOTOR_CHANNELS[2][0], reverse_channel=MOTOR_CHANNELS[2][1]),
        MotorChannelConfig(index=3, forward_channel=MOTOR_CHANNELS[3][0], reverse_channel=MOTOR_CHANNELS[3][1]),
    ]
    driver = MotorDriver(pwm_board=pwm, motor_configs=motor_configs, supply_voltage=supply_voltage)
    # Encoders (two units; left and right)
    circumference = 2.0 * math.pi * wheel_radius_m
    gpio_encoders: List[QuadratureEncoder] = []
    for pin_a, pin_b in ENCODER_PINS:
        hw = GpioZeroEncoderHardware(pin_a=pin_a, pin_b=pin_b, max_steps=0, rotary_cls=RotaryEncoder)
        enc = QuadratureEncoder(
            hardware=hw,
            counts_per_revolution=ENCODER_PPR,
            gear_ratio=1.0,
            wheel_circumference_m=circumference,
            invert=False,
        )
        enc.zero()
        gpio_encoders.append(enc)
    # Motor controller config (feedforward with conservative defaults)
    motor_cfg = MotorControllerConfig(
        motor_to_encoder=EXPECTED_MOTOR_TO_ENCODER,
        gear_ratio=1.0,
        rotor_inertia=1.0e-4,
        viscous_friction=1.0e-3,
        torque_constant=0.05,
        back_emf_constant=0.05,
        winding_resistance=2.0,
        loop_interval=loop_interval,
        pid=PIDSettings(
            kp=0.4,
            ki=1.2,
            kd=0.0,
            integrator_limit=supply_voltage,
            output_limits=(-supply_voltage, supply_voltage),
        ),
    )
    feedback = EncoderFeedbackAdapter(gpio_encoders)
    motor_controller = MotorController(driver=driver, encoder_feedback=feedback, config=motor_cfg)
    # High-level robot controller
    # Tuned for stability with fused IMU feedback (lower gains to prevent oscillation)
    position_pid = PIDController(
        kp=0.5, ki=0.05, kd=0.05, integrator_limit=0.5, output_limits=(-max_linear, max_linear)
    )
    heading_pid = PIDController(
        kp=1.2, ki=0.05, kd=0.1, integrator_limit=0.8, output_limits=(-max_angular, max_angular)
    )
    robot = RobotController(
        motor_controller=motor_controller,
        track_width=track_width_m,
        wheel_radius=wheel_radius_m,
        left_motor_indices=(0, 1),
        right_motor_indices=(2, 3),
        position_pid=position_pid,
        heading_pid=heading_pid,
        max_linear_speed=max_linear,
        max_angular_speed=max_angular,
    )
    return driver, motor_controller, robot, gpio_encoders


def _build_slam(
    *,
    grid_resolution: float,
    grid_width: int,
    grid_height: int,
    grid_origin: Tuple[float, float, float],
    particles: int,
    lidar_max_range: float,
) -> SlamManager:
    grid = OccupancyGrid(
        width=grid_width,
        height=grid_height,
        resolution=grid_resolution,
        origin=grid_origin,
    )
    pf = ParticleFilter(particle_count=particles)
    pf.initialize_gaussian(mean=[0.0, 0.0, 0.0], covariance=np.diag([0.05, 0.05, math.radians(10.0) ** 2]))
    slam = SlamManager(
        occupancy_grid=grid,
        particle_filter=pf,
        resample_threshold=0.5,
        occupied_value=220,
        free_value=40,
        max_range=lidar_max_range,
        sensor_pose=(0.0, 0.0, 0.0),
    )
    return slam


async def _preflight_checks(
    *,
    lidar: RPLidarSerial,
    logger: logging.Logger,
) -> None:
    logger.info("Running preflight checks (LIDAR info/health)...")
    try:
        info = await lidar.get_device_info()
        health = await lidar.get_health()
        logger.info("RPLIDAR info: %s", info.hex())
        logger.info("RPLIDAR health: %s", health.hex())
    except Exception as exc:
        logger.warning("RPLIDAR info/health check failed: %s (continuing)", exc)


async def run_test(args: argparse.Namespace) -> None:
    logger = logging.getLogger("triangle_test")
    logger.info("Initializing hardware...")

    imu: Optional[MPU9250] = None
    heading_fusion: Optional[HeadingFusion] = None
    imu_sampler: Optional[ImuSampler] = None

    # LIDAR
    lidar = RPLidarSerial(port=args.lidar_port, baud_rate=args.lidar_baud, serial_timeout=args.lidar_timeout)
    await lidar.connect()
    # Ensure we are not scanning so we can run preflight checks cleanly
    await lidar.stop(close_serial=False)

    # Preflight checks
    logger.info("Preflight checks...")
    await _preflight_checks(lidar=lidar, logger=logger)
    
    # IMU (optional)
    if args.use_imu:
        try:
            imu = MPU9250(
                bus=args.imu_bus,
                address=args.imu_address,
                sample_rate_hz=args.imu_rate,
                gyro_scale_correction=args.gyro_scale,
                enable_magnetometer=args.use_mag,
            )
        except Exception:
            imu = None
            logger.exception("Failed to initialize IMU; continuing without IMU fusion")

    # Motors/encoders and robot controller
    driver, motor_controller, robot, encoders = _build_motor_driver_and_controller(
        supply_voltage=args.supply_voltage,
        loop_interval=args.loop_interval,
        wheel_radius_m=args.wheel_radius,
        track_width_m=args.track_width,
        max_linear=args.max_linear,
        max_angular=args.max_angular,
    )

    # SLAM
    slam = _build_slam(
        grid_resolution=args.grid_resolution,
        grid_width=args.grid_width,
        grid_height=args.grid_height,
        grid_origin=(args.grid_origin_x, args.grid_origin_y, args.grid_origin_theta),
        particles=args.particles,
        lidar_max_range=args.lidar_max_range,
    )

    # Viewer
    viewer = ViewerClient(url=args.viewer) if args.viewer else None
    if viewer is not None:
        await viewer.connect()

    # Planned triangle
    planned = build_triangle_vertices(args.triangle_side)
    # Close the loop visually
    planned.append(planned[0])

    logger.info("Starting LIDAR scan...")
    await lidar.start()

    imu_warmup_task: Optional[asyncio.Task[float]] = None
    map_warmup_task: Optional[asyncio.Task[int]] = None
    warmup_entries: list[tuple[str, asyncio.Task[Any]]] = []
    yaw_bias: Optional[float] = None

    if imu is not None:
        imu_warmup_task = asyncio.create_task(
            _initialize_and_warmup_imu(
                imu,
                warmup_seconds=args.imu_warmup,
                sample_rate_hz=args.imu_rate,
                logger=logger,
                invert=args.invert_imu,
            ),
            name="imu-warmup",
        )
        warmup_entries.append(("imu", imu_warmup_task))

    if args.map_warmup_seconds > 0.0:
        map_warmup_task = asyncio.create_task(
            _warmup_map(
                lidar=lidar,
                slam=slam,
                warmup_seconds=args.map_warmup_seconds,
                logger=logger,
            ),
            name="map-warmup",
        )
        warmup_entries.append(("map", map_warmup_task))

    if warmup_entries:
        logger.info(
            "Waiting for warmup tasks (map=%s, imu=%s)...",
            bool(map_warmup_task),
            bool(imu_warmup_task),
        )
        warmup_results = await asyncio.gather(
            *(task for _, task in warmup_entries),
            return_exceptions=True,
        )
        for (name, _), result in zip(warmup_entries, warmup_results):
            if isinstance(result, Exception):
                logger.warning("%s warmup failed: %s", name.upper(), result)
                if name == "imu" and imu is not None:
                    await asyncio.to_thread(_close_imu_bus, imu, logger)
                    imu = None
                continue
            if name == "imu":
                yaw_bias = float(result)
            elif name == "map":
                logger.info("Map warmup integrated %d scans", int(result))
    else:
        logger.info("Map/IMU warmup disabled; starting navigation immediately")

    if imu is not None:
        try:
            heading_fusion = HeadingFusion(
                blend=args.imu_heading_blend,
                yaw_bias=0.0 if yaw_bias is None else yaw_bias,
                invert=args.invert_imu,
            )
            imu_sampler = ImuSampler(
                imu=imu,
                fusion=heading_fusion,
                sample_rate_hz=args.imu_rate,
                logger=logger,
            )
            imu_sampler.start()
        except Exception:
            heading_fusion = None
            imu_sampler = None
            logger.exception("Failed to start IMU sampler; continuing without IMU fusion")

    # Navigator
    navigator = TriangleSlamNavigator(
        lidar=lidar,
        motor_controller=motor_controller,
        robot_controller=robot,
        slam=slam,
        planned_vertices=planned,
        viewer=viewer,
        heading_fusion=heading_fusion,
        imu_sampler=imu_sampler,
        lidar_max_range=args.lidar_max_range,
        slam_update_hz=SLAM_HZ,
        map_hz=MAP_HZ,
        state_hz=STATE_HZ,
        logger=logger,
    )

    if viewer is not None:
        def on_viewer_message(data: Dict[str, Any]) -> None:
            msg_type = data.get("type")
            if msg_type == "estop":
                enabled = bool(data.get("enabled", False))
                navigator.set_estop(enabled)
            elif msg_type == "control":
                command = data.get("command")
                if command == "set_mode":
                    mode = str(data.get("mode", "auto"))
                    navigator.set_control_mode(mode)
                elif command == "velocity":
                    lin = float(data.get("linear", 0.0))
                    ang = float(data.get("angular", 0.0))
                    navigator.set_manual_velocity(lin, ang)

        viewer.set_callback(on_viewer_message)

    # Graceful shutdown handler
    stop_event = asyncio.Event()

    def _handle_sigint() -> None:
        logger.info("SIGINT received, stopping...")
        stop_event.set()

    loop = asyncio.get_running_loop()
    try:
        loop.add_signal_handler(signal.SIGINT, _handle_sigint)  # type: ignore[attr-defined]
        loop.add_signal_handler(signal.SIGTERM, _handle_sigint)  # type: ignore[attr-defined]
    except NotImplementedError:
        # Windows event loop: signals not supported in Proactor loop
        pass

    async def _run_and_wait() -> None:
        await navigator.run()

    main_task = asyncio.create_task(_run_and_wait(), name="navigator")
    await stop_event.wait()
    # Cancel the navigator loop
    main_task.cancel()
    try:
        await main_task
    except asyncio.CancelledError:
        pass
    finally:
        logger.info("Shutting down...")
        if imu_sampler is not None:
            try:
                imu_sampler.stop()
            except Exception:
                logger.exception("Error while stopping IMU sampler")
        elif imu is not None:
            await asyncio.to_thread(_close_imu_bus, imu, logger)
        # Stop motors
        try:
            motor_controller.stop_all()
        except Exception:
            logger.exception("Error while stopping MotorController")
        try:
            driver.stop_all()
        except Exception:
            logger.exception("Error while stopping MotorDriver")
        # Close encoders
        for enc in encoders:
            try:
                enc.close()
            except Exception:
                logger.exception("Error while closing encoder")
        # Stop LIDAR
        try:
            await lidar.stop()
        except Exception:
            logger.exception("Error while stopping LIDAR")
        # Close viewer
        if viewer is not None:
            try:
                await viewer.close()
            except Exception:
                logger.exception("Error while closing viewer")


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="RoboMop SLAM Triangle Navigation Manual Test")
    parser.add_argument(
        "--viewer",
        type=str,
        default="ws://10.21.83.244:8765",
        help="Triangle viewer WebSocket URL (ws://host:port). Empty to disable streaming.",
    )
    parser.add_argument(
        "--lidar-port",
        type=str,
        default="/dev/ttyUSB0",
        help="Serial port for RPLIDAR (e.g., /dev/ttyUSB0 or COM3)",
    )
    parser.add_argument("--lidar-baud", type=int, default=1_000_000, help="RPLIDAR baud rate")
    parser.add_argument("--lidar-pwm", type=int, default=660, help="RPLIDAR motor PWM (A1/A2 models)")
    parser.add_argument(
        "--lidar-timeout",
        type=float,
        default=2.0,
        help="RPLIDAR serial read timeout (s); increase if you see timeouts",
    )

    parser.add_argument("--supply-voltage", type=float, default=DEFAULT_SUPPLY_VOLTAGE, help="Motor supply voltage (V)")
    parser.add_argument("--loop-interval", type=float, default=DEFAULT_LOOP_INTERVAL, help="Motor loop interval (s)")
    parser.add_argument("--wheel-radius", type=float, default=DEFAULT_WHEEL_RADIUS_M, help="Wheel radius (m)")
    parser.add_argument("--track-width", type=float, default=DEFAULT_TRACK_WIDTH_M, help="Track width (m)")
    parser.add_argument("--max-linear", type=float, default=DEFAULT_MAX_LINEAR, help="Max linear speed (m/s)")
    parser.add_argument("--max-angular", type=float, default=DEFAULT_MAX_ANGULAR, help="Max angular speed (rad/s)")

    parser.add_argument("--triangle-side", type=float, default=DEFAULT_TRIANGLE_SIDE_M, help="Triangle side length (m)")

    parser.add_argument("--grid-resolution", type=float, default=DEFAULT_GRID_RESOLUTION, help="Grid resolution (m)")
    parser.add_argument("--grid-width", type=int, default=DEFAULT_GRID_WIDTH, help="Grid width (cells)")
    parser.add_argument("--grid-height", type=int, default=DEFAULT_GRID_HEIGHT, help="Grid height (cells)")
    parser.add_argument("--grid-origin-x", type=float, default=DEFAULT_GRID_ORIGIN[0], help="Grid origin x (m)")
    parser.add_argument("--grid-origin-y", type=float, default=DEFAULT_GRID_ORIGIN[1], help="Grid origin y (m)")
    parser.add_argument("--grid-origin-theta", type=float, default=DEFAULT_GRID_ORIGIN[2], help="Grid origin theta (rad)")

    parser.add_argument("--particles", type=int, default=DEFAULT_PARTICLES, help="Particle filter count (100-500)")
    parser.add_argument("--lidar-max-range", type=float, default=DEFAULT_LIDAR_MAX_RANGE, help="LIDAR max range (m)")
    parser.add_argument(
        "--map-warmup-seconds",
        type=float,
        default=DEFAULT_MAP_WARMUP_SECONDS,
        help="Seconds to integrate stationary scans before navigation (0 to disable)",
    )
    parser.add_argument("--use-imu", dest="use_imu", action="store_true", default=True, help="Enable IMU fusion")
    parser.add_argument("--no-imu", dest="use_imu", action="store_false", help="Disable IMU")
    parser.add_argument("--imu-rate", type=float, default=100.0, help="IMU sampling rate for fusion (Hz)")
    parser.add_argument("--imu-warmup", type=float, default=10.0, help="IMU warmup duration before use (s)")
    parser.add_argument(
        "--gyro-scale",
        type=float,
        default=1.0,
        help="Manual multiplier for gyro readings (e.g. 0.5 if angle is 2x)",
    )
    parser.add_argument(
        "--use-mag",
        action="store_true",
        default=False,
        help="Enable magnetometer (disabled by default to prevent magnetic interference)",
    )
    parser.add_argument(
        "--imu-heading-blend",
        type=float,
        default=0.6,
        help="Blend factor between odometry (0.0) and IMU yaw (1.0)",
    )
    parser.add_argument("--imu-bus", type=int, default=1, help="I2C bus number for IMU")
    parser.add_argument("--imu-address", type=lambda x: int(x, 0), default=0x68, help="IMU I2C address (hex, default 0x68)")
    parser.add_argument("--invert-imu", action="store_true", default=True, help="Invert IMU yaw polarity")

    parser.add_argument(
        "--log-level", type=str, default="INFO", choices=["DEBUG", "INFO", "WARNING", "ERROR"], help="Log level"
    )
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> None:
    args = parse_args(argv)
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper()),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    asyncio.run(run_test(args))


if __name__ == "__main__":
    main()


