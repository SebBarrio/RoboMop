# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

RoboMop is an autonomous cleaning robot system with three main components:

1. **Robot** (Python 3.11+) - Runs on Raspberry Pi 5, handles SLAM, navigation, sensor fusion, and motor control
2. **Backend** (Node.js 20+ / TypeScript) - Cloud-hosted Express server with REST API, WebSocket gateway, and data persistence
3. **Frontend** (React 18 / TypeScript / Vite) - Web interface for real-time monitoring and control

The robot explores environments using grid SLAM, plans cleaning routes, and communicates via WebSocket for real-time bidirectional data exchange.

## Essential Commands

### Backend (Node.js/Express/TypeScript)

```powershell
# Development
cd backend
npm install
npm run dev              # Start dev server with hot reload (tsx watch)
npm run build            # Compile TypeScript to dist/
npm start                # Run compiled code (node dist/server.js)

# Testing & Quality
npm test                 # Run Jest tests
npm run test:watch       # Run Jest in watch mode
npm run lint             # ESLint
npm run format           # Prettier
```

### Frontend (React/Vite/TypeScript)

```powershell
# Development
cd frontend
npm install
npm run dev              # Start Vite dev server (http://localhost:5173)
npm run build            # Build for production (tsc + vite build)
npm run preview          # Preview production build

# Testing & Quality
npm run test             # Run Vitest tests
npm run test:watch       # Run Vitest in watch mode
npm run lint             # ESLint
npm run format           # Prettier
```

### Robot (Python)

```powershell
# Development
cd robot
python -m venv venv
.\venv\Scripts\activate  # Activate virtual environment
pip install -r requirements.txt

# Testing & Quality
pytest                   # Run tests
pytest -v                # Verbose test output
black src tests          # Format code
black --check src tests  # Check formatting without changes
pylint src               # Lint code
mypy src                 # Type checking
```

### CI/CD

The project uses GitHub Actions (`.github/workflows/ci.yml`) for continuous integration:
- Runs on pushes to `main` and `001-the-robomop-project` branches
- Each component (backend, frontend, robot) is tested independently
- Checks include: linting, type checking, formatting, and unit tests

## Architecture & Development Patterns

### Three-Tier Architecture

1. **Robot Layer**: Hardware interfacing, autonomous operations
   - SLAM mapping (`robot/src/slam/` - to be implemented)
   - Navigation & path planning (`robot/src/navigation/` - to be implemented)
   - Sensor fusion (`robot/src/sensors/` - to be implemented)
   - Motor control with PID loops (`robot/src/control/` - to be implemented)

2. **Backend Layer**: Communication hub and data persistence
   - Express REST API for CRUD operations
   - Socket.io for real-time bidirectional communication
   - TypeORM for database abstraction (PostgreSQL/SQLite)
   - Located in `backend/src/`

3. **Frontend Layer**: User interface
   - React functional components with hooks
   - Real-time map rendering using HTML5 Canvas
   - Socket.io client for live updates
   - Located in `frontend/src/`

### Key Communication Patterns

- **REST API**: Used for CRUD operations (robots, maps, sessions)
- **WebSocket (Socket.io)**: Real-time data streams
  - Robot → Backend: Map updates (5 Hz), position (10 Hz), sensor data
  - Backend → Frontend: All real-time state changes
  - Frontend → Backend: Control commands (jogging, mode changes, E-stop)

### Test-Driven Development (TDD)

The project follows strict TDD principles:
- Write tests before implementation
- Contract tests validate API/WebSocket interfaces
- Unit tests cover business logic
- Integration tests validate end-to-end flows
- Target: 90%+ coverage (100% for critical paths like safety features)

### Code Style & Quality

**Python (Robot):**
- Black formatter (100 char line length)
- Pylint for linting
- mypy for static type checking (strict mode)
- Type hints required for all functions
- docstrings following Google style

**TypeScript (Backend/Frontend):**
- ESLint with TypeScript plugin
- Prettier for formatting
- Strict TypeScript mode enabled
- Functional components with hooks (Frontend)
- No `any` types without justification

### Project Constitution

The project follows principles defined in `.specify/memory/constitution.md` and `.cursor/commands/constitution.md`:
- **Modular Architecture**: Each module has single, clear purpose with defined interfaces
- **Code Quality**: Linting, static analysis, complexity justification required
- **Consistency**: Standardized error handling, logging, configuration patterns
- **Testing Excellence**: TDD approach, comprehensive test coverage
- **Documentation**: API specs (OpenAPI), WebSocket event catalogs, inline documentation

## Key Technical Details

### Real-time Communication

