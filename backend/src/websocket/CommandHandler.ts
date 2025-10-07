import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { ConnectionHandler } from './ConnectionHandler';
import { commandValidationService } from '../services/CommandValidationService';
import { v4 as uuidv4 } from 'uuid';

/**
 * Command Handler
 * Implements T073: Handle commands (move, set-mode, e-stop, set-speed)
 */

interface MoveCommandPayload {
  direction: 'FORWARD' | 'BACKWARD' | 'LEFT' | 'RIGHT' | 'STOP';
  speed: number;
  duration: number;
}

interface SetModeCommandPayload {
  mode: 'IDLE' | 'EXPLORATION' | 'CLEANING' | 'MANUAL';
  parameters?: {
    mapId?: string;
  };
}

interface EStopCommandPayload {
  reason: string;
}

interface SetSpeedCommandPayload {
  speedMultiplier: number; // 0.1 to 1.0
}

interface ConfigUpdatePayload {
  config: {
    telemetryRate?: number;
    mapUpdateRate?: number;
    pidGains?: {
      kp: number;
      ki: number;
      kd: number;
    };
    restrictedZones?: any[];
  };
}

interface ClearErrorsPayload {
  errorCodes: string[]; // Empty array = clear all
}

export class CommandHandler {
  private connectionHandler: ConnectionHandler;

  constructor(_io: Server, connectionHandler: ConnectionHandler) {
    this.connectionHandler = connectionHandler;
  }

  /**
   * Send move command to robot
   */
  public async sendMoveCommand(
    robotId: string,
    payload: MoveCommandPayload
  ): Promise<{ success: boolean; commandId?: string; error?: string }> {
    const commandId = uuidv4();

    // Validate command
    const validation = commandValidationService.validateCommand(
      commandId,
      robotId,
      'MOVE'
    );

    if (!validation.valid) {
      return {
        success: false,
        error: validation.reason,
      };
    }

    // Get robot socket
    const robotSocket = this.connectionHandler.getRobotSocket(robotId);

    if (!robotSocket) {
      return {
        success: false,
        error: 'ROBOT_OFFLINE',
      };
    }

    // Register command
    commandValidationService.registerCommand(commandId, robotId, 'MOVE');

    // Send command to robot
    robotSocket.emit('command:move', {
      commandId,
      timestamp: new Date().toISOString(),
      ...payload,
    });

    logger.info('Move command sent', {
      commandId,
      robotId,
      direction: payload.direction,
      speed: payload.speed,
    });

    return { success: true, commandId };
  }

  /**
   * Send set-mode command to robot
   */
  public async sendSetModeCommand(
    robotId: string,
    payload: SetModeCommandPayload
  ): Promise<{ success: boolean; commandId?: string; error?: string }> {
    const commandId = uuidv4();

    // Validate command
    const validation = commandValidationService.validateCommand(
      commandId,
      robotId,
      'SET_MODE'
    );

    if (!validation.valid) {
      return {
        success: false,
        error: validation.reason,
      };
    }

    // Get robot socket
    const robotSocket = this.connectionHandler.getRobotSocket(robotId);

    if (!robotSocket) {
      return {
        success: false,
        error: 'ROBOT_OFFLINE',
      };
    }

    // Register command
    commandValidationService.registerCommand(commandId, robotId, 'SET_MODE');

    // Send command to robot
    robotSocket.emit('command:set-mode', {
      commandId,
      timestamp: new Date().toISOString(),
      ...payload,
    });

    logger.info('Set-mode command sent', {
      commandId,
      robotId,
      mode: payload.mode,
    });

    return { success: true, commandId };
  }

