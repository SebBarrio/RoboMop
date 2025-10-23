import { Router, Request, Response, NextFunction } from "express";

import { LogService } from "../../services/LogService.js";
import { LogLevel } from "../../models/enums.js";
import { ValidationError } from "../../services/errors.js";

const router = Router();
const logService = new LogService();

function parseDateParam(value: unknown, fieldName: string): Date | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new ValidationError(`${fieldName} must be an ISO-8601 string`, value);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`${fieldName} must be a valid date`, value);
  }

  return parsed;
}

router.get("/", (req: Request, res: Response, next: NextFunction) => {
  let since: Date | undefined;

  try {
    since = parseDateParam(req.query.since, "since");
  } catch (error) {
    next(error);
    return;
  }

  const options = {
    robotId: req.query.robotId as string | undefined,
    sessionId: req.query.sessionId as string | undefined,
    level: req.query.level as LogLevel | undefined,
    since,
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
  let before: Date | undefined;

  try {
    before = parseDateParam(req.query.before, "before");
  } catch (error) {
    next(error);
    return;
  }

  const options = {
    robotId: req.query.robotId as string | undefined,
    before
  };

  void logService
    .clear(options)
    .then(() => {
      res.status(204).send();
    })
    .catch(next);
});

export default router;
