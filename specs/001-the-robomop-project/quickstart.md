# Quickstart Test Scenarios: RoboMop

**Date**: 2025-09-30  
**Phase**: 1 (Design & Contracts)  
**Purpose**: Manual and automated test scenarios to validate all acceptance criteria

## Overview

This document provides step-by-step test scenarios derived from the feature specification. Each scenario validates one or more functional requirements and can be executed manually or automated using integration/E2E tests.

**Prerequisites**:
- Robot hardware connected and operational
- Backend server running with database initialized
- Frontend web app accessible
- Test environment configured (see Setup section)

---

## Setup

### 1. Environment Setup
```bash
# Start PostgreSQL (or use SQLite for local testing)
# Database connection: postgresql://localhost:5432/robomop_test

# Start Backend
cd backend
npm install
npm run db:migrate
npm run dev

# Start Frontend
cd frontend
npm install
npm run dev

# Configure Robot
cd robot
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python src/main.py --config test-config.yaml
```

### 2. Test Data Initialization
```bash
# Create test robot
curl -X POST http://localhost:3000/api/v1/robots \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Robot",
    "serialNumber": "TEST-001",
    "modelVersion": "1.0.0",
    "firmwareVersion": "1.0.0"
  }'

# Note the returned robotId for subsequent tests
```

### 3. Verification
- Backend: Navigate to `http://localhost:3000/health` (should return 200 OK)
- Frontend: Navigate to `http://localhost:5173` (should show UI)
- Robot: Check logs for "Connected to backend" message

---

## Test Scenarios

## Scenario 1: Robot Registration and Connection

**User Story**: System must register and connect robot  
**Requirements**: Robot entity, WebSocket connection  
**Priority**: P0 (Critical)

### Steps
1. **Register Robot** (if not done in setup)
   ```bash
   POST /api/v1/robots
   Body: {"name": "Test Robot", "serialNumber": "TEST-001", ...}
   ```
   
2. **Start Robot Client**
   ```bash
   python src/main.py --robot-id <ROBOT_ID> --api-key <API_KEY>
   ```

3. **Verify Connection**
   - Check robot logs: "WebSocket connected"
   - Check backend logs: "Robot TEST-001 connected"
   - Check frontend UI: Robot status = "ONLINE"

4. **Verify Heartbeat**
   - Wait 10 seconds
   - Query robot state: `GET /api/v1/robots/<ROBOT_ID>/state`
   - Verify `lastSeenAt` timestamp is recent (<10 seconds ago)

### Expected Results
- ✅ Robot registered with unique ID
- ✅ WebSocket connection established
- ✅ Heartbeat events received every 5 seconds
- ✅ Robot status shows "ONLINE" in UI

### Cleanup
- Disconnect robot: Ctrl+C
- Verify status changes to "OFFLINE" within 10 seconds

---

## Scenario 2: Exploration Mode - Map Building

**User Story**: Robot autonomously explores and maps environment  
**Requirements**: FR-001, FR-002, FR-003, FR-004  
**Priority**: P0 (Critical)

### Preconditions
- Robot connected (Scenario 1 complete)
- Robot in IDLE mode
- Clear test area (minimum 3m x 3m)

### Steps

1. **Create New Map**
   ```bash
   POST /api/v1/maps
   Body: {
     "robotId": "<ROBOT_ID>",
     "resolution": 0.05,
     "width": 1000,
     "height": 1000,
     "origin": {"x": -25.0, "y": -25.0, "theta": 0.0}
   }
   ```
   **Verify**: Map created with ID, `completionPercentage` = 0

2. **Start Exploration Session**
   ```bash
   POST /api/v1/sessions
   Body: {
     "robotId": "<ROBOT_ID>",
     "mapId": "<MAP_ID>",
     "type": "EXPLORATION"
   }
   ```
   **Verify**: Session created with status "IN_PROGRESS"

3. **Command Robot to Start Exploration**
   - Via UI: Click "Start Exploration" button
   - Or via WebSocket: Send `command:set-mode {mode: EXPLORATION}`
   
   **Verify**: 
   - Robot mode changes to "EXPLORATION"
   - Robot begins moving
   - LIDAR spinning

