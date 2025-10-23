import { DataSource, QueryFailedError, Repository } from "typeorm";

import AppDataSource from "../config/database.js";
import { RobotState } from "../models/RobotState.js";
import { Robot } from "../models/Robot.js";
import { Session } from "../models/Session.js";
import { RobotMode, RobotStatus } from "../models/enums.js";
import {
  DependencyError,
  InternalServiceError,
  NotFoundError,
  ValidationError
} from "./errors.js";

export interface PositionInput {
  x: number;
  y: number;
  theta: number;
  confidence: number;
}

export interface VelocityInput {
  linear: number;
  angular: number;
}

export interface MotorCurrentsInput {
  left: number;
  right: number;
}

export interface CreateRobotStateInput {
  robotId: string;
  sessionId?: string | null;
  mode: RobotMode;
  position: PositionInput;
  velocity: VelocityInput;
  batteryLevel: number;
  waterLevel: number;
  motorCurrents: MotorCurrentsInput;
  errors?: string[] | null;
  timestamp?: Date | string;
}

export class RobotStateService {
  private readonly repository: Repository<RobotState>;
  private readonly robotRepository: Repository<Robot>;
  private readonly sessionRepository: Repository<Session>;

  constructor(dataSource: DataSource = AppDataSource) {
    this.repository = dataSource.getRepository(RobotState);
    this.robotRepository = dataSource.getRepository(Robot);
    this.sessionRepository = dataSource.getRepository(Session);
  }

  async getLatestByRobotId(robotId: string): Promise<RobotState> {
    const state = await this.repository
      .createQueryBuilder("state")
      .where("state.robotId = :robotId", { robotId })
      .orderBy("state.timestamp", "DESC")
      .getOne();

    if (!state) {
      throw new NotFoundError(`No state found for robot '${robotId}'`);
    }

    return state;
  }

  async create(input: CreateRobotStateInput): Promise<RobotState> {
    this.validateInput(input);

    const robot = await this.robotRepository.findOne({ where: { id: input.robotId } });
    if (!robot) {
      throw new DependencyError(`Robot with id '${input.robotId}' does not exist`);
    }

    let session: Session | null = null;
    if (input.sessionId) {
      session = await this.sessionRepository.findOne({ where: { id: input.sessionId } });
      if (!session) {
        throw new DependencyError(`Session with id '${input.sessionId}' does not exist`);
      }
      if (session.robotId !== input.robotId) {
        throw new ValidationError("Session does not belong to the provided robot", {
          sessionId: input.sessionId,
          robotId: input.robotId,
          sessionRobotId: session.robotId
        });
      }
    }

    const timestamp = input.timestamp instanceof Date ? input.timestamp : new Date(input.timestamp ?? Date.now());

    const state = this.repository.create({
      robotId: input.robotId,
      sessionId: session ? session.id : null,
      mode: input.mode,
      position: input.position,
      velocity: input.velocity,
      batteryLevel: input.batteryLevel,
      waterLevel: input.waterLevel,
      motorCurrents: input.motorCurrents,
      errors: input.errors && input.errors.length > 0 ? input.errors : [],
      timestamp
    });

    try {
      const savedState = await this.repository.save(state);

      robot.lastSeenAt = timestamp;
      if (input.mode !== RobotMode.ERROR) {
        robot.status = RobotStatus.ONLINE;
      }
      await this.robotRepository.save(robot);

      return savedState;
    } catch (error) {
      this.handleRepositoryError(error, "create robot state");
    }
  }

  private validateInput(input: CreateRobotStateInput): void {
    if (!input.robotId) {
      throw new ValidationError("robotId is required for robot state updates");
    }

    if (!Object.values(RobotMode).includes(input.mode)) {
      throw new ValidationError(`Invalid robot mode '${input.mode}'`, input.mode);
    }

    this.validatePosition(input.position);
    this.validateVelocity(input.velocity);
    this.validateBatteryLevel(input.batteryLevel);
    this.validateWaterLevel(input.waterLevel);
    this.validateMotorCurrents(input.motorCurrents);
    this.validateErrors(input.errors);
  }

  private validatePosition(position: PositionInput): void {
    if (!position) {
      throw new ValidationError("position is required", position);
    }

    const { x, y, theta, confidence } = position;
    if (![x, y, theta, confidence].every((value) => typeof value === "number" && Number.isFinite(value))) {
      throw new ValidationError("position must contain finite numeric values", position);
    }

    if (confidence < 0 || confidence > 1) {
      throw new ValidationError("position confidence must be between 0 and 1", confidence);
    }
  }

  private validateVelocity(velocity: VelocityInput): void {
    if (!velocity) {
      throw new ValidationError("velocity is required", velocity);
    }

    const { linear, angular } = velocity;
    if (![linear, angular].every((value) => typeof value === "number" && Number.isFinite(value))) {
      throw new ValidationError("velocity must contain finite numeric values", velocity);
    }
  }

  private validateBatteryLevel(level: number): void {
    if (typeof level !== "number" || Number.isNaN(level)) {
      throw new ValidationError("batteryLevel must be a valid number", level);
    }

    if (level < 0 || level > 100) {
      throw new ValidationError("batteryLevel must be between 0 and 100", level);
    }
  }

  private validateWaterLevel(level: number): void {
    if (typeof level !== "number" || Number.isNaN(level)) {
      throw new ValidationError("waterLevel must be a valid number", level);
    }

    if (level < 0 || level > 100) {
      throw new ValidationError("waterLevel must be between 0 and 100", level);
    }
  }

  private validateMotorCurrents(currents: MotorCurrentsInput): void {
    if (!currents) {
      throw new ValidationError("motorCurrents are required", currents);
    }

    const { left, right } = currents;
    if (![left, right].every((value) => typeof value === "number" && Number.isFinite(value))) {
      throw new ValidationError("motorCurrents must be finite numeric values", currents);
    }

    if (left < 0 || left > 5 || right < 0 || right > 5) {
      throw new ValidationError("motorCurrents must be between 0 and 5 amps", currents);
    }
  }

  private validateErrors(errors?: string[] | null): void {
    if (!errors) {
      return;
    }

    if (!Array.isArray(errors)) {
      throw new ValidationError("errors must be an array of strings", errors);
    }

    for (const error of errors) {
      if (typeof error !== "string") {
        throw new ValidationError("errors must contain strings", error);
      }

      if (error.length > 50) {
        throw new ValidationError("error codes must not exceed 50 characters", error);
      }
    }
  }

  private handleRepositoryError(error: unknown, action: string): never {
    if (error instanceof QueryFailedError) {
      throw new InternalServiceError(`Failed to ${action}`, error.driverError ?? error);
    }

    if (error instanceof Error) {
      throw new InternalServiceError(`Failed to ${action}`, error);
    }

    throw new InternalServiceError(`Failed to ${action}`);
  }
}

export default RobotStateService;
