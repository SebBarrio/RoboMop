import { Router, Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";

import { RobotService } from "../../services/RobotService.js";
import { RobotStatus, RobotMode } from "../../models/enums.js";
import { ValidationError } from "../../services/errors.js";
import CommandValidationService, { type CommandBody } from "../../services/CommandValidationService.js";
import { resolveCommandHandler } from "../../websocket/index.js";

const router = Router();
const robotService = new RobotService();
const commandValidationService = new CommandValidationService(robotService);

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

const ROBOT_STATUS_VALUES = new Set(Object.values(RobotStatus));

function ensureRobotStatus(status: unknown): RobotStatus {
  if (typeof status !== "string" || !ROBOT_STATUS_VALUES.has(status as RobotStatus)) {
    throw new ValidationError("Invalid robot status", status);
  }

  return status as RobotStatus;
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
      const apiKey = randomUUID();
      res
        .status(201)
        .location(`/api/v1/robots/${robot.id}`)
        .json({
          ...robot,
          apiKey
        });
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
  const robotId = req.params.robotId;

  void commandValidationService
    .validateCommand(robotId, req.body as CommandBody)
    .then(async (validatedCommand) => {
      const handler = resolveCommandHandler();
      if (!handler) {
        return {
          commandId: randomUUID(),
          status: "queued" as const
        };
      }

      return handler.dispatchCommand(robotId, validatedCommand);
    })
    .then((result) => {
      res.status(200).json(result);
    })
    .catch(next);
});

export default router;
