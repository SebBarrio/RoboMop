# Tasks: RoboMop Autonomous Cleaning Robot System

**Input**: Design documents from `C:\Users\sebas\Desktop\RoboMop\specs\001-the-robomop-project\`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/, quickstart.md

## Execution Flow (main)
```
1. Load plan.md from feature directory ✓
2. Load optional design documents ✓
   → data-model.md: 7 entities → model tasks
   → contracts/: API spec + WebSocket events → contract test tasks
   → research.md: 10 technical decisions → setup tasks
   → quickstart.md: 12 scenarios → integration test tasks
3. Generate tasks by category ✓
4. Apply task rules ✓
5. Number tasks sequentially (T001-T151) ✓
6. Generate dependency graph ✓
7. Create parallel execution examples ✓
8. Validate task completeness ✓
9. Return: SUCCESS ✓
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions
- **Robot**: `robot/src/`, `robot/tests/`
- **Backend**: `backend/src/`, `backend/tests/`
- **Frontend**: `frontend/src/`, `frontend/tests/`

---

## Phase 3.1: Setup

- [x] **T001** Create root project structure (robot/, backend/, frontend/, docs/)
- [x] **T002** [P] Initialize Python project in robot/ with requirements.txt (Python 3.11+, pytest, black, pylint, mypy, rplidar SDK, numpy, scipy, python-socketio, asyncio)
- [x] **T003** [P] Initialize Node.js project in backend/ with package.json (Node 20.x, TypeScript 5.x, Express 4.x, Socket.io, TypeORM, Jest, supertest)
- [x] **T004** [P] Initialize Vite+React project in frontend/ with package.json (TypeScript 5.x, React 18.x, Vite 5.x, socket.io-client, Vitest, React Testing Library, Playwright)
- [x] **T005** [P] Configure Python linting in robot/ (black, pylint, mypy configs, pre-commit hook)
- [x] **T006** [P] Configure TypeScript linting in backend/ and frontend/ (ESLint, Prettier, tsconfig.json strict mode)
- [x] **T007** [P] Setup PostgreSQL and SQLite TypeORM configurations in backend/src/config/database.ts
- [x] **T008** [P] Create TypeORM migration scripts in backend/src/migrations/
- [x] **T009** [P] Setup CI/CD pipeline config (.github/workflows/ or equivalent: lint, test, coverage)

---

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

### Contract Tests - Backend API

- [X] **T010** [P] Contract test GET /api/v1/robots in backend/tests/contract/test_robots_get.test.ts
- [X] **T011** [P] Contract test POST /api/v1/robots in backend/tests/contract/test_robots_post.test.ts
- [X] **T012** [P] Contract test GET /api/v1/robots/{robotId} in backend/tests/contract/test_robot_get.test.ts
- [X] **T013** [P] Contract test PATCH /api/v1/robots/{robotId} in backend/tests/contract/test_robot_patch.test.ts
- [X] **T014** [P] Contract test GET /api/v1/robots/{robotId}/state in backend/tests/contract/test_robot_state_get.test.ts
- [X] **T015** [P] Contract test POST /api/v1/robots/{robotId}/state in backend/tests/contract/test_robot_state_post.test.ts
- [X] **T016** [P] Contract test POST /api/v1/robots/{robotId}/command in backend/tests/contract/test_robot_command.test.ts
- [X] **T017** [P] Contract test GET /api/v1/maps in backend/tests/contract/test_maps_get.test.ts
- [X] **T018** [P] Contract test POST /api/v1/maps in backend/tests/contract/test_maps_post.test.ts
- [X] **T019** [P] Contract test GET /api/v1/maps/{mapId} in backend/tests/contract/test_map_get.test.ts
- [X] **T020** [P] Contract test PATCH /api/v1/maps/{mapId} in backend/tests/contract/test_map_patch.test.ts
- [X] **T021** [P] Contract test DELETE /api/v1/maps/{mapId} in backend/tests/contract/test_map_delete.test.ts
- [X] **T022** [P] Contract test GET /api/v1/maps/{mapId}/data in backend/tests/contract/test_map_data_get.test.ts
- [X] **T023** [P] Contract test PUT /api/v1/maps/{mapId}/data in backend/tests/contract/test_map_data_put.test.ts
- [X] **T024** [P] Contract test PATCH /api/v1/maps/{mapId}/data in backend/tests/contract/test_map_data_patch.test.ts
- [X] **T025** [P] Contract test GET /api/v1/maps/{mapId}/zones in backend/tests/contract/test_zones_get.test.ts
- [X] **T026** [P] Contract test POST /api/v1/maps/{mapId}/zones in backend/tests/contract/test_zones_post.test.ts
- [X] **T027** [P] Contract test GET /api/v1/zones/{zoneId} in backend/tests/contract/test_zone_get.test.ts
- [X] **T028** [P] Contract test PATCH /api/v1/zones/{zoneId} in backend/tests/contract/test_zone_patch.test.ts
- [X] **T029** [P] Contract test DELETE /api/v1/zones/{zoneId} in backend/tests/contract/test_zone_delete.test.ts
- [X] **T030** [P] Contract test GET /api/v1/sessions in backend/tests/contract/test_sessions_get.test.ts
- [X] **T031** [P] Contract test POST /api/v1/sessions in backend/tests/contract/test_sessions_post.test.ts
- [X] **T032** [P] Contract test GET /api/v1/sessions/{sessionId} in backend/tests/contract/test_session_get.test.ts
- [X] **T033** [P] Contract test PATCH /api/v1/sessions/{sessionId} in backend/tests/contract/test_session_patch.test.ts
- [X] **T034** [P] Contract test GET /api/v1/logs in backend/tests/contract/test_logs_get.test.ts
- [X] **T035** [P] Contract test DELETE /api/v1/logs in backend/tests/contract/test_logs_delete.test.ts

