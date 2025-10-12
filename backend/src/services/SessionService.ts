import { DataSource, FindManyOptions, In, QueryFailedError, Repository } from "typeorm";

import AppDataSource from "../config/database.js";
import { Session } from "../models/Session.js";
import { Map } from "../models/Map.js";
import { SessionStatus, SessionType } from "../models/enums.js";

import { DependencyError, InternalServiceError, NotFoundError, ValidationError } from "./errors.js";

export interface SessionListOptions {
  robotId?: string;
  type?: SessionType;
  status?: SessionStatus | SessionStatus[];
}

export interface CreateSessionInput {
  robotId: string;
  mapId: string;
  type: SessionType;
  status?: SessionStatus;
  startedAt?: Date;
  statistics?: Record<string, unknown>;
}

export interface UpdateSessionInput {
  status?: SessionStatus;
  completedAt?: Date | null;
  statistics?: Record<string, unknown>;
}

export class SessionService {
  private readonly repository: Repository<Session>;
  private readonly mapRepository: Repository<Map>;

  constructor(dataSource: DataSource = AppDataSource) {
    this.repository = dataSource.getRepository(Session);
    this.mapRepository = dataSource.getRepository(Map);
  }

  async list(options: SessionListOptions = {}): Promise<Session[]> {
    const findOptions: FindManyOptions<Session> = {
      order: { startedAt: "DESC" }
    };

    const where: Record<string, unknown> = {};

    if (options.robotId) {
      where.robotId = options.robotId;
    }

    if (options.type) {
      where.type = options.type;
    }

    if (options.status) {
      where.status = Array.isArray(options.status) ? In(options.status) : options.status;
    }

    if (Object.keys(where).length > 0) {
      findOptions.where = where;
    }

    return this.repository.find(findOptions);
  }

  async getById(id: string): Promise<Session> {
    const session = await this.repository.findOne({ where: { id } });
    if (!session) {
      throw new NotFoundError(`Session with id '${id}' not found`);
    }

    return session;
  }

  async create(input: CreateSessionInput): Promise<Session> {
    this.validateCreateInput(input);

    await this.ensureMapBelongsToRobot(input.mapId, input.robotId);

    const startedAt = input.startedAt instanceof Date ? input.startedAt : input.startedAt ? new Date(input.startedAt) : new Date();

    const session = this.repository.create({
      robotId: input.robotId,
      mapId: input.mapId,
      type: input.type,
      status: input.status ?? SessionStatus.IN_PROGRESS,
      startedAt,
      completedAt: null,
      statistics: input.statistics ?? {}
    });

    try {
      return await this.repository.save(session);
    } catch (error) {
      this.handleRepositoryError(error, "create session");
    }
  }

  async update(id: string, updates: UpdateSessionInput): Promise<Session> {
    if (!updates || Object.keys(updates).length === 0) {
      throw new ValidationError("No updates provided for session");
    }

    const session = await this.getById(id);

    if (updates.statistics !== undefined && typeof updates.statistics !== "object") {
      throw new ValidationError("Session statistics must be an object", updates.statistics);
    }

    if (updates.status) {
      session.status = updates.status;

      if (this.isTerminalStatus(updates.status) && !updates.completedAt) {
        session.completedAt = new Date();
      }
    }

    if (updates.completedAt !== undefined) {
      if (updates.completedAt === null) {
        session.completedAt = null;
      } else {
        session.completedAt =
          updates.completedAt instanceof Date ? updates.completedAt : new Date(updates.completedAt);
      }
    }

    if (updates.statistics !== undefined) {
      session.statistics = updates.statistics;
    }

    try {
      return await this.repository.save(session);
    } catch (error) {
      this.handleRepositoryError(error, "update session");
    }
  }

  async delete(id: string): Promise<void> {
    const result = await this.repository.delete({ id });
    if (result.affected === 0) {
      throw new NotFoundError(`Session with id '${id}' not found`);
    }
  }

  private async ensureMapBelongsToRobot(mapId: string, robotId: string): Promise<void> {
    const map = await this.mapRepository.findOne({ where: { id: mapId } });
    if (!map) {
      throw new DependencyError(`Map with id '${mapId}' does not exist`);
    }

    if (map.robotId !== robotId) {
      throw new ValidationError("Map does not belong to the provided robot", {
        mapId,
        mapRobotId: map.robotId,
        robotId
      });
    }
  }

  private validateCreateInput(input: CreateSessionInput): void {
    if (!input.robotId || !input.mapId) {
      throw new ValidationError("robotId and mapId are required to create a session", input);
    }

    if (!input.type) {
      throw new ValidationError("Session type is required", input);
    }
  }

  private isTerminalStatus(status: SessionStatus): boolean {
    return [SessionStatus.COMPLETED, SessionStatus.INTERRUPTED, SessionStatus.FAILED].includes(status);
  }

  private handleRepositoryError(error: unknown, action: string): never {
    if (error instanceof QueryFailedError) {
      const driverError = error.driverError as { code?: string } | undefined;
      const code = driverError?.code ?? "";
      if (code === "23503" || code === "SQLITE_CONSTRAINT" || code.includes("FOREIGN")) {
        throw new DependencyError("Referenced robot or map does not exist", error.driverError);
      }

      if (code === "23514" || code.includes("CHECK")) {
        throw new ValidationError("Session constraint violation", error.driverError);
      }
    }

    throw new InternalServiceError(`Failed to ${action}`, error);
  }
}

export default SessionService;
