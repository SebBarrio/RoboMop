import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { RobotService } from '../services/RobotService';
import { MapService } from '../services/MapService';
import { SessionService } from '../services/SessionService';
import { LogService } from '../services/LogService';
import { ConnectionHandler } from './ConnectionHandler';

/**
 * Robot Event Handler
 * Implements T072: Handle robot events (state, map-update, sensor-data, session events)
 */

interface RobotHeartbeatPayload {
  robotId: string;
  timestamp: string;
  uptimeSeconds: number;
  cpuUsagePercent: number;
  memoryUsagePercent: number;
  temperatureCelsius: number;
}

interface RobotStatePayload {
  robotId: string;
  timestamp: string;
  mode: string;
  position: {
    x: number;
    y: number;
    theta: number;
    confidence: number;
  };
  velocity: {
    linear: number;
    angular: number;
  };
  batteryLevel: number;
  waterLevel: number;
  motorCurrents: {
    left: number;
    right: number;
  };
  errors: string[];
}

interface MapUpdatePayload {
  robotId: string;
  mapId: string;
  timestamp: string;
  updateType: 'delta' | 'full';
  cells?: Array<{ row: number; col: number; value: number }>;
  metadata?: any;
  data?: string;
}

interface SessionEventPayload {
  robotId: string;
  sessionId: string;
  timestamp: string;
  type?: 'EXPLORATION' | 'CLEANING';
  mapId?: string;
  status?: string;
  statistics?: any;
}

export class RobotEventHandler {
  private robotService: RobotService;
  private mapService: MapService;
  private sessionService: SessionService;
  private logService: LogService;
  private connectionHandler: ConnectionHandler;

  constructor(
    _io: Server,
    robotService: RobotService,
    mapService: MapService,
    sessionService: SessionService,
    logService: LogService,
    connectionHandler: ConnectionHandler
  ) {
    this.robotService = robotService;
    this.mapService = mapService;
    this.sessionService = sessionService;
    this.logService = logService;
    this.connectionHandler = connectionHandler;
  }

  /**
   * Register all robot event handlers on a socket
   */
  public registerHandlers(socket: Socket): void {
    socket.on('robot:heartbeat', (data) => this.handleHeartbeat(socket, data));
    socket.on('robot:state', (data) => this.handleState(socket, data));
    socket.on('robot:map-update', (data) =>
      this.handleMapUpdate(socket, data)
    );
    socket.on('robot:sensor-data', (data) =>
      this.handleSensorData(socket, data)
    );
    socket.on('robot:session-started', (data) =>
      this.handleSessionStarted(socket, data)
    );
    socket.on('robot:session-completed', (data) =>
      this.handleSessionCompleted(socket, data)
    );
    socket.on('robot:error', (data) => this.handleRobotError(socket, data));
    socket.on('robot:log', (data) => this.handleRobotLog(socket, data));
  }

  /**
   * Handle robot heartbeat
   */
  private async handleHeartbeat(
    socket: Socket,
    data: RobotHeartbeatPayload
  ): Promise<void> {
    try {
      // Update heartbeat timestamp
      this.connectionHandler.updateHeartbeat(socket.id);

      // Update robot lastSeenAt
      await this.robotService.updateLastSeen(data.robotId);

      logger.debug('Robot heartbeat received', {
        robotId: data.robotId,
        uptime: data.uptimeSeconds,
      });
    } catch (error) {
      logger.error('Error handling heartbeat', { robotId: data.robotId, error });
    }
  }

  /**
   * Handle robot state update
   */
  private async handleState(
    _socket: Socket,
    data: RobotStatePayload
  ): Promise<void> {
    try {
      // Note: RobotState storage is high frequency - consider rate limiting
      // For now, we'll just forward to frontend without persisting every state
      // In production, you might want to persist every Nth state or on significant changes

      // Forward to frontend clients
      this.connectionHandler.broadcastToFrontend('frontend:robot-state', data);

      logger.debug('Robot state update processed', {
        robotId: data.robotId,
        mode: data.mode,
      });
    } catch (error) {
      logger.error('Error handling state update', {
        robotId: data.robotId,
        error,
      });
    }
  }

