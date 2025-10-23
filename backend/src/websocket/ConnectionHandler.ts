import type { Server as HttpServer } from "node:http";
import type { Socket } from "socket.io";
import { Server } from "socket.io";

import { RobotStatus } from "../models/enums.js";
import MapService from "../services/MapService.js";
import ZoneService from "../services/ZoneService.js";
import LogService from "../services/LogService.js";
import { RobotService } from "../services/RobotService.js";
import CommandValidationService from "../services/CommandValidationService.js";
import { ServiceError } from "../services/errors.js";

import ConnectionRegistry from "./ConnectionRegistry.js";
import CommandHandler from "./CommandHandler.js";
import RobotEventHandler from "./RobotEventHandler.js";
import FrontendEventHandler from "./FrontendEventHandler.js";

export class ConnectionHandler {
  private readonly io: Server;
  private readonly registry: ConnectionRegistry;

  private readonly robotService = new RobotService();
  private readonly mapService = new MapService();
  private readonly zoneService = new ZoneService();
  private readonly logService = new LogService();
  private readonly commandValidationService = new CommandValidationService(this.robotService);

  private readonly commandHandler: CommandHandler;
  private readonly robotEventHandler: RobotEventHandler;
  private readonly frontendEventHandler: FrontendEventHandler;

  constructor(httpServer: HttpServer) {
    console.log("ConnectionHandler initialized");
    this.io = new Server(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    this.registry = new ConnectionRegistry();
    this.commandHandler = new CommandHandler(this.registry);
    this.robotEventHandler = new RobotEventHandler(
      this.registry,
      this.robotService,
      this.mapService,
      this.logService
    );
    this.frontendEventHandler = new FrontendEventHandler(
      this.registry,
      this.commandHandler,
      this.commandValidationService,
      this.zoneService,
      this.mapService,
      this.robotService
    );

    this.io.on("connection", (socket) => {
      void this.handleConnection(socket);
    });
  }

  getCommandHandler(): CommandHandler {
    return this.commandHandler;
  }

  private async handleConnection(socket: Socket): Promise<void> {
    const auth = (socket.handshake.auth ?? {}) as Record<string, unknown>;
    console.log("handleConnection", auth);

    if (typeof auth.robotId === "string" && auth.robotId.trim().length > 0) {
      await this.handleRobotConnection(socket, auth.robotId);
      return;
    }

    if (typeof auth.userId === "string" && auth.userId.trim().length > 0) {
      this.handleFrontendConnection(socket, auth.userId);
      return;
    }

    socket.emit("error", {
      code: "AUTH_FAILED",
      message: "Missing authentication details"
    });
    socket.disconnect(true);
  }

  private async handleRobotConnection(socket: Socket, robotId: string): Promise<void> {
    this.robotEventHandler.register(socket, robotId);

    try {
      await this.robotService.getById(robotId);
    } catch (error) {
      this.emitServiceError(socket, error);
      socket.disconnect(true);
      return;
    }

    this.registry.registerRobot(robotId, socket);
    this.safeTouch(robotId, RobotStatus.ONLINE);

    socket.on("disconnect", () => {
      this.registry.unregisterRobot(socket);
      this.safeTouch(robotId, RobotStatus.OFFLINE);
    });
  }

  private handleFrontendConnection(socket: Socket, _userId: string): void {
    this.registry.registerFrontend(socket);
    this.frontendEventHandler.register(socket);

    socket.on("disconnect", () => {
      this.registry.unregisterFrontend(socket);
    });
  }

  close(): void {
    this.io.removeAllListeners();
    this.io.disconnectSockets(true);
    this.io.close();
  }

  private safeTouch(robotId: string, status: RobotStatus): void {
    void this.robotService
      .touch(robotId, new Date(), status)
      .catch((error) => this.handleTouchError(error));
  }

  private handleTouchError(error: unknown): void {
    if (process.env.NODE_ENV === "test") {
      return;
    }

    if (error instanceof ServiceError) {
      console.warn("Failed to update robot status", {
        code: error.code,
        message: error.message
      });
      return;
    }

    if (error instanceof Error) {
      console.warn("Failed to update robot status", error.message);
    }
  }

  private emitServiceError(socket: Socket, error: unknown): void {
    if (error instanceof ServiceError) {
      socket.emit("error", {
        code: error.code,
        message: error.message,
        details: error.details
      });
      return;
    }

    if (error instanceof Error) {
      socket.emit("error", {
        code: "INTERNAL_ERROR",
        message: error.message
      });
      return;
    }

    socket.emit("error", {
      code: "INTERNAL_ERROR",
      message: "Unknown error"
    });
  }
}

export default ConnectionHandler;
