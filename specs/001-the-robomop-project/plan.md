# Implementation Plan: RoboMop Autonomous Cleaning Robot System

**Branch**: `001-the-robomop-project` | **Date**: 2025-09-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `C:\Users\sebas\Desktop\RoboMop\specs\001-the-robomop-project\spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path ✓
2. Fill Technical Context ✓
3. Fill the Constitution Check section ✓
4. Evaluate Constitution Check section ✓
5. Execute Phase 0 → research.md ✓
6. Execute Phase 1 → contracts, data-model.md, quickstart.md ✓
7. Re-evaluate Constitution Check section ✓
8. Plan Phase 2 → Describe task generation approach ✓
9. STOP - Ready for /tasks command ✓
```

## Summary

The RoboMop system is an autonomous cleaning robot with comprehensive web-based monitoring and control capabilities. The system consists of three main components:

1. **Robot (Python)**: Autonomous navigation, SLAM mapping, cleaning path planning, and sensor fusion running on Raspberry Pi 5
2. **Backend (NodeJS/Express)**: Cloud-hosted API server managing real-time communication, data persistence, and WebSocket connections
3. **Frontend (Vite/React/TypeScript)**: Responsive web interface for desktop and tablet with real-time map visualization and robot control

**Primary Requirement**: Build an autonomous cleaning robot that explores environments using grid SLAM, plans efficient cleaning routes, and provides real-time remote monitoring/control through a modern web interface.

**Technical Approach**: Modular architecture with clear separation between robot control (Python), server (Node.js), and UI (React/TypeScript). Real-time bidirectional communication via WebSockets. TDD approach with comprehensive testing at all layers.

## Technical Context

**Language/Version**: 
- Robot: Python 3.11+
- Backend: Node.js 20.x LTS / TypeScript 5.x
- Frontend: TypeScript 5.x

**Primary Dependencies**: 
- Robot: RPLidar Python SDK, numpy, scipy (sensor fusion), asyncio (async comms)
- Backend: Express 4.x, Socket.io (WebSockets), TypeORM (data persistence)
- Frontend: React 18.x, Vite 5.x, Socket.io-client, Canvas/WebGL for map rendering

**Storage**: 
- Robot: Local file system (map cache)
- Backend: PostgreSQL (maps, logs, sessions) or SQLite for development
- Frontend: Browser localStorage (UI state)

**Testing**: 
- Robot: pytest, pytest-asyncio, unittest.mock
- Backend: Jest, supertest (API testing), Socket.io test utilities
- Frontend: Vitest, React Testing Library, Playwright (E2E)

**Target Platform**: 
- Robot: Raspberry Pi 5 (Debian-based Linux)
- Backend: Cloud VM (Linux) or containerized (Docker)
- Frontend: Modern browsers (Chrome, Firefox, Safari, Edge)

**Project Type**: Web application (robot + backend + frontend)

**Performance Goals**: 
- Map transmission: 5 Hz (200ms intervals)
- Position updates: 10 Hz (100ms intervals)
- UI map rendering: 60 FPS
- Emergency stop latency: <500ms end-to-end

**Constraints**: 
- Position accuracy: ±5 cm
- Map update visibility: <1 second
- E-stop response: <500ms
- WiFi-dependent communication (no offline mode for UI)
- Single robot support (extensible to multi-robot)

**Scale/Scope**: 
- Single robot per deployment
- Typical environment: 100-500 m² indoor spaces
- Map data: ~1-5 MB per environment
- Concurrent users: 1-5 per robot (monitoring only)
- Session logs: retained indefinitely until manual clear

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Modular Architecture Gate**: 
- [x] Each feature designed as standalone module with clear interface
  - Robot: SLAM, navigation, control, sensors as separate modules
  - Backend: API routes, WebSocket handlers, data layer separated
  - Frontend: Map viewer, controls, status display as components
- [x] No module dependencies on implementation details of other modules
  - Robot→Backend: REST API + WebSocket protocol only
  - Backend→Frontend: JSON REST + Socket.io events only
  - Clear contract definitions for all interfaces
- [x] Single, clear purpose defined for each component
  - Each module has single responsibility (SLAM, path planning, API, UI)

**Code Quality Gate**:
- [x] Linting and formatting standards defined
  - Python: black, pylint, mypy (type checking)
  - TypeScript: ESLint, Prettier
  - Pre-commit hooks for format validation
- [x] Static analysis checks configured
  - Python: mypy for type safety
  - TypeScript: strict mode enabled
  - Security scans: bandit (Python), npm audit (Node)
- [x] Code complexity justified in documentation
  - SLAM algorithms documented with references
  - Path planning logic explained with diagrams

