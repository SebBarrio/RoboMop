type RobotCreatePayload = {
  name: string;
  serialNumber: string;
  modelVersion: string;
  firmwareVersion: string;
};

const uniqueSuffix = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const buildRobotCreatePayload = (
  overrides: Partial<RobotCreatePayload> = {}
): RobotCreatePayload => ({
  name: `Test Robot ${uniqueSuffix()}`,
  serialNumber: `TEST-${uniqueSuffix().toUpperCase()}`,
  modelVersion: "1.0.0",
  firmwareVersion: "1.0.0",
  ...overrides
});

type RobotStateUpdatePayload = {
  mode: string;
  position: {
    x: number;
    y: number;
    theta: number;
    confidence: number;
  };
  velocity: {
    linear: number;
    angular: number;
  };
  batteryLevel: number;
  waterLevel: number;
  motorCurrents: {
    left: number;
    right: number;
  };
  errors?: string[];
};

export const buildRobotStateUpdatePayload = (
  overrides: Partial<RobotStateUpdatePayload> = {}
): RobotStateUpdatePayload => ({
  mode: "IDLE",
  position: { x: 1.2, y: -0.4, theta: 0.5, confidence: 0.95 },
  velocity: { linear: 0.0, angular: 0.0 },
  batteryLevel: 75.5,
  waterLevel: 60.2,
  motorCurrents: { left: 1.1, right: 1.2 },
  errors: [],
  ...overrides
});

type RobotCommandPayload = {
  type: string;
  payload: Record<string, unknown>;
};

export const buildRobotCommandPayload = (
  overrides: Partial<RobotCommandPayload> = {}
): RobotCommandPayload => ({
  type: "MOVE",
  payload: {
    direction: "FORWARD",
    speed: 0.5,
    duration: 1
  },
  ...overrides
});

type MapCreatePayload = {
  robotId: string;
  name?: string;
  resolution: number;
  width: number;
  height: number;
  origin: {
    x: number;
    y: number;
    theta: number;
  };
};

export const buildMapCreatePayload = (
  robotId: string,
  overrides: Partial<MapCreatePayload> = {}
): MapCreatePayload => ({
  robotId,
  name: `Test Map ${uniqueSuffix()}`,
  resolution: 0.05,
  width: 500,
  height: 500,
  origin: { x: 0, y: 0, theta: 0 },
  ...overrides
});

type MapUpdatePayload = {
  name?: string;
  metadata?: Record<string, unknown>;
  completionPercentage?: number;
};

export const buildMapUpdatePayload = (
  overrides: MapUpdatePayload = {}
): MapUpdatePayload => ({
  name: `Updated Map ${uniqueSuffix()}`,
  metadata: { cleanlinessScore: 92 },
  completionPercentage: 42,
  ...overrides
});

type ZoneCreatePayload = {
  name?: string;
  geometry: {
    type: "Polygon";
    coordinates: Array<Array<{ x: number; y: number }>>;
  };
};

const defaultZoneCoordinates = (): Array<Array<{ x: number; y: number }>> => [
  [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
    { x: 0, y: 0 }
  ]
];

export const buildZoneCreatePayload = (
  overrides: Partial<ZoneCreatePayload> = {}
): ZoneCreatePayload => ({
  name: `Test Zone ${uniqueSuffix()}`,
  geometry: {
    type: "Polygon",
    coordinates: defaultZoneCoordinates()
  },
  ...overrides
});

type ZoneUpdatePayload = {
  name?: string;
  geometry?: ZoneCreatePayload["geometry"];
};

export const buildZoneUpdatePayload = (
  overrides: ZoneUpdatePayload = {}
): ZoneUpdatePayload => ({
  name: `Updated Zone ${uniqueSuffix()}`,
  geometry: {
    type: "Polygon",
    coordinates: defaultZoneCoordinates()
  },
  ...overrides
});

type SessionCreatePayload = {
  robotId: string;
  mapId: string;
  type: "EXPLORATION" | "CLEANING";
};

export const buildSessionCreatePayload = (
  robotId: string,
  mapId: string,
  overrides: Partial<SessionCreatePayload> = {}
): SessionCreatePayload => ({
  robotId,
  mapId,
  type: "EXPLORATION",
  ...overrides
});

type SessionUpdatePayload = {
  status?: "IN_PROGRESS" | "COMPLETED" | "INTERRUPTED" | "FAILED";
  completedAt?: string;
  statistics?: Record<string, unknown>;
};

export const buildSessionUpdatePayload = (
  overrides: SessionUpdatePayload = {}
): SessionUpdatePayload => ({
  status: "COMPLETED",
  completedAt: new Date().toISOString(),
  statistics: {
    distanceTraveled: 120.5,
    areaCovered: 85.3,
    duration: 1800,
    batteryUsed: 25.4,
    completionReason: "FINISHED"
  },
  ...overrides
});
