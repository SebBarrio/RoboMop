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

type HeartbeatPayload = {
  robotId: string;
  timestamp: string;
  uptimeSeconds: number;
  cpuUsagePercent: number;
  memoryUsagePercent: number;
  temperatureCelsius: number;
};

export const buildRobotHeartbeatPayload = (
  robotId: string,
  overrides: Partial<HeartbeatPayload> = {}
): HeartbeatPayload => ({
  robotId,
  timestamp: new Date().toISOString(),
  uptimeSeconds: 3600,
  cpuUsagePercent: 42.5,
  memoryUsagePercent: 58.2,
  temperatureCelsius: 55.1,
  ...overrides
});

type RobotStateEventPayload = {
  robotId: string;
  timestamp: string;
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
  errors: string[];
};

export const buildRobotStateEventPayload = (
  robotId: string,
  overrides: Partial<RobotStateEventPayload> = {}
): RobotStateEventPayload => ({
  robotId,
  timestamp: new Date().toISOString(),
  mode: "CLEANING",
  position: { x: 1.25, y: -0.8, theta: 1.57, confidence: 0.95 },
  velocity: { linear: 0.3, angular: 0.0 },
  batteryLevel: 78.5,
  waterLevel: 65.0,
  motorCurrents: { left: 1.2, right: 1.3 },
  errors: [],
  ...overrides
});

type RobotMapUpdateEventPayload = {
  robotId: string;
  mapId: string;
  timestamp: string;
  updateType: "delta" | "full";
  cells?: Array<{ row: number; col: number; value: number }>;
  metadata?: Record<string, unknown>;
  data?: string;
};

export const buildRobotMapUpdatePayload = (
  robotId: string,
  mapId: string,
  overrides: Partial<RobotMapUpdateEventPayload> = {}
): RobotMapUpdateEventPayload => ({
  robotId,
  mapId,
  timestamp: new Date().toISOString(),
  updateType: "delta",
  cells: [
    { row: 100, col: 200, value: 210 },
    { row: 101, col: 200, value: 205 },
    { row: 101, col: 201, value: 198 }
  ],
  ...overrides
});

type SensorDataPayload = {
  robotId: string;
  timestamp: string;
  lidarScan: {
    scanId: number;
    points: Array<{ angle: number; distance: number }>;
  };
  imuData: {
    acceleration: { x: number; y: number; z: number };
    gyroscope: { x: number; y: number; z: number };
    magnetometer: { x: number; y: number; z: number };
  };
  encoders: {
    left: { ticks: number; velocity: number };
    right: { ticks: number; velocity: number };
  };
  ultrasonic: number;
  waterLevel: number;
  batteryVoltage: number;
};

export const buildRobotSensorDataPayload = (
  robotId: string,
  overrides: Partial<SensorDataPayload> = {}
): SensorDataPayload => ({
  robotId,
  timestamp: new Date().toISOString(),
  lidarScan: {
    scanId: 12345,
    points: [
      { angle: 0, distance: 2.5 },
      { angle: 1, distance: 2.3 },
      { angle: 2, distance: 2.1 }
    ]
  },
  imuData: {
    acceleration: { x: 0.1, y: 0.0, z: 9.8 },
    gyroscope: { x: 0.01, y: 0.0, z: 0.0 },
    magnetometer: { x: 0.3, y: 0.1, z: -0.4 }
  },
  encoders: {
    left: { ticks: 1250, velocity: 0.3 },
    right: { ticks: 1260, velocity: 0.3 }
  },
  ultrasonic: 0.25,
  waterLevel: 65.0,
  batteryVoltage: 24.5,
  ...overrides
});

type UiCommandPayload = {
  robotId: string;
  command: {
    type: string;
    payload: Record<string, unknown>;
  };
};

export const buildUiCommandPayload = (
  robotId: string,
  overrides: Partial<UiCommandPayload> = {}
): UiCommandPayload => ({
  robotId,
  command: {
    type: "MOVE",
    payload: {
      direction: "FORWARD",
      speed: 0.5
    }
  },
  ...overrides
});

type UiCreateZonePayload = {
  mapId: string;
  zone: ZoneCreatePayload;
};

export const buildUiCreateZonePayload = (
  mapId: string,
  overrides: Partial<UiCreateZonePayload> = {}
): UiCreateZonePayload => ({
  mapId,
  zone: buildZoneCreatePayload(),
  ...overrides
});
