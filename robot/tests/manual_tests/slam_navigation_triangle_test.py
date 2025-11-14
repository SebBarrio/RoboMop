#!/usr/bin/env python3
"""
SLAM Navigation Triangle Manual Test

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
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

# Make 'src' importable when running this script directly
_THIS_FILE = Path(__file__).resolve()
_ROBOT_DIR = _THIS_FILE.parents[2]  # .../RoboMop/robot
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
from src.sensors.lidar import LidarMeasurement, RPLidarSerial
from src.sensors.imu import MPU9250, ImuSample
from src.slam.occupancy_grid import OccupancyGrid
from src.slam.particle_filter import ParticleFilter
from src.slam.slam_manager import SlamManager


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

DEFAULT_GRID_RESOLUTION: float = 0.05  # 5 cm
DEFAULT_GRID_WIDTH: int = 800
DEFAULT_GRID_HEIGHT: int = 800
DEFAULT_GRID_ORIGIN: Tuple[float, float, float] = (-20.0, -20.0, 0.0)

DEFAULT_PARTICLES: int = 200
DEFAULT_LIDAR_MAX_RANGE: float = 5.0

STATE_HZ: float = 10.0
MAP_HZ: float = 2.0
SLAM_HZ: float = 5.0


# -----------------------------
# Utility data structures
# -----------------------------

@dataclass(slots=True)
class ViewerClient:
    url: str
    websocket: Optional[Any] = None
    logger: logging.Logger = logging.getLogger("triangle_stream")

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


# -----------------------------
# High-level test controller
# -----------------------------

class TriangleSlamNavigator:
    def __init__(
        self,
        *,
        lidar: RPLidarSerial,
        imu: Optional[MPU9250],
        motor_controller: MotorController,
        robot_controller: RobotController,
        slam: SlamManager,
        planned_vertices: Sequence[Tuple[float, float]],
        viewer: Optional[ViewerClient],
        lidar_max_range: float,
        slam_update_hz: float,
        map_hz: float,
        state_hz: float,
        imu_warmup_samples: int,
        logger: logging.Logger,
    ) -> None:
        self._lidar = lidar
        self._imu = imu
        self._motor = motor_controller
        self._robot = robot_controller
        self._slam = slam
        self._viewer = viewer
        self._logger = logger
        self._lidar_max_range = float(lidar_max_range)
        self._slam_period = 1.0 / float(slam_update_hz)
        self._map_period = 1.0 / float(map_hz)
        self._state_period = 1.0 / float(state_hz)
        self._imu_warmup_samples = int(max(0, imu_warmup_samples))
        self._imu_ready = False
        self._imu_yaw: Optional[float] = None

        self._vertices = list(planned_vertices)
        self._waypoint_index = 0
        self._trajectory: List[Tuple[float, float]] = []
        self._last_pose_for_slam: Optional[Pose2D] = None
        self._latest_scan: List[LidarMeasurement] = []
        self._running = False

    async def run(self) -> None:
        self._running = True
        try:
            await self._run_all_tasks()
        finally:
            self._running = False

    async def _run_all_tasks(self) -> None:
        tasks = [
            asyncio.create_task(self._control_loop(), name="control-loop"),
            asyncio.create_task(self._slam_loop(), name="slam-loop"),
            asyncio.create_task(self._viewer_loop(), name="viewer-loop"),
        ]
        if self._imu is not None:
            tasks.append(asyncio.create_task(self._imu_loop(), name="imu-loop"))
        try:
            await asyncio.wait(tasks, return_when=asyncio.FIRST_EXCEPTION)
        finally:
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

    async def _control_loop(self) -> None:
        """High-rate robot control loop and waypoint progression."""
        loop_interval = self._motor.loop_interval
        self._logger.info("Starting control loop at %.1f Hz", 1.0 / loop_interval)
        # Issue first waypoint
        if self._vertices:
            self._issue_next_waypoint()
        while self._running:
            start = asyncio.get_running_loop().time()
            # Progress goals
            if not self._robot.goal_active and self._vertices:
                self._issue_next_waypoint()
            # Update controller and integrate pose
            self._robot.update(dt=loop_interval)
            # Override heading with IMU yaw when available (IMU primary for theta)
            if self._imu_ready and self._imu_yaw is not None:
                pose = self._robot.pose
                self._robot.reset_pose(Pose2D(pose.x, pose.y, self._imu_yaw))
            self._trajectory.append((self._robot.pose.x, self._robot.pose.y))
            # Loop pacing
            elapsed = asyncio.get_running_loop().time() - start
            await asyncio.sleep(max(0.0, loop_interval - elapsed))

    def _issue_next_waypoint(self) -> None:
        if self._waypoint_index >= len(self._vertices):
            # Finished one triangle lap; restart to keep moving
            self._waypoint_index = 0
        x, y = self._vertices[self._waypoint_index]
        self._robot.set_pose_goal(x=x, y=y)
        self._waypoint_index += 1

    async def _slam_loop(self) -> None:
        """Lower-rate loop that waits for full LIDAR scans and updates SLAM."""
        self._logger.info("Starting SLAM loop at %.1f Hz (scan-blocking)", 1.0 / self._slam_period)
        # Initialize last pose for odometry delta
        self._last_pose_for_slam = Pose2D(self._robot.pose.x, self._robot.pose.y, self._robot.pose.theta)
        while self._running:
            # Read one full revolution
            scan = await self._lidar.read_scan()
            self._latest_scan = scan
            if not scan:
                continue
            # Build scan array
            scan_array = np.array([[m.angle_radians, max(0.0, float(m.distance_m))] for m in scan], dtype=float)
            # Compute body-frame odometry delta since last SLAM step
            assert self._last_pose_for_slam is not None
            prev = self._last_pose_for_slam
            curr = self._robot.pose
            dx_world = curr.x - prev.x
            dy_world = curr.y - prev.y
            dtheta = _wrap_angle(curr.theta - prev.theta)
            # Rotate world delta into body frame using previous heading
            cos_h = math.cos(prev.theta)
            sin_h = math.sin(prev.theta)
            dx_body = cos_h * dx_world + sin_h * dy_world
            dy_body = -sin_h * dx_world + cos_h * dy_world
            control = np.array([dx_body, dy_body, dtheta], dtype=float)
            # Process covariance (tuned conservatively)
            cov = np.diag([0.01, 0.01, math.radians(2.0) ** 2])
            # Update SLAM
            try:
                self._slam.step(
                    control=control,
                    process_covariance=cov,
                    scan=scan_array,
                )
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
        next_state = asyncio.get_running_loop().time()
        next_map = next_state
        self._logger.info("Starting viewer loop: state=%.1f Hz, map=%.1f Hz", 1.0 / state_period, 1.0 / map_period)
        while self._running:
            now = asyncio.get_running_loop().time()
            if now >= next_state:
                await self._send_state_update()
                next_state = now + state_period
            if now >= next_map:
                await self._send_map_update()
                next_map = now + map_period
            await asyncio.sleep(0.01)

    async def _send_state_update(self) -> None:
        if self._viewer is None:
            return
        pose = self._robot.pose
        payload: Dict[str, Any] = {
            "type": "triangle_update",
            "pose": {"x": pose.x, "y": pose.y, "theta": pose.theta},
            "trajectory": list(self._trajectory[-2000:]),
            "plannedVertices": list(self._vertices),
            "lidarScan": [[float(m.angle_radians), float(max(0.0, m.distance_m))] for m in self._latest_scan[-720:]],
        }
        await self._viewer.send_update(payload)

    async def _send_map_update(self) -> None:
        if self._viewer is None:
            return
        grid: OccupancyGrid = self._slam.occupancy_grid
        data_bytes = grid.array.tobytes(order="C")
        compressed = gzip.compress(data_bytes)
        b64 = base64.b64encode(compressed).decode("ascii")
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

    async def _imu_loop(self) -> None:
        """Continuously read IMU and provide yaw (theta) to the controller."""
        assert self._imu is not None
        self._logger.info("Starting IMU loop (sample_rate=%.1f Hz)", float(getattr(self._imu, "_sample_rate_hz", 0.0)))
        # Start async sampling thread
        await self._imu.start()
        warmup_remaining = self._imu_warmup_samples
        # Warmup: collect initial samples while robot is stationary to converge offsets
        if warmup_remaining > 0:
            self._logger.info("IMU warmup: collecting %d samples; keep robot stationary", warmup_remaining)
        try:
            async for sample in self._imu.iter_samples():
                # Use IMU yaw as primary theta (already wrapped to [-pi, pi] in API)
                try:
                    self._imu_yaw = float(sample.orientation.yaw)
                except Exception:
                    # Defensive parsing guard
                    pass
                if warmup_remaining > 0:
                    warmup_remaining -= 1
                    if warmup_remaining == 0:
                        self._imu_ready = True
                        self._logger.info("IMU warmup complete; switching to IMU yaw for heading")
        except asyncio.CancelledError:
            raise
        except Exception:
            self._logger.exception("IMU loop failed")

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
    pos_kp: float,
    pos_ki: float,
    pos_kd: float,
    head_kp: float,
    head_ki: float,
    head_kd: float,
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
            kp=0.45,
            ki=0.2,
            kd=0.01,
            integrator_limit=supply_voltage,
            output_limits=(-supply_voltage, supply_voltage),
        ),
    )
    feedback = EncoderFeedbackAdapter(gpio_encoders)
    motor_controller = MotorController(driver=driver, encoder_feedback=feedback, config=motor_cfg)
    # High-level robot controller
    position_pid = PIDController(kp=pos_kp, ki=pos_ki, kd=pos_kd, integrator_limit=0.5, output_limits=(-max_linear, max_linear))
    heading_pid = PIDController(
        kp=head_kp, ki=head_ki, kd=head_kd, integrator_limit=0.8, output_limits=(-max_angular, max_angular)
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


async def run_test(args: argparse.Namespace) -> None:
    logger = logging.getLogger("triangle_test")
    logger.info("Initializing hardware...")

    # IMU (optional but recommended)
    imu: Optional[MPU9250] = None
    try:
        imu = MPU9250(bus=args.imu_bus, address=args.imu_address, sample_rate_hz=args.imu_rate)
        # initialize() is called inside start(), but invoking it here gives earlier calibration/logs if desired
        imu.initialize()
        logger.info("IMU initialized on I2C bus %d addr 0x%02X", args.imu_bus, args.imu_address)
    except Exception as exc:
        logger.error("Failed to initialize IMU: %s (continuing without IMU)", exc)
        imu = None

    # LIDAR
    lidar = RPLidarSerial(port=args.lidar_port, baud_rate=args.lidar_baud, serial_timeout=args.lidar_timeout)
    await lidar.start()

    # Motors/encoders and robot controller
    driver, motor_controller, robot, encoders = _build_motor_driver_and_controller(
        supply_voltage=args.supply_voltage,
        loop_interval=args.loop_interval,
        wheel_radius_m=args.wheel_radius,
        track_width_m=args.track_width,
        max_linear=args.max_linear,
        max_angular=args.max_angular,
        pos_kp=args.pos_kp,
        pos_ki=args.pos_ki,
        pos_kd=args.pos_kd,
        head_kp=args.head_kp,
        head_ki=args.head_ki,
        head_kd=args.head_kd,
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

    logger.info("LIDAR started and ready for navigation")

    # Navigator
    navigator = TriangleSlamNavigator(
        lidar=lidar,
        imu=imu,
        motor_controller=motor_controller,
        robot_controller=robot,
        slam=slam,
        planned_vertices=planned,
        viewer=viewer,
        lidar_max_range=args.lidar_max_range,
        slam_update_hz=SLAM_HZ,
        map_hz=MAP_HZ,
        state_hz=STATE_HZ,
        imu_warmup_samples=args.imu_warmup_samples,
        logger=logger,
    )

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
        # Stop IMU
        if imu is not None:
            try:
                await imu.stop()
            except Exception:
                logger.exception("Error while stopping IMU")
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

    # IMU options
    parser.add_argument("--imu-bus", type=int, default=1, help="I2C bus for IMU (default: 1)")
    parser.add_argument(
        "--imu-address",
        type=lambda x: int(x, 0),
        default=0x68,
        help="IMU I2C address (0x68/0x69). Accepts hex like 0x68",
    )
    parser.add_argument("--imu-rate", type=float, default=100.0, help="IMU sample rate Hz")
    parser.add_argument(
        "--imu-warmup-samples",
        type=int,
        default=150,
        help="IMU warmup samples to collect while stationary before using yaw",
    )

    # PID tuning (tightened defaults)
    parser.add_argument("--pos-kp", type=float, default=1.2, help="Position PID Kp (default: 1.2)")
    parser.add_argument("--pos-ki", type=float, default=0.02, help="Position PID Ki (default: 0.02)")
    parser.add_argument("--pos-kd", type=float, default=0.2, help="Position PID Kd (default: 0.2)")
    parser.add_argument("--head-kp", type=float, default=3.0, help="Heading PID Kp (default: 3.0)")
    parser.add_argument("--head-ki", type=float, default=0.05, help="Heading PID Ki (default: 0.05)")
    parser.add_argument("--head-kd", type=float, default=0.3, help="Heading PID Kd (default: 0.3)")

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


