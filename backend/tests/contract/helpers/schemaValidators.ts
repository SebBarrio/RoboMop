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
