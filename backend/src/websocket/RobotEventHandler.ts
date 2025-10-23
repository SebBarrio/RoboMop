import type { Socket } from "socket.io";

import { RobotStatus } from "../models/enums.js";
import MapService from "../services/MapService.js";
import LogService from "../services/LogService.js";
import { RobotService } from "../services/RobotService.js";
import { ServiceError } from "../services/errors.js";

import ConnectionRegistry from "./ConnectionRegistry.js";

type AckCallback = ((error: unknown, response?: unknown) => void) | undefined;

export class RobotEventHandler {
  constructor(
    private readonly registry: ConnectionRegistry,
    private readonly robotService: RobotService,
    private readonly mapService: MapService,
    private readonly logService: LogService
  ) {}

  register(socket: Socket, robotId: string): void {
    console.log("register robot handler", robotId);
    socket.onAny((eventName) => {
      console.log("robot socket event", eventName);
    });
    socket.on("robot:heartbeat", (payload, callback) => {
      console.log("heartbeat callback type", typeof callback);
      void this.handleHeartbeat(robotId, payload, callback);
    });

    socket.on("robot:state", (payload, callback) => {
      void this.handleState(robotId, payload, callback);
    });

    socket.on("robot:map-update", (payload, callback) => {
      void this.handleMapUpdate(robotId, payload, callback);
    });

    socket.on("robot:sensor-data", (payload, callback) => {
      void this.handleSensorData(robotId, payload, callback);
    });

    socket.on("robot:session-started", (payload) => {
      void this.handleSessionEvent(robotId, "STARTED", payload);
    });

    socket.on("robot:session-completed", (payload) => {
      void this.handleSessionEvent(robotId, "COMPLETED", payload);
    });

    socket.on("robot:error", (payload) => {
      void this.handleRobotError(robotId, payload);
    });

    socket.on("robot:log", (payload) => {
      void this.handleRobotLog(robotId, payload);
    });
  }

  private async handleHeartbeat(robotId: string, payload: Record<string, unknown>, callback: AckCallback): Promise<void> {
    try {
      console.log("handleHeartbeat invoked");
      const receivedAt = new Date();
      const timestamp = this.extractTimestamp(payload?.timestamp) ?? receivedAt;

      await this.robotService.touch(robotId, timestamp, RobotStatus.ONLINE);

      this.registry.emitToRobotStream(robotId, "heartbeat", "frontend:heartbeat", {
        robotId,
        ...payload
      });

      this.respond(callback, {
        status: "accepted",
        receivedAt: receivedAt.toISOString()
      });
    } catch (error) {
      this.fail(callback, error);
    }
  }

  private async handleState(robotId: string, payload: Record<string, unknown>, callback: AckCallback): Promise<void> {
    try {
      const receivedAt = new Date();

      const state = await this.robotService.updateState(robotId, {
        mode: payload.mode as never,
        position: payload.position as never,
        velocity: payload.velocity as never,
        batteryLevel: payload.batteryLevel as number,
        waterLevel: payload.waterLevel as number,
        motorCurrents: payload.motorCurrents as never,
        errors: (payload.errors as string[]) ?? []
      });

      await this.robotService.touch(robotId, receivedAt, RobotStatus.ONLINE);

      this.registry.emitToRobotStream(robotId, "robot-state", "frontend:robot-state", payload);

      this.respond(callback, {
        status: "accepted",
        stateId: state.id,
        receivedAt: receivedAt.toISOString()
      });
    } catch (error) {
      this.fail(callback, error);
    }
  }

  private async handleMapUpdate(robotId: string, payload: Record<string, unknown>, callback: AckCallback): Promise<void> {
    try {
      const receivedAt = new Date();

      const mapId = typeof payload.mapId === "string" ? payload.mapId : undefined;
      if (!mapId) {
        throw new ServiceError("Map identifier is required", 400, "VALIDATION_ERROR");
      }

      const updateType = typeof payload.updateType === "string" ? payload.updateType : "delta";
      let updatedCells = 0;

      if (updateType === "delta" && Array.isArray(payload.cells)) {
        const cells = payload.cells.map((cell) => ({
          row: Number((cell as Record<string, unknown>).row),
          col: Number((cell as Record<string, unknown>).col),
          value: Number((cell as Record<string, unknown>).value)
        }));
        updatedCells = cells.length;

        await this.mapService.patchCells(mapId, cells);
      } else if (updateType === "full") {
        if (typeof payload.data === "string") {
          const buffer = Buffer.from(payload.data, "base64");
          updatedCells = buffer.length;
          await this.mapService.replaceData(mapId, buffer);
        }

        if (payload.metadata && typeof payload.metadata === "object") {
          await this.mapService.update(mapId, { metadata: payload.metadata as Record<string, unknown> });
        }
      }

      this.registry.emitToRobotStream(robotId, "map-update", "frontend:map-update", payload);

      this.respond(callback, {
        status: "accepted",
        updatedCells,
        receivedAt: receivedAt.toISOString()
      });
    } catch (error) {
      this.fail(callback, error);
    }
  }

  private async handleSensorData(
    robotId: string,
    payload: Record<string, unknown>,
    callback: AckCallback
  ): Promise<void> {
    try {
      const receivedAt = new Date();
      this.registry.emitToRobotStream(robotId, "sensor-data", "frontend:sensor-data", payload);

      this.respond(callback, {
        status: "queued",
        receivedAt: receivedAt.toISOString()
      });
    } catch (error) {
      this.fail(callback, error);
    }
  }

  private async handleSessionEvent(robotId: string, event: string, payload: Record<string, unknown>): Promise<void> {
    try {
      this.registry.emitToRobotStream(robotId, "session-event", "frontend:session-event", {
        event,
        session: payload
      });
    } catch (error) {
      // Swallow errors to avoid impacting robot connection
      if (error instanceof Error) {
        // eslint-disable-next-line no-console
        console.error("Failed to process session event", error);
      }
    }
  }

  private async handleRobotError(robotId: string, payload: Record<string, unknown>): Promise<void> {
    this.registry.broadcastToRobot(robotId, "frontend:error", payload);
  }

  private async handleRobotLog(robotId: string, payload: Record<string, unknown>): Promise<void> {
    if (!payload || typeof payload !== "object") {
      return;
    }

    const level = typeof payload.level === "string" ? payload.level : "INFO";
    const moduleName = typeof payload.module === "string" ? payload.module : "Robot";
    const message = typeof payload.message === "string" ? payload.message : "";

    if (!message) {
      return;
    }

    await this.logService.create({
      robotId,
      sessionId: typeof payload.sessionId === "string" ? payload.sessionId : undefined,
      level: level as never,
      module: moduleName,
      message,
      data: (payload.data as Record<string, unknown>) ?? undefined,
      timestamp: this.extractTimestamp(payload.timestamp) ?? new Date()
    });
  }

  private respond(callback: AckCallback, payload: Record<string, unknown>): void {
    if (typeof callback === "function") {
      console.log("ack respond", payload);
      callback(payload);
    }
  }

  private fail(callback: AckCallback, error: unknown): void {
    if (typeof callback !== "function") {
      return;
    }

    if (error instanceof ServiceError) {
      callback({ code: error.code, message: error.message, details: error.details });
      return;
    }

    if (error instanceof Error) {
      callback(error);
      return;
    }

    callback(new Error("Unknown error"));
  }

  private extractTimestamp(raw: unknown): Date | undefined {
    if (raw instanceof Date) {
      return raw;
    }

    if (typeof raw === "string") {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    return undefined;
  }
}

export default RobotEventHandler;
