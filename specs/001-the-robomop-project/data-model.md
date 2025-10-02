# Data Model: RoboMop

**Date**: 2025-09-30  
**Phase**: 1 (Design & Contracts)  
**Status**: Complete

## Overview

This document defines all data entities, their fields, relationships, validation rules, and state transitions for the RoboMop system. Models are designed to support modularity, testability, and clear contracts between robot, backend, and frontend.

---

## Entity Relationship Diagram

```
┌──────────────┐         ┌──────────────┐
│              │         │              │
│    Robot     │────────▶│ RobotState   │
│              │  1:N    │              │
└──────────────┘         └──────────────┘
       │                        │
       │                        │
       │ 1:N                    │ N:1
       ▼                        ▼
┌──────────────┐         ┌──────────────┐
│              │         │              │
│   Session    │◀────────│     Map      │
│              │  N:1    │              │
└──────────────┘         └──────────────┘
       │                        │
       │                        │
       │ 1:N                    │ 1:N
       ▼                        ▼
┌──────────────┐         ┌──────────────┐
│              │         │              │
│     Log      │         │RestrictedZone│
│              │         │              │
└──────────────┘         └──────────────┘
       │
       │ N:1
       ▼
┌──────────────┐
│              │
│  SensorData  │
│              │
└──────────────┘
```

---

## 1. Robot

Represents the physical robot instance.

### Fields

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `id` | UUID | Yes | - | Primary key |
| `name` | String | Yes | Max 100 chars | Human-readable robot name |
| `serialNumber` | String | Yes | Unique, alphanumeric | Hardware serial number |
| `modelVersion` | String | Yes | Semver format | Robot model version (e.g., "1.0.0") |
| `firmwareVersion` | String | Yes | Semver format | Firmware version |
| `createdAt` | DateTime | Yes | Auto-generated | Registration timestamp |
| `lastSeenAt` | DateTime | Yes | Auto-updated | Last communication timestamp |
| `status` | Enum | Yes | See Robot Status | Current connection status |

### Robot Status Enum
- `ONLINE`: Robot connected, sending heartbeats
- `OFFLINE`: Robot disconnected, no recent heartbeat
- `ERROR`: Robot reported critical error
- `MAINTENANCE`: Robot in maintenance mode

### Relationships
- **Has Many** `RobotState` (historical states)
- **Has Many** `Session` (exploration/cleaning sessions)

### Validation Rules
- `serialNumber` must be unique across all robots
- `lastSeenAt` updated every 5 seconds when online
- Status transitions: Any → ONLINE/OFFLINE/ERROR, MAINTENANCE ↔ OFFLINE only

### Example
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "RoboMop-001",
  "serialNumber": "RM2025-A001",
  "modelVersion": "1.0.0",
  "firmwareVersion": "1.2.3",
  "createdAt": "2025-09-30T10:00:00Z",
  "lastSeenAt": "2025-09-30T14:30:15Z",
  "status": "ONLINE"
}
```

---

## 2. RobotState

Represents the robot's operational state at a point in time. High-frequency updates (10 Hz for position, lower for other fields).

### Fields

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `id` | UUID | Yes | - | Primary key |
| `robotId` | UUID | Yes | Foreign key | Reference to Robot |
| `timestamp` | DateTime | Yes | Auto-generated | State capture time |
| `mode` | Enum | Yes | See Mode Enum | Operational mode |
| `position` | Object | Yes | See Position | Current position |
| `velocity` | Object | Yes | See Velocity | Current velocity |
| `batteryLevel` | Float | Yes | 0.0-100.0 | Battery percentage |
| `waterLevel` | Float | Yes | 0.0-100.0 | Water tank percentage |
| `motorCurrents` | Object | Yes | See MotorCurrents | Motor current readings |
| `errors` | Array<String> | No | Max 10 items | Active error codes |

### Mode Enum
- `IDLE`: Robot stationary, no active task
- `EXPLORATION`: Autonomously exploring environment
- `CLEANING`: Executing cleaning path
- `MANUAL`: Under manual control from UI
- `RETURNING`: Returning to start position
- `ERROR`: Error state, requires intervention

### Position Object
```json
{
  "x": 1.25,           // meters, ±0.05 accuracy
  "y": -0.8,           // meters, ±0.05 accuracy
  "theta": 1.57,       // radians, orientation
  "confidence": 0.95   // position confidence (0.0-1.0)
}
```

### Velocity Object
```json
{
  "linear": 0.3,       // m/s
  "angular": 0.1       // rad/s
}
```

### MotorCurrents Object
```json
{
  "left": 1.2,         // amperes
  "right": 1.3         // amperes
}
```

### Relationships
- **Belongs To** `Robot`
- **Belongs To** `Session` (optional, null if not in session)

### Validation Rules
- `batteryLevel` and `waterLevel`: 0.0 ≤ value ≤ 100.0
- `position.confidence`: 0.0 ≤ value ≤ 1.0
- `motorCurrents`: 0.0 ≤ value ≤ 5.0 (hardware limit)
- `errors`: Each error code max 50 chars

### State Transitions
```
IDLE → EXPLORATION | CLEANING | MANUAL
EXPLORATION → IDLE | MANUAL | RETURNING | ERROR
CLEANING → IDLE | MANUAL | RETURNING | ERROR
MANUAL → IDLE | EXPLORATION | CLEANING | ERROR
RETURNING → IDLE | ERROR
ERROR → IDLE (after error cleared)
```

### Example
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "robotId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-09-30T14:30:15.123Z",
  "mode": "CLEANING",
  "position": {"x": 1.25, "y": -0.8, "theta": 1.57, "confidence": 0.95},
  "velocity": {"linear": 0.3, "angular": 0.0},
  "batteryLevel": 78.5,
  "waterLevel": 65.0,
  "motorCurrents": {"left": 1.2, "right": 1.3},
  "errors": []
}
```