### Contract Tests - WebSocket Events

- [X] **T036** [P] WebSocket contract test robot:heartbeat event in backend/tests/contract/test_ws_heartbeat.test.ts
- [X] **T037** [P] WebSocket contract test robot:state event in backend/tests/contract/test_ws_robot_state.test.ts
- [X] **T038** [P] WebSocket contract test robot:map-update event in backend/tests/contract/test_ws_map_update.test.ts
- [X] **T039** [P] WebSocket contract test robot:sensor-data event in backend/tests/contract/test_ws_sensor_data.test.ts
- [X] **T040** [P] WebSocket contract test command:move event in backend/tests/contract/test_ws_command_move.test.ts
- [X] **T041** [P] WebSocket contract test command:set-mode event in backend/tests/contract/test_ws_command_mode.test.ts
- [X] **T042** [P] WebSocket contract test command:e-stop event in backend/tests/contract/test_ws_e_stop.test.ts
- [X] **T043** [P] WebSocket contract test ui:command event in backend/tests/contract/test_ws_ui_command.test.ts
- [X] **T044** [P] WebSocket contract test ui:create-zone event in backend/tests/contract/test_ws_create_zone.test.ts

### Integration Tests - Quickstart Scenarios

- [X] **T045** [P] Integration test Scenario 1: Robot registration and connection in backend/tests/integration/test_robot_registration.test.ts
- [X] **T046** [P] Integration test Scenario 2: Exploration mode in robot/tests/integration/test_exploration_mode.py
- [X] **T047** [P] Integration test Scenario 3: Cleaning mode in robot/tests/integration/test_cleaning_mode.py
- [X] **T048** [P] Integration test Scenario 4: Manual control in frontend/tests/e2e/test_manual_control.spec.ts
- [X] **T049** [P] Integration test Scenario 5: Emergency stop in frontend/tests/e2e/test_emergency_stop.spec.ts
- [X] **T050** [P] Integration test Scenario 6: Restricted zones in frontend/tests/e2e/test_restricted_zones.spec.ts
- [X] **T051** [P] Integration test Scenario 7: Water level monitoring in robot/tests/integration/test_water_level.py
- [X] **T052** [P] Integration test Scenario 8: Low battery behavior in robot/tests/integration/test_low_battery.py
- [X] **T053** [P] Integration test Scenario 9: WiFi disconnection in robot/tests/integration/test_wifi_disconnect.py
- [X] **T054** [P] Integration test Scenario 10: Real-time map updates in frontend/tests/e2e/test_map_updates.spec.ts

---

## Phase 3.3: Core Implementation (ONLY after tests are failing)

### Backend - Data Models (TypeORM Entities)

- [X] **T055** [P] Robot entity model in backend/src/models/Robot.ts
- [X] **T056** [P] RobotState entity model in backend/src/models/RobotState.ts
- [X] **T057** [P] Map entity model in backend/src/models/Map.ts
- [X] **T058** [P] RestrictedZone entity model in backend/src/models/RestrictedZone.ts
- [X] **T059** [P] Session entity model in backend/src/models/Session.ts
- [X] **T060** [P] Log entity model in backend/src/models/Log.ts

