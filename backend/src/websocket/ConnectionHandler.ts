import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { RobotService } from '../services/RobotService';
import { commandValidationService } from '../services/CommandValidationService';

/**
 * WebSocket Connection Handler
 * Implements T071: Connection lifecycle (auth, heartbeat, disconnect)
 */

interface AuthenticatedSocket extends Socket {
  robotId?: string;
  clientType?: 'robot' | 'frontend';
  userId?: string; // For frontend clients (future)
}

interface ConnectionMetadata {
  robotId?: string;
  clientType: 'robot' | 'frontend';
  connectedAt: Date;
  lastHeartbeat?: Date;
}

export class ConnectionHandler {
  private io: Server;
  private robotService: RobotService;
  private connections: Map<string, ConnectionMetadata> = new Map();
  private heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();

  // Robot heartbeat timeout (15 seconds - 3x expected interval)
  private readonly HEARTBEAT_TIMEOUT = 15000;

  constructor(io: Server, robotService: RobotService) {
    this.io = io;
    this.robotService = robotService;
  }

  /**
   * Handle new client connection
   */
  public async handleConnection(socket: AuthenticatedSocket): Promise<void> {
    logger.info('Client connection attempt', { socketId: socket.id });

    try {
      // Authenticate the client
      const authResult = await this.authenticateClient(socket);

      if (!authResult.success) {
        socket.emit('error', {
          code: 'AUTH_FAILED',
          message: authResult.message || 'Authentication failed',
        });
        socket.disconnect();
        return;
      }

      // Store connection metadata
      socket.robotId = authResult.robotId;
      socket.clientType = authResult.clientType;

      this.connections.set(socket.id, {
        robotId: authResult.robotId,
        clientType: authResult.clientType!,
        connectedAt: new Date(),
      });

      logger.info('Client authenticated', {
        socketId: socket.id,
        clientType: authResult.clientType,
        robotId: authResult.robotId,
      });

      // If robot, update status to ONLINE
      if (authResult.clientType === 'robot' && authResult.robotId) {
        await this.robotService.updateStatus(
          authResult.robotId,
          'ONLINE'
        );

        // Start heartbeat monitoring
        this.startHeartbeatMonitoring(socket);
      }

      // Setup disconnect handler
      socket.on('disconnect', () => this.handleDisconnect(socket));
    } catch (error) {
      logger.error('Connection error', { socketId: socket.id, error });
      socket.emit('error', {
        code: 'CONNECTION_ERROR',
        message: 'Internal server error',
      });
      socket.disconnect();
    }
  }

  /**
   * Handle client disconnect
   */
  private async handleDisconnect(
    socket: AuthenticatedSocket
  ): Promise<void> {
    const connection = this.connections.get(socket.id);

    logger.info('Client disconnected', {
      socketId: socket.id,
      clientType: connection?.clientType,
      robotId: connection?.robotId,
    });

    // Stop heartbeat monitoring
    const interval = this.heartbeatIntervals.get(socket.id);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(socket.id);
    }

    // If robot, update status to OFFLINE
    if (
      connection?.clientType === 'robot' &&
      connection.robotId
    ) {
      try {
        await this.robotService.updateStatus(
          connection.robotId,
          'OFFLINE'
        );
        
        // Clear pending commands for this robot
        commandValidationService.clearRobotCommands(connection.robotId);
      } catch (error) {
        logger.error('Error updating robot status on disconnect', {
          robotId: connection.robotId,
          error,
        });
      }
    }

    // Remove connection metadata
    this.connections.delete(socket.id);
  }

  /**
   * Authenticate client based on connection parameters
   */
  private async authenticateClient(
    socket: AuthenticatedSocket
  ): Promise<{
    success: boolean;
    message?: string;
    clientType?: 'robot' | 'frontend';
    robotId?: string;
  }> {
    const { apiKey, robotId } = socket.handshake.query;

    // Robot authentication (via API key)
    if (apiKey && typeof apiKey === 'string') {
      // TODO: Implement proper API key validation (T118)
      // For now, accept any non-empty API key and validate robot exists

      if (!robotId || typeof robotId !== 'string') {
        return {
          success: false,
          message: 'Robot ID required for robot authentication',
        };
      }

      try {
        const robot = await this.robotService.findById(robotId);

        if (!robot) {
          return {
            success: false,
            message: 'Robot not found',
          };
        }

        return {
          success: true,
          clientType: 'robot',
          robotId: robot.id,
        };
      } catch (error) {
        logger.error('Robot authentication error', { robotId, error });
        return {
          success: false,
          message: 'Authentication failed',
        };
      }
    }

    // Frontend authentication (via session cookie)
    // TODO: Implement session-based authentication (T119)
    // For now, accept all frontend connections
    return {
      success: true,
      clientType: 'frontend',
    };
  }

  /**
   * Start heartbeat monitoring for a robot
   */
  private startHeartbeatMonitoring(socket: AuthenticatedSocket): void {
    const interval = setInterval(() => {
      const connection = this.connections.get(socket.id);
      if (!connection || !connection.lastHeartbeat) return;

      const now = new Date();
      const timeSinceLastHeartbeat =
        now.getTime() - connection.lastHeartbeat.getTime();

      if (timeSinceLastHeartbeat > this.HEARTBEAT_TIMEOUT) {
        logger.warn('Robot heartbeat timeout', {
          socketId: socket.id,
          robotId: connection.robotId,
          timeSinceLastHeartbeat,
        });

        // Disconnect the robot
        socket.disconnect();
      }
    }, this.HEARTBEAT_TIMEOUT / 3); // Check every 5 seconds

    this.heartbeatIntervals.set(socket.id, interval);
  }

  /**
   * Update heartbeat timestamp
   */
  public updateHeartbeat(socketId: string): void {
    const connection = this.connections.get(socketId);
    if (connection) {
      connection.lastHeartbeat = new Date();
    }
  }

  /**
   * Get all robot connections
   */
  public getRobotConnections(): Map<string, ConnectionMetadata> {
    const robotConnections = new Map<string, ConnectionMetadata>();
    
    this.connections.forEach((conn, socketId) => {
      if (conn.clientType === 'robot') {
        robotConnections.set(socketId, conn);
      }
    });

    return robotConnections;
  }

  /**
   * Get socket for a specific robot
   */
  public getRobotSocket(robotId: string): AuthenticatedSocket | null {
    for (const [socketId, conn] of this.connections.entries()) {
      if (conn.clientType === 'robot' && conn.robotId === robotId) {
        const socket = this.io.sockets.sockets.get(socketId);
        return socket as AuthenticatedSocket || null;
      }
    }
    return null;
  }

  /**
   * Broadcast to all frontend clients
   */
  public broadcastToFrontend(event: string, data: any): void {
    this.connections.forEach((conn, socketId) => {
      if (conn.clientType === 'frontend') {
        const socket = this.io.sockets.sockets.get(socketId);
        socket?.emit(event, data);
      }
    });
  }
}