---

## 3. Map

Represents the spatial map of the environment.

### Fields

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `id` | UUID | Yes | - | Primary key |
| `robotId` | UUID | Yes | Foreign key | Robot that created map |
| `name` | String | No | Max 100 chars | User-assigned map name |
| `resolution` | Float | Yes | 0.01-0.1 | Meters per grid cell |
| `width` | Integer | Yes | 100-10000 | Grid width in cells |
| `height` | Integer | Yes | 100-10000 | Grid height in cells |
| `origin` | Object | Yes | See Origin | Map coordinate origin |
| `data` | Binary/JSONB | Yes | - | Occupancy grid data |
| `metadata` | JSONB | No | - | Flexible metadata |
| `createdAt` | DateTime | Yes | Auto-generated | Map creation time |
| `updatedAt` | DateTime | Yes | Auto-updated | Last update time |
| `completionPercentage` | Float | Yes | 0.0-100.0 | Exploration progress |

### Origin Object
```json
{
  "x": -50.0,    // meters
  "y": -50.0,    // meters
  "theta": 0.0   // radians
}
```

### Data Format
- **Storage**: Binary blob (PostgreSQL BYTEA) or base64 string (SQLite)
- **Encoding**: Uint8Array, row-major order
- **Values**: 
  - 0: Unknown
  - 1-127: Free space (probability)
  - 128-255: Occupied (probability)

### Metadata Fields (Flexible JSONB)
```json
{
  "environment": "office",
  "totalArea": 150.5,        // square meters
  "exploredArea": 120.3,     // square meters
  "dateScanned": "2025-09-30",
  "scanDuration": 1800,      // seconds
  "notes": "First floor, north wing"
}
```

### Relationships
- **Belongs To** `Robot`
- **Has Many** `RestrictedZone`
- **Has Many** `Session`

### Validation Rules
- `resolution`: Typically 0.05 (5 cm, matches accuracy requirement)
- `width * height` ≤ 100,000,000 cells (max ~100 MB)
- `completionPercentage`: Auto-calculated from unknown cell count

### Example
```json
{
  "id": "770e8400-e29b-41d4-a716-446655440002",
  "robotId": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Office Floor 1",
  "resolution": 0.05,
  "width": 2000,
  "height": 2000,
  "origin": {"x": -50.0, "y": -50.0, "theta": 0.0},
  "data": "<binary blob>",
  "metadata": {
    "environment": "office",
    "totalArea": 100.0,
    "exploredArea": 100.0
  },
  "createdAt": "2025-09-30T10:00:00Z",
  "updatedAt": "2025-09-30T10:30:00Z",
  "completionPercentage": 100.0
}
```

---

## 4. RestrictedZone

Represents user-defined areas where the robot must not enter.

### Fields

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `id` | UUID | Yes | - | Primary key |
| `mapId` | UUID | Yes | Foreign key | Map this zone belongs to |
| `name` | String | No | Max 100 chars | User-assigned zone name |
| `geometry` | Object | Yes | See Geometry | Zone boundary |
| `createdAt` | DateTime | Yes | Auto-generated | Zone creation time |
| `updatedAt` | DateTime | Yes | Auto-updated | Last update time |