  /**
   * Send emergency stop command to robot
   */
  public async sendEStopCommand(
    robotId: string,
    payload: EStopCommandPayload
  ): Promise<{ success: boolean; commandId?: string; error?: string }> {
    const commandId = uuidv4();

    // Get robot socket
    const robotSocket = this.connectionHandler.getRobotSocket(robotId);

    if (!robotSocket) {
      return {
        success: false,
        error: 'ROBOT_OFFLINE',
      };
    }

    // E-stop doesn't need validation - highest priority
    // Register command
    commandValidationService.registerCommand(commandId, robotId, 'E_STOP');

    // Send command to robot
    robotSocket.emit('command:e-stop', {
      commandId,
      timestamp: new Date().toISOString(),
      ...payload,
    });

    logger.warn('E-stop command sent', {
      commandId,
      robotId,
      reason: payload.reason,
    });

    return { success: true, commandId };
  }

  /**
   * Send set-speed command to robot
   */
  public async sendSetSpeedCommand(
    robotId: string,
    payload: SetSpeedCommandPayload
  ): Promise<{ success: boolean; commandId?: string; error?: string }> {
    const commandId = uuidv4();

    // Validate speed multiplier
    if (payload.speedMultiplier < 0.1 || payload.speedMultiplier > 1.0) {
      return {
        success: false,
        error: 'INVALID_SPEED_MULTIPLIER',
      };
    }

    // Get robot socket
    const robotSocket = this.connectionHandler.getRobotSocket(robotId);

    if (!robotSocket) {
      return {
        success: false,
        error: 'ROBOT_OFFLINE',
      };
    }

    // Register command
    commandValidationService.registerCommand(commandId, robotId, 'SET_SPEED');

    // Send command to robot
    robotSocket.emit('command:set-speed', {
      commandId,
      timestamp: new Date().toISOString(),
      ...payload,
    });

    logger.info('Set-speed command sent', {
      commandId,
      robotId,
      speedMultiplier: payload.speedMultiplier,
    });

    return { success: true, commandId };
  }

  /**
   * Send config update command to robot
   */
  public async sendConfigUpdateCommand(
    robotId: string,
    payload: ConfigUpdatePayload
  ): Promise<{ success: boolean; commandId?: string; error?: string }> {
    const commandId = uuidv4();

    // Get robot socket
    const robotSocket = this.connectionHandler.getRobotSocket(robotId);

    if (!robotSocket) {
      return {
        success: false,
        error: 'ROBOT_OFFLINE',
      };
    }

    // Register command
    commandValidationService.registerCommand(
      commandId,
      robotId,
      'CONFIG_UPDATE'
    );

    // Send command to robot
    robotSocket.emit('command:config-update', {
      commandId,
      timestamp: new Date().toISOString(),
      ...payload,
    });

    logger.info('Config update command sent', {
      commandId,
      robotId,
    });

    return { success: true, commandId };
  }

  /**
   * Send clear errors command to robot
   */
  public async sendClearErrorsCommand(
    robotId: string,
    payload: ClearErrorsPayload
  ): Promise<{ success: boolean; commandId?: string; error?: string }> {
    const commandId = uuidv4();

    // Get robot socket
    const robotSocket = this.connectionHandler.getRobotSocket(robotId);

    if (!robotSocket) {
      return {
        success: false,
        error: 'ROBOT_OFFLINE',
      };
    }

    // Register command
    commandValidationService.registerCommand(
      commandId,
      robotId,
      'CLEAR_ERRORS'
    );

    // Send command to robot
    robotSocket.emit('command:clear-errors', {
      commandId,
      timestamp: new Date().toISOString(),
      ...payload,
    });

    logger.info('Clear errors command sent', {
      commandId,
      robotId,
      errorCodes: payload.errorCodes,
    });

    return { success: true, commandId };
  }

  /**
   * Handle command acknowledgement from robot
   */
  public handleCommandAck(socket: Socket, data: any): void {
    const { commandId, status, robotId } = data;

    // Update command status
    commandValidationService.updateCommandStatus(
      commandId,
      robotId || (socket as any).robotId,
      status
    );

    logger.debug('Command acknowledgement received', {
      commandId,
      status,
    });
  }
}