4. **Monitor Exploration Progress**
   - Watch frontend map viewer
   - Observe map filling in as robot explores
   - Check `completionPercentage` increasing

5. **Wait for Completion**
   - Robot autonomously explores all accessible areas
   - When complete: Robot stops, mode changes to "IDLE"
   - Session status changes to "COMPLETED"

6. **Verify Map Quality**
   ```bash
   GET /api/v1/maps/<MAP_ID>
   ```
   **Check**:
   - `completionPercentage` ≥ 95%
   - Map data shows walls, open spaces, and obstacles
   - No large unexplored gaps (except inaccessible areas)

### Expected Results
- ✅ Robot autonomously explores environment
- ✅ Map built with ≥95% coverage
- ✅ Obstacles and walls accurately mapped
- ✅ Robot detects completion (no more frontiers)
- ✅ Map updates visible in UI within 1 second
- ✅ Session statistics recorded (distance, duration, etc.)

### Performance Criteria
- Position accuracy: ±5 cm (verify via ground truth markers)
- Map update rate: 5 Hz during exploration
- Exploration completion time: <30 minutes for 50 m² area

### Cleanup
- Session should auto-complete
- Robot returns to IDLE mode

---

## Scenario 3: Cleaning Mode - Full Area Coverage

**User Story**: Robot executes cleaning route covering entire mapped area  
**Requirements**: FR-005, FR-006, FR-007, NFR-006  
**Priority**: P0 (Critical)

### Preconditions
- Scenario 2 complete (map exists with 100% exploration)
- Robot in IDLE mode
- Water tank filled (≥50%)
- Battery charged (≥80%)

### Steps

1. **Create Cleaning Session**
   ```bash
   POST /api/v1/sessions
   Body: {
     "robotId": "<ROBOT_ID>",
     "mapId": "<MAP_ID>",
     "type": "CLEANING"
   }
   ```

2. **Start Cleaning via UI**
   - Navigate to web interface
   - Select map
   - Click "Start Cleaning" button
   - Confirm action in dialog (as per FR-040)

3. **Monitor Cleaning Progress**
   - Watch robot follow planned route
   - Observe coverage pattern (boustrophedon or spiral)
   - Check water level decreasing
   - Check battery level decreasing

4. **Verify Route Execution**
   - Robot stays on planned path (±10 cm tolerance)
   - Robot avoids restricted zones (if any)
   - Robot corrects position errors automatically

5. **Wait for Completion**
   - Robot covers entire accessible area
   - Robot returns to starting position
   - Mode changes to IDLE
   - Session status = "COMPLETED"

6. **Verify Session Statistics**
   ```bash
   GET /api/v1/sessions/<SESSION_ID>
   ```
   **Check**:
   - `statistics.areaCovered` ≈ total map area
   - `statistics.distanceTraveled` > 0
   - `statistics.duration` reasonable
   - `statistics.completionReason` = "FINISHED"

### Expected Results
- ✅ Robot plans efficient cleaning route
- ✅ Robot covers ≥95% of accessible area
- ✅ Robot maintains position accuracy (±5 cm)
- ✅ Robot operates until completion
- ✅ Robot returns to starting position
- ✅ Session logged with complete statistics

### Performance Criteria
- Coverage efficiency: ≥95% of accessible area
- Path overlap: ≤10%
- Runtime: Operates until completion (per NFR-006)

### Cleanup
- Session should auto-complete
- Robot at starting position in IDLE mode

---

## Scenario 4: Manual Control - Jogging

**User Story**: User manually controls robot via web interface  
**Requirements**: FR-018, FR-035, FR-037  
**Priority**: P1 (High)

### Preconditions
- Robot connected
- Robot in IDLE or MANUAL mode
- Frontend UI open

### Steps

1. **Enter Manual Mode**
   - UI: Select "Manual" mode from dropdown
   - Verify: Robot mode changes to "MANUAL"

2. **Test Forward Movement**
   - UI: Click "Forward" button
   - Verify: Robot moves forward
   - Verify: Command acknowledged within network latency
   - UI: Release button
   - Verify: Robot stops

3. **Test Rotation**
   - UI: Click "Rotate Left" button
   - Verify: Robot rotates counter-clockwise
   - UI: Release button
   - Verify: Robot stops

