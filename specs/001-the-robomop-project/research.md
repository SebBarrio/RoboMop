# Research: RoboMop Technical Decisions

**Date**: 2025-09-30  
**Phase**: 0 (Outline & Research)  
**Status**: Complete

## Overview

This document consolidates research findings and technical decisions for the RoboMop autonomous cleaning robot system. All decisions are made to support the functional and non-functional requirements while adhering to constitutional principles of modularity, testing, and quality.

---

## 1. Grid SLAM Algorithm

### Decision
**Occupancy Grid SLAM with Particle Filter Localization**

### Rationale
- **Performance**: Efficient enough for Raspberry Pi 5 real-time operation
- **Accuracy**: Meets ±5 cm position accuracy requirement
- **2D Indoor Focus**: Perfect fit for floor-cleaning robot
- **Library Support**: Well-supported in Python ecosystem
- **Proven**: Industry-standard for similar applications

### Alternatives Considered
- **GraphSLAM**: More accurate but computationally expensive, overkill for 2D indoor mapping
- **EKF-SLAM**: Assumes Gaussian distributions, less robust to multimodal localization uncertainty
- **Visual SLAM**: Requires cameras, more complex, unnecessary given LIDAR availability

### Implementation Notes
- Grid resolution: 5 cm (matches position accuracy requirement)
- Particle count: 100-500 (tunable based on environment complexity)
- Update rate: Synchronized with LIDAR scan rate (5-10 Hz)

### References
- "Probabilistic Robotics" - Thrun, Burgard, Fox (canonical SLAM reference)
- Python libraries: `numpy`, `scipy` for grid operations and filters

---

## 2. RPLIDAR S2L Integration

### Decision
**Use official rplidar Python SDK with async scan acquisition**

### Rationale
- **Official Support**: Maintained by Slamtec, guaranteed compatibility
- **Proven Stability**: Widely used in robotics community
- **Async Support**: Enables non-blocking scan acquisition for real-time control
- **Simple API**: Easy integration, reduces development time

### Alternatives Considered
- **Custom Driver**: Unnecessary complexity, no advantage over SDK
- **ROS Wrapper**: Too heavyweight for single robot application
- **Third-party Libraries**: Less maintained, compatibility risks

### Implementation Notes
- Scan rate: 10 Hz (default for S2L)
- Data format: 360-point scan with distance + angle
- Integration: Async queue for scan data, processed by SLAM module

### References
- Slamtec rplidar SDK: https://github.com/Slamtec/rplidar_sdk
- Python bindings: `rplidar-roboticia` package

---

## 3. IMU Sensor Fusion (MPU9250)

### Decision
**Complementary Filter for IMU fusion + Extended Kalman Filter for multi-sensor fusion**

### Rationale
- **Lightweight**: Complementary filter is computationally cheap for IMU attitude estimation
- **Real-time Capable**: Meets 100 Hz update rate requirement for position tracking
- **Adequate Accuracy**: Sufficient for odometry assistance (not primary position source)
- **EKF Integration**: Combines IMU, encoders, and LIDAR for robust pose estimation

### Alternatives Considered
- **Full EKF for IMU**: Overkill, complementary filter adequate for attitude
- **Madgwick Filter**: More complex, marginal accuracy improvement not worth complexity
- **UKF (Unscented Kalman Filter)**: More accurate but slower, unnecessary for this application

### Implementation Notes
- IMU sample rate: 100 Hz
- Complementary filter weight: 0.98 (tunable)
- EKF state: [x, y, θ, vx, vy, ω] (position, velocity, angular velocity)
- Sensor fusion: IMU (angular velocity) + Encoders (linear velocity) + LIDAR (position correction)

### References
- IMU library: `mpu9250-jmdev` or direct I2C communication
- Kalman filter: `filterpy` Python library

---

## 4. Path Planning Algorithm

### Decision
**A\* for exploration frontier selection + Coverage Path Planning for cleaning**

### Rationale
- **A\* for Exploration**: Optimal path to nearest unexplored frontier, proven efficient
- **Coverage for Cleaning**: Ensures complete area coverage, minimizes overlap
- **Modular**: Separate algorithms for separate tasks, easy to test and maintain
- **Performance**: Both run efficiently on occupancy grid representation

### Alternatives Considered
- **RRT (Rapidly-exploring Random Trees)**: Better for unknown environments, overkill since we have map
- **D\* (Dynamic A\*)**: Useful for replanning, unnecessary since we replan from scratch when needed
- **Greedy Algorithms**: Simpler but suboptimal paths, wastes battery

### Implementation Notes
- **Exploration**: 
  - Frontier detection: Find boundaries between known free and unknown space
  - Goal selection: A\* to nearest frontier, switch to next when reached
  - Completion: No frontiers remain
