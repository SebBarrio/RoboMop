const ROBOT_STATUS_VALUES = ["ONLINE", "OFFLINE", "ERROR", "MAINTENANCE"];
const ROBOT_MODE_VALUES = ["IDLE", "EXPLORATION", "CLEANING", "MANUAL", "RETURNING", "ERROR"];
const SESSION_TYPE_VALUES = ["EXPLORATION", "CLEANING"];
const SESSION_STATUS_VALUES = ["IN_PROGRESS", "COMPLETED", "INTERRUPTED", "FAILED"];
const LOG_LEVEL_VALUES = ["DEBUG", "INFO", "WARN", "ERROR", "CRITICAL"];

export const expectIsoDateString = (value: unknown): void => {
  expect(typeof value).toBe("string");
  if (typeof value === "string") {
    expect(new Date(value).toString()).not.toBe("Invalid Date");
  }
};

export const expectRobotSchema = (value: unknown): void => {
  expect(value).toBeDefined();
  const robot = value as Record<string, unknown>;

  expect(typeof robot.id).toBe("string");
  expect(typeof robot.name).toBe("string");
  expect(typeof robot.serialNumber).toBe("string");
  expect(typeof robot.modelVersion).toBe("string");
  expect(typeof robot.firmwareVersion).toBe("string");
  expect(typeof robot.status).toBe("string");

  if (typeof robot.status === "string") {
    expect(ROBOT_STATUS_VALUES).toContain(robot.status);
  }

  expectIsoDateString(robot.createdAt);
  expectIsoDateString(robot.lastSeenAt);
};

export const expectLocationHeader = (headers: Record<string, string | string[] | undefined>): void => {
  const location = headers.location;
  expect(location).toBeDefined();
  if (typeof location === "string") {
    expect(location.length).toBeGreaterThan(0);
  }
};

export const expectRobotStateSchema = (value: unknown): void => {
  expect(value).toBeDefined();
  const state = value as Record<string, unknown>;

  expect(typeof state.id).toBe("string");
  expect(typeof state.robotId).toBe("string");
  expectIsoDateString(state.timestamp);

  expect(typeof state.mode).toBe("string");
  if (typeof state.mode === "string") {
    expect(ROBOT_MODE_VALUES).toContain(state.mode);
  }

  const position = state.position as Record<string, unknown>;
  expect(position).toBeDefined();
  expect(typeof position.x).toBe("number");
  expect(typeof position.y).toBe("number");
  expect(typeof position.theta).toBe("number");
  expect(typeof position.confidence).toBe("number");

  const velocity = state.velocity as Record<string, unknown>;
  expect(velocity).toBeDefined();
  expect(typeof velocity.linear).toBe("number");
  expect(typeof velocity.angular).toBe("number");

  expect(typeof state.batteryLevel).toBe("number");
  expect(typeof state.waterLevel).toBe("number");

  const motorCurrents = state.motorCurrents as Record<string, unknown>;
  expect(motorCurrents).toBeDefined();
  expect(typeof motorCurrents.left).toBe("number");
  expect(typeof motorCurrents.right).toBe("number");

  if (Array.isArray(state.errors)) {
    state.errors.forEach((err) => expect(typeof err).toBe("string"));
  }
};

export const expectMapMetadataSchema = (value: unknown): void => {
  expect(value).toBeDefined();
  const map = value as Record<string, unknown>;

  expect(typeof map.id).toBe("string");
  expect(typeof map.robotId).toBe("string");
  expect(typeof map.resolution).toBe("number");
  expect(typeof map.width).toBe("number");
  expect(typeof map.height).toBe("number");

  const origin = map.origin as Record<string, unknown>;
  expect(origin).toBeDefined();
  expect(typeof origin.x).toBe("number");
  expect(typeof origin.y).toBe("number");
  expect(typeof origin.theta).toBe("number");

  expect(typeof map.completionPercentage).toBe("number");

  if (typeof map.name !== "undefined") {
    expect(typeof map.name).toBe("string");
  }

  if (typeof map.metadata !== "undefined") {
    expect(typeof map.metadata).toBe("object");
  }

  expectIsoDateString(map.createdAt);
  expectIsoDateString(map.updatedAt);
};

