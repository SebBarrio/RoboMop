export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends ServiceError {
  constructor(message = "Resource not found") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ValidationError extends ServiceError {
  constructor(message: string, details?: unknown) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

export class ConflictError extends ServiceError {
  constructor(message: string, details?: unknown) {
    super(message, 409, "CONFLICT", details);
  }
}

export class DependencyError extends ServiceError {
  constructor(message: string, details?: unknown) {
    super(message, 422, "DEPENDENCY_ERROR", details);
  }
}

export class InternalServiceError extends ServiceError {
  constructor(message = "Internal service error", details?: unknown) {
    super(message, 500, "INTERNAL_ERROR", details);
  }
}

export type ServiceResult<T> = Promise<T>;