### Backend - Services

- [X] **T061** [P] RobotService CRUD operations in backend/src/services/RobotService.ts
- [X] **T062** [P] MapService CRUD and map data operations in backend/src/services/MapService.ts
- [X] **T063** [P] SessionService session lifecycle management in backend/src/services/SessionService.ts
- [X] **T064** [P] ZoneService restricted zone management in backend/src/services/ZoneService.ts
- [X] **T065** [P] LogService log querying and clearing in backend/src/services/LogService.ts

### Backend - API Routes

- [X] **T066** Robot endpoints in backend/src/api/routes/robots.ts (GET, POST, PATCH /robots, /robots/:id, /robots/:id/state, /robots/:id/command)
- [X] **T067** Map endpoints in backend/src/api/routes/maps.ts (GET, POST, PATCH, DELETE /maps, /maps/:id, /maps/:id/data)
- [X] **T068** Zone endpoints in backend/src/api/routes/zones.ts (GET, POST, PATCH, DELETE /zones/:id, /maps/:id/zones)
- [X] **T069** Session endpoints in backend/src/api/routes/sessions.ts (GET, POST, PATCH /sessions, /sessions/:id)
- [X] **T070** Log endpoints in backend/src/api/routes/logs.ts (GET, DELETE /logs with filtering)

### Backend - WebSocket Handlers

- [X] **T071** WebSocket connection handler in backend/src/websocket/ConnectionHandler.ts (auth, heartbeat, disconnect)
- [X] **T072** Robot event handlers in backend/src/websocket/RobotEventHandler.ts (state, map-update, sensor-data, session events)
- [X] **T073** Command handlers in backend/src/websocket/CommandHandler.ts (move, set-mode, e-stop, set-speed)
- [X] **T074** Frontend event handlers in backend/src/websocket/FrontendEventHandler.ts (subscribe, ui:command, zone operations)
- [X] **T074a** Command conflict validation service in backend/src/services/CommandValidationService.ts (prevent conflicting commands per FR-039)

### Robot - Hardware Interfaces

- [x] **T075** [P] RPLIDAR S2L interface in robot/src/sensors/lidar.py (async scan acquisition, 10 Hz)
- [x] **T076** [P] MPU9250 IMU interface in robot/src/sensors/imu.py (I2C communication, complementary filter, 100 Hz)
- [x] **T077** [P] Encoder interface in robot/src/sensors/encoders.py (quadrature decoding, velocity calculation)
- [ ] **T078** [P] Ultrasonic sensor interface in robot/src/sensors/ultrasonic.py (HC-SR04, floor drop detection)
- [ ] **T079** [P] Water level sensor interface in robot/src/sensors/water_level.py (4-point sensor reading)
- [x] **T080** [P] PCA9685 PWM interface in robot/src/control/pwm_controller.py (I2C motor control)

### Robot - SLAM and Navigation

- [x] **T081** Occupancy grid implementation in robot/src/slam/occupancy_grid.py (2D grid, update methods, 5cm resolution)
- [x] **T082** Particle filter localization in robot/src/slam/particle_filter.py (100-500 particles, resampling)
- [x] **T083** SLAM module integration in robot/src/slam/slam_manager.py (sensor fusion, map building)
- [x] **T084** A* pathfinding algorithm in robot/src/navigation/astar.py (frontier selection, obstacle avoidance)
- [x] **T085** Coverage path planner in robot/src/navigation/coverage_planner.py (boustrophedon pattern, 10% overlap)
- [X] **T086** Path executor in robot/src/navigation/path_executor.py (waypoint tracking, position control)

### Robot - Control Systems

- [x] **T087** [P] PID controller implementation in robot/src/control/pid.py (tunable gains, anti-windup)
- [x] **T088** Motor controller in robot/src/control/motor_controller.py (velocity control, encoder feedback, 100 Hz)
- [x] **T089** Robot velocity controller in robot/src/control/robot_controller.py (differential drive kinematics)
- [ ] **T090** Safety controller in robot/src/control/safety.py (e-stop, cliff detection, collision avoidance)
- [ ] **T090a** [P] Battery monitor with return-to-start behavior in robot/src/control/battery_manager.py (implements FR-045 low battery handling)

### Robot - Communication

- [X] **T091** WebSocket client in robot/src/communication/websocket_client.py (Socket.io client, auto-reconnect)
- [X] **T092** State publisher in robot/src/communication/state_publisher.py (10 Hz state updates, 5 Hz map updates)
- [X] **T093** Command receiver in robot/src/communication/command_receiver.py (command dispatch, acknowledgement)