const expectPoint = (value: unknown): void => {
  expect(value).toBeDefined();
  const point = value as Record<string, unknown>;
  expect(typeof point.x).toBe("number");
  expect(typeof point.y).toBe("number");
};

const expectPolygon = (value: unknown): void => {
  expect(value).toBeDefined();
  const polygon = value as Record<string, unknown>;
  expect(polygon.type).toBe("Polygon");
  expect(Array.isArray(polygon.coordinates)).toBe(true);

  if (Array.isArray(polygon.coordinates)) {
    polygon.coordinates.forEach((ring) => {
      expect(Array.isArray(ring)).toBe(true);
      if (Array.isArray(ring)) {
        ring.forEach((point) => expectPoint(point));
      }
    });
  }
};

export const expectRestrictedZoneSchema = (value: unknown): void => {
  expect(value).toBeDefined();
  const zone = value as Record<string, unknown>;

  expect(typeof zone.id).toBe("string");
  expect(typeof zone.mapId).toBe("string");

  if (typeof zone.name !== "undefined") {
    expect(typeof zone.name).toBe("string");
  }

  expectPolygon(zone.geometry);

  expectIsoDateString(zone.createdAt);
  expectIsoDateString(zone.updatedAt);
};

export const expectSessionSchema = (value: unknown): void => {
  expect(value).toBeDefined();
  const session = value as Record<string, unknown>;

  expect(typeof session.id).toBe("string");
  expect(typeof session.robotId).toBe("string");
  expect(typeof session.mapId).toBe("string");

  expect(typeof session.type).toBe("string");
  if (typeof session.type === "string") {
    expect(SESSION_TYPE_VALUES).toContain(session.type);
  }

  expect(typeof session.status).toBe("string");
  if (typeof session.status === "string") {
    expect(SESSION_STATUS_VALUES).toContain(session.status);
  }

  expectIsoDateString(session.startedAt);

  if (typeof session.completedAt !== "undefined" && session.completedAt !== null) {
    expectIsoDateString(session.completedAt);
  }

  if (typeof session.statistics !== "undefined" && session.statistics !== null) {
    expect(typeof session.statistics).toBe("object");
  }
};

export const expectLogSchema = (value: unknown): void => {
  expect(value).toBeDefined();
  const log = value as Record<string, unknown>;

  expect(typeof log.id).toBe("string");

  if (typeof log.sessionId !== "undefined" && log.sessionId !== null) {
    expect(typeof log.sessionId).toBe("string");
  }

  expect(typeof log.robotId).toBe("string");
  expectIsoDateString(log.timestamp);

  expect(typeof log.level).toBe("string");
  if (typeof log.level === "string") {
    expect(LOG_LEVEL_VALUES).toContain(log.level);
  }

  expect(typeof log.module).toBe("string");
  expect(typeof log.message).toBe("string");

  if (typeof log.data !== "undefined" && log.data !== null) {
    expect(typeof log.data).toBe("object");
  }
};

const expectNumber = (value: unknown): void => {
  expect(typeof value).toBe("number");
  if (typeof value === "number") {
    expect(Number.isFinite(value)).toBe(true);
  }
};

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new Error("Expected record payload");
  }
}

export const expectRobotHeartbeatPayloadSchema = (value: unknown): void => {
  expect(value).toBeDefined();
  const heartbeat = value as Record<string, unknown>;

  expect(typeof heartbeat.robotId).toBe("string");
  expectIsoDateString(heartbeat.timestamp);
  expectNumber(heartbeat.uptimeSeconds);
  expectNumber(heartbeat.cpuUsagePercent);
  expectNumber(heartbeat.memoryUsagePercent);
  expectNumber(heartbeat.temperatureCelsius);
};

export const expectRobotHeartbeatAckSchema = (value: unknown): void => {
  expect(value).toBeDefined();
  const ack = value as Record<string, unknown>;

  expect(typeof ack.status).toBe("string");
  expect(ack.status).toBe("accepted");
  expectIsoDateString(ack.receivedAt);
};

