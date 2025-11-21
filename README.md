# RoboMop

RoboMop is an autonomous floor-cleaning platform composed of a Python-based robot stack, a TypeScript backend, and a React dashboard. The repository collects everything needed to plan paths, run SLAM, drive the motors, and visualize robot state. This README orients new contributors, with special emphasis on the on-robot code inside `robot/` and the `slam_navigation_triangle_test.py` manual program used for hardware bring-up.

## Table of Contents
- [System Overview](#system-overview)
- [Repository Layout](#repository-layout)
- [Robot Stack (Python 3.11)](#robot-stack-python-311)
  - [Key Modules](#key-modules)
  - [Configuration](#configuration)
  - [Dependencies](#dependencies)
  - [Entry Points](#entry-points)
- [Manual Triangle SLAM Test](#manual-triangle-slam-test)
  - [Purpose](#purpose)
  - [Hardware & Software Prerequisites](#hardware--software-prerequisites)
  - [Running the Viewer](#running-the-viewer)
  - [Running the Robot Test](#running-the-robot-test)
  - [Live Controls & Telemetry](#live-controls--telemetry)
  - [Shutdown Sequence](#shutdown-sequence)
- [Backend Service (Node/TypeScript)](#backend-service-nodetypescript)
- [Frontend Dashboard (Vite/React)](#frontend-dashboard-vitereact)
- [Testing & Quality Gates](#testing--quality-gates)
- [Troubleshooting & Logs](#troubleshooting--logs)
- [Further Reading](#further-reading)

## System Overview
- **Robot (`robot/`)** – Python control software that interfaces with hardware (RPLidar, IMU, encoders, ultrasonic, pump sensors), executes SLAM + navigation, and streams telemetry over Socket.IO.
- **Backend (`backend/`)** – Node.js/TypeScript API used for fleet coordination, persistence (PostgreSQL/SQLite via TypeORM), and relaying commands and WebSocket events.
- **Frontend (`frontend/`)** – React 18 + Vite app that renders the live map, robot pose, manual controls, emergency stop, and test viewers.
- **Specs & Datasheets (`specs/`, `Datasheets/`)** – Source-of-truth design docs, contracts, and component datasheets for reference during development.

The robot can run autonomously via `robot/src/main.py`, while `robot/tests/manual_tests/slam_navigation_triangle_test.py` provides a deterministic hardware test that validates SLAM, control loops, and the visualization pipeline end-to-end.

## Repository Layout
```
RoboMop
├── robot/          # Primary focus: robot firmware/control software
├── backend/        # Express + Socket.IO server, TypeORM entities, services
├── frontend/       # React UI, Canvas map rendering, Playwright/Vitest tests
├── specs/          # Product plans, contracts, data models
├── Datasheets/     # Hardware reference PDFs
├── AGENTS.md       # AI agent guidance & conventions
└── WARP.md         # Warp instructions for deployment tooling
```

## Robot Stack (Python 3.11)
The `robot/` folder contains a full robotics stack optimized for Raspberry Pi-class hardware.

### Key Modules
- `src/communication/` – Async Socket.IO client, command receiver, state publisher.
- `src/control/` – PWM motor driver (PCA9685), PID loops (`PIDController`), kinematic robot controller, and motor controller with encoder feedback.
- `src/navigation/` – A* grid planner, coverage planner (boustrophedon patterns), path executor for following waypoints with tolerance bands.
- `src/sensors/` – Abstractions for lidar (`RPLidarSerial`), IMU (`MPU9250`), quadrature encoders, ultrasonic rangefinder, and water-level sensor.
- `src/slam/` – Occupancy grid utilities, particle filter, sensor fusion EKF, and `SlamManager` orchestrating scan matching + map updates.
- `config/` – YAML configs that set WebSocket endpoints, publish rates, and robot defaults (`base.yaml` ships with development settings).
- `tests/` – Contract, integration, unit, and hardware manual tests (see below for the flagship triangle test).

### Configuration
`robot/config/base.yaml` defines network endpoints (`websocket.url`, robot ID, transports), telemetry publish rates (`stateHz`, `mapHz`), default mode, speed multiplier, and retry timeouts. Copy this file to create environment-specific configs (e.g., `dev.yaml`, `robot.yaml`), then pass `--config` to `robot/src/main.py` if needed.

### Dependencies
- Python 3.11+ with `pip install -r robot/requirements.txt`
- Hardware-specific libraries: Adafruit Blinka/PlatformDetect/PCA9685, `gpiozero`, `smbus2`, `rplidar-roboticia`, `mpu9250-jmdev`, `python-socketio`
- Tooling: `black`, `pytest`, `pylint`, `mypy` (configured via `pyproject.toml`)

### Entry Points
- `robot/src/main.py` – Production entry that connects to the backend, initializes hardware, runs SLAM + planning loops, and streams telemetry.
- `robot/tests/manual_tests/slam_navigation_triangle_test.py` – Manual integration harness treated as the *main program* for this repository because it exercises the entire sensor stack, drive system, and SLAM pipeline without depending on the backend. It also exposes a WebSocket interface for the triangle viewer UI.

## Manual Triangle SLAM Test
The triangle navigator is the canonical program for validating a real robot before running autonomous missions. It drives the robot along an equilateral triangle while performing SLAM, streaming scans/maps, and accepting viewer commands.

### Purpose
- Validate motor wiring, encoder alignment, and PID tuning.
- Confirm RPLidar scans stream reliably and feed the particle filter.
- Exercise IMU fusion (`HeadingFusion` + `ImuSampler`) and ensure fused heading resets the robot controller before each control tick.
- Stream live pose, trajectory, scans, and occupancy grid to `triangle_viewer.py` for visualization and manual overrides (E-stop, teleop).

### Hardware & Software Prerequisites
1. Raspberry Pi (or similar) with access to:
   - RPLidar (set `--lidar-port` such as `COM3` or `/dev/ttyUSB0`)
   - PCA9685 motor driver + 4 motor H-bridges
   - 2 rotary encoders wired to GPIO
   - MPU9250 IMU (optional but enabled by default)
2. Install system dependencies (`sudo apt-get install i2c-tools`) and Python packages (`pip install websockets numpy adafruit-circuitpython-pca9685 gpiozero smbus2 pyserial`, matching `requirements.txt`).
3. Enable I2C/SPI/UART interfaces on the host OS per hardware vendor instructions.

### Running the Viewer
From your laptop or the same host (PowerShell shown for Windows; use bash on Linux/macOS):
```powershell
cd C:\Users\sebas\Desktop\RoboMop
python robot\tests\manual_tests\triangle_viewer.py --host 0.0.0.0 --port 8765
```
The viewer hosts a WebSocket server that renders pose, trajectory, lidar scans, and the latest occupancy grid. Keep this terminal open; it logs inbound robot updates and viewer-issued commands.

### Running the Robot Test
On the robot (requires sudo when accessing raw hardware):
```powershell
cd C:\Users\sebas\Desktop\RoboMop
python robot\tests\manual_tests\slam_navigation_triangle_test.py `
  --viewer ws://<viewer-ip>:8765 `
  --lidar-port COM3 `
  --lidar-baud 1000000 `
  --triangle-side 1.0
```
Key flags:
- `--viewer` – WebSocket URL of the triangle viewer; leave empty to disable streaming.
- `--lidar-port`, `--lidar-baud`, `--lidar-pwm`, `--lidar-timeout` – Tune for your specific RPLidar hardware.
- Motion & geometry: `--wheel-radius`, `--track-width`, `--max-linear`, `--max-angular`, `--triangle-side`.
- SLAM grid: `--grid-resolution`, `--grid-width`, `--grid-height`, `--grid-origin-*`, `--particles`, `--lidar-max-range`.
- IMU fusion: `--use-imu/--no-imu`, `--imu-rate`, `--imu-warmup`, `--imu-heading-blend`, `--invert-imu`.

The script performs:
1. Hardware initialization (PCA9685, encoders, IMU) and RPLidar pre-flight (`get_device_info`, `get_health`).
2. Optional IMU warmup to compute yaw bias via `_initialize_and_warmup_imu`.
3. SLAM grid + particle filter setup via `_build_slam`.
4. `TriangleSlamNavigator` loops:
   - High-rate control thread (`_control_loop_thread`) executing fused heading updates, manual/auto mode selection, pure-pursuit control, and e-stop enforcement.
   - SLAM loop that blocks on full lidar scans, filters poor-quality points, computes body-frame odometry deltas, and steps the particle filter.
   - Viewer loop that periodically sends pose, trajectory, odom, IMU headings, lidar scans, and compressed occupancy grid tiles over WebSocket.

### Live Controls & Telemetry
When connected, the viewer can:
- Issue `estop` events to instantly stop motors (`navigator.set_estop`), logging warnings in the robot console.
- Switch between `auto` (triangle path) and `manual` modes; manual mode cancels goals and lets you stream direct velocity commands.
- Display separate odometry vs SLAM pose, IMU heading (deg + age), last 720 lidar points, and the recent XY trajectory deque.
- Receive incremental map updates (gzip+base64 encoded) at `MAP_HZ` (default 1 Hz) for real-time visualization.

### Shutdown Sequence
The script registers SIGINT/SIGTERM handlers; pressing `Ctrl+C` triggers:
1. Cancellation of the navigator task and stop event resolution.
2. IMU sampler shutdown (closing SMBus) and motor driver stops.
3. Encoder closure, lidar stop, and viewer disconnect.
Always allow the sequence to finish to avoid leaving the PCA9685 or lidar running.

## Backend Service (Node/TypeScript)
- Location: `backend/`
- Stack: Node.js 20, TypeScript 5, Express 4, Socket.IO, TypeORM, with SQLite for development (`backend/data/robomop.sqlite`) and PostgreSQL in production.
- Entities: `Robot`, `RobotState`, `Session`, `Map`, `RestrictedZone`, `Log`.
- Services: command routing, telemetry ingestion, robot registration, session logging.
- Commands:
  ```powershell
  cd backend
  npm install
  npm run dev        # tsx watch src/server.ts
  npm test           # Jest + Supertest suites
  npm run lint       # ESLint
  npm run build      # TypeScript -> dist/
  npm run seed:robot # Seed demo robot into SQLite/Postgres
  ```

## Frontend Dashboard (Vite/React)
- Location: `frontend/`
- Stack: React 18, TypeScript, Vite 5, Socket.IO client, Canvas rendering.
- Features: live map viewer, control widgets (jogging, e-stop, mode selector), status panel (battery, water, warnings).
- Commands:
  ```powershell
  cd frontend
  npm install
  npm run dev     # Launch Vite dev server with hot reload
  npm test        # Vitest unit tests
  npm run lint    # ESLint
  npm run build   # Production bundle in dist/
  npm run test:e2e # Playwright (configured via tests/e2e)
  ```

## Testing & Quality Gates
- **Robot**
  - `cd robot && pytest` – Unit + integration suites (requires Linux for hardware mocks).
  - `pytest --cov=src --cov-report=html` – Coverage target 90%+ (100% for safety-critical code).
  - `black src tests`, `pylint src`, `mypy src` – Enforced via CI before deployment.
- **Backend**
  - `npm test` (Jest), `npm run lint`, `npm run typecheck`, `npm run test:coverage`.
- **Frontend**
  - `npm test` (Vitest), `npm run test:e2e` (Playwright), `npm run lint`.
- **Manual Hardware Validation**
  - `robot/tests/manual_tests/slam_navigation_triangle_test.py` – Run before each major hardware change.
  - Additional manual tests (encoders, PID, lidar socket, etc.) live under `robot/tests/manual_tests/`.

## Troubleshooting & Logs
- Robot logs: `robot/log*.csv`, `robot/logs/` (PNG plots generated by `tools/pid_log_analysis.py`), and `robot/pid_plots/` comparing linear/angular performance.
- Backend database: `backend/data/robomop.sqlite` for local runs; inspect using `sqlite3` or GUI tools.
- Viewer issues: ensure the robot and viewer agree on the WebSocket URL and that firewalls allow the chosen port (default 8765). Enable `--log-level DEBUG` on the triangle test for more detail.
- Hardware connectivity: rerun `_preflight_checks` by starting the triangle test; lidar info/health is logged before scans begin. IMU warmup progress is logged during initialization.

## Further Reading
- `specs/001-the-robomop-project/spec.md` – End-to-end functional specification.
- `specs/001-the-robomop-project/contracts/` – API and WebSocket contract documents.
- `Datasheets/` – PCA9685, encoder, motor, and RPLidar reference PDFs.
- `AGENTS.md` & `WARP.md` – Extended operational guidelines for AI agents and deployment tooling.

With the triangle SLAM test as the central operational script, you can validate the full hardware stack before integrating with the backend and frontend services. Once confident, transition to `robot/src/main.py` to connect the robot to the broader RoboMop ecosystem.