### Robot - Main Application

- [x] **T094** Main robot application in robot/src/main.py (initialization, mode management, graceful shutdown)
- [x] **T095** Configuration management in robot/src/config.py (YAML config loading, validation, defaults)

### Frontend - Components

- [ ] **T096** [P] MapViewer component in frontend/src/components/MapViewer/MapViewer.tsx (Canvas rendering, zoom/pan, 60 FPS)
- [ ] **T097** [P] Canvas layer manager in frontend/src/components/MapViewer/LayerManager.ts (map, zones, route, robot overlays)
- [ ] **T098** [P] Restricted zone painter in frontend/src/components/MapViewer/ZonePainter.tsx (polygon drawing, touch support)
- [ ] **T098a** [P] Touch gesture handler in frontend/src/components/MapViewer/TouchGestureHandler.ts (pinch-zoom, pan, zone painting for tablet per NFR-004)
- [ ] **T099** [P] JoggingControls component in frontend/src/components/Controls/JoggingControls.tsx (directional buttons, speed slider)
- [ ] **T100** [P] EmergencyStop button component in frontend/src/components/Controls/EmergencyStopButton.tsx (large, red, always visible)
- [ ] **T101** [P] ModeSelector component in frontend/src/components/Controls/ModeSelector.tsx (dropdown, confirm critical actions)
- [ ] **T102** [P] StatusPanel component in frontend/src/components/StatusPanel/StatusPanel.tsx (status display, water level gauge, battery gauge)
- [ ] **T103** [P] RobotPositionOverlay in frontend/src/components/MapViewer/RobotPositionOverlay.tsx (robot icon, orientation indicator)
- [ ] **T104** [P] LidarScanOverlay in frontend/src/components/MapViewer/LidarScanOverlay.tsx (LIDAR visualization)
- [ ] **T105** [P] RouteOverlay in frontend/src/components/MapViewer/RouteOverlay.tsx (planned route path)

### Frontend - Services

- [ ] **T106** [P] API client service in frontend/src/services/apiClient.ts (REST API wrapper, error handling)
- [ ] **T107** [P] WebSocket service in frontend/src/services/websocketService.ts (Socket.io connection, event subscriptions)
- [ ] **T108** [P] Map service in frontend/src/services/mapService.ts (map data management, delta updates)
- [ ] **T109** [P] Robot control service in frontend/src/services/robotControlService.ts (command dispatch, state tracking)

### Frontend - State Management

- [ ] **T110** Robot state store in frontend/src/stores/robotStore.ts (React Context or Zustand, WebSocket integration)
- [ ] **T111** Map state store in frontend/src/stores/mapStore.ts (map data, zones, real-time updates)

### Frontend - Main Application

- [ ] **T112** Main App component in frontend/src/App.tsx (layout: map zone, control zone, status zone)
- [ ] **T113** Responsive layout implementation in frontend/src/App.css (desktop 1920x1080, tablet 1024x768)

---

## Phase 3.4: Integration

### Backend Integration

- [ ] **T114** Connect TypeORM to PostgreSQL/SQLite in backend/src/server.ts (DB initialization, connection pooling)
- [ ] **T115** API error handling middleware in backend/src/api/middleware/errorHandler.ts (error formatting, logging)
- [ ] **T116** Request logging middleware in backend/src/api/middleware/requestLogger.ts (structured JSON logs)
- [ ] **T117** CORS configuration in backend/src/api/middleware/cors.ts (allow frontend origin)
- [ ] **T118** API key authentication middleware in backend/src/api/middleware/auth.ts (robot API key validation)
- [ ] **T119** WebSocket authentication in backend/src/websocket/auth.ts (robot API key, user session)
- [ ] **T120** Rate limiting for WebSocket in backend/src/websocket/rateLimiter.ts (10 Hz state, 5 Hz map, 100/s commands)

### Robot Integration

- [x] **T121** Sensor fusion integration in robot/src/slam/sensor_fusion.py (EKF combining LIDAR, IMU, encoders)
- [ ] **T122** Hardware abstraction layer tests in robot/tests/integration/test_hardware_integration.py (verify all sensors readable)
- [ ] **T123** SLAM loop integration in robot/src/main.py (LIDAR → SLAM update → position publish)
- [ ] **T124** Navigation loop integration in robot/src/main.py (mode → path planning → execution)

