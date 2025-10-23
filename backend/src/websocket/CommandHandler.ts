import { randomUUID } from "node:crypto";

import type {
  ValidatedCommand,
  MoveCommandPayload,
  SetModeCommandPayload,
  EStopCommandPayload,
  SetSpeedCommandPayload,
  ConfigUpdateCommandPayload
} from "../services/CommandValidationService.js";
import { ValidationError } from "../services/errors.js";

import ConnectionRegistry from "./ConnectionRegistry.js";

export type CommandDispatchResult = {
  commandId: string;
  status: "queued" | "sent";
};

export class CommandHandler {
  constructor(private readonly registry: ConnectionRegistry) {}

  async dispatchCommand(robotId: string, command: ValidatedCommand): Promise<CommandDispatchResult> {
    const commandId = randomUUID();
    const timestamp = new Date().toISOString();

    const { event, payload } = this.buildEventPayload(command, commandId, timestamp);

    const socket = this.registry.getRobotSocket(robotId);

    if (!socket) {
      return {
        commandId,
        status: "queued"
      };
    }

    socket.emit(event, payload);

    return {
      commandId,
      status: "sent"
    };
  }

  private buildEventPayload(
    command: ValidatedCommand,
    commandId: string,
    timestamp: string
  ): { event: string; payload: Record<string, unknown> } {
    switch (command.type) {
      case "MOVE":
        const movePayload = command.payload as MoveCommandPayload;
        return {
          event: "command:move",
          payload: {
            commandId,
            timestamp,
            direction: movePayload.direction,
            speed: movePayload.speed,
            duration: movePayload.duration ?? 0
          }
        };
      case "SET_MODE": {
        const setModePayload = command.payload as SetModeCommandPayload;
        const payload: Record<string, unknown> = {
          commandId,
          timestamp,
          mode: setModePayload.mode
        };

        if (setModePayload.parameters !== undefined && setModePayload.parameters !== null) {
          payload.parameters = setModePayload.parameters;
        }

        return {
          event: "command:set-mode",
          payload
        };
      }
      case "E_STOP":
        const eStopPayload = command.payload as EStopCommandPayload;
        return {
          event: "command:e-stop",
          payload: {
            commandId,
            timestamp,
            reason: eStopPayload.reason ?? "USER_INITIATED"
          }
        };
      case "SET_SPEED":
        const setSpeedPayload = command.payload as SetSpeedCommandPayload;
        return {
          event: "command:set-speed",
          payload: {
            commandId,
            timestamp,
            speedMultiplier: setSpeedPayload.speedMultiplier
          }
        };
      case "CONFIG_UPDATE":
        const configPayload = command.payload as ConfigUpdateCommandPayload;
        return {
          event: "command:config-update",
          payload: {
            commandId,
            timestamp,
            config: configPayload.config
          }
        };
      default:
        throw new ValidationError("Unsupported command type", command.type);
    }
  }
}

export default CommandHandler;