4. **Test Speed Control**
   - UI: Adjust speed slider to 50%
   - UI: Click "Forward" button
   - Verify: Robot moves at reduced speed
   - Measure: Velocity ≈ 0.15 m/s (half of max ~0.3 m/s)

5. **Test Directional Controls**
   - Forward: Robot moves forward
   - Backward: Robot moves backward
   - Left: Robot rotates left (CCW)
   - Right: Robot rotates right (CW)

### Expected Results
- ✅ Robot responds to manual commands
- ✅ Movement direction matches button pressed
- ✅ Speed adjustable via slider
- ✅ Robot stops when button released
- ✅ Command latency ≤ WiFi round-trip time

### Performance Criteria
- Command execution: As fast as network allows (typically <200ms)
- Control responsiveness: Immediate (no lag visible to user)

### Cleanup
- Return to IDLE mode

---

## Scenario 5: Emergency Stop

**User Story**: User can immediately stop robot in emergency  
**Requirements**: FR-014, FR-036  
**Priority**: P0 (Critical - Safety)

### Preconditions
- Robot connected
- Robot in any active mode (MANUAL, EXPLORATION, or CLEANING)
- Robot in motion

### Steps

1. **Initiate Emergency Stop**
   - **Method 1 (UI)**: Click large red "E-STOP" button
   - **Method 2 (WebSocket)**: Send `command:e-stop` event
   - **Method 3 (API)**: 
     ```bash
     POST /api/v1/robots/<ROBOT_ID>/command
     Body: {"type": "E_STOP", "payload": {}}
     ```

2. **Measure Response Time**
   - Record timestamp of E-stop command
   - Record timestamp of robot acknowledgement
   - Record timestamp of robot velocity = 0

3. **Verify Robot State**
   - Robot velocity: linear = 0, angular = 0
   - Robot mode: IDLE or ERROR
   - Motors: All stopped
   - Position: Last known position maintained

4. **Verify UI Update**
   - Robot status shows "Stopped" or "Emergency"
   - E-stop indicator visible
   - Map shows robot at stopped position

### Expected Results
- ✅ Robot stops all movement within 500ms
- ✅ Command acknowledged within 500ms
- ✅ Robot enters safe state (IDLE or ERROR)
- ✅ UI updates to show stopped status
- ✅ E-stop works from any operational mode

### Performance Criteria
- **CRITICAL**: E-stop response ≤ 500ms (per FR-014, NFR-003)
- Measurement: Command sent → Motors stopped < 500ms

### Cleanup
- Clear error state if needed
- Return to IDLE mode

---

## Scenario 6: Restricted Zones

**User Story**: User paints restricted zones, robot avoids them  
**Requirements**: FR-007, FR-030, FR-040  
**Priority**: P1 (High)

### Preconditions
- Map exists (from Scenario 2)
- Robot in IDLE mode
- Frontend UI open on map view

### Steps

1. **Create Restricted Zone via UI**
   - UI: Click "Paint Restricted Zone" tool
   - UI: Draw polygon on map (e.g., around a rug or pet area)
     - Click 4+ points to define boundary
     - Double-click to close polygon
   - UI: Name zone: "Living room rug"
   - UI: Save zone

2. **Verify Zone Created**
   ```bash
   GET /api/v1/maps/<MAP_ID>/zones
   ```
   **Check**:
   - Zone present in list
   - Geometry matches drawn polygon
   - Zone visible on map as shaded area

3. **Plan Cleaning with Restricted Zone**
   - UI: Start cleaning session
   - Observe planned route avoids restricted zone
   - Route should go around zone, not through it

4. **Execute Cleaning**
   - Robot executes cleaning path
   - Verify: Robot never enters restricted zone
   - Verify: Robot cleans up to zone boundary

5. **Test Overlapping Zone Edit**
   - UI: Edit zone to expand boundary
   - WebSocket: Receive `frontend:zone-updated` event
   - Verify: Map updates immediately (last-write-wins, per FR-046)

### Expected Results
- ✅ User can draw restricted zones on map
- ✅ Zones persist across sessions
- ✅ Robot avoids restricted zones during exploration
- ✅ Robot avoids restricted zones during cleaning
- ✅ Zone edits update map in real-time
- ✅ Concurrent edits resolved with last-write-wins