export const expectRobotStateEventSchema = (value: unknown): void => {
  expect(value).toBeDefined();
  const state = value as Record<string, unknown>;

  expect(typeof state.robotId).toBe("string");
  expectIsoDateString(state.timestamp);

  expect(typeof state.mode).toBe("string");
  if (typeof state.mode === "string") {
    expect(ROBOT_MODE_VALUES).toContain(state.mode);
  }

  const position = state.position as Record<string, unknown>;
  expect(position).toBeDefined();
  expectNumber(position.x);
  expectNumber(position.y);
  expectNumber(position.theta);
  expectNumber(position.confidence);

  const velocity = state.velocity as Record<string, unknown>;
  expect(velocity).toBeDefined();
  expectNumber(velocity.linear);
  expectNumber(velocity.angular);

  expectNumber(state.batteryLevel);
  expectNumber(state.waterLevel);

  const motorCurrents = state.motorCurrents as Record<string, unknown>;
  expect(motorCurrents).toBeDefined();
  expectNumber(motorCurrents.left);
  expectNumber(motorCurrents.right);

  if (Array.isArray(state.errors)) {
    state.errors.forEach((err) => expect(typeof err).toBe("string"));
  }
};

export const expectRobotStateAckSchema = (value: unknown): void => {
  expect(value).toBeDefined();
  const ack = value as Record<string, unknown>;

  expect(typeof ack.status).toBe("string");
  expect(ack.status).toBe("accepted");
  expect(typeof ack.stateId).toBe("string");
  expectIsoDateString(ack.receivedAt);
};

export const expectRobotMapUpdatePayloadSchema = (value: unknown): void => {
  expect(value).toBeDefined();
  const update = value as Record<string, unknown>;

  expect(typeof update.robotId).toBe("string");
  expect(typeof update.mapId).toBe("string");
  expectIsoDateString(update.timestamp);

  expect(typeof update.updateType).toBe("string");
  if (typeof update.updateType === "string") {
    expect(["delta", "full"]).toContain(update.updateType);
  }

  if (update.updateType === "delta") {
    expect(Array.isArray(update.cells)).toBe(true);
    if (Array.isArray(update.cells)) {
      update.cells.forEach((cell) => {
        const record = cell as Record<string, unknown>;
        expectNumber(record.row);
        expectNumber(record.col);
        expectNumber(record.value);
      });
    }
  }

  if (update.updateType === "full") {
    expect(typeof update.metadata).toBe("object");
    expect(typeof update.data).toBe("string");
  }
};

export const expectRobotMapUpdateAckSchema = (value: unknown): void => {
  expect(value).toBeDefined();
  const ack = value as Record<string, unknown>;

  expect(typeof ack.status).toBe("string");
  expect(ack.status).toBe("accepted");
  expectNumber(ack.updatedCells);
  expectIsoDateString(ack.receivedAt);
};

export const expectRobotSensorDataPayloadSchema = (value: unknown): void => {
  expect(value).toBeDefined();
  const data = value as Record<string, unknown>;

  expect(typeof data.robotId).toBe("string");
  expectIsoDateString(data.timestamp);

  const lidarScan = data.lidarScan as Record<string, unknown>;
  expect(lidarScan).toBeDefined();
  expectNumber(lidarScan.scanId);
  expect(Array.isArray(lidarScan.points)).toBe(true);
  if (Array.isArray(lidarScan.points)) {
    lidarScan.points.forEach((point) => {
      const record = point as Record<string, unknown>;
      expectNumber(record.angle);
      expectNumber(record.distance);
    });
  }

  const imuData = data.imuData;
  expect(imuData).toBeDefined();
  assertRecord(imuData);
  const imuKeys = ["acceleration", "gyroscope", "magnetometer"] as const;
  imuKeys.forEach((key) => {
    const axis = imuData[key];
    expect(axis).toBeDefined();
    assertRecord(axis);
    expectNumber(axis.x);
    expectNumber(axis.y);
    expectNumber(axis.z);
  });

  const encoders = data.encoders;
  expect(encoders).toBeDefined();
  assertRecord(encoders);
  const encoderKeys = ["left", "right"] as const;
  encoderKeys.forEach((key) => {
    const wheel = encoders[key];
    expect(wheel).toBeDefined();
    assertRecord(wheel);
    expectNumber(wheel.ticks);
    expectNumber(wheel.velocity);
  });

  expectNumber(data.ultrasonic);
  expectNumber(data.waterLevel);
  expectNumber(data.batteryVoltage);
};

