import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { CommandHandler } from './CommandHandler';
import { ZoneService } from '../services/ZoneService';
import { ConnectionHandler } from './ConnectionHandler';

/**
 * Frontend Event Handler
 * Implements T074: Handle frontend events (subscribe, ui:command, zone operations)
 */

interface SubscribePayload {
  streams?: string[];
  types?: string[];
  robotId: string;
}

interface UICommandPayload {
  robotId: string;
  command: {
    type: 'MOVE' | 'SET_MODE' | 'E_STOP' | 'SET_SPEED';
    payload: any;
  };
}

interface CreateZonePayload {
  mapId: string;
  zone: {
    name?: string;
    geometry: {
      type: 'Polygon';
      coordinates: Array<Array<{ x: number; y: number }>>;
    };
  };
}

interface UpdateZonePayload {
  zoneId: string;
  updates: {
    name?: string;
    geometry?: any;
  };
}

interface DeleteZonePayload {
  zoneId: string;
}

export class FrontendEventHandler {
  private commandHandler: CommandHandler;
  private zoneService: ZoneService;
  private connectionHandler: ConnectionHandler;

  // Track subscriptions per socket
  private subscriptions: Map<string, Set<string>> = new Map();

  constructor(
    _io: Server,
    commandHandler: CommandHandler,
    zoneService: ZoneService,
    connectionHandler: ConnectionHandler
  ) {
    this.commandHandler = commandHandler;
    this.zoneService = zoneService;
    this.connectionHandler = connectionHandler;
  }

  /**
   * Register all frontend event handlers on a socket
   */
  public registerHandlers(socket: Socket): void {
    socket.on('subscribe', (data) => this.handleSubscribe(socket, data));
    socket.on('unsubscribe', (data) => this.handleUnsubscribe(socket, data));
    socket.on('ui:command', (data) => this.handleUICommand(socket, data));
    socket.on('ui:create-zone', (data) =>
      this.handleCreateZone(socket, data)
    );
    socket.on('ui:update-zone', (data) =>
      this.handleUpdateZone(socket, data)
    );
    socket.on('ui:delete-zone', (data) =>
      this.handleDeleteZone(socket, data)
    );
  }

  /**
   * Handle subscription request
   */
  private handleSubscribe(socket: Socket, data: unknown): void {
    try {
      if (!data || typeof data !== 'object') {
        throw new Error('Payload must be an object');
      }

      const { streams, types, robotId } = data as Partial<SubscribePayload>;

      if (!robotId || typeof robotId !== 'string' || robotId.trim() === '') {
        throw new Error('robotId must be a non-empty string');
      }

      // Accept either 'streams' or 'types' field name
      const streamsList = streams || types;
      
      if (!Array.isArray(streamsList)) {
        throw new Error('streams or types must be an array');
      }

      // Map frontend 'types' to backend stream names
      const streamMapping: Record<string, string> = {
        'state': 'robot-state',
        'map': 'map-update',
        'sensor': 'sensor-data',
        'logs': 'session-event',
        'robot-state': 'robot-state',
        'map-update': 'map-update',
        'sensor-data': 'sensor-data',
        'session-event': 'session-event',
      };

      const requestedStreams = streamsList
        .map((s) => streamMapping[s] || s)
        .filter((s) => Object.values(streamMapping).includes(s));

      if (requestedStreams.length === 0) {
        throw new Error('No valid streams requested');
      }

      // Store subscriptions
      this.subscriptions.set(socket.id, new Set(requestedStreams));

      // Send confirmation
      socket.emit('subscribed', {
        streams: requestedStreams,
        robotId,
      });

      logger.info('Frontend client subscribed', {
        socketId: socket.id,
        streams: requestedStreams,
        robotId,
      });
    } catch (error) {
      logger.error('Error handling subscribe', { socketId: socket.id, error: error instanceof Error ? error.message : error });
      socket.emit('error', {
        code: 'SUBSCRIBE_ERROR',
        message:
          error instanceof Error ? error.message : 'Failed to subscribe',
      });
    }
  }

  /**
   * Handle unsubscribe request
   */
  private handleUnsubscribe(socket: Socket, data: SubscribePayload): void {
    try {
      const currentSubs = this.subscriptions.get(socket.id);

      // Accept either 'streams' or 'types' field name
      const streamsList = data.streams || data.types || [];

      // Map frontend 'types' to backend stream names
      const streamMapping: Record<string, string> = {
        'state': 'robot-state',
        'map': 'map-update',
        'sensor': 'sensor-data',
        'logs': 'session-event',
        'robot-state': 'robot-state',
        'map-update': 'map-update',
        'sensor-data': 'sensor-data',
        'session-event': 'session-event',
      };

      const mappedStreams = streamsList.map((s) => streamMapping[s] || s);

      if (currentSubs) {
        mappedStreams.forEach((stream) => currentSubs.delete(stream));
      }

      logger.info('Frontend client unsubscribed', {
        socketId: socket.id,
        streams: mappedStreams,
      });
    } catch (error) {
      logger.error('Error handling unsubscribe', {
        socketId: socket.id,
        error,
      });
    }
  }

