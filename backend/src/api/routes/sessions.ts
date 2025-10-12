import { Router, Request, Response, NextFunction } from "express";

import { SessionService } from "../../services/SessionService.js";
import { SessionStatus, SessionType } from "../../models/enums.js";

const router = Router();
const sessionService = new SessionService();

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
  void sessionService
    .create({
      robotId,
      mapId,
      type,
      status,
      startedAt,
      statistics
    })
    .then((session) => {
      res.status(201).json(session);
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
  void sessionService
    .update(req.params.sessionId, {
      status,
      completedAt,
      statistics
    })
    .then((session) => {
      res.status(200).json(session);
    })
    .catch(next);
});

export default router;