export const expectRobotSensorDataAckSchema = (value: unknown): void => {
  expect(value).toBeDefined();
  const ack = value as Record<string, unknown>;

  expect(typeof ack.status).toBe("string");
  expect(ack.status).toBe("queued");
  expectIsoDateString(ack.receivedAt);
};

export const expectCommandMovePayloadSchema = (value: unknown): void => {
  expect(value).toBeDefined();
  const command = value as Record<string, unknown>;

  expect(typeof command.commandId).toBe("string");
  expectIsoDateString(command.timestamp);
  expect(typeof command.direction).toBe("string");
  expectNumber(command.speed);
  expectNumber(command.duration);
};

export const expectCommandSetModePayloadSchema = (value: unknown): void => {
  expect(value).toBeDefined();
  const command = value as Record<string, unknown>;

  expect(typeof command.commandId).toBe("string");
  expectIsoDateString(command.timestamp);
  expect(typeof command.mode).toBe("string");
  if (typeof command.parameters !== "undefined" && command.parameters !== null) {
    expect(typeof command.parameters).toBe("object");
  }
};

export const expectCommandEStopPayloadSchema = (value: unknown): void => {
  expect(value).toBeDefined();
  const command = value as Record<string, unknown>;

  expect(typeof command.commandId).toBe("string");
  expectIsoDateString(command.timestamp);
  expect(typeof command.reason).toBe("string");
};

export const expectUiCommandPayloadSchema = (value: unknown): void => {
  expect(value).toBeDefined();
  const payload = value;
  assertRecord(payload);

  expect(typeof payload.robotId).toBe("string");

  const command = payload.command;
  expect(command).toBeDefined();
  assertRecord(command);
  expect(typeof command.type).toBe("string");
  if (command.payload !== undefined && command.payload !== null) {
    expect(typeof command.payload).toBe("object");
  }
};

export const expectUiCommandAckPayloadSchema = (value: unknown): void => {
  expect(value).toBeDefined();
  const payload = value as Record<string, unknown>;

  expect(typeof payload.commandId).toBe("string");
  expect(typeof payload.status).toBe("string");
  expectIsoDateString(payload.timestamp);
};

export const expectUiCreateZonePayloadSchema = (value: unknown): void => {
  expect(value).toBeDefined();
  const payload = value;
  assertRecord(payload);

  expect(typeof payload.mapId).toBe("string");

  const zone = payload.zone;
  expect(zone).toBeDefined();
  if (zone) {
    assertRecord(zone);
    if (typeof zone.name !== "undefined") {
      expect(typeof zone.name).toBe("string");
    }

    const geometry = zone.geometry;
    expect(geometry).toBeDefined();
    if (geometry) {
      assertRecord(geometry);
      expect(geometry.type).toBe("Polygon");
      expect(Array.isArray(geometry.coordinates)).toBe(true);
      if (Array.isArray(geometry.coordinates)) {
        geometry.coordinates.forEach((ring) => {
          expect(Array.isArray(ring)).toBe(true);
          if (Array.isArray(ring)) {
            ring.forEach((point) => expectPoint(point));
          }
        });
      }
    }
  }
};

export const expectUiZoneCreatedPayloadSchema = (value: unknown): void => {
  expect(value).toBeDefined();
  const payload = value;
  assertRecord(payload);

  expect(typeof payload.zone).toBe("object");
  if (payload.zone) {
    expectRestrictedZoneSchema(payload.zone);
  }
};
