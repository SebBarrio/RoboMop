import { Request, Response, NextFunction } from "express";

import { ServiceError } from "../../services/errors.js";

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof ServiceError) {
    res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      details: error.details ?? null
    });
    return;
  }

  console.error("Unhandled error:", error);
  
  res.status(500).json({
    error: "An unexpected error occurred",
    code: "INTERNAL_ERROR"
  });
}
