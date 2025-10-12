import { DataSource, QueryFailedError, Repository, SelectQueryBuilder } from "typeorm";

import AppDataSource from "../config/database.js";
import { Log } from "../models/Log.js";
import { LogLevel } from "../models/enums.js";

import { InternalServiceError, NotFoundError, ValidationError } from "./errors.js";

export interface LogQueryOptions {
  robotId?: string;
  sessionId?: string;
  level?: LogLevel;
  since?: Date;
  limit?: number;
}

export interface CreateLogInput {
  robotId: string;
  sessionId?: string | null;
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, unknown> | null;
  timestamp?: Date;
}

export interface ClearLogsOptions {
  robotId?: string;
  before?: Date;
}

const DEFAULT_LOG_LIMIT = 100;
const MAX_LOG_LIMIT = 1000;

export class LogService {
  private readonly repository: Repository<Log>;

  constructor(dataSource: DataSource = AppDataSource) {
    this.repository = dataSource.getRepository(Log);
  }

  async query(options: LogQueryOptions = {}): Promise<Log[]> {
    const limit = this.resolveLimit(options.limit);
    const qb = this.buildQuery(options);

    qb.orderBy("log.timestamp", "DESC").limit(limit);

    return qb.getMany();
  }

  async create(input: CreateLogInput): Promise<Log> {
    this.validateCreateInput(input);

    const log = this.repository.create({
      robotId: input.robotId,
      sessionId: input.sessionId ?? null,
      level: input.level,
      module: input.module,
      message: input.message,
      data: input.data ?? null,
      timestamp: input.timestamp ?? new Date()
    });

    try {
      return await this.repository.save(log);
    } catch (error) {
      this.handleRepositoryError(error, "create log");
    }
  }

  async deleteById(id: string): Promise<void> {
    const result = await this.repository.delete({ id });
    if (result.affected === 0) {
      throw new NotFoundError(`Log with id '${id}' not found`);
    }
  }

  async clear(options: ClearLogsOptions = {}): Promise<number> {
    if (!options.robotId && !options.before) {
      throw new ValidationError("Clearing logs requires at least robotId or before timestamp");
    }

    const qb = this.repository.createQueryBuilder().delete().from(Log);

    if (options.robotId) {
      qb.andWhere("robotId = :robotId", { robotId: options.robotId });
    }

    if (options.before) {
      qb.andWhere("timestamp < :before", { before: options.before });
    }

    const result = await qb.execute();
    return result.affected ?? 0;
  }

  private buildQuery(options: LogQueryOptions): SelectQueryBuilder<Log> {
    const qb = this.repository.createQueryBuilder("log");

    if (options.robotId) {
      qb.andWhere("log.robotId = :robotId", { robotId: options.robotId });
    }

    if (options.sessionId) {
      qb.andWhere("log.sessionId = :sessionId", { sessionId: options.sessionId });
    }

    if (options.level) {
      qb.andWhere("log.level = :level", { level: options.level });
    }

    if (options.since) {
      qb.andWhere("log.timestamp >= :since", { since: options.since });
    }

    return qb;
  }

  private resolveLimit(rawLimit?: number): number {
    if (!rawLimit) {
      return DEFAULT_LOG_LIMIT;
    }

    if (!Number.isInteger(rawLimit) || rawLimit <= 0) {
      throw new ValidationError("Log limit must be a positive integer", rawLimit);
    }

    if (rawLimit > MAX_LOG_LIMIT) {
      throw new ValidationError(`Log limit cannot exceed ${MAX_LOG_LIMIT}`, rawLimit);
    }

    return rawLimit;
  }

  private validateCreateInput(input: CreateLogInput): void {
    if (!input.robotId) {
      throw new ValidationError("robotId is required to create a log", input);
    }

    if (!input.module) {
      throw new ValidationError("module is required to create a log", input);
    }

    if (!input.message) {
      throw new ValidationError("message is required to create a log", input);
    }
  }

  private handleRepositoryError(error: unknown, action: string): never {
    if (error instanceof QueryFailedError) {
      throw new InternalServiceError(`Failed to ${action}`, error.driverError);
    }

    throw new InternalServiceError(`Failed to ${action}`, error);
  }
}

export default LogService;