- **Map transmission**: 5 Hz (every 200ms)
- **Position updates**: 10 Hz (every 100ms)
- **Emergency stop latency**: Must be <500ms end-to-end
- **Position accuracy**: ±5 cm required

### Data Models

Located in `specs/001-the-robomop-project/data-model.md`:
- **Robot**: Physical robot instance, connection status
- **RobotState**: Operational state (mode, position, velocity, battery, water level)
- **Map**: Spatial environment representation (occupancy grid)
- **Session**: Exploration or cleaning operation
- **RestrictedZone**: User-defined no-go areas
- **SensorData**: LIDAR, IMU, encoders, ultrasonic readings

### API Contracts

Defined in `specs/001-the-robomop-project/contracts/`:
- REST API: OpenAPI 3.0 spec (`api-spec.yaml`)
- WebSocket: Event catalog (`websocket-events.md`)

### Database

- **Production**: PostgreSQL (with JSONB support for map metadata)
- **Development**: SQLite (simpler setup)
- **ORM**: TypeORM with migrations (`backend/src/migrations/`)

### Performance Requirements

- **Map update visibility**: <1 second in UI
- **UI rendering**: 60 FPS target
- **Position estimation**: ±5 cm accuracy
- **Control latency**: As fast as WiFi allows (no specific target beyond round-trip)

## Development Workflow

### Specification-Driven Development

The project uses `.specify/` templates and `specs/` directory:
- Feature specs define WHAT users need (no implementation details)
- Plans define technical approach, architecture decisions
- Data models, contracts, and quickstart scenarios guide implementation
- Tasks are derived from specs using TDD ordering

### Working with Specs

Important specification files in `specs/001-the-robomop-project/`:
- `spec.md`: Feature requirements and acceptance criteria
- `plan.md`: Technical implementation plan and architecture decisions
- `data-model.md`: Complete entity definitions
- `quickstart.md`: Manual test scenarios
- `contracts/`: API and WebSocket specifications

### Safety-Critical Features

When working on safety features (emergency stop, fall detection, obstacle avoidance):
- Require 100% test coverage
- Add integration tests validating <500ms E-stop response
- Document in code with explicit safety comments
- Follow requirements FR-008, FR-009, FR-014, FR-045

## Common Development Tasks

### Adding a New API Endpoint

1. Define contract in `specs/001-the-robomop-project/contracts/api-spec.yaml`
2. Write contract test in `backend/tests/contract/`
3. Write unit tests in `backend/tests/unit/`
4. Implement route in `backend/src/api/`
5. Update quickstart scenarios if user-facing

### Adding a New WebSocket Event

1. Define event in `specs/001-the-robomop-project/contracts/websocket-events.md`
2. Write contract test validating message format
3. Implement handler in `backend/src/websocket/`
4. Update frontend client in `frontend/src/services/`
5. Add integration test for end-to-end flow

### Adding Robot Functionality

1. Design module interface (SLAM, navigation, sensors, control)
2. Write unit tests in `robot/tests/unit/`
3. Implement module following single responsibility principle
4. Add type hints and docstrings
5. Verify with mypy and black formatting
6. Add integration tests if communicating with backend

### Troubleshooting

**Backend won't start:**
- Check database connection (PostgreSQL running or SQLite file writable)
- Verify `.env` file exists with required config
- Check port 3000 is available

**Frontend can't connect:**
- Verify backend is running on `http://localhost:3000`
- Check WebSocket connection in browser dev tools
- Ensure CORS configuration allows frontend origin

**Robot connection issues:**
- Verify WiFi connectivity
- Check API key is valid
- Confirm backend WebSocket endpoint is accessible
- Check robot logs for connection errors

**Tests failing:**
- Run tests in sequential mode: `npm test -- --runInBand` (backend)
- Check test database is isolated (use different DB for tests)
- Verify mocks are properly configured

## Windows-Specific Notes

This project is being developed on Windows with PowerShell:
- Use `.\venv\Scripts\activate` for Python virtual environment (not `source venv/bin/activate`)
- Path separators: Windows uses backslash, but code should use forward slash for cross-platform compatibility
- Line endings: Configure git to handle CRLF/LF appropriately
- Some Python packages (like RPLidar) may require special handling on Windows

## Additional Resources

- **Quickstart Scenarios**: `specs/001-the-robomop-project/quickstart.md` - Step-by-step test scenarios
- **Research Decisions**: `specs/001-the-robomop-project/research.md` - Algorithm choices and rationale
- **Task Planning**: Future `specs/001-the-robomop-project/tasks.md` (generated by /tasks command)