- **Cleaning**: 
  - Algorithm: Boustrophedon (back-and-forth) or spiral coverage
  - Overlap: 10% to ensure no gaps
  - Restricted zones: Mark as obstacles in coverage planner

### References
- A\*: Classic grid-based pathfinding
- Coverage: "Coverage Path Planning: The Boustrophedon Cellular Decomposition" - Choset

---

## 5. Real-time Communication Protocol

### Decision
**WebSocket (Socket.io) for bidirectional real-time communication**

### Rationale
- **Low Latency**: ~10-50 ms typical latency, meets <1 second map update requirement
- **Bidirectional**: Supports robot→server (telemetry) and server→robot (commands)
- **Event-based**: Natural fit for state updates and command dispatch
- **Binary Support**: Efficient for map tile transmission
- **Cross-platform**: Works in browsers (frontend) and Python (robot)

### Alternatives Considered
- **HTTP Polling**: 500ms+ latency, inefficient, cannot meet real-time requirements
- **gRPC**: Excellent performance but overcomplicated for web frontend, requires HTTP/2
- **MQTT**: Good for IoT but less suited for large payload (maps), extra broker complexity

### Implementation Notes
- **Events** (Robot→Server): `map-update`, `position-update`, `sensor-data`, `status-update`
- **Events** (Server→Robot): `command`, `e-stop`, `mode-change`, `config-update`
- **Fallback**: HTTP REST API for non-realtime operations (config, logs)
- **Reconnection**: Auto-reconnect with exponential backoff

### References
- Python client: `python-socketio`
- Node.js server: `socket.io`
- Frontend: `socket.io-client`

---

## 6. Map Data Structure

### Decision
**2D Occupancy Grid with metadata (resolution, origin, dimensions)**

### Rationale
- **Standard**: Universal SLAM representation
- **Efficient**: Compact storage, fast updates
- **Serializable**: Easy to transmit over network (binary or base64)
- **Render-friendly**: Direct mapping to canvas pixels for visualization

### Alternatives Considered
- **Vector Map**: Harder to update incrementally, more complex raycasting
- **Point Cloud**: Too large for transmission, overkill for 2D navigation
- **Topological Map**: Good for high-level planning but insufficient for precise navigation

### Implementation Notes
- **Grid Format**: 2D numpy array (Python), Uint8Array (TypeScript)
- **Values**: 0 = unknown, 1-127 = free (probability), 128-255 = occupied (probability)
- **Resolution**: 5 cm per cell (matches accuracy requirement)
- **Typical Size**: 100×100m space = 2000×2000 cells = 4 MB uncompressed
- **Compression**: Run-length encoding or PNG compression for transmission
- **Delta Updates**: Only send changed cells to reduce bandwidth

### Metadata Schema
```json
{
  "resolution": 0.05,
  "width": 2000,
  "height": 2000,
  "origin": {"x": -50.0, "y": -50.0, "theta": 0.0},
  "timestamp": "2025-09-30T12:00:00Z"
}
```

### References
- ROS occupancy grid format: nav_msgs/OccupancyGrid
- Compression: PNG encoding for efficient transfer

---

## 7. Frontend Map Rendering

### Decision
**HTML5 Canvas with delta-update rendering**

### Rationale
- **Performance**: Capable of 60 FPS for smooth updates
- **Widely Supported**: Works on all modern browsers (desktop + tablet)
- **React Integration**: Easy to wrap in React component
- **Flexible**: Supports overlays (robot position, route, restricted zones)

### Alternatives Considered
- **WebGL**: More performant but overcomplicated for 2D grid, harder to debug
- **SVG**: Vector-based, too slow for frequent full-map updates
- **Third-party Libraries** (Leaflet, MapBox): Overkill, designed for geographic maps

### Implementation Notes
- **Rendering Strategy**: 
  - Full redraw on map load
  - Delta updates: only repaint changed cells
  - Double buffering to prevent flicker
- **Layers**: 
  1. Base map (occupancy grid)
  2. Restricted zones (overlay)
  3. Planned route (overlay)
  4. Robot position + LIDAR scan (overlay)
- **Zoom/Pan**: Canvas coordinate transformations
- **Interaction**: Mouse/touch for painting restricted zones

### References
- Canvas API: MDN Web Docs
- React wrapper: Custom hook `useCanvas` for lifecycle management

---

## 8. Database Choice

### Decision
**PostgreSQL for production, SQLite for development/testing**

### Rationale
- **PostgreSQL Production**: 
  - Robust, battle-tested
  - JSONB support for flexible map metadata
  - Good TypeORM integration
  - Scales to multiple robots (future)
- **SQLite Development**: 
  - Zero-config, fast iteration
  - Same TypeORM entities work for both
  - Ideal for local testing

### Alternatives Considered
- **MongoDB**: Document DB advantages not needed, JSONB covers flexible schema
- **MySQL**: Less mature JSONB support than PostgreSQL
- **Redis Only**: Too volatile for map persistence, could be added as cache layer