**Consistency Gate**:
- [x] Standardized patterns for error handling, logging, configuration
  - Error handling: Try-except with specific exceptions (Python), Error classes (TS)
  - Logging: Structured JSON logs with levels (DEBUG, INFO, WARN, ERROR)
  - Config: Environment variables + config files with validation
- [x] Uniform naming conventions followed
  - Python: snake_case (PEP 8)
  - TypeScript: camelCase for variables/functions, PascalCase for types/components
  - API: kebab-case for endpoints, camelCase for JSON fields
- [x] Similar functionalities use consistent implementations
  - All API endpoints follow REST conventions
  - All WebSocket events use consistent payload format
  - All UI components follow React functional component pattern

**Testing Excellence Gate**:
- [x] TDD approach confirmed (tests before implementation)
  - Contract tests written first for all APIs
  - Unit tests for all business logic before code
  - Integration tests for robot-server-UI flows
- [x] Unit, integration, and contract tests planned
  - Unit: Individual modules (SLAM, controllers, services)
  - Integration: End-to-end robot control flow
  - Contract: API schema validation, WebSocket message formats
- [x] 90%+ test coverage target established
  - Enforced via coverage reports in CI
  - Critical paths (safety, navigation) require 100% coverage

**Documentation & Observability Gate**:
- [x] Comprehensive documentation planned for all modules
  - API: OpenAPI 3.0 specification
  - WebSocket: Event catalog with schemas
  - Code: Docstrings (Python), JSDoc (TypeScript)
  - Architecture: Diagrams in docs/
- [x] Structured logging strategy defined
  - JSON logs with correlation IDs for request tracing
  - Log levels: DEBUG (dev), INFO (prod), ERROR (alerts)
  - Centralized logging via stdout (captured by container/systemd)
- [x] Performance metrics and monitoring planned
  - Robot: Position accuracy, SLAM loop time, sensor read rates
  - Backend: API latency, WebSocket message rates, DB query time
  - Frontend: Render FPS, map update latency, user interaction lag

## Project Structure

### Documentation (this feature)
```
specs/001-the-robomop-project/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
│   ├── api-spec.yaml    # OpenAPI spec for REST API
│   └── websocket-events.md  # WebSocket event catalog
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
robot/
├── src/
│   ├── slam/            # Grid SLAM implementation
│   ├── navigation/      # Path planning and execution
│   ├── sensors/         # LIDAR, IMU, encoders, ultrasonic
│   ├── control/         # Motor control and PID loops
│   ├── communication/   # WebSocket/HTTP client
│   └── main.py          # Entry point
└── tests/
    ├── contract/        # API/WebSocket contract tests
    ├── integration/     # End-to-end robot tests
    └── unit/            # Module unit tests

backend/
├── src/
│   ├── models/          # TypeORM entities (Map, Session, RobotState)
│   ├── services/        # Business logic services
│   ├── api/             # Express REST routes
│   ├── websocket/       # Socket.io event handlers
│   └── server.ts        # Entry point
└── tests/
    ├── contract/        # API contract tests
    ├── integration/     # API integration tests
    └── unit/            # Service unit tests

frontend/
├── src/
│   ├── components/      # React components
│   │   ├── MapViewer/   # Real-time map rendering
│   │   ├── Controls/    # Jogging, mode, speed controls
│   │   └── StatusPanel/ # Robot status, water level, errors
│   ├── services/        # API and WebSocket clients
│   ├── hooks/           # Custom React hooks
│   ├── types/           # TypeScript type definitions
│   └── App.tsx          # Entry point
└── tests/
    ├── unit/            # Component unit tests
    └── e2e/             # Playwright E2E tests
```

**Structure Decision**: Web application with three-tier architecture:
1. **Robot** (Python on Raspberry Pi 5): Hardware interfacing, sensor fusion, SLAM, navigation
2. **Backend** (Node.js on cloud): API server, WebSocket gateway, data persistence
3. **Frontend** (React/TypeScript in browser): User interface for monitoring and control

This structure provides clear separation of concerns: robot handles autonomous operation, backend manages communication and data, frontend handles user interaction.

## Phase 0: Outline & Research

**Status**: ✓ Complete

### Research Topics Resolved

1. **Grid SLAM Algorithm Selection**
   - **Decision**: Occupancy Grid SLAM with particle filter localization
   - **Rationale**: Suitable for 2D indoor environments, efficient on Raspberry Pi 5, well-supported libraries
   - **Alternatives considered**: GraphSLAM (too computationally intensive), EKF-SLAM (less robust to multi-modal distributions)

2. **RPLIDAR S2L Integration**
   - **Decision**: Use rplidar Python library with async scan acquisition
   - **Rationale**: Official SDK, proven stability, async support for real-time performance
   - **Alternatives considered**: Custom driver (unnecessary complexity)

