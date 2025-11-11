"""Entry point for the RoboMop robot application."""

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
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Mapping

import matplotlib.pyplot as plt
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

    def __init__(
        self, config: AppConfig, logger: logging.Logger, triangle_stream_url: str | None = None
    ) -> None:
        self._config = config
        self._logger = logger
        self._triangle_stream_url = triangle_stream_url

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
        # Flag to indicate triangle test is running (prevents navigation loop interference)
        self._running_triangle_test = False
        # Sensor warmup configuration
        self._imu_warmup_seconds: float = 10.0
        self._lidar_warmup_seconds: float = 5
        # Cached map payload to avoid blocking event loop with base64 encoding
        self._latest_map_payload: Mapping[str, Any] | None = None
        # Cache latest LIDAR scan for visualization
        self._latest_lidar_scan: list[tuple[float, float]] = []

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

        async def read_lidar_with_timeout() -> list[LidarMeasurement]:
            """Read LIDAR scan with timeout to prevent blocking."""
            try:
                return await asyncio.wait_for(lidar.read_scan(), timeout=0.5)
            except asyncio.TimeoutError:
                self._logger.warning("LIDAR read_scan() timed out after 0.5s")
                return []
            except Exception as exc:
                self._logger.error("LIDAR read_scan() failed: %s", exc)
                return []

        self._hardware = HardwareAbstractionLayer(
            lidar_reader=read_lidar_with_timeout,
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

        # Map four motors with new channel assignments
        motor_channels = [
            MotorChannelConfig(index=0, forward_channel=1, reverse_channel=0),
            MotorChannelConfig(index=1, forward_channel=3, reverse_channel=2),
            MotorChannelConfig(index=2, forward_channel=5, reverse_channel=4),
            MotorChannelConfig(index=3, forward_channel=7, reverse_channel=6),
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
            motor_to_encoder={0: 0, 1: 0, 2: 1, 3: 1},
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
            left_motor_indices=[0, 1],
            right_motor_indices=[2, 3],
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
            # Warmup/convergence for IMU and LIDAR before starting loops
            try:
                await self._warmup_sensors()
            except Exception as exc:
                self._logger.warning("Sensor warmup encountered an issue: %s", exc)

        # Start SLAM and navigation loops before connecting to backend
        self._slam_task = asyncio.create_task(self._slam_loop())
        self._navigation_task = asyncio.create_task(self._navigation_loop())
        self._logger.info("SLAM and navigation loops started")

        # Run triangle calibration test if enabled
        if self._config.robot.run_triangle_test:
            self._logger.info("Running triangle calibration test")
            original_mode = self._mode
            try:
                await self._run_triangle_test()
                self._mode = original_mode
                self._logger.info("Triangle calibration test completed, restored mode to %s", self._mode)
            except (asyncio.CancelledError, KeyboardInterrupt):
                self._logger.warning("Triangle test interrupted, shutting down")
                self._mode = original_mode
                self._running_triangle_test = False
                raise

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

    async def _warmup_sensors(self) -> None:
        """Allow IMU and LIDAR to converge/spin-up before SLAM starts."""
        if not self._hardware:
            return
        self._logger.info(
            "Warming up sensors: IMU %.1fs, LIDAR %.1fs",
            self._imu_warmup_seconds,
            self._lidar_warmup_seconds,
        )
        # IMU warmup: sample gyro to stabilize and report stats
        imu_samples = 0
        sum_wz = 0.0
        sum_wz2 = 0.0
        imu_end = time.perf_counter() + max(0.0, self._imu_warmup_seconds)
        while time.perf_counter() < imu_end:
            try:
                snapshot = await self._hardware.read_all()
                wz = float(snapshot.imu_sample.angular_velocity_rad_s.z)
                sum_wz += wz
                sum_wz2 += wz * wz
                imu_samples += 1
            except Exception:
                # Ignore sporadic failures during warmup
                pass
            await asyncio.sleep(0.01)
        if imu_samples > 0:
            mean_wz = sum_wz / imu_samples
            var_wz = max(0.0, (sum_wz2 / imu_samples) - (mean_wz * mean_wz))
            std_wz = math.sqrt(var_wz)
            self._logger.info(
                "IMU warmup complete: samples=%d omega_z mean=%.5f rad/s std=%.5f rad/s",
                imu_samples,
                mean_wz,
                std_wz,
            )
        else:
            self._logger.warning("IMU warmup collected zero samples")

        # LIDAR warmup: discard early scans until motor stabilizes
        lidar_end = time.perf_counter() + max(0.0, self._lidar_warmup_seconds)
        non_empty_scans = 0
        total_pts = 0
        while time.perf_counter() < lidar_end:
            try:
                snapshot = await self._hardware.read_all()
                count = len(snapshot.lidar_scan)
                if count > 0:
                    non_empty_scans += 1
                    total_pts += count
            except Exception:
                pass
            await asyncio.sleep(0.05)
        avg_pts = (total_pts / non_empty_scans) if non_empty_scans > 0 else 0.0
        self._logger.info(
            "LIDAR warmup complete: non_empty_scans=%d avg_points_per_scan=%.1f",
            non_empty_scans,
            avg_pts,
        )

    async def _slam_loop(self) -> None:
        """Main SLAM update loop running at 10 Hz."""
        self._logger.info("SLAM loop started")
        target_interval = 0.1
        slam_update_count = 0

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
                    omega_meas = snapshot.imu_sample.angular_velocity_rad_s.z
                    # Use measured velocities for EKF prediction and telemetry
                    self._sensor_fusion.predict(
                        control_v=avg_encoder_velocity,
                        control_w=omega_meas,
                        dt=dt,
                    )
                    self._velocity = {"linear": avg_encoder_velocity, "angular": omega_meas}
                    self._sensor_fusion.update_v(avg_encoder_velocity)
                    self._sensor_fusion.update_omega(omega_meas)

                lidar_measurements = [
                    (m.angle_radians, m.distance_m) for m in snapshot.lidar_scan
                ]
                
                # Cache LIDAR scan for visualization
                self._latest_lidar_scan = lidar_measurements

                if lidar_measurements:
                    slam_update_count += 1
                    # Build body-frame displacement control for particle filter
                    dx_body = self._velocity["linear"] * dt if dt > 0 else 0.0
                    dtheta = self._velocity["angular"] * dt if dt > 0 else 0.0
                    control = np.array([dx_body, 0.0, dtheta])
                    # Scale process noise with actual per-step motion; keep tiny floors to avoid degeneracy
                    lin_sigma = max(1e-4, 0.1 * abs(dx_body))
                    side_sigma = max(1e-4, 0.05 * abs(dx_body))
                    ang_sigma = max(1e-3, 0.2 * abs(dtheta))
                    process_covariance = np.diag([lin_sigma**2, side_sigma**2, ang_sigma**2])
                    
                    estimated_pose, slam_covariance = self._slam_manager.step(
                        control=control,
                        process_covariance=process_covariance,
                        scan=lidar_measurements,
                    )

                    self._pose = {
                        "x": float(estimated_pose[0]),
                        "y": float(estimated_pose[1]),
                        "theta": float(estimated_pose[2]),
                    }
                    # Fuse SLAM pose back into EKF with returned covariance
                    try:
                        self._sensor_fusion.update_pose(estimated_pose, R=slam_covariance)
                    except Exception as exc:
                        self._logger.debug("EKF pose update failed: %s", exc)
                    # Refresh cached map payload off-thread to avoid blocking the event loop
                    try:
                        await asyncio.to_thread(self._refresh_map_payload)
                    except Exception as exc:
                        self._logger.debug("Failed to refresh map payload: %s", exc)
                    
                    # Log SLAM updates periodically
                    if slam_update_count % 50 == 0:  # Every 5 seconds at 10Hz
                        self._logger.info(
                            "SLAM update #%d: pose=(%.3f, %.3f, %.3f°), %d measurements",
                            slam_update_count,
                            self._pose["x"],
                            self._pose["y"],
                            math.degrees(self._pose["theta"]),
                            len(lidar_measurements)
                        )
                    # Sensor diagnostics more frequently
                    if slam_update_count % 10 == 0:  # Every ~1s at 10Hz
                        left_v = self._encoder_cache.get("left")
                        right_v = self._encoder_cache.get("right")
                        left_vs = left_v.velocity_m_s if left_v is not None else None
                        right_vs = right_v.velocity_m_s if right_v is not None else None
                        pf_neff = None
                        try:
                            if self._particle_filter is not None:
                                pf_neff = float(self._particle_filter.effective_particle_count)
                        except Exception:
                            pf_neff = None
                        self._logger.info(
                            "SENSORS dt=%.3f v_enc=%.4f m/s (L=%.4f R=%.4f) omega_imu=%.4f rad/s "
                            "lidar_pts=%d pf_neff=%s",
                            dt,
                            self._velocity["linear"],
                            left_vs or 0.0,
                            right_vs or 0.0,
                            self._velocity["angular"],
                            len(lidar_measurements),
                            f"{pf_neff:.1f}" if pf_neff is not None else "n/a",
                        )
                else:
                    # Log when no LIDAR data is received (only once per second to avoid spam)
                    if not hasattr(self, '_last_lidar_warning') or time.perf_counter() - self._last_lidar_warning > 1.0:
                        self._logger.warning("No LIDAR measurements received in snapshot")
                        self._last_lidar_warning = time.perf_counter()

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
                    # Don't cancel path executor if triangle test is running
                    if not self._running_triangle_test:
                        if self._path_executor.status is not PathExecutorStatus.IDLE:
                            self._path_executor.cancel()

                if self._path_executor.status is PathExecutorStatus.RUNNING:
                    self._path_executor.update(current_pose, dt=target_interval)
                    self._robot_controller.update(dt=target_interval)

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

    async def _run_triangle_test(self) -> None:
        """Execute a 1m equilateral triangle path and save diagnostic map image."""
        if not self._path_executor or not self._robot_controller or not self._occupancy_grid:
            self._logger.error("Cannot run triangle test: navigation not initialized")
            return

        self._logger.info("Starting triangle calibration test (1m equilateral triangle)")
        
        # Calculate equilateral triangle vertices (1m side length)
        # Start at origin, first vertex at (0, 0)
        side_length = 1.0
        height = side_length * math.sqrt(3) / 2.0
        
        vertices = [
            (0.0, 0.0),  # Start
            (side_length, 0.0),  # Move right 1m
            (side_length / 2.0, height),  # Move to apex
            (0.0, 0.0),  # Return to start
        ]
        
        # Create waypoints for the triangle
        waypoints = [Waypoint(x=x, y=y, theta=None) for x, y in vertices]
        
        # Track trajectory
        trajectory: list[tuple[float, float]] = []
        
        # Set flags to prevent navigation loop interference
        self._running_triangle_test = True
        self._mode = "MANUAL"
        
        # Optional WebSocket streaming
        ws_connection = None
        if self._triangle_stream_url:
            try:
                import websockets  # type: ignore
                ws_connection = await websockets.connect(self._triangle_stream_url)
                self._logger.info("Connected to triangle viewer at %s", self._triangle_stream_url)
            except Exception as exc:
                self._logger.warning(
                    "Failed to connect to triangle viewer at %s: %s",
                    self._triangle_stream_url,
                    exc,
                )
        
        try:
            # Load and start the path
            self._path_executor.load_path(waypoints, start_immediately=True)
            self._logger.info("Triangle path loaded with %d waypoints", len(waypoints))
            
            # Wait for path completion with timeout
            timeout = 60.0  # 60 seconds timeout
            start_time = time.perf_counter()
            sample_interval = 0.1  # Sample trajectory every 100ms
            last_sample_time = start_time
            update_counter = 0
            
            while time.perf_counter() - start_time < timeout:
                await asyncio.sleep(0.05)
                
                # Sample trajectory
                current_time = time.perf_counter()
                if current_time - last_sample_time >= sample_interval:
                    trajectory.append((self._pose["x"], self._pose["y"]))
                    last_sample_time = current_time
                    update_counter += 1
                    
                    # Stream update to viewer if connected
                    if ws_connection:
                        try:
                            update_message = {
                                "type": "triangle_update",
                                "timestamp": current_time,
                                "pose": {
                                    "x": self._pose["x"],
                                    "y": self._pose["y"],
                                    "theta": self._pose["theta"],
                                },
                                "trajectory": trajectory,
                                "plannedVertices": vertices,
                                "lidarScan": self._latest_lidar_scan,  # Add current LIDAR scan
                            }
                            # Add compressed map data if available (send every 5 updates to reduce bandwidth)
                            if self._occupancy_grid and update_counter % 5 == 0:
                                map_data = self._build_map_payload(self._occupancy_grid, compress=True)
                                update_message["map"] = map_data
                            
                            await ws_connection.send(json.dumps(update_message))
                        except Exception as exc:
                            self._logger.debug("Failed to send update to viewer: %s", exc)
                
                # Check if path is complete
                if self._path_executor.status is PathExecutorStatus.COMPLETED:
                    self._logger.info("Triangle path completed successfully")
                    break
                elif self._path_executor.status in (PathExecutorStatus.CANCELLED, PathExecutorStatus.IDLE):
                    self._logger.warning("Triangle path was cancelled or stopped")
                    break
            else:
                self._logger.warning("Triangle test timed out after %.1f seconds", timeout)
                self._path_executor.cancel()
        
        except (asyncio.CancelledError, KeyboardInterrupt):
            self._logger.warning("Triangle test interrupted by user")
            if self._path_executor:
                self._path_executor.cancel()
            raise
        
        finally:
            # Close WebSocket connection if open
            if ws_connection:
                try:
                    await ws_connection.close()
                    self._logger.info("Closed connection to triangle viewer")
                except Exception as exc:
                    self._logger.debug("Error closing viewer connection: %s", exc)
            
            # Always stop the robot and save diagnostics
            self._velocity = {"linear": 0.0, "angular": 0.0}
            
            # Stop motors immediately if motor controller exists
            if self._motor_controller:
                try:
                    self._motor_controller.stop_all()
                    self._logger.info("Motors stopped")
                except Exception as exc:
                    self._logger.error("Failed to stop motors: %s", exc)
            
            # Clear the test flag
            self._running_triangle_test = False
            
            # Save the diagnostic image
            self._save_triangle_test_image(trajectory, vertices)
            
            self._logger.info("Triangle test complete. Trajectory had %d samples", len(trajectory))

    def _save_triangle_test_image(
        self, trajectory: list[tuple[float, float]], planned_vertices: list[tuple[float, float]]
    ) -> None:
        """Save occupancy grid map with trajectory overlay to disk."""
        if not self._occupancy_grid:
            self._logger.warning("Cannot save map: occupancy grid not available")
            return
        
        # Create logs directory if it doesn't exist
        logs_dir = Path("robot/logs")
        logs_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = logs_dir / f"triangle_test_{timestamp}.png"
        
        # Create figure
        fig, ax = plt.subplots(figsize=(12, 12), dpi=100)
        
        # Get occupancy grid data
        grid_data = self._occupancy_grid.array
        origin_x, origin_y, _ = self._occupancy_grid.origin
        resolution = self._occupancy_grid.resolution
        height, width = grid_data.shape
        
        # Create extent for imshow (world coordinates)
        extent = [
            origin_x,
            origin_x + width * resolution,
            origin_y,
            origin_y + height * resolution,
        ]
        
        # Display occupancy grid (inverted colormap: white=free, black=occupied)
        # Grid values: 0=unknown, 1-127=free, 128-255=occupied
        display_grid = np.where(grid_data == 0, 128, grid_data)  # Show unknown as gray
        ax.imshow(
            display_grid,
            cmap="gray_r",
            origin="lower",
            extent=extent,
            vmin=0,
            vmax=255,
            alpha=0.8,
        )
        
        # Plot planned triangle vertices
        if planned_vertices:
            planned_x = [v[0] for v in planned_vertices]
            planned_y = [v[1] for v in planned_vertices]
            ax.plot(planned_x, planned_y, "b--", linewidth=2, label="Planned Path", alpha=0.7)
            ax.scatter(planned_x[:-1], planned_y[:-1], c="blue", s=100, marker="o", 
                      label="Waypoints", zorder=5)
        
        # Plot actual trajectory
        if trajectory:
            traj_x = [p[0] for p in trajectory]
            traj_y = [p[1] for p in trajectory]
            ax.plot(traj_x, traj_y, "r-", linewidth=2, label="Actual Trajectory", alpha=0.9)
            ax.scatter(traj_x[0], traj_y[0], c="green", s=150, marker="^", 
                      label="Start", zorder=6)
            ax.scatter(traj_x[-1], traj_y[-1], c="red", s=150, marker="s", 
                      label="End", zorder=6)
        
        ax.set_xlabel("X (meters)", fontsize=12)
        ax.set_ylabel("Y (meters)", fontsize=12)
        ax.set_title(f"Triangle Calibration Test - {timestamp}", fontsize=14, fontweight="bold")
        ax.legend(loc="upper right", fontsize=10)
        ax.grid(True, alpha=0.3)
        ax.set_aspect("equal")
        
        # Set reasonable axis limits around the triangle
        if trajectory or planned_vertices:
            all_x = ([p[0] for p in trajectory] if trajectory else []) + [v[0] for v in planned_vertices]
            all_y = ([p[1] for p in trajectory] if trajectory else []) + [v[1] for v in planned_vertices]
            if all_x and all_y:
                margin = 0.5  # 0.5m margin
                ax.set_xlim(min(all_x) - margin, max(all_x) + margin)
                ax.set_ylim(min(all_y) - margin, max(all_y) + margin)
            else:
                # Default view if no data
                ax.set_xlim(-0.5, 1.5)
                ax.set_ylim(-0.5, 1.5)
        
        plt.tight_layout()
        plt.savefig(filename, dpi=150, bbox_inches="tight")
        plt.close(fig)
        
        self._logger.info("Triangle test map saved to %s", filename)

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
        if self._latest_map_payload is not None:
            return self._latest_map_payload
        # Fallback: build once synchronously if cache is empty
        if not self._occupancy_grid:
            return None
        self._latest_map_payload = self._build_map_payload(self._occupancy_grid)
        return self._latest_map_payload

    def _build_map_payload(self, grid: OccupancyGrid, compress: bool = False) -> Mapping[str, Any]:
        grid_data = grid.array
        height, width = grid_data.shape
        
        if compress:
            # Compress with gzip before base64 encoding
            compressed_data = gzip.compress(grid_data.tobytes(), compresslevel=6)
            encoded_data = base64.b64encode(compressed_data).decode("ascii")
            encoding = "gzip+base64"
        else:
            encoded_data = base64.b64encode(grid_data.tobytes()).decode("ascii")
            encoding = "base64"
        
        return {
            "resolution": float(grid.resolution),
            "width": int(width),
            "height": int(height),
            "origin": {
                "x": float(grid.origin[0]),
                "y": float(grid.origin[1]),
                "theta": float(grid.origin[2]),
            },
            "data": encoded_data,
            "encoding": encoding,
        }

    def _refresh_map_payload(self) -> None:
        if not self._occupancy_grid:
            return
        # Build new payload and swap atomically
        self._latest_map_payload = self._build_map_payload(self._occupancy_grid)

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
    if args.triangle_test:
        nested("robot")["runTriangleTest"] = True
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
    parser.add_argument(
        "--triangle-test",
        action="store_true",
        help="Run triangle calibration test before connecting to backend",
    )
    parser.add_argument(
        "--triangle-stream-url",
        type=str,
        help="WebSocket URL (ws://host:port) for triangle test live viewer (enables streaming)",
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

    app = RobotApp(config, logger, triangle_stream_url=args.triangle_stream_url)
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
