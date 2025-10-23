import { Router, Request, Response, NextFunction } from "express";

import { SessionService } from "../../services/SessionService.js";
import { SessionStatus, SessionType } from "../../models/enums.js";
import { ValidationError } from "../../services/errors.js";

const router = Router();
const sessionService = new SessionService();

const SESSION_STATUS_VALUES = new Set(Object.values(SessionStatus));
const SESSION_TYPE_VALUES = new Set(Object.values(SessionType));

interface SessionCreateBody {
  robotId: string;
  mapId: string;
  type: SessionType;
  status?: SessionStatus;
  startedAt?: Date;
  statistics?: Record<string, unknown>;
}

interface SessionUpdateBody {
  status?: SessionStatus;
  completedAt?: Date | null;
  statistics?: Record<string, unknown>;
}

function ensureSessionType(value: unknown): SessionType {
  if (typeof value !== "string" || !SESSION_TYPE_VALUES.has(value as SessionType)) {
    throw new ValidationError("Invalid session type", value);
  }

  return value as SessionType;
}

function ensureSessionStatus(value: unknown): SessionStatus {
  if (typeof value !== "string" || !SESSION_STATUS_VALUES.has(value as SessionStatus)) {
    throw new ValidationError("Invalid session status", value);
  }

  return value as SessionStatus;
}

router.get("/", (req: Request, res: Response, next: NextFunction) => {
  const options = {
    robotId: req.query.robotId as string | undefined,
    type: req.query.type as SessionType | undefined,
    status: req.query.status as SessionStatus | undefined
  };
  void sessionService
    .list(options)
    .then((sessions) => {
      res.status(200).json(sessions);
    })
    .catch(next);
});

router.post("/", (req: Request, res: Response, next: NextFunction) => {
  const { robotId, mapId, type, status, startedAt, statistics } = req.body as SessionCreateBody;

  let validatedType: SessionType;
  let validatedStatus: SessionStatus | undefined;

  try {
    validatedType = ensureSessionType(type);
    validatedStatus = status !== undefined ? ensureSessionStatus(status) : undefined;
  } catch (error) {
    next(error);
    return;
  }

  void sessionService
    .create({
      robotId,
      mapId,
      type: validatedType,
      status: validatedStatus,
      startedAt,
      statistics
    })
    .then((session) => {
      res.status(201).location(`/api/v1/sessions/${session.id}`).json(session);
    })
    .catch(next);
});

router.get("/:sessionId", (req: Request, res: Response, next: NextFunction) => {
  void sessionService
    .getById(req.params.sessionId)
    .then((session) => {
      res.status(200).json(session);
    })
    .catch(next);
});

router.patch("/:sessionId", (req: Request, res: Response, next: NextFunction) => {
  const { status, completedAt, statistics } = req.body as SessionUpdateBody;

  let validatedStatus: SessionStatus | undefined;

  try {
    validatedStatus = status !== undefined ? ensureSessionStatus(status) : undefined;
  } catch (error) {
    next(error);
    return;
  }

  void sessionService
    .update(req.params.sessionId, {
      status: validatedStatus,
      completedAt,
      statistics
    })
    .then((session) => {
      res.status(200).json(session);
    })
    .catch(next);
});

export default router;