3. **IMU Sensor Fusion**
   - **Decision**: Complementary filter for IMU fusion, EKF for sensor fusion with encoders
   - **Rationale**: Lightweight, real-time capable, adequate accuracy for indoor navigation
   - **Alternatives considered**: Full EKF for IMU (overkill), Madgwick filter (more complex)

4. **Path Planning Algorithm**
   - **Decision**: A* for exploration frontier selection, coverage path planning for cleaning
   - **Rationale**: A* is proven and efficient, coverage algorithms ensure complete area cleaning
   - **Alternatives considered**: RRT (unnecessary for known maps), D* (overkill for static planning)

5. **Real-time Communication Protocol**
   - **Decision**: WebSocket (Socket.io) for bidirectional real-time data
   - **Rationale**: Low latency, event-based, supports binary data for map tiles
   - **Alternatives considered**: HTTP polling (too slow), gRPC (overcomplicated for web)

6. **Map Data Structure**
   - **Decision**: 2D occupancy grid with metadata (resolution, origin, size)
   - **Rationale**: Standard SLAM representation, easily serializable, efficient rendering
   - **Alternatives considered**: Vector map (harder to update), point cloud (too large)

7. **Frontend Map Rendering**
   - **Decision**: HTML5 Canvas with delta updates for performance
   - **Rationale**: 60 FPS capable, widely supported, easy to integrate with React
   - **Alternatives considered**: WebGL (overcomplicated), SVG (too slow for large maps)

8. **Database Choice**
   - **Decision**: PostgreSQL for production, SQLite for development
   - **Rationale**: PostgreSQL handles JSONB for flexible map metadata, reliable, good TypeORM support
   - **Alternatives considered**: MongoDB (no strong need for document DB), MySQL (less JSONB support)

**Output**: All technical unknowns resolved, architecture decisions documented above.

## Phase 1: Design & Contracts

**Status**: ✓ Complete

### Artifacts Generated
1. **data-model.md**: Complete entity definitions with fields, relationships, validation
2. **contracts/api-spec.yaml**: OpenAPI 3.0 specification for all REST endpoints
3. **contracts/websocket-events.md**: Socket.io event catalog with JSON schemas
4. **quickstart.md**: Step-by-step testing scenarios for all user stories

### Key Design Decisions
- **API Architecture**: RESTful for CRUD operations, WebSocket for real-time streams
- **State Management**: Robot maintains state locally, syncs to backend, frontend subscribes via WebSocket
- **Error Handling**: HTTP status codes for REST, error events for WebSocket, retry logic with exponential backoff
- **Security**: API key authentication for robot, session-based auth for web UI (future: OAuth)

### Contract Tests Created
- Robot→Backend API contract tests (26 test files covering all REST endpoints)
- Backend→Frontend WebSocket event tests (9 test files covering all Socket.io events)
- Integration test scenarios (10 test files covering all quickstart scenarios)

All tests currently fail (no implementation) - ready for TDD implementation phase.

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Load `.specify/templates/tasks-template.md` as base
- Generate tasks from Phase 1 design docs (contracts, data model, quickstart)
- Each API endpoint → contract test task [P] + implementation task
- Each WebSocket event → contract test task [P] + handler implementation
- Each entity → model creation task [P] + repository pattern
- Each user story → integration test task + feature implementation
- Each SLAM/navigation component → unit test [P] + algorithm implementation

**Ordering Strategy**:
- **TDD order**: All tests before corresponding implementation
- **Dependency order**: 
  1. Setup: Project init, dependencies, linting
  2. Data layer: Models, schemas, database migrations
  3. Robot core: Sensors → SLAM → Navigation → Control
  4. Backend core: API routes → WebSocket → Data services
  5. Frontend core: Components → Services → Integration
  6. Integration: End-to-end flows, quickstart validation
- **Parallel execution**: Mark [P] for tasks operating on different files/modules

**Estimated Output**: 60-80 numbered, ordered tasks in tasks.md

Tasks will be organized into:
- Phase 3.1: Setup (5-10 tasks)
- Phase 3.2: Tests First (25-30 tasks) ⚠️ MUST COMPLETE BEFORE 3.3
- Phase 3.3: Core Implementation (30-40 tasks)
- Phase 3.4: Integration (5-10 tasks)
- Phase 3.5: Polish (5-10 tasks)

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking
*Fill ONLY if Constitution Check has violations that must be justified*

No constitutional violations detected. The architecture follows modular principles with clear separation of concerns, comprehensive testing strategy, and well-documented design decisions.

## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented (none)

---
*Based on Constitution v1.0.0 - See `.specify/memory/constitution.md`*