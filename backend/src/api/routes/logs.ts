import { Router, Request, Response, NextFunction } from "express";

import { LogService } from "../../services/LogService.js";
import { LogLevel } from "../../models/enums.js";

const router = Router();
const logService = new LogService();

router.get("/", (req: Request, res: Response, next: NextFunction) => {
  const options = {
    robotId: req.query.robotId as string | undefined,
    sessionId: req.query.sessionId as string | undefined,
    level: req.query.level as LogLevel | undefined,
    since: req.query.since ? new Date(req.query.since as string) : undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined
  };

  void logService
    .query(options)
    .then((logs) => {
      res.status(200).json(logs);
    })
    .catch(next);
});

router.delete("/", (req: Request, res: Response, next: NextFunction) => {
  const options = {
    robotId: req.query.robotId as string | undefined,
    before: req.query.before ? new Date(req.query.before as string) : undefined
  };

  void logService
    .clear(options)
    .then(() => {
      res.status(204).send();
    })
    .catch(next);
});

export default router;
