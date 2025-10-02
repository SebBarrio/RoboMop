# WebSocket Events: RoboMop

**Date**: 2025-09-30  
**Protocol**: Socket.io v4.x  
**Transport**: WebSocket with fallback to HTTP long-polling

## Overview

This document defines all WebSocket events for bidirectional real-time communication between robot, backend, and frontend.

**Connection URLs**:
- Development: `ws://localhost:3000/`
- Production: `wss://api.robomop.example.com/`

**Authentication**: 
- Robot: API key via connection query parameter `?apiKey=<KEY>`
- Frontend: Session cookie from web app authentication

---

## Event Categories

| Category | Direction | Purpose |
|----------|-----------|---------|
| **Connection** | Bidirectional | Connection lifecycle |
| **Robot → Backend** | Upstream | Robot telemetry and state |
| **Backend → Robot** | Downstream | Commands and configuration |
| **Backend → Frontend** | Downstream | Real-time updates for UI |
| **Frontend → Backend** | Upstream | User commands |

---

## Connection Events

### `connect`
**Direction**: Client → Server (automatic)  
**Description**: Client successfully connected to server  
**Payload**: None

### `disconnect`
**Direction**: Client → Server (automatic)  
**Description**: Client disconnected from server  
**Payload**: 
```json
{
  "reason": "transport close"  // Socket.io disconnect reason
}
```

### `error`
**Direction**: Server → Client  
**Description**: Connection or protocol error  
**Payload**: 
```json
{
  "code": "AUTH_FAILED",
  "message": "Invalid API key"
}
```

**Error Codes**:
- `AUTH_FAILED`: Authentication failed
- `INVALID_EVENT`: Unknown event type
- `INVALID_PAYLOAD`: Malformed payload
- `RATE_LIMIT`: Too many events

---

## Robot → Backend Events

### `robot:heartbeat`
**Frequency**: Every 5 seconds  
**Description**: Robot health check  
**Payload**:
```json
{
  "robotId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-09-30T14:30:15.123Z",
  "uptimeSeconds": 3600,
  "cpuUsagePercent": 45.2,
  "memoryUsagePercent": 62.1,
  "temperatureCelsius": 58.0
}
```

### `robot:state`
**Frequency**: 10 Hz (every 100ms)  
**Description**: Robot state update (position, velocity, battery, etc.)  
**Payload**:
```json
{
  "robotId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-09-30T14:30:15.123Z",
  "mode": "CLEANING",
  "position": {
    "x": 1.25,
    "y": -0.8,
    "theta": 1.57,
    "confidence": 0.95
  },
  "velocity": {
    "linear": 0.3,
    "angular": 0.0
  },
  "batteryLevel": 78.5,
  "waterLevel": 65.0,
  "motorCurrents": {
    "left": 1.2,
    "right": 1.3
  },
  "errors": []
}
```

### `robot:map-update`
**Frequency**: 5 Hz (every 200ms) during exploration, on-demand otherwise  
**Description**: Map grid update (delta or full)  
**Payload (Delta Update)**:
```json
{
  "robotId": "550e8400-e29b-41d4-a716-446655440000",
  "mapId": "770e8400-e29b-41d4-a716-446655440002",
  "timestamp": "2025-09-30T14:30:15.123Z",
  "updateType": "delta",
  "cells": [
    {"row": 100, "col": 200, "value": 200},
    {"row": 100, "col": 201, "value": 195},
    {"row": 101, "col": 200, "value": 205}
  ]
}
```

**Payload (Full Update)**:
```json
{
  "robotId": "550e8400-e29b-41d4-a716-446655440000",
  "mapId": "770e8400-e29b-41d4-a716-446655440002",
  "timestamp": "2025-09-30T14:30:15.123Z",
  "updateType": "full",
  "metadata": {
    "resolution": 0.05,
    "width": 2000,
    "height": 2000,
    "origin": {"x": -50.0, "y": -50.0, "theta": 0.0}
  },
  "data": "<base64-encoded-grid-or-binary>"
}
```