### Implementation Notes
- **Entities**: Map, RobotState, Session, RestrictedZone, Log
- **Migrations**: TypeORM migrations for schema versioning
- **Indexes**: B-tree on timestamps, GiST on spatial data (future)
- **Backups**: pg_dump for PostgreSQL, file copy for SQLite

### Schema Principles
- **Normalization**: 3NF for relational data
- **Denormalization**: JSONB for variable sensor data
- **Soft Deletes**: Keep deleted maps for audit trail

### References
- TypeORM: https://typeorm.io/
- PostgreSQL JSONB: https://www.postgresql.org/docs/current/datatype-json.html

---

## 9. Motor Control (PCA9685 PWM)

### Decision
**PID control loops for individual motors + higher-level velocity controller**

### Rationale
- **Layered Control**: Separation of concerns (low-level PWM vs. high-level navigation)
- **PID Proven**: Industry standard for motor control
- **Tunable**: Parameters can be adjusted for robot's mechanical characteristics
- **Modular**: Motor controllers independent of navigation logic

### Alternatives Considered
- **Open-loop Control**: Simpler but inaccurate, cannot meet ±5 cm requirement
- **LQR (Linear Quadratic Regulator)**: More optimal but complex to tune
- **Cascaded PID**: (Position → Velocity → Current) Overcomplicated for differential drive

### Implementation Notes
- **Low Level**: PWM duty cycle control via PCA9685 I2C
- **Motor Controller**: PID loop (100 Hz) for each motor
  - Input: Target velocity (rad/s)
  - Feedback: Encoder readings
  - Output: PWM duty cycle
- **Velocity Controller**: Converts (linear_vel, angular_vel) → (left_motor_vel, right_motor_vel)
- **Position Controller**: Navigation commands → velocity setpoints

### PID Tuning
- **Initial Gains**: Kp=1.0, Ki=0.1, Kd=0.05 (tuned experimentally)
- **Anti-windup**: Integral term clamping to prevent saturation
- **Deadband**: Ignore errors <0.01 rad/s to prevent oscillation

### References
- PCA9685 library: Adafruit CircuitPython library or direct smbus2
- PID library: `simple-pid` Python package

---

## 10. Testing Strategy

### Decision
**TDD with three layers: Unit → Integration → End-to-End**

### Rationale
- **Constitutional**: Testing Excellence principle mandates TDD
- **Quality**: Tests-first prevents regressions, documents behavior
- **Coverage**: 90%+ target ensures reliability
- **Confidence**: Refactoring safe with comprehensive test suite

### Test Layers

**Unit Tests** (pytest, Jest, Vitest)
- Individual modules: SLAM grid update, A\* pathfinding, API routes, React components
- Mocked dependencies: Hardware sensors, network calls
- Coverage target: 95%+ for business logic

**Integration Tests** (pytest, supertest)
- Multi-module interactions: SLAM + Navigation, API + Database, UI + WebSocket
- Real dependencies where feasible: In-memory database, mock hardware
- Coverage target: 80%+ for integration paths

**Contract Tests** (pytest, Jest)
- API schemas: OpenAPI validation for all endpoints
- WebSocket events: Event payload validation
- Ensures robot↔backend↔frontend compatibility

**End-to-End Tests** (Playwright)
- Full user flows: Exploration → Cleaning → Monitoring
- Real browser, simulated robot (mock sensors)
- Coverage: All acceptance scenarios from spec

### CI/CD Integration
- Pre-commit: Linting, formatting
- PR checks: All tests, coverage threshold, security scan
- Main branch: Deploy to staging, smoke tests

### References
- pytest: https://docs.pytest.org/
- Jest: https://jestjs.io/
- Vitest: https://vitest.dev/
- Playwright: https://playwright.dev/

---

## Decision Summary

| **Area** | **Decision** | **Key Benefit** |
|----------|--------------|-----------------|
| SLAM | Occupancy Grid + Particle Filter | Meets accuracy, efficient on Pi5 |
| LIDAR | rplidar SDK | Official support, stable |
| IMU Fusion | Complementary + EKF | Real-time, accurate |
| Path Planning | A\* + Coverage | Optimal exploration & cleaning |
| Communication | WebSocket (Socket.io) | Low latency, bidirectional |
| Map Format | 2D Occupancy Grid | Standard, efficient |
| Rendering | Canvas + Delta Updates | 60 FPS capable |
| Database | PostgreSQL (prod) / SQLite (dev) | Robust, flexible |
| Motor Control | PID Loops | Proven, tunable |
| Testing | TDD (Unit/Integration/E2E) | Quality, confidence |

---

## Next Steps

All research complete. Proceed to Phase 1:
- Define data models (data-model.md)
- Design API contracts (contracts/)
- Create test scenarios (quickstart.md)
- Generate contract tests

**Status**: ✓ Ready for Phase 1