### Geometry Object
Polygonal boundary defined by vertices.

```json
{
  "type": "Polygon",
  "coordinates": [
    [
      {"x": 1.0, "y": 1.0},
      {"x": 2.0, "y": 1.0},
      {"x": 2.0, "y": 2.0},
      {"x": 1.0, "y": 2.0},
      {"x": 1.0, "y": 1.0}  // Closed polygon
    ]
  ]
}
```

### Relationships
- **Belongs To** `Map`

### Validation Rules
- `geometry.coordinates`: Min 4 points (triangle + closing point)
- `geometry.coordinates`: First and last point must match (closed polygon)
- Polygon must be simple (no self-intersections)
- Area: 0.01 m² ≤ area ≤ 1000 m²

### Example
```json
{
  "id": "880e8400-e29b-41d4-a716-446655440003",
  "mapId": "770e8400-e29b-41d4-a716-446655440002",
  "name": "Storage closet",
  "geometry": {
    "type": "Polygon",
    "coordinates": [[
      {"x": 5.0, "y": 5.0},
      {"x": 7.0, "y": 5.0},
      {"x": 7.0, "y": 6.0},
      {"x": 5.0, "y": 6.0},
      {"x": 5.0, "y": 5.0}
    ]]
  },
  "createdAt": "2025-09-30T11:00:00Z",
  "updatedAt": "2025-09-30T11:00:00Z"
}
```

---

## 5. Session

Represents a complete exploration or cleaning operation.

### Fields

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `id` | UUID | Yes | - | Primary key |
| `robotId` | UUID | Yes | Foreign key | Robot performing session |
| `mapId` | UUID | Yes | Foreign key | Map used for session |
| `type` | Enum | Yes | See Session Type | Session type |
| `status` | Enum | Yes | See Session Status | Session status |
| `startedAt` | DateTime | Yes | Auto-generated | Session start time |
| `completedAt` | DateTime | No | - | Session end time |
| `statistics` | JSONB | Yes | See Statistics | Session metrics |

### Session Type Enum
- `EXPLORATION`: Mapping new environment
- `CLEANING`: Executing cleaning path

### Session Status Enum
- `IN_PROGRESS`: Currently active
- `COMPLETED`: Finished successfully
- `INTERRUPTED`: Stopped before completion (e.g., low battery)
- `FAILED`: Ended due to error

### Statistics Object (Flexible JSONB)
```json
{
  "distanceTraveled": 150.5,      // meters
  "areaCovered": 75.2,            // square meters
  "duration": 1800,               // seconds
  "batteryUsed": 35.5,            // percentage points
  "waterUsed": 40.0,              // percentage points (cleaning only)
  "errorsEncountered": 0,
  "averageSpeed": 0.3,            // m/s
  "completionReason": "FINISHED"  // FINISHED | LOW_BATTERY | ERROR | USER_STOPPED
}
```

### Relationships
- **Belongs To** `Robot`
- **Belongs To** `Map`
- **Has Many** `Log`
- **Has Many** `RobotState` (states during session)

### Validation Rules
- `completedAt` ≥ `startedAt` when present
- `status = COMPLETED` ↔ `completedAt` is set
- `statistics.duration`: Auto-calculated from timestamps

### State Transitions
```
IN_PROGRESS → COMPLETED | INTERRUPTED | FAILED
```

### Example
```json
{
  "id": "990e8400-e29b-41d4-a716-446655440004",
  "robotId": "550e8400-e29b-41d4-a716-446655440000",
  "mapId": "770e8400-e29b-41d4-a716-446655440002",
  "type": "CLEANING",
  "status": "COMPLETED",
  "startedAt": "2025-09-30T13:00:00Z",
  "completedAt": "2025-09-30T13:30:00Z",
  "statistics": {
    "distanceTraveled": 120.0,
    "areaCovered": 100.0,
    "duration": 1800,
    "batteryUsed": 25.0,
    "waterUsed": 30.0,
    "errorsEncountered": 0,
    "averageSpeed": 0.27,
    "completionReason": "FINISHED"
  }
}
```

---

## 6. Log

Represents operational log entries for debugging and audit.

