"""Entry point for the RoboMop robot application."""

from __future__ import annotations

import argparse
import asyncio
import base64
import logging
import math
import signal
import sys
import time
from typing import Any, Mapping

import numpy as np
from socketio import exceptions as socketio_exceptions

from .communication.command_receiver import CommandReceiver
from .communication.state_publisher import StatePublisher
from .communication.websocket_client import ConnectionConfig, WebSocketClient
from .config import AppConfig, load_config
from .control.motor_controller import (
    MotorController,
    MotorControllerConfig,
    PIDSettings as VelocityPIDSettings,
)
from .control.pwm_controller import MotorChannelConfig, MotorDriver
from .control.pid import PIDController
from .control.robot_controller import Pose2D, RobotController
from .navigation.astar import AStarPlanner
from .navigation.coverage_planner import CoveragePlanner
from .navigation.path_executor import PathExecutor, PathExecutorStatus, Waypoint
from .sensors.encoders import EncoderReading, GpioZeroEncoderHardware, QuadratureEncoder
from .sensors.hardware import HardwareAbstractionLayer
from .sensors.imu import ImuSample, MPU9250
from .sensors.lidar import LidarMeasurement, RPLidarSerial
from .sensors.ultrasonic import UltrasonicSensor
from .sensors.water_level import WaterLevelSensor
from .slam.occupancy_grid import OccupancyGrid
from .slam.particle_filter import ParticleFilter
from .slam.sensor_fusion import SensorFusionEKF
from .slam.slam_manager import SlamManager


