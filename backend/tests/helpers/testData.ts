import { RobotService } from '../../src/services/RobotService';
import { MapService } from '../../src/services/MapService';
import { ZoneService } from '../../src/services/ZoneService';
import { SessionService } from '../../src/services/SessionService';
import { LogService } from '../../src/services/LogService';
import { Robot } from '../../src/models/Robot';
import { Map } from '../../src/models/Map';
import { RestrictedZone } from '../../src/models/RestrictedZone';
import { Session } from '../../src/models/Session';
import { Log } from '../../src/models/Log';

const randomSuffix = (): string => Math.random().toString(36).slice(2, 10).toUpperCase();

export async function createTestRobot(
  overrides: Partial<Omit<Robot, 'id'>> = {}
): Promise<Robot> {
  const robotService = new RobotService();

  const robot = await robotService.create({
    name: overrides.name ?? `Test Robot ${randomSuffix()}`,
    serialNumber:
      overrides.serialNumber ?? `ROBOT-${Date.now()}-${randomSuffix()}`,
    modelVersion: overrides.modelVersion ?? '1.0.0',
    firmwareVersion: overrides.firmwareVersion ?? '1.0.0',
  });

  return robot;
}

export async function createTestMap(
  overrides: Partial<Omit<Map, 'id' | 'robotId'>> & { robotId?: string } = {}
): Promise<Map> {
  const mapService = new MapService();

  const robotId = overrides.robotId ?? (await createTestRobot()).id;

  const map = await mapService.create({
    robotId,
    name: overrides.name ?? `Test Map ${randomSuffix()}`,
    resolution: overrides.resolution ?? 0.05,
    width: overrides.width ?? 200,
    height: overrides.height ?? 200,
    origin:
      overrides.origin ?? {
        x: 0,
        y: 0,
        theta: 0,
      },
  });

  return map;
}

export async function createTestZone(
  options: {
    mapId?: string;
    name?: string | null;
    geometry?: RestrictedZone['geometry'];
  } = {}
): Promise<RestrictedZone> {
  const zoneService = new ZoneService();

  const mapId = options.mapId ?? (await createTestMap()).id;
  const geometry =
    options.geometry ?? {
      type: 'Polygon' as const,
      coordinates: [
        [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
          { x: 2, y: 2 },
          { x: 0, y: 2 },
          { x: 0, y: 0 },
        ],
      ],
    };

  return zoneService.create({
    mapId,
    name: options.name ?? `Zone ${randomSuffix()}`,
    geometry,
  });
}

export async function createTestSession(
  options: {
    robotId?: string;
    mapId?: string;
    type?: Session['type'];
    status?: Session['status'];
    completedAt?: Date;
    statistics?: Partial<Session['statistics']>;
  } = {}
): Promise<Session> {
  const sessionService = new SessionService();
  const mapService = new MapService();

  let map: Map | null = null;

  if (options.mapId) {
    map = await mapService.findById(options.mapId);
  }

  if (!map) {
    map = await createTestMap({ robotId: options.robotId });
  }

  const robotId = options.robotId ?? map.robotId;

  const session = await sessionService.create({
    robotId,
    mapId: map.id,
    type: options.type ?? 'CLEANING',
  });

  if (options.status && options.status !== 'IN_PROGRESS') {
    return sessionService.update(session.id, {
      status: options.status,
      completedAt: options.completedAt,
      statistics: {
        ...session.statistics,
        ...options.statistics,
      },
    });
  }

  if (options.statistics) {
    await sessionService.updateStatistics(session.id, options.statistics);
  }

  return session;
}

export async function createTestLog(
  options: {
    robotId?: string;
    sessionId?: string;
    level?: Log['level'];
    module?: string;
    message?: string;
    data?: Record<string, unknown>;
  } = {}
): Promise<Log> {
  const logService = new LogService();
  const robotId = options.robotId ?? (await createTestRobot()).id;

  return logService.create({
    robotId,
    sessionId: options.sessionId,
    level: options.level ?? 'INFO',
    module: options.module ?? 'test-module',
    message: options.message ?? 'Test log message',
    data: options.data,
  });
}
