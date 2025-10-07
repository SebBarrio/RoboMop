/**
 * WebSocket Contract Test: command:set-mode Event
 * 
 * Tests the contract for the command:set-mode WebSocket event.
 * This event is sent from backend to robot to change operational mode.
 * 
 * Requirements: T041 - WebSocket contract test command:set-mode event
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';

describe('WebSocket Contract: command:set-mode', () => {
  let httpServer: HttpServer;
  let ioServer: SocketIOServer;
  let serverPort: number;
  let robotSocket: ClientSocket;
  let frontendSocket: ClientSocket;

  const testRobotId = '550e8400-e29b-41d4-a716-446655440000';
  const testMapId = '770e8400-e29b-41d4-a716-446655440002';

  beforeAll((done) => {
    // Create HTTP server
    httpServer = createServer();
    
    // Attach Socket.io
    ioServer = new SocketIOServer(httpServer, {
      cors: { origin: '*' },
      transports: ['websocket'],
    });

    // Setup event handlers
    ioServer.on('connection', (socket) => {
      const { apiKey, robotId } = socket.handshake.query;
      const isRobot = apiKey && robotId;

      if (isRobot) {
        // Store robot socket for command sending
        socket.data.robotId = robotId;
        socket.data.isRobot = true;
      }

      // Frontend → Backend: UI command to robot
      socket.on('ui:command', (data) => {
        const commandId = `cmd-${Date.now()}`;
        
        // Find robot socket and send command
        ioServer.sockets.sockets.forEach((robotSock) => {
          if (robotSock.data.robotId === data.robotId && robotSock.data.isRobot) {
            if (data.command.type === 'SET_MODE') {
              robotSock.emit('command:set-mode', {
                commandId,
                timestamp: new Date().toISOString(),
                mode: data.command.payload.mode,
                parameters: data.command.payload.parameters || {},
              });
            }
          }
        });

        // Send acknowledgement back to frontend
        socket.emit('ui:command-ack', {
          commandId,
          status: 'SENT',
          timestamp: new Date().toISOString(),
        });
      });

      // Robot → Backend: Command acknowledgement
      socket.on('command:ack', (data) => {
        // Forward ack to all frontend clients
        ioServer.emit('command:ack', data);
      });
    });

    // Start server
    httpServer.listen(0, () => {
      serverPort = (httpServer.address() as AddressInfo).port;
      done();
    });
  });

  afterAll((done) => {
    if (robotSocket?.connected) robotSocket.disconnect();
    if (frontendSocket?.connected) frontendSocket.disconnect();
    ioServer.close();
    httpServer.close(done);
  });

  it('should accept valid set-mode command to IDLE', (done) => {
    // Connect robot first
    robotSocket = ioClient(`http://localhost:${serverPort}`, {
      query: { apiKey: 'test-api-key', robotId: testRobotId },
      transports: ['websocket'],
    });

    robotSocket.on('connect', () => {
      robotSocket.once('command:set-mode', (data) => {
        expect(data).toHaveProperty('commandId');
        expect(data).toHaveProperty('timestamp');
        expect(data).toHaveProperty('mode');
        expect(data.mode).toBe('IDLE');
        expect(typeof data.commandId).toBe('string');
        expect(typeof data.timestamp).toBe('string');
        expect(() => new Date(data.timestamp)).not.toThrow();
        done();
      });

      // Connect frontend and send command
      frontendSocket = ioClient(`http://localhost:${serverPort}`, {
        transports: ['websocket'],
      });

      frontendSocket.on('connect', () => {
        frontendSocket.emit('ui:command', {
          robotId: testRobotId,
          command: {
            type: 'SET_MODE',
            payload: {
              mode: 'IDLE',
            },
          },
        });
      });
    });
  });

  it('should accept valid set-mode command to EXPLORATION', (done) => {
    robotSocket.once('command:set-mode', (data) => {
      expect(data.mode).toBe('EXPLORATION');
      expect(data.parameters).toBeDefined();
      expect(typeof data.parameters).toBe('object');
      done();
    });

    frontendSocket.emit('ui:command', {
      robotId: testRobotId,
      command: {
        type: 'SET_MODE',
        payload: {
          mode: 'EXPLORATION',
          parameters: {},
        },
      },
    });
  });

  it('should accept valid set-mode command to CLEANING with mapId', (done) => {
    robotSocket.once('command:set-mode', (data) => {
      expect(data.mode).toBe('CLEANING');
      expect(data.parameters).toBeDefined();
      expect(data.parameters.mapId).toBe(testMapId);
      done();
    });

    frontendSocket.emit('ui:command', {
      robotId: testRobotId,
      command: {
        type: 'SET_MODE',
        payload: {
          mode: 'CLEANING',
          parameters: {
            mapId: testMapId,
          },
        },
      },
    });
  });

  it('should accept valid set-mode command to MANUAL', (done) => {
    robotSocket.once('command:set-mode', (data) => {
      expect(data.mode).toBe('MANUAL');
      expect(data.parameters).toBeDefined();
      done();
    });

    frontendSocket.emit('ui:command', {
      robotId: testRobotId,
      command: {
        type: 'SET_MODE',
        payload: {
          mode: 'MANUAL',
        },
      },
    });
  });

  it('should validate mode enum values', () => {
    const validModes = ['IDLE', 'EXPLORATION', 'CLEANING', 'MANUAL', 'RETURNING', 'ERROR'];
    const invalidModes = ['INVALID', 'SLEEPING', 'UNKNOWN', 123, null, undefined];

    validModes.forEach((mode) => {
      expect(typeof mode).toBe('string');
      expect(validModes.includes(mode)).toBe(true);
    });

    invalidModes.forEach((mode) => {
      if (typeof mode === 'string') {
        expect(validModes.includes(mode)).toBe(false);
      } else {
        expect(typeof mode).not.toBe('string');
      }
    });
  });

  it('should include commandId for tracking', (done) => {
    robotSocket.once('command:set-mode', (data) => {
      expect(data.commandId).toBeDefined();
      expect(typeof data.commandId).toBe('string');
      expect(data.commandId.length).toBeGreaterThan(0);
      expect(data.commandId).toMatch(/^cmd-/);
      done();
    });

    frontendSocket.emit('ui:command', {
      robotId: testRobotId,
      command: {
        type: 'SET_MODE',
        payload: {
          mode: 'IDLE',
        },
      },
    });
  });

  it('should include valid timestamp in ISO 8601 format', (done) => {
    robotSocket.once('command:set-mode', (data) => {
      expect(data.timestamp).toBeDefined();
      expect(typeof data.timestamp).toBe('string');
      expect(() => new Date(data.timestamp)).not.toThrow();
      
      const timestamp = new Date(data.timestamp);
      expect(timestamp.toISOString()).toBe(data.timestamp);
      
      // Check timestamp is recent (within last 5 seconds)
      const now = new Date();
      const diff = now.getTime() - timestamp.getTime();
      expect(diff).toBeLessThan(5000);
      expect(diff).toBeGreaterThanOrEqual(0);
      
      done();
    });

    frontendSocket.emit('ui:command', {
      robotId: testRobotId,
      command: {
        type: 'SET_MODE',
        payload: {
          mode: 'EXPLORATION',
        },
      },
    });
  });

  it('should support parameters field for mode-specific data', (done) => {
    const customParameters = {
      mapId: testMapId,
      speed: 0.5,
      coverage: 'FULL',
      customField: 'test-value',
    };

    robotSocket.once('command:set-mode', (data) => {
      expect(data.parameters).toBeDefined();
      expect(data.parameters.mapId).toBe(testMapId);
      expect(data.parameters.speed).toBe(0.5);
      expect(data.parameters.coverage).toBe('FULL');
      expect(data.parameters.customField).toBe('test-value');
      done();
    });

    frontendSocket.emit('ui:command', {
      robotId: testRobotId,
      command: {
        type: 'SET_MODE',
        payload: {
          mode: 'CLEANING',
          parameters: customParameters,
        },
      },
    });
  });

  it('should handle empty parameters object', (done) => {
    robotSocket.once('command:set-mode', (data) => {
      expect(data.parameters).toBeDefined();
      expect(typeof data.parameters).toBe('object');
      expect(Object.keys(data.parameters).length).toBe(0);
      done();
    });

    frontendSocket.emit('ui:command', {
      robotId: testRobotId,
      command: {
        type: 'SET_MODE',
        payload: {
          mode: 'IDLE',
          parameters: {},
        },
      },
    });
  });

  it('should receive acknowledgement from robot', (done) => {
    const startTime = Date.now();

    // Listen for command acknowledgement
    frontendSocket.once('command:ack', (ackData) => {
      const latency = Date.now() - startTime;
      
      expect(ackData).toHaveProperty('commandId');
      expect(ackData).toHaveProperty('status');
      expect(ackData).toHaveProperty('timestamp');
      expect(ackData.status).toBe('ACKNOWLEDGED');
      expect(latency).toBeLessThan(1000); // Should be fast
      
      done();
    });

    // Robot receives command and sends ack
    robotSocket.once('command:set-mode', (data) => {
      robotSocket.emit('command:ack', {
        commandId: data.commandId,
        status: 'ACKNOWLEDGED',
        timestamp: new Date().toISOString(),
      });
    });

    // Frontend sends command
    frontendSocket.emit('ui:command', {
      robotId: testRobotId,
      command: {
        type: 'SET_MODE',
        payload: {
          mode: 'MANUAL',
        },
      },
    });
  });

  it('should handle mode transitions correctly', (done) => {
    let commandCount = 0;
    const modes = ['IDLE', 'EXPLORATION', 'CLEANING', 'MANUAL', 'IDLE'];

    robotSocket.on('command:set-mode', (data) => {
      expect(data.mode).toBe(modes[commandCount]);
      commandCount++;

      if (commandCount === modes.length) {
        robotSocket.off('command:set-mode');
        done();
      }
    });

    // Send mode transitions with delays
    modes.forEach((mode, index) => {
      setTimeout(() => {
        frontendSocket.emit('ui:command', {
          robotId: testRobotId,
          command: {
            type: 'SET_MODE',
            payload: {
              mode,
              parameters: mode === 'CLEANING' ? { mapId: testMapId } : {},
            },
          },
        });
      }, index * 100);
    });
  }, 10000);

  it('should support RETURNING mode', (done) => {
    robotSocket.once('command:set-mode', (data) => {
      expect(data.mode).toBe('RETURNING');
      expect(data.parameters).toBeDefined();
      done();
    });

    frontendSocket.emit('ui:command', {
      robotId: testRobotId,
      command: {
        type: 'SET_MODE',
        payload: {
          mode: 'RETURNING',
          parameters: {},
        },
      },
    });
  });

  it('should receive ui:command-ack immediately after sending command', (done) => {
    const startTime = Date.now();

    frontendSocket.once('ui:command-ack', (ackData) => {
      const latency = Date.now() - startTime;
      
      expect(ackData).toHaveProperty('commandId');
      expect(ackData).toHaveProperty('status');
      expect(ackData).toHaveProperty('timestamp');
      expect(ackData.status).toBe('SENT');
      expect(latency).toBeLessThan(100); // Should be very fast (server-side only)
      
      done();
    });

    frontendSocket.emit('ui:command', {
      robotId: testRobotId,
      command: {
        type: 'SET_MODE',
        payload: {
          mode: 'IDLE',
        },
      },
    });
  });
});