### Frontend Integration

- [ ] **T125** WebSocket connection integration in frontend/src/App.tsx (connect on mount, handle reconnect)
- [ ] **T126** Real-time state updates in frontend/src/hooks/useRobotState.ts (WebSocket → React state)
- [ ] **T127** Map update pipeline in frontend/src/hooks/useMapUpdates.ts (delta updates → canvas render)

---

## Phase 3.5: Polish

### Unit Tests

- [x] **T128** [P] Unit tests for SLAM grid operations in robot/tests/unit/test_occupancy_grid.py
- [ ] **T129** [P] Unit tests for A* pathfinding in robot/tests/unit/test_astar.py
- [x] **T130** [P] Unit tests for coverage planner in robot/tests/unit/test_coverage_planner.py
- [ ] **T131** [P] Unit tests for PID controller in robot/tests/unit/test_pid.py
- [ ] **T132** [P] Unit tests for backend services in backend/tests/unit/services/*.test.ts
- [ ] **T133** [P] Unit tests for frontend components in frontend/tests/unit/components/*.test.tsx

### Performance Validation

- [ ] **T134** Performance test: E-stop latency < 500ms in backend/tests/performance/test_estop_latency.test.ts
- [ ] **T135** Performance test: Map update visibility < 1s in frontend/tests/performance/test_map_latency.spec.ts
- [ ] **T136** Performance test: Position accuracy ±5 cm in robot/tests/performance/test_position_accuracy.py
- [ ] **T137** Performance test: UI rendering 60 FPS in frontend/tests/performance/test_rendering_fps.spec.ts

### Documentation

- [ ] **T138** [P] API documentation from OpenAPI spec in docs/api.md
- [ ] **T139** [P] WebSocket event documentation in docs/websocket.md
- [ ] **T140** [P] Robot setup guide in docs/robot-setup.md (hardware wiring, Pi5 config, sensor calibration)
- [ ] **T141** [P] Deployment guide in docs/deployment.md (backend deployment, environment variables, database setup)
- [ ] **T142** [P] User manual in docs/user-manual.md (web UI usage, maintenance procedures)

### Code Quality

- [ ] **T143** [P] Add docstrings to all Python modules (Google style)
- [ ] **T144** [P] Add JSDoc comments to all TypeScript modules
- [ ] **T145** Run coverage reports: Robot pytest-cov, Backend Jest coverage, Frontend Vitest coverage (ensure 90%+)
- [ ] **T146** Remove code duplication (DRY violations)
- [ ] **T147** Security audit: Run bandit (Python), npm audit (Node), fix critical issues

### Final Validation

- [ ] **T148** Execute all quickstart scenarios from quickstart.md (manual validation)
- [ ] **T149** Run full automated test suite (robot + backend + frontend)
- [ ] **T150** Performance benchmark validation (all NFRs met)
- [ ] **T151** Cross-browser testing (Chrome, Firefox, Safari, Edge) on desktop and tablet

---

## Dependencies

### Critical Path
1. **Setup** (T001-T009) must complete first
2. **All Tests** (T010-T054) before any implementation
3. **Models** (T055-T060) before services (T061-T065)
4. **Services** (T061-T065) before API routes (T066-T070)
5. **Robot Sensors** (T075-T080) before SLAM (T081-T083)
6. **SLAM** (T081-T083) before Navigation (T084-T086)
7. **Core** (T055-T095) before Integration (T114-T127)
8. **Integration** (T114-T127) before Polish (T128-T151)

### Detailed Dependencies
- T055-T060 (Models) → T061-T065 (Services)
- T061-T065 (Services) → T066-T070 (API Routes)
- T066-T070 (API Routes) + T071-T074 (WebSocket) → T074a (Command validation) → T114 (DB connection)
- T075-T080 (Sensors) → T081 (SLAM Grid)
- T081 (Grid) → T082 (Particle Filter) → T083 (SLAM Manager)
- T083 (SLAM) → T084-T086 (Navigation)
- T087-T089 (Control) → T090 (Safety Controller) → T090a (Battery Manager)
- T091-T093 (Communication) → T094 (Main App)
- T096-T098 (Map components) → T098a (Touch gestures) → T099-T105 (Other components)
- T096-T105 (Components) + T106-T109 (Services) → T110-T111 (Stores) → T112-T113 (App)
- All implementation → T128-T137 (Unit & Performance Tests)
- T138-T147 (Docs & Quality) can run anytime after core complete
- T148-T151 (Validation) must be last

---

## Parallel Execution Examples

### Example 1: Setup Phase (T002-T004)
All three project initializations can run simultaneously:
```bash
# Terminal 1
Task: "Initialize Python project in robot/ with requirements.txt"

# Terminal 2  
Task: "Initialize Node.js project in backend/ with package.json"

# Terminal 3
Task: "Initialize Vite+React project in frontend/ with package.json"
```

### Example 2: Backend Contract Tests (T010-T035)
All backend contract tests are independent and can run in parallel:
```bash
# Launch all 26 contract test tasks simultaneously
Task: "Contract test GET /api/v1/robots in backend/tests/contract/test_robots_get.test.ts"
Task: "Contract test POST /api/v1/robots in backend/tests/contract/test_robots_post.test.ts"
... (all T010-T035)
```

### Example 3: Data Models (T055-T060)
All entity models are independent:
```bash
Task: "Robot entity model in backend/src/models/Robot.ts"
Task: "RobotState entity model in backend/src/models/RobotState.ts"
Task: "Map entity model in backend/src/models/Map.ts"
Task: "RestrictedZone entity model in backend/src/models/RestrictedZone.ts"
Task: "Session entity model in backend/src/models/Session.ts"
Task: "Log entity model in backend/src/models/Log.ts"
```

### Example 4: Robot Sensors (T075-T080)
All sensor interfaces are independent:
```bash
Task: "RPLIDAR S2L interface in robot/src/sensors/lidar.py"
Task: "MPU9250 IMU interface in robot/src/sensors/imu.py"
Task: "Encoder interface in robot/src/sensors/encoders.py"
Task: "Ultrasonic sensor interface in robot/src/sensors/ultrasonic.py"
Task: "Water level sensor interface in robot/src/sensors/water_level.py"
Task: "PCA9685 PWM interface in robot/src/control/pwm_controller.py"
```

### Example 5: Frontend Components (T096-T105)
All React components are independent:
```bash
Task: "MapViewer component in frontend/src/components/MapViewer/MapViewer.tsx"
Task: "JoggingControls component in frontend/src/components/Controls/JoggingControls.tsx"
Task: "EmergencyStop button component in frontend/src/components/Controls/EmergencyStopButton.tsx"
... (all T096-T105)
```

---

## Notes

### TDD Workflow
1. **Write test**: Task from Phase 3.2 (T010-T054)
2. **Run test**: Verify it fails (red)
3. **Implement**: Task from Phase 3.3 (T055-T113)
4. **Run test**: Verify it passes (green)
5. **Refactor**: Clean up code while keeping tests green
6. **Commit**: Commit after each task completion

### Parallel Execution Rules
- [P] tasks = different files, no dependencies
- Verify tests fail before implementing
- Commit after each task
- Avoid: vague tasks, same file conflicts

### File Path Specificity
Every task includes exact file path:
- ✅ Good: `robot/src/slam/occupancy_grid.py`
- ❌ Bad: `implement SLAM module`

### Coverage Targets
- Robot: 90%+ (critical safety functions 100%)
- Backend: 90%+
- Frontend: 85%+ (UI components may be lower)

---

## Task Generation Rules
*Applied during main() execution*

1. **From Contracts**: ✓
   - 26 API contract tests (T010-T035)
   - 9 WebSocket contract tests (T036-T044)

2. **From Data Model**: ✓
   - 6 entity models (T055-T060)
   - 5 service layers (T061-T065)

3. **From User Stories**: ✓
   - 10 integration tests from quickstart scenarios (T045-T054)

4. **Ordering**: ✓
   - Setup → Tests → Models → Services → Endpoints → Polish
   - Dependencies respected throughout

---

## Validation Checklist
*GATE: Checked by main() before returning*

- [x] All contracts have corresponding tests (T010-T044 test all API/WebSocket contracts)
- [x] All entities have model tasks (T055-T060 create all 6 persistent entities)
- [x] All tests come before implementation (Phase 3.2 before 3.3)
- [x] Parallel tasks truly independent (all [P] tasks operate on different files)
- [x] Each task specifies exact file path (all 154 tasks have paths)
- [x] No task modifies same file as another [P] task (verified)
- [x] All functional requirements have task coverage (43/45 FRs, gaps filled with T074a, T090a, T098a)

---

**Status**: ✓ Tasks Generated - 154 Tasks Ready for Execution (T001-T151 + T074a, T090a, T098a)  
**Next Command**: Begin implementation with T001 or run batch of parallel tasks