  /**
   * Handle UI command (proxied to robot)
   */
  private async handleUICommand(
    socket: Socket,
    data: UICommandPayload
  ): Promise<void> {
    try {
      const { robotId, command } = data;
      let result;

      switch (command.type) {
        case 'MOVE':
          result = await this.commandHandler.sendMoveCommand(
            robotId,
            command.payload
          );
          break;

        case 'SET_MODE':
          result = await this.commandHandler.sendSetModeCommand(
            robotId,
            command.payload
          );
          break;

        case 'E_STOP':
          result = await this.commandHandler.sendEStopCommand(robotId, {
            reason: command.payload.reason || 'USER_INITIATED',
          });
          break;

        case 'SET_SPEED':
          result = await this.commandHandler.sendSetSpeedCommand(
            robotId,
            command.payload
          );
          break;

        default:
          socket.emit('ui:command-ack', {
            status: 'FAILED',
            error: 'UNKNOWN_COMMAND_TYPE',
          });
          return;
      }

      if (result.success) {
        socket.emit('ui:command-ack', {
          commandId: result.commandId,
          status: 'SENT',
          timestamp: new Date().toISOString(),
        });
      } else {
        socket.emit('ui:command-ack', {
          status: 'FAILED',
          error: result.error,
        });
      }
    } catch (error) {
      logger.error('Error handling UI command', { socketId: socket.id, error });
      socket.emit('ui:command-ack', {
        status: 'FAILED',
        error: 'INTERNAL_ERROR',
      });
    }
  }

  /**
   * Handle create zone request
   */
  private async handleCreateZone(
    socket: Socket,
    data: CreateZonePayload
  ): Promise<void> {
    try {
      const zone = await this.zoneService.create({
        mapId: data.mapId,
        name: data.zone.name,
        geometry: data.zone.geometry,
      });

      // Send confirmation
      socket.emit('ui:zone-created', { zone });

      // Broadcast to all frontend clients
      this.connectionHandler.broadcastToFrontend('frontend:zone-updated', {
        event: 'CREATED',
        zone,
      });

      // TODO: Send config update to robot with new restricted zones
      // This would require loading all zones for the map and sending to robot

      logger.info('Zone created', {
        zoneId: zone.id,
        mapId: data.mapId,
      });
    } catch (error) {
      logger.error('Error creating zone', { socketId: socket.id, error });
      socket.emit('error', {
        code: 'ZONE_CREATE_ERROR',
        message: 'Failed to create zone',
      });
    }
  }

  /**
   * Handle update zone request
   */
  private async handleUpdateZone(
    socket: Socket,
    data: UpdateZonePayload
  ): Promise<void> {
    try {
      const zone = await this.zoneService.update(
        data.zoneId,
        data.updates
      );

      // Send confirmation
      socket.emit('ui:zone-updated', { zone });

      // Broadcast to all frontend clients
      this.connectionHandler.broadcastToFrontend('frontend:zone-updated', {
        event: 'UPDATED',
        zone,
      });

      logger.info('Zone updated', { zoneId: data.zoneId });
    } catch (error) {
      logger.error('Error updating zone', { socketId: socket.id, error });
      socket.emit('error', {
        code: 'ZONE_UPDATE_ERROR',
        message: 'Failed to update zone',
      });
    }
  }

  /**
   * Handle delete zone request
   */
  private async handleDeleteZone(
    socket: Socket,
    data: DeleteZonePayload
  ): Promise<void> {
    try {
      await this.zoneService.delete(data.zoneId);

      // Send confirmation
      socket.emit('ui:zone-deleted', { zoneId: data.zoneId });

      // Broadcast to all frontend clients
      this.connectionHandler.broadcastToFrontend('frontend:zone-updated', {
        event: 'DELETED',
        zoneId: data.zoneId,
      });

      logger.info('Zone deleted', { zoneId: data.zoneId });
    } catch (error) {
      logger.error('Error deleting zone', { socketId: socket.id, error });
      socket.emit('error', {
        code: 'ZONE_DELETE_ERROR',
        message: 'Failed to delete zone',
      });
    }
  }

  /**
   * Clean up subscriptions on disconnect
   */
  public handleDisconnect(socketId: string): void {
    this.subscriptions.delete(socketId);
  }
}

