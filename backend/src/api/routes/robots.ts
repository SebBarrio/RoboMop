import { Router, Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";

import { RobotService } from "../../services/RobotService.js";
import { RobotStatus, RobotMode } from "../../models/enums.js";
import { ValidationError } from "../../services/errors.js";

const router = Router();
const robotService = new RobotService();

interface RobotCreateBody {
  name: string;
  serialNumber: string;
  modelVersion: string;
  firmwareVersion: string;
}

interface RobotUpdateBody {
  name?: string;
  status?: RobotStatus;
  modelVersion?: string;
  firmwareVersion?: string;
}

interface RobotStateUpdateBody {
  mode: RobotMode;
  position: { x: number; y: number; theta: number; confidence: number };
  velocity: { linear: number; angular: number };
  batteryLevel: number;
  waterLevel: number;
  motorCurrents: { left: number; right: number };
  errors?: string[] | null;
}

const COMMAND_TYPES = ["MOVE", "SET_MODE", "E_STOP", "SET_SPEED", "CONFIG_UPDATE"] as const;
type CommandType = (typeof COMMAND_TYPES)[number];

const MOVE_DIRECTIONS = new Set(["FORWARD", "BACKWARD", "LEFT", "RIGHT", "STOP"]);

const ROBOT_STATUS_VALUES = new Set(Object.values(RobotStatus));

interface CommandBody {
  type: string;
  payload: Record<string, unknown> | null | undefined;
}

function ensureRobotStatus(status: unknown): RobotStatus {
  if (typeof status !== "string" || !ROBOT_STATUS_VALUES.has(status as RobotStatus)) {
    throw new ValidationError("Invalid robot status", status);
  }

  return status as RobotStatus;
}

function ensureCommand(body: CommandBody): void {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Command body must be an object");
  }

  const { type, payload } = body;

  if (typeof type !== "string" || type.trim().length === 0) {
    throw new ValidationError("Command type is required");
  }

  if (!COMMAND_TYPES.includes(type as CommandType)) {
    throw new ValidationError(`Unsupported command type '${type}'`);
  }

  if (!payload || typeof payload !== "object") {
    throw new ValidationError("Command payload must be an object");
  }

  switch (type as CommandType) {
    case "MOVE":
      validateMovePayload(payload);
      break;
    case "SET_MODE":
      validateSetModePayload(payload);
      break;
    case "E_STOP":
      validateEStopPayload(payload);
      break;
    case "SET_SPEED":
      validateSetSpeedPayload(payload);
      break;
    case "CONFIG_UPDATE":
      validateConfigUpdatePayload(payload);
      break;
    default:
      break;
  }

}

function validateMovePayload(payload: Record<string, unknown>): void {
  const { direction, speed, duration } = payload as {
    direction?: unknown;
    speed?: unknown;
    duration?: unknown;
  };

  if (typeof direction !== "string" || !MOVE_DIRECTIONS.has(direction)) {
    throw new ValidationError("MOVE command requires a valid direction", payload);
  }

  if (typeof speed !== "number" || Number.isNaN(speed) || speed < 0 || speed > 1.0) {
    throw new ValidationError("MOVE command requires speed between 0 and 1", speed);
  }

  if (duration !== undefined && (typeof duration !== "number" || Number.isNaN(duration) || duration < 0)) {
    throw new ValidationError("MOVE command duration must be a non-negative number", duration);
  }
}

function validateSetModePayload(payload: Record<string, unknown>): void {
  const { mode, parameters } = payload as {
    mode?: unknown;
    parameters?: unknown;
  };

  if (typeof mode !== "string" || !Object.values(RobotMode).includes(mode as RobotMode)) {
    throw new ValidationError("SET_MODE command requires a valid mode", mode);
  }

  if (parameters !== undefined && typeof parameters !== "object") {
    throw new ValidationError("SET_MODE parameters must be an object", parameters);
  }
}

function validateEStopPayload(payload: Record<string, unknown>): void {
  const { reason } = payload as { reason?: unknown };

  if (reason !== undefined && typeof reason !== "string") {
    throw new ValidationError("E_STOP reason must be a string", reason);
  }
}

function validateSetSpeedPayload(payload: Record<string, unknown>): void {
  const { speedMultiplier } = payload as { speedMultiplier?: unknown };

  if (typeof speedMultiplier !== "number" || Number.isNaN(speedMultiplier) || speedMultiplier <= 0) {
    throw new ValidationError("SET_SPEED command requires a positive speedMultiplier", speedMultiplier);
  }
}

function validateConfigUpdatePayload(payload: Record<string, unknown>): void {
  const { config } = payload as { config?: unknown };

  if (typeof config !== "object" || config === null) {
    throw new ValidationError("CONFIG_UPDATE command requires a config object", config);
  }
}

router.get("/", (req: Request, res: Response, next: NextFunction) => {
  const options = {
    status: req.query.status as RobotStatus | undefined,
    serialNumber: req.query.serialNumber as string | undefined
  };
  void robotService
    .list(options)
    .then((robots) => {
      res.status(200).json(robots);
    })
    .catch(next);
});

router.post("/", (req: Request, res: Response, next: NextFunction) => {
  const { name, serialNumber, modelVersion, firmwareVersion } = req.body as RobotCreateBody;
  void robotService
    .create({
      name,
      serialNumber,
      modelVersion,
      firmwareVersion
    })
    .then((robot) => {
      res.status(201).location(`/api/v1/robots/${robot.id}`).json(robot);
    })
    .catch(next);
});

router.get("/:robotId", (req: Request, res: Response, next: NextFunction) => {
  void robotService
    .getById(req.params.robotId)
    .then((robot) => {
      res.status(200).json(robot);
    })
    .catch(next);
});

router.patch("/:robotId", (req: Request, res: Response, next: NextFunction) => {
  const { name, status, modelVersion, firmwareVersion } = req.body as RobotUpdateBody;

  let validatedStatus: RobotStatus | undefined;

  try {
    validatedStatus = status !== undefined ? ensureRobotStatus(status) : undefined;
  } catch (error) {
    next(error);
    return;
  }

  void robotService
    .update(req.params.robotId, {
      name,
      status: validatedStatus,
      modelVersion,
      firmwareVersion
    })
    .then((robot) => {
      res.status(200).json(robot);
    })
    .catch(next);
});

router.get("/:robotId/state", (req: Request, res: Response, next: NextFunction) => {
  void robotService
    .getCurrentState(req.params.robotId)
    .then((state) => {
      res.status(200).json(state);
    })
    .catch(next);
});

router.post("/:robotId/state", (req: Request, res: Response, next: NextFunction) => {
  const { mode, position, velocity, batteryLevel, waterLevel, motorCurrents, errors } =
    req.body as RobotStateUpdateBody;
  void robotService
    .updateState(req.params.robotId, {
      mode,
      position,
      velocity,
      batteryLevel,
      waterLevel,
      motorCurrents,
      errors
    })
    .then((state) => {
      res.status(200).json(state);
    })
    .catch(next);
});

router.post("/:robotId/command", (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureCommand(req.body as CommandBody);
  } catch (error) {
    next(error);
    return;
  }

  void robotService
    .getById(req.params.robotId)
    .then(() => {
      res.status(200).json({
        commandId: randomUUID(),
        status: "queued"
      });
    })
    .catch(next);
});

export default router;