  /**
   * Handle map update (delta or full)
   */
  private async handleMapUpdate(
    _socket: Socket,
    data: MapUpdatePayload
  ): Promise<void> {
    try {
      if (data.updateType === 'delta' && data.cells) {
        // Apply delta update
        await this.mapService.updateCells(data.mapId, data.cells);
      } else if (data.updateType === 'full' && data.data) {
        // Update full map data
        const buffer = Buffer.from(data.data, 'base64');
        await this.mapService.updateData(data.mapId, buffer);
      }

      // Forward to frontend clients
      this.connectionHandler.broadcastToFrontend('frontend:map-update', data);

      logger.debug('Map update processed', {
        robotId: data.robotId,
        mapId: data.mapId,
        updateType: data.updateType,
        cellCount: data.cells?.length,
      });
    } catch (error) {
      logger.error('Error handling map update', {
        robotId: data.robotId,
        mapId: data.mapId,
        error,
      });
    }
  }

  /**
   * Handle sensor data
   */
  private async handleSensorData(
    _socket: Socket,
    data: any
  ): Promise<void> {
    try {
      // Forward to subscribed frontend clients
      // Note: Sensor data is not persisted by default (high frequency)
      this.connectionHandler.broadcastToFrontend('frontend:sensor-data', data);

      logger.debug('Sensor data forwarded', { robotId: data.robotId });
    } catch (error) {
      logger.error('Error handling sensor data', {
        robotId: data.robotId,
        error,
      });
    }
  }

  /**
   * Handle session started event
   */
  private async handleSessionStarted(
    _socket: Socket,
    data: SessionEventPayload
  ): Promise<void> {
    try {
      // Session should already be created via API, just verify
      const session = await this.sessionService.findById(data.sessionId);

      if (!session) {
        logger.error('Session not found', { sessionId: data.sessionId });
        return;
      }

      // Forward to frontend
      this.connectionHandler.broadcastToFrontend('frontend:session-event', {
        event: 'STARTED',
        session,
      });

      logger.info('Session started event processed', {
        robotId: data.robotId,
        sessionId: data.sessionId,
        type: data.type,
      });
    } catch (error) {
      logger.error('Error handling session started', {
        robotId: data.robotId,
        sessionId: data.sessionId,
        error,
      });
    }
  }

  /**
   * Handle session completed event
   */
  private async handleSessionCompleted(
    _socket: Socket,
    data: SessionEventPayload
  ): Promise<void> {
    try {
      // Update session with completion data
      await this.sessionService.complete(
        data.sessionId,
        data.status!,
        data.statistics || {}
      );

      const session = await this.sessionService.findById(data.sessionId);

      // Forward to frontend
      this.connectionHandler.broadcastToFrontend('frontend:session-event', {
        event: 'COMPLETED',
        session,
      });

      logger.info('Session completed event processed', {
        robotId: data.robotId,
        sessionId: data.sessionId,
        status: data.status,
      });
    } catch (error) {
      logger.error('Error handling session completed', {
        robotId: data.robotId,
        sessionId: data.sessionId,
        error,
      });
    }
  }

  /**
   * Handle robot error
   */
  private async handleRobotError(
    _socket: Socket,
    data: any
  ): Promise<void> {
    try {
      // Log error to database
      await this.logService.create({
        robotId: data.robotId,
        level: data.severity || 'ERROR',
        module: 'Robot',
        message: data.message,
        data: data.data,
      });

      // If critical, update robot status
      if (data.severity === 'CRITICAL') {
        await this.robotService.updateStatus(data.robotId, 'ERROR');
      }

      // Forward to frontend
      this.connectionHandler.broadcastToFrontend('frontend:error', data);

      logger.error('Robot error received', {
        robotId: data.robotId,
        errorCode: data.errorCode,
        severity: data.severity,
      });
    } catch (error) {
      logger.error('Error handling robot error', {
        robotId: data.robotId,
        error,
      });
    }
  }

  /**
   * Handle robot log entry
   */
  private async handleRobotLog(
    _socket: Socket,
    data: any
  ): Promise<void> {
    try {
      // Store log in database
      await this.logService.create({
        robotId: data.robotId,
        level: data.level,
        module: data.module,
        message: data.message,
        data: data.data,
      });

      logger.debug('Robot log entry stored', {
        robotId: data.robotId,
        level: data.level,
      });
    } catch (error) {
      logger.error('Error handling robot log', {
        robotId: data.robotId,
        error,
      });
    }
  }
}