class RobotApp:
    """Coordinates communication between the robot and backend services."""

    def __init__(self, config: AppConfig, logger: logging.Logger) -> None:
        self._config = config
        self._logger = logger

        connection = ConnectionConfig(
            url=config.websocket.url,
            robot_id=config.websocket.robot_id,
            api_key=config.websocket.api_key,
            namespace=config.websocket.namespace,
            socketio_path=config.websocket.socketio_path,
            transports=config.websocket.transports,
        )
        self._ws = WebSocketClient(
            connection,
            ack_timeout=config.ack_timeout,
            logger=logger.getChild("ws"),
        )

        map_hz = config.publish.map_hz if config.publish.map_hz is not None else 5.0
        self._publisher = StatePublisher(
            self._ws,
            self._state_provider,
            map_provider=self._map_provider,
            state_hz=config.publish.state_hz,
            map_hz=map_hz,
            logger=logger.getChild("publisher"),
        )

        self._receiver = CommandReceiver(
            self._ws,
            on_move=self._on_move,
            on_set_mode=self._on_set_mode,
            on_e_stop=self._on_e_stop,
            on_set_speed=self._on_set_speed,
            on_config_update=self._on_config_update,
            logger=logger.getChild("commands"),
        )

        self._mode = config.robot.mode
        self._speed_multiplier = config.robot.speed_multiplier
        self._velocity = {"linear": 0.0, "angular": 0.0}
        self._pose = {"x": 0.0, "y": 0.0, "theta": 0.0}
        self._battery_level = 100.0
        self._water_level = 100.0
        self._errors: list[str] = []

        self._hardware: HardwareAbstractionLayer | None = None
        self._occupancy_grid: OccupancyGrid | None = None
        self._particle_filter: ParticleFilter | None = None
        self._sensor_fusion: SensorFusionEKF | None = None
        self._slam_manager: SlamManager | None = None
        self._slam_task: asyncio.Task[None] | None = None
        self._last_update_time = time.perf_counter()

        self._motor_controller: MotorController | None = None
        self._robot_controller: RobotController | None = None
        self._astar_planner: AStarPlanner | None = None
        self._coverage_planner: CoveragePlanner | None = None
        self._path_executor: PathExecutor | None = None
        self._navigation_task: asyncio.Task[None] | None = None
        self._start_position: tuple[float, float, float] = (0.0, 0.0, 0.0)
        # Cache latest encoder readings for synchronous motor loop consumption
        self._encoder_cache: dict[str, EncoderReading] = {}

    async def _initialize_hardware(self) -> None:
        """Initialize hardware abstraction layer with all sensors."""
        hw_cfg = self._config.hardware

        lidar = RPLidarSerial(
            port=hw_cfg.lidar_port,
            baud_rate=hw_cfg.lidar_baud_rate,
            motor_pwm=hw_cfg.lidar_motor_pwm,
        )

        imu = MPU9250(
            bus=hw_cfg.imu_i2c_bus,
            address=hw_cfg.imu_address,
            sample_rate_hz=100.0,
            filter_alpha=0.98,
        )

        left_encoder_hw = GpioZeroEncoderHardware(
            pin_a=hw_cfg.encoder_left_pins[0],
            pin_b=hw_cfg.encoder_left_pins[1],
        )
        left_encoder = QuadratureEncoder(
            hardware=left_encoder_hw,
            counts_per_revolution=hw_cfg.encoder_counts_per_rev,
            wheel_circumference_m=hw_cfg.wheel_diameter_m * 3.14159,
            invert=False,
            velocity_cutoff_hz=12.0,
            min_dt=0.001,
        )

        right_encoder_hw = GpioZeroEncoderHardware(
            pin_a=hw_cfg.encoder_right_pins[0],
            pin_b=hw_cfg.encoder_right_pins[1],
        )
        right_encoder = QuadratureEncoder(
            hardware=right_encoder_hw,
            counts_per_revolution=hw_cfg.encoder_counts_per_rev,
            wheel_circumference_m=hw_cfg.wheel_diameter_m * 3.14159,
            invert=False,
            velocity_cutoff_hz=12.0,
            min_dt=0.001,
        )

        ultrasonic = UltrasonicSensor(
            trigger_pin=hw_cfg.ultrasonic_trigger_pin,
            echo_pin=hw_cfg.ultrasonic_echo_pin,
        )

        water_level = WaterLevelSensor(
            adc_channel=hw_cfg.water_level_adc_channel,
        )

        async def read_imu_async() -> ImuSample:
            return imu.read_sample()

        async def read_left_encoder_async() -> EncoderReading:
            await asyncio.sleep(0.001)
            return left_encoder.read()

        async def read_right_encoder_async() -> EncoderReading:
            await asyncio.sleep(0.001)
            return right_encoder.read()

        self._hardware = HardwareAbstractionLayer(
            lidar_reader=lidar.read_scan,
            imu_reader=read_imu_async,
            encoder_readers={
                "left": read_left_encoder_async,
                "right": read_right_encoder_async,
            },
            ultrasonic_reader=ultrasonic.read_distance,
            water_level_reader=water_level.read_percentage,
            start_hooks=[lidar.start, imu.start, ultrasonic.start, water_level.start],
            stop_hooks=[lidar.stop, imu.stop, ultrasonic.stop, water_level.stop],
        )
        # Keep references for motor feedback
        self._left_encoder = left_encoder
        self._right_encoder = right_encoder

    def _initialize_slam(self) -> None:
        """Initialize SLAM components (grid, particle filter, sensor fusion, manager)."""
        slam_cfg = self._config.slam

        self._occupancy_grid = OccupancyGrid(
            resolution=slam_cfg.grid_resolution,
            width=slam_cfg.grid_width,
            height=slam_cfg.grid_height,
            origin=(slam_cfg.grid_origin_x, slam_cfg.grid_origin_y, 0.0),
        )

        self._particle_filter = ParticleFilter(
            particle_count=slam_cfg.particle_count,
        )
        # Initialize particles with Gaussian distribution around origin
        initial_pose_mean = np.array([0.0, 0.0, 0.0])
        initial_pose_covariance = np.diag([0.1, 0.1, 0.1])
        self._particle_filter.initialize_gaussian(
            mean=initial_pose_mean,
            covariance=initial_pose_covariance,
        )

        initial_state = np.array([0.0, 0.0, 0.0, 0.0, 0.0])
        initial_covariance = np.diag([0.1, 0.1, 0.1, 0.5, 0.5])
        process_noise = np.diag([0.01, 0.01, 0.01, 0.1, 0.1])
        pose_noise = np.diag([0.05, 0.05, 0.05])

        self._sensor_fusion = SensorFusionEKF(
            x0=initial_state,
            P0=initial_covariance,
            Q=process_noise,
            R_pose=pose_noise,
            R_v=0.1,
            R_w=0.1,
        )

        sensor_pose = np.array(
            [slam_cfg.sensor_pose_x, slam_cfg.sensor_pose_y, slam_cfg.sensor_pose_theta]
        )

        self._slam_manager = SlamManager(
            occupancy_grid=self._occupancy_grid,
            particle_filter=self._particle_filter,
            resample_threshold=slam_cfg.resample_threshold,
            max_range=slam_cfg.max_lidar_range,
            sensor_pose=sensor_pose,
        )

    def _initialize_navigation(self) -> None:
        """Initialize navigation components (planners, controllers, executor)."""
        if not self._occupancy_grid or not self._hardware:
            self._logger.warning("Cannot initialize navigation without SLAM and hardware")
            return

        nav_cfg = self._config.navigation
        hw_cfg = self._config.hardware

        self._astar_planner = AStarPlanner(
            self._occupancy_grid,
            obstacle_threshold=nav_cfg.obstacle_threshold,
            inflation_radius=nav_cfg.inflation_radius,
            allow_diagonal=False,
        )

        self._coverage_planner = CoveragePlanner(
            self._occupancy_grid,
            cleaning_width=nav_cfg.cleaning_width,
            overlap_ratio=nav_cfg.overlap_ratio,
            obstacle_threshold=nav_cfg.obstacle_threshold,
        )

        # Real PWM motor driver (PCA9685) and encoder feedback wiring
        try:
            import board  # type: ignore
            import busio  # type: ignore
            from adafruit_pca9685 import PCA9685  # type: ignore
        except Exception as exc:  # pragma: no cover - import guard on non-RPi envs
            raise RuntimeError(
                "Hardware modules (board, busio, adafruit_pca9685) are required on the robot"
            ) from exc

        i2c = busio.I2C(board.SCL, board.SDA)
        pwm = PCA9685(i2c)
        pwm.frequency = 1000

        # Map two motors: left index 0 -> channels (0,1), right index 1 -> channels (2,3)
        motor_channels = [
            MotorChannelConfig(index=0, forward_channel=0, reverse_channel=1),
            MotorChannelConfig(index=1, forward_channel=2, reverse_channel=3),
        ]
        motor_driver = MotorDriver(pwm, motor_channels, supply_voltage=12.0)

        class _EncoderFeedback:
            def __init__(self, left: QuadratureEncoder, right: QuadratureEncoder) -> None:
                self._left = left
                self._right = right

            def get_reading(self, encoder_index: int) -> EncoderReading:
                if encoder_index == 0:
                    return self._left.read()
                elif encoder_index == 1:
                    return self._right.read()
                raise KeyError(f"Unknown encoder index {encoder_index}")

        encoder_feedback = _EncoderFeedback(self._left_encoder, self._right_encoder)

        velocity_pid = VelocityPIDSettings(
            kp=0.3,
            ki=0.05,
            kd=0.0,
        )

        mc_config = MotorControllerConfig(
            motor_to_encoder={0: 0, 1: 1},
            gear_ratio=1.0,
            rotor_inertia=1e-4,
            viscous_friction=0.01,
            torque_constant=0.0188,
            back_emf_constant=0.0188,
            winding_resistance=0.091,
            loop_interval=0.01,
            pid=velocity_pid,
        )

        self._motor_controller = MotorController(
            driver=motor_driver,
            encoder_feedback=encoder_feedback,
            config=mc_config,
        )

        position_pid = PIDController(
            kp=nav_cfg.position_kp,
            ki=nav_cfg.position_ki,
            kd=nav_cfg.position_kd,
            output_limits=(-nav_cfg.max_linear_speed, nav_cfg.max_linear_speed),
        )

        heading_pid = PIDController(
            kp=nav_cfg.heading_kp,
            ki=nav_cfg.heading_ki,
            kd=nav_cfg.heading_kd,
            output_limits=(-nav_cfg.max_angular_speed, nav_cfg.max_angular_speed),
        )

        self._robot_controller = RobotController(
            motor_controller=self._motor_controller,
            track_width=nav_cfg.track_width,
            wheel_radius=hw_cfg.wheel_diameter_m / 2.0,
            left_motor_indices=[0],
            right_motor_indices=[1],
            position_pid=position_pid,
            heading_pid=heading_pid,
            max_linear_speed=nav_cfg.max_linear_speed,
            max_angular_speed=nav_cfg.max_angular_speed,
            goal_tolerance=nav_cfg.path_tolerance,
            heading_tolerance=math.radians(nav_cfg.heading_tolerance_deg),
        )

        self._path_executor = PathExecutor(
            self._robot_controller,
            default_linear_tolerance=nav_cfg.path_tolerance,
            default_heading_tolerance=math.radians(nav_cfg.heading_tolerance_deg),
        )

        self._start_position = (self._pose["x"], self._pose["y"], self._pose["theta"])

    async def start(self) -> None:
        self._logger.info("Initializing hardware and SLAM systems")
        await self._initialize_hardware()
        self._initialize_slam()
        self._initialize_navigation()

        if self._hardware:
            await self._hardware.start()
            self._logger.info("Hardware layer started")

        self._logger.info("Connecting to backend at %s", self._config.websocket.url)
        try:
            await self._ws.connect()
        except socketio_exceptions.ConnectionError as exc:
            self._logger.error(
                "Failed to connect to backend at %s: %s",
                self._config.websocket.url,
                exc,
            )
            await self._ws.disconnect()
            if self._hardware and self._hardware.started:
                await self._hardware.stop()
                self._logger.info("Hardware layer stopped after connection failure")
            raise
        await self._receiver.start()
        await self._publisher.start()

        self._slam_task = asyncio.create_task(self._slam_loop())
        self._navigation_task = asyncio.create_task(self._navigation_loop())
        self._logger.info("Robot connection established (mode=%s)", self._mode)

    async def stop(self) -> None:
        self._logger.info("Shutting down robot application")

        if self._navigation_task and not self._navigation_task.done():
            self._navigation_task.cancel()
            try:
                await self._navigation_task
            except asyncio.CancelledError:
                pass

        if self._slam_task and not self._slam_task.done():
            self._slam_task.cancel()
            try:
                await self._slam_task
            except asyncio.CancelledError:
                pass

        self._receiver.stop()
        await self._publisher.stop()
        await self._ws.disconnect()

        if self._hardware:
            await self._hardware.stop()
            self._logger.info("Hardware layer stopped")

    async def _slam_loop(self) -> None:
        """Main SLAM update loop running at 10 Hz."""
        self._logger.info("SLAM loop started")
        target_interval = 0.1

        while True:
            try:
                loop_start = time.perf_counter()

                if not self._hardware or not self._slam_manager or not self._sensor_fusion:
                    await asyncio.sleep(target_interval)
                    continue

                snapshot = await self._hardware.read_all()
                dt = snapshot.timestamp - self._last_update_time
                self._last_update_time = snapshot.timestamp

                if dt > 0 and dt < 1.0:
                    self._sensor_fusion.predict(
                        control_v=self._velocity["linear"],
                        control_w=self._velocity["angular"],
                        dt=dt,
                    )

                    left_vel = snapshot.encoders.get("left")
                    right_vel = snapshot.encoders.get("right")
                    if left_vel is not None:
                        self._encoder_cache["left"] = left_vel
                    if right_vel is not None:
                        self._encoder_cache["right"] = right_vel
                    avg_encoder_velocity = 0.0
                    if left_vel and right_vel:
                        avg_encoder_velocity = (
                            (left_vel.velocity_m_s or 0.0) + (right_vel.velocity_m_s or 0.0)
                        ) / 2.0

                    self._sensor_fusion.update_velocity(
                        v_measured=avg_encoder_velocity,
                        w_measured=snapshot.imu_sample.angular_velocity_rad_s.z,
                    )

                lidar_measurements = [
                    (m.angle_radians, m.distance_m) for m in snapshot.lidar_scan
                ]

                if lidar_measurements:
                    odometry_pose = self._sensor_fusion.state_vector[:3]
                    estimated_pose = self._slam_manager.update(
                        scan=lidar_measurements, odometry_pose=odometry_pose
                    )

                    self._pose = {
                        "x": float(estimated_pose[0]),
                        "y": float(estimated_pose[1]),
                        "theta": float(estimated_pose[2]),
                    }

                self._battery_level = max(0.0, self._battery_level - 0.001)
                self._water_level = snapshot.water_level_percentage

                if self._battery_level < 15.0 and self._mode in ("EXPLORATION", "CLEANING"):
                    if "LOW_BATTERY" not in self._errors:
                        self._logger.warning("Low battery (%.1f%%) - switching to RETURNING mode", 
                                           self._battery_level)
                        self._errors.append("LOW_BATTERY")
                        self._mode = "RETURNING"
                elif self._battery_level >= 15.0 and "LOW_BATTERY" in self._errors:
                    self._errors.remove("LOW_BATTERY")

                if snapshot.ultrasonic_distance_m < 0.1:
                    if "CLIFF_DETECTED" not in self._errors:
                        self._errors.append("CLIFF_DETECTED")
                        self._logger.warning("Cliff detected at distance %.2fm", 
                                           snapshot.ultrasonic_distance_m)
                elif "CLIFF_DETECTED" in self._errors:
                    self._errors.remove("CLIFF_DETECTED")

                loop_duration = time.perf_counter() - loop_start
                sleep_time = max(0.0, target_interval - loop_duration)
                await asyncio.sleep(sleep_time)

            except asyncio.CancelledError:
                self._logger.info("SLAM loop cancelled")
                raise
            except Exception as exc:
                self._logger.error("SLAM loop error: %s", exc, exc_info=True)
                self._errors.append(f"SLAM_ERROR: {str(exc)[:50]}")
                await asyncio.sleep(target_interval)

    async def _navigation_loop(self) -> None:
        """Main navigation loop running at 5 Hz for path planning and execution."""
        self._logger.info("Navigation loop started")
        target_interval = 1.0 / self._config.navigation.update_hz

        while True:
            try:
                loop_start = time.perf_counter()

                if (
                    not self._astar_planner
                    or not self._coverage_planner
                    or not self._path_executor
                    or not self._robot_controller
                    or not self._occupancy_grid
                ):
                    await asyncio.sleep(target_interval)
                    continue

                current_pose = Pose2D(
                    x=self._pose["x"], y=self._pose["y"], theta=self._pose["theta"]
                )
                self._robot_controller.reset_pose(current_pose)

                if self._mode == "EXPLORATION":
                    await self._handle_exploration_mode(current_pose)
                elif self._mode == "CLEANING":
                    await self._handle_cleaning_mode(current_pose)
                elif self._mode == "RETURNING":
                    await self._handle_returning_mode(current_pose)
                elif self._mode == "MANUAL":
                    if self._path_executor.status is not PathExecutorStatus.IDLE:
                        self._path_executor.cancel()

                if self._path_executor.status is PathExecutorStatus.RUNNING:
                    self._path_executor.update(current_pose, dt=target_interval)
                    self._robot_controller.update(dt=target_interval)
                    
                    cmd_linear = self._robot_controller.pose.x - current_pose.x
                    cmd_angular = self._robot_controller.pose.theta - current_pose.theta
                    self._velocity = {
                        "linear": max(-self._config.navigation.max_linear_speed, 
                                    min(self._config.navigation.max_linear_speed, cmd_linear)),
                        "angular": max(-self._config.navigation.max_angular_speed,
                                     min(self._config.navigation.max_angular_speed, cmd_angular)),
                    }

                loop_duration = time.perf_counter() - loop_start
                sleep_time = max(0.0, target_interval - loop_duration)
                await asyncio.sleep(sleep_time)

            except asyncio.CancelledError:
                self._logger.info("Navigation loop cancelled")
                raise
            except Exception as exc:
                self._logger.error("Navigation loop error: %s", exc, exc_info=True)
                self._errors.append(f"NAV_ERROR: {str(exc)[:50]}")
                await asyncio.sleep(target_interval)

    async def _handle_exploration_mode(self, current_pose: Pose2D) -> None:
        """Handle EXPLORATION mode: find nearest frontier and navigate to it."""
        if self._path_executor.status is PathExecutorStatus.RUNNING:
            return

        if self._path_executor.status is PathExecutorStatus.COMPLETED:
            self._path_executor.cancel()

        result = self._astar_planner.plan_to_nearest_frontier(
            start=[current_pose.x, current_pose.y]
        )

        if result is None:
            self._logger.info("No more frontiers found - exploration complete")
            self._mode = "IDLE"
            return

        frontier, path = result
        self._logger.info(
            "Planning to frontier at (%.2f, %.2f), distance: %.2f m",
            frontier.world[0],
            frontier.world[1],
            frontier.distance,
        )

        waypoints = [Waypoint(x=x, y=y, theta=None) for x, y in path]
        self._path_executor.load_path(waypoints, start_immediately=True)

    async def _handle_cleaning_mode(self, current_pose: Pose2D) -> None:
        """Handle CLEANING mode: generate coverage path and execute."""
        if self._path_executor.status is PathExecutorStatus.RUNNING:
            return

        if self._path_executor.status is PathExecutorStatus.COMPLETED:
            self._logger.info("Cleaning path completed")
            self._mode = "IDLE"
            return

        self._logger.info("Planning cleaning coverage path")
        path = self._coverage_planner.plan(start=[current_pose.x, current_pose.y])

        if path is None:
            self._logger.warning("Failed to generate cleaning path")
            self._mode = "IDLE"
            return

        self._logger.info("Generated cleaning path with %d waypoints", len(path))
        waypoints = [Waypoint(x=x, y=y, theta=None) for x, y in path]
        self._path_executor.load_path(waypoints, start_immediately=True)

    async def _handle_returning_mode(self, current_pose: Pose2D) -> None:
        """Handle RETURNING mode: navigate back to start position."""
        if self._path_executor.status is PathExecutorStatus.RUNNING:
            return

        if self._path_executor.status is PathExecutorStatus.COMPLETED:
            self._logger.info("Returned to start position")
            self._mode = "IDLE"
            return

        start_x, start_y, start_theta = self._start_position
        self._logger.info("Planning return path to (%.2f, %.2f)", start_x, start_y)

        path = self._astar_planner.plan(
            start=[current_pose.x, current_pose.y],
            goal=[start_x, start_y],
            allow_unknown=False,
        )

        if path is None:
            self._logger.warning("Failed to plan return path")
            self._mode = "IDLE"
            return

        self._logger.info("Generated return path with %d waypoints", len(path))
        waypoints = [Waypoint(x=x, y=y, theta=None) for x, y in path]
        waypoints.append(Waypoint(x=start_x, y=start_y, theta=start_theta))
        self._path_executor.load_path(waypoints, start_immediately=True)

    def _state_provider(self) -> Mapping[str, Any]:
        return {
            "mode": self._mode,
            "position": self._pose,
            "velocity": self._velocity,
            "batteryLevel": self._battery_level,
            "waterLevel": self._water_level,
            "motorCurrents": [],
            "errors": list(self._errors),
        }

    def _map_provider(self) -> Mapping[str, Any] | None:
        """Provide current occupancy grid map for transmission."""
        if not self._occupancy_grid:
            return None

        grid_data = self._occupancy_grid.array
        height, width = grid_data.shape

        encoded_data = base64.b64encode(grid_data.tobytes()).decode("ascii")

        return {
            "resolution": float(self._occupancy_grid.resolution),
            "width": int(width),
            "height": int(height),
            "origin": {
                "x": float(self._occupancy_grid.origin[0]),
                "y": float(self._occupancy_grid.origin[1]),
                "theta": float(self._occupancy_grid.origin[2]),
            },
            "data": encoded_data,
            "encoding": "base64",
        }

    async def _on_move(self, command_id: str, params: Mapping[str, Any]) -> None:
        direction = str(params.get("direction", "STOP")).upper()
        speed = float(params.get("speed", 0.0)) * self._speed_multiplier
        duration = float(params.get("duration", 0.0))

        self._logger.debug(
            "Received move command %s direction=%s speed=%.3f duration=%.2f",
            command_id,
            direction,
            speed,
            duration,
        )

        if direction == "FORWARD":
            self._velocity = {"linear": speed, "angular": 0.0}
        elif direction == "BACKWARD":
            self._velocity = {"linear": -speed, "angular": 0.0}
        elif direction == "LEFT":
            self._velocity = {"linear": 0.0, "angular": speed}
        elif direction == "RIGHT":
            self._velocity = {"linear": 0.0, "angular": -speed}
        else:
            self._velocity = {"linear": 0.0, "angular": 0.0}

    async def _on_set_mode(
        self,
        command_id: str,
        mode: str,
        parameters: Mapping[str, Any],
    ) -> None:
        self._logger.info("Mode changed via command %s: %s", command_id, mode)
        self._mode = mode

    async def _on_e_stop(self, command_id: str) -> None:
        self._logger.warning("Emergency stop triggered by command %s", command_id)
        self._velocity = {"linear": 0.0, "angular": 0.0}
        self._mode = "IDLE"

    async def _on_set_speed(self, command_id: str, multiplier: float) -> None:
        self._speed_multiplier = float(multiplier)
        self._logger.info("Speed multiplier updated to %.2f", self._speed_multiplier)

    async def _on_config_update(self, command_id: str, patch: Mapping[str, Any]) -> None:
        if "speedMultiplier" in patch:
            await self._on_set_speed(command_id, float(patch["speedMultiplier"]))
        if "mode" in patch:
            self._mode = str(patch["mode"]).upper()