### `robot:sensor-data`
**Frequency**: As needed (typically 10 Hz)  
**Description**: Raw sensor readings  
**Payload**:
```json
{
  "robotId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-09-30T14:30:15.123Z",
  "lidarScan": {
    "scanId": 12345,
    "points": [
      {"angle": 0.0, "distance": 2.5},
      {"angle": 1.0, "distance": 2.3}
      // ... 360 points total
    ]
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

### `robot:session-started`
**Frequency**: On session start  
**Description**: Robot started a new session  
**Payload**:
```json
{
  "robotId": "550e8400-e29b-41d4-a716-446655440000",
  "sessionId": "990e8400-e29b-41d4-a716-446655440004",
  "timestamp": "2025-09-30T13:00:00Z",
  "type": "CLEANING",
  "mapId": "770e8400-e29b-41d4-a716-446655440002"
}
```

### `robot:session-completed`
**Frequency**: On session completion  
**Description**: Robot completed or interrupted a session  
**Payload**:
```json
{
  "robotId": "550e8400-e29b-41d4-a716-446655440000",
  "sessionId": "990e8400-e29b-41d4-a716-446655440004",
  "timestamp": "2025-09-30T13:30:00Z",
  "status": "COMPLETED",
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

### `robot:error`
**Frequency**: On error occurrence  
**Description**: Robot encountered an error  
**Payload**:
```json
{
  "robotId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-09-30T14:30:15.123Z",
  "errorCode": "SLAM_LOCALIZATION_LOST",
  "severity": "CRITICAL",
  "message": "SLAM localization confidence dropped below threshold",
  "data": {
    "confidence": 0.15,
    "threshold": 0.5
  }
}
```

**Error Severities**:
- `INFO`: Informational, no action needed
- `WARN`: Warning, degraded operation
- `ERROR`: Error, feature impaired
- `CRITICAL`: Critical, robot stopped

### `robot:log`
**Frequency**: As needed  
**Description**: Real-time log entry  
**Payload**:
```json
{
  "robotId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-09-30T14:30:15.123Z",
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

## Backend → Robot Events

### `command:move`
**Description**: Manual movement command  
**Payload**:
```json
{
  "commandId": "cmd-12345",
  "timestamp": "2025-09-30T14:30:15.123Z",
  "direction": "FORWARD",  // FORWARD, BACKWARD, LEFT, RIGHT, STOP
  "speed": 0.5,  // m/s or rad/s depending on direction
  "duration": 1.0  // seconds (0 = continuous)
}
```

**Response (Acknowledgement)**:
Event: `command:ack`
```json
{
  "commandId": "cmd-12345",
  "status": "ACKNOWLEDGED",
  "timestamp": "2025-09-30T14:30:15.150Z"
}
```

### `command:set-mode`
**Description**: Change operational mode  
**Payload**:
```json
{
  "commandId": "cmd-12346",
  "timestamp": "2025-09-30T14:30:15.123Z",
  "mode": "CLEANING",  // IDLE, EXPLORATION, CLEANING, MANUAL
  "parameters": {
    "mapId": "770e8400-e29b-41d4-a716-446655440002"
  }
}
```

### `command:e-stop`
**Description**: Emergency stop  
**Payload**:
```json
{
  "commandId": "cmd-12347",
  "timestamp": "2025-09-30T14:30:15.123Z",
  "reason": "USER_INITIATED"
}
```

**Priority**: Highest (processed immediately)  
**Response Requirement**: Must acknowledge within 500ms

### `command:set-speed`
**Description**: Adjust robot speed  
**Payload**:
```json
{
  "commandId": "cmd-12348",
  "timestamp": "2025-09-30T14:30:15.123Z",
  "speedMultiplier": 0.75  // 0.1 to 1.0, multiplier for base speed
}
```

### `command:config-update`
**Description**: Update robot configuration  
**Payload**:
```json
{
  "commandId": "cmd-12349",
  "timestamp": "2025-09-30T14:30:15.123Z",
  "config": {
    "telemetryRate": 10,  // Hz
    "mapUpdateRate": 5,   // Hz
    "pidGains": {
      "kp": 1.0,
      "ki": 0.1,
      "kd": 0.05
    }
  }
}
```

### `command:clear-errors`
**Description**: Clear error state  
**Payload**:
```json
{
  "commandId": "cmd-12350",
  "timestamp": "2025-09-30T14:30:15.123Z",
  "errorCodes": ["SLAM_LOCALIZATION_LOST"]  // Empty array = clear all
}
```

---

## Backend → Frontend Events

All `robot:*` events are forwarded to frontend clients with `frontend:` prefix for namespace clarity.

### `frontend:robot-state`
**Frequency**: 10 Hz  
**Description**: Forwarded robot state update  
**Payload**: Same as `robot:state`

### `frontend:map-update`
**Frequency**: 5 Hz during exploration  
**Description**: Forwarded map update  
**Payload**: Same as `robot:map-update`

### `frontend:sensor-data`
**Frequency**: 10 Hz (optional subscription)  
**Description**: Forwarded sensor data  
**Payload**: Same as `robot:sensor-data`

### `frontend:session-event`
**Frequency**: On session change  
**Description**: Session started, completed, or updated  
**Payload**:
```json
{
  "event": "STARTED",  // STARTED, COMPLETED, INTERRUPTED, FAILED
  "session": {
    "id": "990e8400-e29b-41d4-a716-446655440004",
    "robotId": "550e8400-e29b-41d4-a716-446655440000",
    "type": "CLEANING",
    "status": "IN_PROGRESS",
    "startedAt": "2025-09-30T13:00:00Z"
  }
}
```

### `frontend:error`
**Frequency**: On robot error  
**Description**: Forwarded robot error  
**Payload**: Same as `robot:error`

### `frontend:zone-updated`
**Frequency**: On restricted zone change  
**Description**: Restricted zone added, updated, or deleted  
**Payload**:
```json
{
  "event": "CREATED",  // CREATED, UPDATED, DELETED
  "zone": {
    "id": "880e8400-e29b-41d4-a716-446655440003",
    "mapId": "770e8400-e29b-41d4-a716-446655440002",
    "name": "Storage closet",
    "geometry": {
      "type": "Polygon",
      "coordinates": [[...]]
    }
  }
}
```

---

## Frontend → Backend Events

### `subscribe`
**Description**: Subscribe to specific event streams  
**Payload**:
```json
{
  "streams": ["robot-state", "map-update", "sensor-data", "session-event"],
  "robotId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response**:
Event: `subscribed`
```json
{
  "streams": ["robot-state", "map-update", "session-event"],
  "robotId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### `unsubscribe`
**Description**: Unsubscribe from event streams  
**Payload**:
```json
{
  "streams": ["sensor-data"],
  "robotId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### `ui:command`
**Description**: User-initiated command (proxied to robot)  
**Payload**:
```json
{
  "robotId": "550e8400-e29b-41d4-a716-446655440000",
  "command": {
    "type": "MOVE",  // MOVE, SET_MODE, E_STOP, SET_SPEED
    "payload": {
      "direction": "FORWARD",
      "speed": 0.5
    }
  }
}
```

**Response**:
Event: `ui:command-ack`
```json
{
  "commandId": "cmd-12345",
  "status": "SENT",  // SENT, ACKNOWLEDGED, EXECUTED, FAILED
  "timestamp": "2025-09-30T14:30:15.123Z"
}
```

### `ui:create-zone`
**Description**: Create restricted zone from UI  
**Payload**:
```json
{
  "mapId": "770e8400-e29b-41d4-a716-446655440002",
  "zone": {
    "name": "Kitchen area",
    "geometry": {
      "type": "Polygon",
      "coordinates": [[
        {"x": 1.0, "y": 1.0},
        {"x": 2.0, "y": 1.0},
        {"x": 2.0, "y": 2.0},
        {"x": 1.0, "y": 2.0},
        {"x": 1.0, "y": 1.0}
      ]]
    }
  }
}
```

**Response**:
Event: `ui:zone-created`
```json
{
  "zone": {
    "id": "880e8400-e29b-41d4-a716-446655440003",
    "mapId": "770e8400-e29b-41d4-a716-446655440002",
    "name": "Kitchen area",
    "geometry": {...}
  }
}
```

### `ui:update-zone`
**Description**: Update restricted zone from UI  
**Payload**:
```json
{
  "zoneId": "880e8400-e29b-41d4-a716-446655440003",
  "updates": {
    "name": "Updated kitchen area",
    "geometry": {...}
  }
}
```

### `ui:delete-zone`
**Description**: Delete restricted zone from UI  
**Payload**:
```json
{
  "zoneId": "880e8400-e29b-41d4-a716-446655440003"
}
```

**Response**:
Event: `ui:zone-deleted`
```json
{
  "zoneId": "880e8400-e29b-41d4-a716-446655440003"
}
```

---

## Error Handling

All events can result in an error response:

**Event**: `error`  
**Payload**:
```json
{
  "event": "ui:command",  // Original event that caused error
  "code": "ROBOT_OFFLINE",
  "message": "Robot is not connected",
  "timestamp": "2025-09-30T14:30:15.123Z"
}
```

**Common Error Codes**:
- `ROBOT_OFFLINE`: Robot not connected
- `INVALID_COMMAND`: Unknown or malformed command
- `PERMISSION_DENIED`: User lacks permission
- `RESOURCE_NOT_FOUND`: Referenced entity doesn't exist
- `CONFLICT`: Operation conflicts with current state (e.g., robot busy)
- `RATE_LIMIT`: Too many requests

---

## Reconnection Strategy

**Client-side (Robot & Frontend)**:
- Auto-reconnect with exponential backoff
- Initial retry: 1 second
- Max retry: 30 seconds
- Max retries: Infinite (unless explicitly disconnected)

**Server-side**:
- Maintain connection state for 60 seconds after disconnect
- Resume event stream if client reconnects within window
- Otherwise, treat as new connection (client must re-subscribe)

---

## Message Size Limits

| Event Type | Max Payload Size |
|------------|------------------|
| `robot:state` | 10 KB |
| `robot:sensor-data` | 100 KB |
| `robot:map-update` (delta) | 100 KB |
| `robot:map-update` (full) | 10 MB |
| `command:*` | 10 KB |
| `ui:*` | 10 KB |

Payloads exceeding limits will be rejected with `PAYLOAD_TOO_LARGE` error.

---

## Rate Limits

| Event Type | Max Rate (per robot) |
|------------|----------------------|
| `robot:state` | 10 Hz (100ms interval) |
| `robot:map-update` | 5 Hz (200ms interval) |
| `robot:sensor-data` | 10 Hz (100ms interval) |
| `command:*` | 100/second |
| `ui:*` | 10/second |

Exceeding rates triggers `RATE_LIMIT` error and temporary throttling (10 seconds).

---

## Event Flow Examples

### Example 1: User Initiates Cleaning
```
1. Frontend → Backend: ui:command {type: SET_MODE, mode: CLEANING}
2. Backend → Robot: command:set-mode {mode: CLEANING, mapId: ...}
3. Robot → Backend: command:ack {commandId: ..., status: ACKNOWLEDGED}
4. Backend → Frontend: ui:command-ack {status: ACKNOWLEDGED}
5. Robot → Backend: robot:session-started {type: CLEANING, ...}
6. Backend → Frontend: frontend:session-event {event: STARTED, ...}
7. [Continuous] Robot → Backend: robot:state {mode: CLEANING, ...}
8. [Continuous] Backend → Frontend: frontend:robot-state {...}
```

### Example 2: Emergency Stop
```
1. Frontend → Backend: ui:command {type: E_STOP}
2. Backend → Robot: command:e-stop {reason: USER_INITIATED}
3. Robot → Backend: command:ack {status: ACKNOWLEDGED} (within 500ms)
4. Robot → Backend: robot:state {mode: IDLE, velocity: {linear: 0, angular: 0}}
5. Backend → Frontend: frontend:robot-state {...}
```

### Example 3: Create Restricted Zone
```
1. Frontend → Backend: ui:create-zone {mapId: ..., zone: {...}}
2. Backend → Database: INSERT RestrictedZone
3. Backend → Frontend: ui:zone-created {zone: {...}}
4. Backend → Frontend (broadcast): frontend:zone-updated {event: CREATED, zone: {...}}
5. Backend → Robot: command:config-update {restrictedZones: [...]}
6. Robot → Backend: command:ack {status: ACKNOWLEDGED}
```

---

## Testing

Contract tests should validate:
1. **Event Schema**: All events match documented JSON schemas
2. **Event Flow**: Expected sequence of events for each use case
3. **Error Handling**: Proper error events for failure scenarios
4. **Rate Limits**: Throttling enforced correctly
5. **Reconnection**: State preserved/restored after disconnect

Mock WebSocket server recommended for testing (e.g., `socket.io-mock`).

---

**Status**: ✓ Contract Complete - Ready for Test Generation
