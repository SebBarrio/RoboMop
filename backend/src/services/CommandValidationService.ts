import { RobotMode } from "../models/enums.js";
import type { RobotState } from "../models/RobotState.js";
import { ValidationError, NotFoundError } from "./errors.js";
import { RobotService } from "./RobotService.js";

export const COMMAND_TYPES = ["MOVE", "SET_MODE", "E_STOP", "SET_SPEED", "CONFIG_UPDATE"] as const;

export type CommandType = (typeof COMMAND_TYPES)[number];

export interface CommandBody {
  type?: string;
  payload?: Record<string, unknown> | null;
}

export type MoveDirection = "FORWARD" | "BACKWARD" | "LEFT" | "RIGHT" | "STOP";

export interface MoveCommandPayload {
  direction: MoveDirection;
  speed: number;
  duration?: number;
}

export interface SetModeCommandPayload {
  mode: string;
  parameters?: Record<string, unknown> | null;
}

export interface EStopCommandPayload {
  reason?: string | null;
}

export interface SetSpeedCommandPayload {
  speedMultiplier: number;
}

export interface ConfigUpdateCommandPayload {
  config: Record<string, unknown>;
}

export type CommandPayloadMap = {
  MOVE: MoveCommandPayload;
  SET_MODE: SetModeCommandPayload;
  E_STOP: EStopCommandPayload;
  SET_SPEED: SetSpeedCommandPayload;
  CONFIG_UPDATE: ConfigUpdateCommandPayload;
};

export type ValidatedCommand<TType extends CommandType = CommandType> = {
  type: TType;
  payload: CommandPayloadMap[TType];
};

const MOVE_DIRECTIONS: ReadonlySet<MoveDirection> = new Set(["FORWARD", "BACKWARD", "LEFT", "RIGHT", "STOP"]);

export class CommandValidationService {
  constructor(private readonly robotService: RobotService = new RobotService()) {}

  async validateCommand(robotId: string, body: CommandBody): Promise<ValidatedCommand> {
    if (!robotId || typeof robotId !== "string") {
      throw new ValidationError("Robot id is required to submit a command", robotId);
    }

    const command = this.validateStructure(body);

    await this.robotService.getById(robotId);

    const currentState = await this.getCurrentState(robotId);
    this.ensureNoConflicts(currentState, command);

    return command;
  }

  private validateStructure(body: CommandBody): ValidatedCommand {
    if (!body || typeof body !== "object") {
      throw new ValidationError("Command body must be an object");
    }

    const { type, payload } = body;

    if (typeof type !== "string" || type.trim().length === 0) {
      throw new ValidationError("Command type is required");
    }

    const normalizedType = type.trim().toUpperCase();

    if (!COMMAND_TYPES.includes(normalizedType as CommandType)) {
      throw new ValidationError(`Unsupported command type '${type}'`);
    }

    if (!payload || typeof payload !== "object") {
      throw new ValidationError("Command payload must be an object", payload);
    }

    switch (normalizedType as CommandType) {
      case "MOVE":
        return {
          type: "MOVE",
          payload: this.validateMovePayload(payload)
        };
      case "SET_MODE":
        return {
          type: "SET_MODE",
          payload: this.validateSetModePayload(payload)
        };
      case "E_STOP":
        return {
          type: "E_STOP",
          payload: this.validateEStopPayload(payload)
        };
      case "SET_SPEED":
        return {
          type: "SET_SPEED",
          payload: this.validateSetSpeedPayload(payload)
        };
      case "CONFIG_UPDATE":
        return {
          type: "CONFIG_UPDATE",
          payload: this.validateConfigUpdatePayload(payload)
        };
      default: {
        throw new ValidationError(`Unsupported command type '${type}'`);
      }
    }
  }

