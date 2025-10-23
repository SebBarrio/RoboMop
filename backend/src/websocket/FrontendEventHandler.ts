import type { Socket } from "socket.io";

import ZoneService from "../services/ZoneService.js";
import MapService from "../services/MapService.js";
import { RobotService } from "../services/RobotService.js";
import CommandValidationService, { type CommandBody } from "../services/CommandValidationService.js";
import { ServiceError } from "../services/errors.js";

import CommandHandler from "./CommandHandler.js";
import ConnectionRegistry from "./ConnectionRegistry.js";

type AckCallback = ((error: unknown, response?: unknown) => void) | undefined;

interface SubscribePayload {
  robotId?: string;
  streams?: string[];
}

interface UiCommandPayload {
  robotId?: string;
  command?: CommandBody;
}

interface CreateZonePayload {
  mapId?: string;
  zone?: Record<string, unknown>;
}

export class FrontendEventHandler {
  constructor(
    private readonly registry: ConnectionRegistry,
    private readonly commandHandler: CommandHandler,
    private readonly commandValidationService: CommandValidationService,
    private readonly zoneService: ZoneService,
    private readonly mapService: MapService,
    private readonly robotService: RobotService
  ) {}

  register(socket: Socket): void {
    socket.on("subscribe", (payload, callback) => {
      void this.handleSubscribe(socket, payload ?? {}, callback);
    });

    socket.on("unsubscribe", (payload, callback) => {
      void this.handleUnsubscribe(socket, payload ?? {}, callback);
    });

    socket.on("ui:command", (payload) => {
      void this.handleUiCommand(socket, payload ?? {});
    });

    socket.on("ui:create-zone", (payload) => {
      void this.handleCreateZone(socket, payload ?? {});
    });
  }

  private async handleSubscribe(socket: Socket, payload: SubscribePayload, callback: AckCallback): Promise<void> {
    try {
      const robotId = payload.robotId;
      const streams = Array.isArray(payload.streams) ? payload.streams : [];

      if (typeof robotId !== "string" || robotId.trim().length === 0) {
        throw new ServiceError("robotId is required to subscribe", 400, "VALIDATION_ERROR");
      }

      if (streams.length === 0) {
        throw new ServiceError("streams array must contain at least one entry", 400, "VALIDATION_ERROR");
      }

      await this.robotService.getById(robotId);

      this.registry.subscribe(socket, robotId, streams);

      if (typeof callback === "function") {
        callback({
          status: "subscribed",
          robotId,
          streams
        });
      }
    } catch (error) {
      this.fail(socket, "subscribe", callback, error);
    }
  }

  private async handleUnsubscribe(socket: Socket, payload: SubscribePayload, callback: AckCallback): Promise<void> {
    try {
      const robotId = payload.robotId;
      const streams = Array.isArray(payload.streams) ? payload.streams : [];

      if (typeof robotId !== "string" || robotId.trim().length === 0) {
        throw new ServiceError("robotId is required to unsubscribe", 400, "VALIDATION_ERROR");
      }

      if (streams.length === 0) {
        throw new ServiceError("streams array must contain at least one entry", 400, "VALIDATION_ERROR");
      }

      this.registry.unsubscribe(socket, robotId, streams);

      if (typeof callback === "function") {
        callback({
          status: "unsubscribed",
          robotId,
          streams
        });
      }
    } catch (error) {
      this.fail(socket, "unsubscribe", callback, error);
    }
  }

  private async handleUiCommand(socket: Socket, payload: UiCommandPayload): Promise<void> {
    try {
      const robotId = payload.robotId;
      const command = payload.command;

      if (typeof robotId !== "string" || robotId.trim().length === 0) {
        throw new ServiceError("robotId is required for ui:command", 400, "VALIDATION_ERROR");
      }

      if (!command) {
        throw new ServiceError("command payload is required", 400, "VALIDATION_ERROR");
      }

      const validated = await this.commandValidationService.validateCommand(robotId, command);
      const result = await this.commandHandler.dispatchCommand(robotId, validated);

      socket.emit("ui:command-ack", {
        commandId: result.commandId,
        status: result.status,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.emitError(socket, "ui:command", error);
    }
  }

  private async handleCreateZone(socket: Socket, payload: CreateZonePayload): Promise<void> {
    try {
      const mapId = payload.mapId;
      const zoneInput = payload.zone;

      if (typeof mapId !== "string" || mapId.trim().length === 0) {
        throw new ServiceError("mapId is required for ui:create-zone", 400, "VALIDATION_ERROR");
      }

      if (!zoneInput || typeof zoneInput !== "object") {
        throw new ServiceError("zone payload must be an object", 400, "VALIDATION_ERROR");
      }

      const zone = await this.zoneService.create({
        mapId,
        name: typeof zoneInput.name === "string" ? zoneInput.name : undefined,
        geometry: zoneInput.geometry as never
      });

      socket.emit("ui:zone-created", {
        zone
      });

      const map = await this.mapService.getById(mapId);
      this.registry.broadcastToRobot(map.robotId, "frontend:zone-updated", {
        event: "CREATED",
        zone
      });
    } catch (error) {
      this.emitError(socket, "ui:create-zone", error);
    }
  }

  private fail(socket: Socket, event: string, callback: AckCallback, error: unknown): void {
    if (typeof callback === "function") {
      if (error instanceof ServiceError) {
        callback({ code: error.code, message: error.message, details: error.details });
        return;
      }

      if (error instanceof Error) {
        callback(error);
        return;
      }

      callback(new Error("Unknown error"));
    } else {
      this.emitError(socket, event, error);
    }
  }

  private emitError(socket: Socket, event: string, error: unknown): void {
    if (error instanceof ServiceError) {
      socket.emit("error", {
        event,
        code: error.code,
        message: error.message,
        details: error.details
      });
      return;
    }

    if (error instanceof Error) {
      socket.emit("error", {
        event,
        code: "INTERNAL_ERROR",
        message: error.message
      });
      return;
    }

    socket.emit("error", {
      event,
      code: "INTERNAL_ERROR",
      message: "Unknown error"
    });
  }
}

export default FrontendEventHandler;
