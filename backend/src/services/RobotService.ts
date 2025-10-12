import { DataSource, FindManyOptions, QueryFailedError, Repository } from "typeorm";

import AppDataSource from "../config/database.js";
import { Robot } from "../models/Robot.js";
import { RobotState } from "../models/RobotState.js";
import { RobotStatus, RobotMode } from "../models/enums.js";
import { Position, Velocity, MotorCurrents } from "../models/embeddables.js";

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

export interface UpdateRobotStateInput {
  mode: RobotMode;
  position: Position;
  velocity: Velocity;
  batteryLevel: number;
  waterLevel: number;
  motorCurrents: MotorCurrents;
  errors?: string[] | null;
  sessionId?: string | null;
}

export class RobotService {
  private readonly repository: Repository<Robot>;
  private readonly stateRepository: Repository<RobotState>;

  constructor(dataSource: DataSource = AppDataSource) {
    this.repository = dataSource.getRepository(Robot);
    this.stateRepository = dataSource.getRepository(RobotState);
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

  async getCurrentState(robotId: string): Promise<RobotState> {
    await this.getById(robotId);

    const state = await this.stateRepository.findOne({
      where: { robotId },
      order: { timestamp: "DESC" }
    });

    if (!state) {
      throw new NotFoundError(`No state found for robot with id '${robotId}'`);
    }

    return state;
  }

  async updateState(robotId: string, input: UpdateRobotStateInput): Promise<RobotState> {
    await this.getById(robotId);

    this.validateStateInput(input);

    const state = this.stateRepository.create({
      robotId,
      sessionId: input.sessionId ?? null,
      mode: input.mode,
      position: input.position,
      velocity: input.velocity,
      batteryLevel: input.batteryLevel,
      waterLevel: input.waterLevel,
      motorCurrents: input.motorCurrents,
      errors: input.errors ?? null,
      timestamp: new Date()
    });

    try {
      return await this.stateRepository.save(state);
    } catch (error) {
      this.handleRepositoryError(error, "update robot state");
    }
  }

  async delete(id: string): Promise<void> {
    const result = await this.repository.delete({ id });
    if (result.affected === 0) {
      throw new NotFoundError(`Robot with id '${id}' not found`);
    }
  }

  private validateStateInput(input: UpdateRobotStateInput): void {
    if (!input.mode) {
      throw new ValidationError("Robot mode is required", input);
    }

    if (!input.position || typeof input.position.x !== "number" || typeof input.position.y !== "number") {
      throw new ValidationError("Valid position is required", input.position);
    }

    if (!input.velocity || typeof input.velocity.linear !== "number" || typeof input.velocity.angular !== "number") {
      throw new ValidationError("Valid velocity is required", input.velocity);
    }

    if (typeof input.batteryLevel !== "number" || input.batteryLevel < 0 || input.batteryLevel > 100) {
      throw new ValidationError("Battery level must be between 0 and 100", input.batteryLevel);
    }

    if (typeof input.waterLevel !== "number" || input.waterLevel < 0 || input.waterLevel > 100) {
      throw new ValidationError("Water level must be between 0 and 100", input.waterLevel);
    }

    if (!input.motorCurrents || typeof input.motorCurrents.left !== "number" || typeof input.motorCurrents.right !== "number") {
      throw new ValidationError("Valid motor currents are required", input.motorCurrents);
    }
  }

  private handleRepositoryError(error: unknown, action: string): never {
    if (error instanceof QueryFailedError) {
      const driverError = error.driverError as { code?: string } | undefined;
      const driverCode = driverError?.code ?? error.message;
      if (driverCode === "23505" || driverCode === "SQLITE_CONSTRAINT" || driverCode.includes("UNIQUE")) {
        throw new ConflictError("Robot with the same serial number already exists");
      }
    }

    throw new InternalServiceError(`Failed to ${action}`, error);
  }
}

export default RobotService;