  private validateMovePayload(payload: Record<string, unknown>): MoveCommandPayload {
    const { direction, speed, duration } = payload as {
      direction?: unknown;
      speed?: unknown;
      duration?: unknown;
    };

    if (typeof direction !== "string" || !MOVE_DIRECTIONS.has(direction as MoveDirection)) {
      throw new ValidationError("MOVE command requires a valid direction", direction);
    }

    if (typeof speed !== "number" || Number.isNaN(speed) || speed < 0 || speed > 1) {
      throw new ValidationError("MOVE command requires speed between 0 and 1", speed);
    }

    if (duration !== undefined && (typeof duration !== "number" || Number.isNaN(duration) || duration < 0)) {
      throw new ValidationError("MOVE command duration must be a non-negative number", duration);
    }

    return {
      direction: direction as MoveDirection,
      speed,
      duration: duration === undefined ? undefined : (duration as number)
    };
  }

  private validateSetModePayload(payload: Record<string, unknown>): SetModeCommandPayload {
    const { mode, parameters } = payload as {
      mode?: unknown;
      parameters?: unknown;
    };

    if (typeof mode !== "string" || mode.trim().length === 0) {
      throw new ValidationError("SET_MODE command requires a mode value", mode);
    }

    if (parameters !== undefined && parameters !== null && typeof parameters !== "object") {
      throw new ValidationError("SET_MODE parameters must be an object", parameters);
    }

    return {
      mode: mode.trim(),
      parameters: (parameters ?? undefined) as Record<string, unknown> | undefined
    };
  }

  private validateEStopPayload(payload: Record<string, unknown>): EStopCommandPayload {
    const { reason } = payload as { reason?: unknown };

    if (reason !== undefined && reason !== null && typeof reason !== "string") {
      throw new ValidationError("E_STOP reason must be a string", reason);
    }

    return {
      reason: reason === undefined ? undefined : (reason as string)
    };
  }

  private validateSetSpeedPayload(payload: Record<string, unknown>): SetSpeedCommandPayload {
    const { speedMultiplier } = payload as { speedMultiplier?: unknown };

    if (
      typeof speedMultiplier !== "number" ||
      Number.isNaN(speedMultiplier) ||
      speedMultiplier <= 0 ||
      !Number.isFinite(speedMultiplier)
    ) {
      throw new ValidationError("SET_SPEED command requires a positive speedMultiplier", speedMultiplier);
    }

    return {
      speedMultiplier
    };
  }

  private validateConfigUpdatePayload(payload: Record<string, unknown>): ConfigUpdateCommandPayload {
    const { config } = payload as { config?: unknown };

    if (!config || typeof config !== "object") {
      throw new ValidationError("CONFIG_UPDATE command requires a config object", config);
    }

    return {
      config: config as Record<string, unknown>
    };
  }

  private async getCurrentState(robotId: string): Promise<RobotState | null> {
    try {
      return await this.robotService.getCurrentState(robotId);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return null;
      }

      throw error;
    }
  }

  private ensureNoConflicts(currentState: RobotState | null, command: ValidatedCommand): void {
    switch (command.type) {
      case "MOVE":
        if (currentState && currentState.mode !== RobotMode.MANUAL) {
          throw new ValidationError("MOVE commands require the robot to be in MANUAL mode", currentState.mode);
        }
        break;
      case "SET_MODE": {
        const { mode } = command.payload as SetModeCommandPayload;
        this.ensureModeTransitionAllowed(currentState, mode);
        break;
      }
      case "SET_SPEED":
        if (currentState && currentState.mode !== RobotMode.MANUAL) {
          throw new ValidationError("SET_SPEED commands require the robot to be in MANUAL mode", currentState.mode);
        }
        break;
      default:
        break;
    }
  }

  private ensureModeTransitionAllowed(currentState: RobotState | null, requestedMode: string): void {
    if (!currentState) {
      return;
    }

    const nextMode = requestedMode.toUpperCase();

    if (currentState.mode === RobotMode.EXPLORATION && nextMode === "CLEANING") {
      throw new ValidationError("Cannot start cleaning while exploration mode is active", {
        currentMode: currentState.mode,
        requestedMode: requestedMode
      });
    }

    if (currentState.mode === RobotMode.CLEANING && nextMode === "EXPLORATION") {
      throw new ValidationError("Cannot start exploration while cleaning mode is active", {
        currentMode: currentState.mode,
        requestedMode: requestedMode
      });
    }
  }
}

export default CommandValidationService;