### Cleanup
- Optionally delete test zone: `DELETE /api/v1/zones/<ZONE_ID>`

---

## Scenario 7: Water Level Monitoring

**User Story**: Robot monitors water level and alerts when low  
**Requirements**: FR-012  
**Priority**: P1 (High)

### Preconditions
- Robot in CLEANING mode
- Water tank partially filled

### Steps

1. **Monitor Water Level**
   - Frontend: Observe water level gauge
   - Should show current percentage (e.g., 65%)

2. **Simulate Water Depletion**
   - **Option A** (Real): Let robot clean until water low
   - **Option B** (Simulated): Manually trigger low water sensor

3. **Verify Low Water Alert**
   - When water level < 20%:
     - Robot publishes `robot:error` with code "WATER_LOW"
     - Frontend displays warning notification
     - Robot pauses cleaning
     - Robot mode changes to IDLE or ERROR

4. **Refill Water**
   - Manually refill water tank
   - Robot sensor detects water level restored

5. **Resume Cleaning**
   - UI: Click "Resume" button
   - Robot continues cleaning from paused position

### Expected Results
- ✅ Water level monitored continuously
- ✅ Alert triggered when water < 20%
- ✅ Robot pauses cleaning automatically
- ✅ User notified via UI
- ✅ Cleaning resumable after refill

### Cleanup
- Complete or cancel cleaning session

---

## Scenario 8: Low Battery Behavior

**User Story**: Robot returns to start when battery critically low  
**Requirements**: FR-045  
**Priority**: P1 (High)

### Preconditions
- Robot in CLEANING mode
- Battery level monitored

### Steps

1. **Monitor Battery Level**
   - Frontend: Observe battery gauge
   - Should decrease during operation

2. **Trigger Low Battery**
   - **Option A** (Real): Run robot until battery < 15%
   - **Option B** (Simulated): Manually trigger low battery condition

3. **Verify Low Battery Behavior**
   - Robot stops current task
   - Robot plans path to starting position
   - Robot navigates to start position
   - Robot enters IDLE mode
   - User receives alert: "Low battery - returning to start"

4. **Verify Arrival at Start**
   - Robot position = starting position (±10 cm)
   - Robot stopped and idle
   - Session marked "INTERRUPTED" with reason "LOW_BATTERY"

### Expected Results
- ✅ Robot detects critically low battery (< 15%)
- ✅ Robot returns to starting position
- ✅ Robot pauses and alerts user
- ✅ Session statistics include interruption reason

### Cleanup
- Recharge battery before next test

---

## Scenario 9: WiFi Disconnection Handling

**User Story**: Robot handles WiFi disconnection gracefully  
**Requirements**: FR-025  
**Priority**: P1 (High)

### Test 9A: Disconnection During Manual Control

1. **Setup**: Robot in MANUAL mode, moving forward
2. **Disconnect**: Disable WiFi on robot or block connection
3. **Verify**: Robot stops immediately (within 1 second)
4. **Reconnect**: Re-enable WiFi
5. **Verify**: Robot reconnects, enters IDLE mode

**Expected**: Robot stops when WiFi lost during manual control (safety-critical)

### Test 9B: Disconnection During Autonomous Cleaning

1. **Setup**: Robot in CLEANING mode, executing path
2. **Disconnect**: Disable WiFi
3. **Verify**: Robot continues cleaning from last known plan
4. **Wait**: 30 seconds
5. **Verify**: Robot still cleaning (not stopped)
6. **Reconnect**: Re-enable WiFi
7. **Verify**: Robot reconnects, syncs state, continues cleaning

**Expected**: Robot continues autonomous tasks when WiFi lost

### Expected Results
- ✅ Manual mode: Robot stops when WiFi lost (safety)
- ✅ Autonomous mode: Robot continues task using last plan
- ✅ Automatic reconnection when WiFi restored
- ✅ State synced after reconnection

---

## Scenario 10: Real-time Map Updates

**User Story**: Map updates visible in UI within 1 second  
**Requirements**: NFR-002  
**Priority**: P1 (High)

### Preconditions
- Robot in EXPLORATION mode
- Frontend UI open on map view

### Steps

1. **Start Exploration**
   - Robot begins exploring new area