async def _serve(app: RobotApp) -> None:
    try:
        await app.start()
    except Exception:
        await app.stop()
        raise
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop_event.set)
        except NotImplementedError:
            continue

    try:
        await stop_event.wait()
    except asyncio.CancelledError:
        raise
    finally:
        await app.stop()


def _build_overrides(args: argparse.Namespace) -> dict[str, Any]:
    overrides: dict[str, Any] = {}

    def nested(section: str) -> dict[str, Any]:
        entry = overrides.setdefault(section, {})
        assert isinstance(entry, dict)
        return entry

    if args.robot_id:
        nested("websocket")["robotId"] = args.robot_id
    if args.server_url:
        nested("websocket")["url"] = args.server_url
    if args.api_key:
        nested("websocket")["apiKey"] = args.api_key
    if args.namespace:
        nested("websocket")["namespace"] = args.namespace
    if args.socketio_path:
        nested("websocket")["socketioPath"] = args.socketio_path
    if args.transports:
        nested("websocket")["transports"] = args.transports
    if args.state_hz is not None:
        nested("publish")["stateHz"] = args.state_hz
    if args.map_hz is not None:
        nested("publish")["mapHz"] = args.map_hz
    if args.mode:
        nested("robot")["mode"] = args.mode
    if args.speed_multiplier is not None:
        nested("robot")["speedMultiplier"] = args.speed_multiplier
    if args.log_level:
        overrides["logLevel"] = args.log_level
    if args.ack_timeout is not None:
        overrides["ackTimeout"] = args.ack_timeout

    return overrides


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the RoboMop robot control client")
    parser.add_argument("--config", type=str, help="Path to YAML configuration file")
    parser.add_argument("--robot-id", type=str, help="Override the robot identifier")
    parser.add_argument("--server-url", type=str, help="Override the backend server URL")
    parser.add_argument("--api-key", type=str, help="API key used for authentication")
    parser.add_argument("--namespace", type=str, help="Socket.IO namespace override")
    parser.add_argument(
        "--socketio-path",
        type=str,
        help="Custom Socket.IO path on the backend (default: socket.io)",
    )
    parser.add_argument(
        "--transports",
        nargs="+",
        help="Comma separated list of allowed Socket.IO transports",
    )
    parser.add_argument(
        "--state-hz",
        type=float,
        help="State publication frequency in Hz",
    )
    parser.add_argument(
        "--map-hz",
        type=float,
        help="Map publication frequency in Hz (set to 0 to disable)",
    )
    parser.add_argument("--mode", type=str, help="Initial robot mode override")
    parser.add_argument(
        "--speed-multiplier",
        type=float,
        help="Speed multiplier override between 0.1 and 1.0",
    )
    parser.add_argument("--log-level", type=str, help="Logging level override")
    parser.add_argument(
        "--ack-timeout",
        type=float,
        help="Command acknowledgement timeout in seconds",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    overrides = _build_overrides(args)
    config_path = args.config

    config = load_config(config_path, overrides=overrides if overrides else None)
    logging.basicConfig(
        level=getattr(logging, config.log_level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    logger = logging.getLogger("robomop")
    logger.info("Loaded configuration (robotId=%s)", config.websocket.robot_id)

    app = RobotApp(config, logger)
    try:
        asyncio.run(_serve(app))
    except socketio_exceptions.ConnectionError:
        logger.error(
            "Unable to establish WebSocket connection to %s. "
            "Ensure the backend is running and reachable, or update the robot configuration.",
            config.websocket.url,
        )
        sys.exit(1)
    except KeyboardInterrupt:
        logger.info("Interrupted by user, shutting down")


if __name__ == "__main__":
    main()
