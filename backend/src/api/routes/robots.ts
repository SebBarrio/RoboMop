import { Router, Request, Response, NextFunction } from "express";

import { RobotService } from "../../services/RobotService.js";
import { RobotStatus, RobotMode } from "../../models/enums.js";

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

interface CommandBody {
  type: string;
  payload: Record<string, unknown>;
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
      res.status(201).json(robot);
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
  void robotService
    .update(req.params.robotId, {
      name,
      status,
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

router.post("/:robotId/command", (req: Request, res: Response) => {
  const { type, payload } = req.body as CommandBody;

  if (!type || !payload) {
    res.status(400).json({ error: "Command type and payload are required" });
    return;
  }

  const commandId = crypto.randomUUID();

  res.status(200).json({
    commandId,
    status: "queued"
  });
});

export default router;
