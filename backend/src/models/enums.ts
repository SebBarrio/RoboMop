export enum RobotStatus {
  ONLINE = "ONLINE",
  OFFLINE = "OFFLINE",
  ERROR = "ERROR",
  MAINTENANCE = "MAINTENANCE"
}

export enum RobotMode {
  IDLE = "IDLE",
  EXPLORATION = "EXPLORATION",
  CLEANING = "CLEANING",
  MANUAL = "MANUAL",
  RETURNING = "RETURNING",
  ERROR = "ERROR"
}

export enum SessionType {
  EXPLORATION = "EXPLORATION",
  CLEANING = "CLEANING"
}

export enum SessionStatus {
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  INTERRUPTED = "INTERRUPTED",
  FAILED = "FAILED"
}

export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
  CRITICAL = "CRITICAL"
}
