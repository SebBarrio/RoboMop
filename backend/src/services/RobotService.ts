import { DataSource, FindManyOptions, QueryFailedError, Repository } from "typeorm";

import AppDataSource from "../config/database.js";
import { Robot } from "../models/Robot.js";
import { RobotStatus } from "../models/enums.js";
import { ConflictError, InternalServiceError, NotFoundError, ValidationError } from "./errors.js";

export interface RobotListOptions {
  status?: RobotStatus;
  serialNumber?: string;
}

export interface CreateRobotInput {
  name: string;
  serialNumber: string;
  modelVersion: string;
  firmwareVersion: string;
  status?: RobotStatus;
  lastSeenAt?: Date;
}

export interface UpdateRobotInput {
  name?: string;
  status?: RobotStatus;
  modelVersion?: string;
  firmwareVersion?: string;
  lastSeenAt?: Date;
}

export class RobotService {
  private readonly repository: Repository<Robot>;

  constructor(dataSource: DataSource = AppDataSource) {
    this.repository = dataSource.getRepository(Robot);
  }

  async list(options: RobotListOptions = {}): Promise<Robot[]> {
    const findOptions: FindManyOptions<Robot> = {
      order: { createdAt: "ASC" }
    };

    const where: Record<string, unknown> = {};

    if (options.status) {
      where.status = options.status;
    }

    if (options.serialNumber) {
      where.serialNumber = options.serialNumber;
    }

    if (Object.keys(where).length > 0) {
      findOptions.where = where;
    }

    return this.repository.find(findOptions);
  }

  async getById(id: string): Promise<Robot> {
    const robot = await this.repository.findOne({ where: { id } });

    if (!robot) {
      throw new NotFoundError(`Robot with id '${id}' not found`);
    }

    return robot;
  }

  async create(input: CreateRobotInput): Promise<Robot> {
    if (!input.name || input.name.trim().length === 0) {
      throw new ValidationError("Robot name is required", input);
    }

    if (!input.serialNumber || input.serialNumber.trim().length === 0) {
      throw new ValidationError("Robot serialNumber is required", input);
    }

    if (!input.modelVersion || input.modelVersion.trim().length === 0) {
      throw new ValidationError("Robot modelVersion is required", input);
    }

    if (!input.firmwareVersion || input.firmwareVersion.trim().length === 0) {
      throw new ValidationError("Robot firmwareVersion is required", input);
    }

    const robot = this.repository.create({
      name: input.name.trim(),
      serialNumber: input.serialNumber.trim(),
      modelVersion: input.modelVersion.trim(),
      firmwareVersion: input.firmwareVersion.trim(),
      status: input.status ?? RobotStatus.OFFLINE,
      lastSeenAt: input.lastSeenAt ?? new Date()
    });

    try {
      return await this.repository.save(robot);
    } catch (error) {
      this.handleRepositoryError(error, "create robot");
    }
  }

  async update(id: string, updates: UpdateRobotInput): Promise<Robot> {
    if (!updates || Object.keys(updates).length === 0) {
      throw new ValidationError("No updates provided for robot");
    }

    const robot = await this.getById(id);

    if (updates.lastSeenAt && !(updates.lastSeenAt instanceof Date)) {
      updates.lastSeenAt = new Date(updates.lastSeenAt);
    }

    if (updates.name !== undefined) {
      if (updates.name.trim().length === 0) {
        throw new ValidationError("Robot name cannot be empty");
      }
      updates.name = updates.name.trim();
    }

    if (updates.modelVersion !== undefined) {
      if (updates.modelVersion.trim().length === 0) {
        throw new ValidationError("Robot modelVersion cannot be empty");
      }
      updates.modelVersion = updates.modelVersion.trim();
    }

    if (updates.firmwareVersion !== undefined) {
      if (updates.firmwareVersion.trim().length === 0) {
        throw new ValidationError("Robot firmwareVersion cannot be empty");
      }
      updates.firmwareVersion = updates.firmwareVersion.trim();
    }

    this.repository.merge(robot, updates);

    try {
      return await this.repository.save(robot);
    } catch (error) {
      this.handleRepositoryError(error, "update robot");
    }
  }

  async touch(id: string, lastSeenAt: Date | string = new Date(), status?: RobotStatus): Promise<Robot> {
    const robot = await this.getById(id);
    robot.lastSeenAt = lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt);
    if (status) {
      robot.status = status;
    }

    try {
      return await this.repository.save(robot);
    } catch (error) {
      this.handleRepositoryError(error, "touch robot");
    }
  }

  async delete(id: string): Promise<void> {
    const result = await this.repository.delete({ id });
    if (result.affected === 0) {
      throw new NotFoundError(`Robot with id '${id}' not found`);
    }
  }

  private handleRepositoryError(error: unknown, action: string): never {
    if (error instanceof QueryFailedError) {
      const driverCode = (error.driverError?.code ?? error.message) as string;
      if (driverCode === "23505" || driverCode === "SQLITE_CONSTRAINT" || driverCode.includes("UNIQUE")) {
        throw new ConflictError("Robot with the same serial number already exists");
      }
    }

    throw new InternalServiceError(`Failed to ${action}`, error);
  }
}

export default RobotService;