2. **Measure Update Latency**
   - Place visible marker in robot's path
   - Timestamp: Robot LIDAR scans marker
   - Timestamp: Marker appears on UI map
   - Calculate: Latency = UI timestamp - LIDAR timestamp

3. **Verify Update Rate**
   - Robot publishes map updates at 5 Hz (every 200ms)
   - Backend forwards to frontend via WebSocket
   - Frontend renders updates at 60 FPS

4. **Verify Visual Smoothness**
   - Map updates appear smooth, not choppy
   - No visible lag between robot movement and map update

### Expected Results
- ✅ Map updates transmitted at 5 Hz
- ✅ Map updates visible in UI within 1 second (per NFR-002)
- ✅ UI rendering smooth (60 FPS)
- ✅ No perceptible lag

### Performance Criteria
- **CRITICAL**: Map visibility latency < 1 second (per NFR-002)
- Typical latency: 200-400ms (1-2 update cycles + network + render)

---

## Scenario 11: Multi-User Observation

**User Story**: Multiple users can monitor robot simultaneously  
**Requirements**: NFR-005 (single robot, extensible to multi-robot)  
**Priority**: P2 (Medium)

### Steps

1. **Open Frontend in Multiple Browsers**
   - Browser 1: Chrome
   - Browser 2: Firefox
   - Browser 3: Safari (on tablet)

2. **All Browsers: Connect to Same Robot**
   - Navigate to robot dashboard
   - Select same robot ID

3. **Start Robot Operation**
   - Browser 1: Start cleaning
   - Browsers 2 & 3: Observe only

4. **Verify All Browsers Receive Updates**
   - Robot position updates in all browsers
   - Map updates visible in all browsers
   - Status changes reflected in all browsers

5. **Test Concurrent Command** (Should be prevented)
   - Browser 2: Try to send movement command while cleaning
   - Verify: Error "Robot busy" or command ignored

### Expected Results
- ✅ Multiple users can observe simultaneously
- ✅ All users receive same real-time updates
- ✅ Only one user can control at a time (conflict prevention)

---

## Scenario 12: Log Retention and Retrieval

**User Story**: Operational logs retained until manually cleared  
**Requirements**: FR-043  
**Priority**: P2 (Medium)

### Steps

1. **Generate Logs**
   - Run Scenarios 2-3 (Exploration + Cleaning)
   - Logs auto-generated for all operations

2. **Query Logs**
   ```bash
   GET /api/v1/logs?robotId=<ROBOT_ID>&level=INFO&limit=100
   ```
   **Verify**: Logs returned in reverse chronological order

3. **Filter Logs by Session**
   ```bash
   GET /api/v1/logs?sessionId=<SESSION_ID>
   ```
   **Verify**: Only logs from that session returned

4. **Verify Retention**
   - Wait 24 hours (or simulate)
   - Query logs again
   - Verify: Logs still present (not auto-deleted)

5. **Manual Clear**
   ```bash
   DELETE /api/v1/logs?robotId=<ROBOT_ID>&before=2025-09-30T00:00:00Z
   ```
   **Verify**: Logs before date deleted, others retained

### Expected Results
- ✅ Logs generated for all operations
- ✅ Logs queryable by robot, session, level, time
- ✅ Logs retained indefinitely until manual clear
- ✅ User can clear logs selectively

---

## Automated Test Execution

The scenarios above can be automated using:

### Robot (Python)
```bash
cd robot
pytest tests/integration/test_quickstart.py -v
```

### Backend (Node.js)
```bash
cd backend
npm run test:integration
```

### Frontend (E2E)
```bash
cd frontend
npx playwright test tests/e2e/quickstart.spec.ts
```

### Full Suite
```bash
# From repository root
npm run test:quickstart
```

---

## Success Criteria

**All Scenarios Pass**:
- ✅ 12/12 scenarios pass
- ✅ All functional requirements validated
- ✅ All non-functional requirements met
- ✅ Zero critical bugs
- ✅ Performance targets achieved

**Performance Benchmarks**:
- Position accuracy: ±5 cm
- Map update latency: < 1 second
- E-stop response: < 500ms
- Exploration coverage: ≥ 95%
- Cleaning coverage: ≥ 95%

---

**Status**: ✓ Quickstart Scenarios Complete - Ready for Test Implementation