### Fields

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `id` | UUID | Yes | - | Primary key |
| `sessionId` | UUID | No | Foreign key | Related session (nullable) |
| `robotId` | UUID | Yes | Foreign key | Robot that generated log |
| `timestamp` | DateTime | Yes | Auto-generated | Log entry time |
| `level` | Enum | Yes | See Log Level | Severity level |
| `module` | String | Yes | Max 50 chars | Source module (e.g., "SLAM", "Navigation") |
| `message` | String | Yes | Max 500 chars | Log message |
| `data` | JSONB | No | - | Structured log data |

### Log Level Enum
- `DEBUG`: Detailed diagnostic information
- `INFO`: Informational messages
- `WARN`: Warning conditions
- `ERROR`: Error conditions
- `CRITICAL`: Critical conditions requiring immediate attention

### Relationships
- **Belongs To** `Robot`
- **Belongs To** `Session` (optional)

### Validation Rules
- Retention: Kept until manually cleared (as per spec clarifications)
- `message`: Max 500 chars to prevent abuse
- `data`: Max 10 KB JSON to prevent storage bloat

### Example
```json
{
  "id": "aa0e8400-e29b-41d4-a716-446655440005",
  "sessionId": "990e8400-e29b-41d4-a716-446655440004",
  "robotId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-09-30T13:15:30.456Z",
  "level": "INFO",
  "module": "Navigation",
  "message": "Waypoint reached: (5.2, 3.8)",
  "data": {
    "waypoint": {"x": 5.2, "y": 3.8},
    "distanceRemaining": 45.3
  }
}
```

---

## 7. SensorData (Event-based, not persisted)

Represents real-time sensor readings. Transmitted via WebSocket, not stored in database (except in logs if needed).

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `robotId` | UUID | Yes | Robot ID |
| `timestamp` | DateTime | Yes | Reading time |
| `lidarScan` | Object | Yes | LIDAR scan data |
| `imuData` | Object | Yes | IMU readings |
| `encoders` | Object | Yes | Encoder readings |
| `ultrasonic` | Float | Yes | Ultrasonic distance (m) |
| `waterLevel` | Float | Yes | Water level (%) |
| `batteryVoltage` | Float | Yes | Battery voltage (V) |

### LidarScan Object
```json
{
  "scanId": 12345,
  "points": [
    {"angle": 0.0, "distance": 2.5},
    {"angle": 1.0, "distance": 2.3},
    ...  // 360 points
  ]
}
```

### ImuData Object
```json
{
  "acceleration": {"x": 0.1, "y": 0.0, "z": 9.8},  // m/s²
  "gyroscope": {"x": 0.01, "y": 0.0, "z": 0.0},   // rad/s
  "magnetometer": {"x": 0.3, "y": 0.1, "z": -0.4}  // μT
}
```

### Encoders Object
```json
{
  "left": {"ticks": 1250, "velocity": 0.3},   // ticks, m/s
  "right": {"ticks": 1260, "velocity": 0.3}
}
```

### Example
```json
{
  "robotId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-09-30T13:15:30.100Z",
  "lidarScan": {
    "scanId": 12345,
    "points": [...]
  },
  "imuData": {
    "acceleration": {"x": 0.1, "y": 0.0, "z": 9.8},
    "gyroscope": {"x": 0.01, "y": 0.0, "z": 0.0},
    "magnetometer": {"x": 0.3, "y": 0.1, "z": -0.4}
  },
  "encoders": {
    "left": {"ticks": 1250, "velocity": 0.3},
    "right": {"ticks": 1260, "velocity": 0.3}
  },
  "ultrasonic": 0.25,
  "waterLevel": 65.0,
  "batteryVoltage": 24.5
}
```

---

## Data Model Summary

| Entity | Primary Purpose | Storage | Update Frequency |
|--------|----------------|---------|------------------|
| Robot | Robot identity | PostgreSQL/SQLite | On registration |
| RobotState | Current robot state | PostgreSQL/SQLite | 10 Hz |
| Map | Environment map | PostgreSQL/SQLite | 5 Hz during exploration |
| RestrictedZone | No-go areas | PostgreSQL/SQLite | On user edit |
| Session | Operation record | PostgreSQL/SQLite | On start/complete |
| Log | Audit trail | PostgreSQL/SQLite | As needed |
| SensorData | Real-time telemetry | Not persisted (WebSocket) | 100 Hz |

---

## Next Steps

Data model complete. Proceed to:
- API contract definition (contracts/api-spec.yaml)
- WebSocket event catalog (contracts/websocket-events.md)
- Test scenario definition (quickstart.md)

**Status**: ✓ Ready for Contract Generation
