/**
 * Contract Test: command:move WebSocket event
 * Validates move command schema and handling
 * Tests T073 implementation
 */

import { io as ioClient, Socket } from 'socket.io-client';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { app, httpServer, initializeWebSocketHandlers } from '../../src/server';
import { AppDataSource } from '../../src/config/database';

describe('WebSocket: command:move', () => {
  let robotSocket: Socket;
  let frontendSocket: Socket;
  let testRobotId: string = '';
  const serverUrl = 'http://localhost:3003';

  beforeAll(async () => {
    // Initialize WebSocket handlers
    initializeWebSocketHandlers();

    await new Promise<void>((resolve) => {
      httpServer.listen(3003, () => resolve());
    });

    const response = await request(app)
      .post('/api/v1/robots')
      .send({
        name: 'Test Robot Move',
        serialNumber: 'TEST-MOVE-001',
        modelVersion: '1.0.0',
        firmwareVersion: '1.0.0',
      })
      .expect(201);

    testRobotId = response.body.id;
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  beforeEach((done) => {
    let connected = 0;
    const checkDone = () => {
      connected++;
      if (connected === 2) done();
    };

    robotSocket = ioClient(serverUrl, {
      query: { apiKey: 'test-key', robotId: testRobotId },
      transports: ['websocket'],
    });
    robotSocket.on('connect', checkDone);

    frontendSocket = ioClient(serverUrl, {
      transports: ['websocket'],
    });
    frontendSocket.on('connect', checkDone);
  });

  afterEach(() => {
    if (robotSocket.connected) robotSocket.disconnect();
    if (frontendSocket.connected) frontendSocket.disconnect();
  });

  it('should send move command from frontend to robot', (done) => {
    const moveCommand = {
      robotId: testRobotId,
      command: {
        type: 'MOVE',
        payload: {
          direction: 'FORWARD',
          speed: 0.5,
          duration: 1.0,
        },
      },
    };

    // Robot listens for command
    robotSocket.on('command:move', (data) => {
      expect(data.commandId).toBeDefined();
      expect(data.direction).toBe('FORWARD');
      expect(data.speed).toBe(0.5);
      expect(data.duration).toBe(1.0);
      done();
    });

    // Frontend sends command
    setTimeout(() => {
      frontendSocket.emit('ui:command', moveCommand);
    }, 100);
  });

  it('should generate unique command ID', (done) => {
    const moveCommand = {
      robotId: testRobotId,
      command: {
        type: 'MOVE',
        payload: {
          direction: 'BACKWARD',
          speed: 0.3,
          duration: 2.0,
        },
      },
    };

    let firstCommandId: string;
    let receivedCount = 0;

    robotSocket.on('command:move', (data) => {
      receivedCount++;
      
      if (receivedCount === 1) {
        firstCommandId = data.commandId;
        expect(firstCommandId).toBeDefined();
        expect(firstCommandId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      } else if (receivedCount === 2) {
        expect(data.commandId).toBeDefined();
        expect(data.commandId).not.toBe(firstCommandId);
        done();
      }
    });

    // Send two commands
    setTimeout(() => {
      frontendSocket.emit('ui:command', moveCommand);
      setTimeout(() => {
        frontendSocket.emit('ui:command', moveCommand);
      }, 100);
    }, 100);
  });

  it('should acknowledge move command to frontend', (done) => {
    const moveCommand = {
      robotId: testRobotId,
      command: {
        type: 'MOVE',
        payload: {
          direction: 'LEFT',
          speed: 0.2,
          duration: 0.5,
        },
      },
    };

    // Frontend listens for acknowledgement
    frontendSocket.on('ui:command-ack', (ack) => {
      expect(ack.commandId).toBeDefined();
      expect(ack.status).toBe('SENT');
      expect(ack.timestamp).toBeDefined();
      done();
    });

    // Send command
    frontendSocket.emit('ui:command', moveCommand);
  });

  it('should support all movement directions', async () => {
    const directions = ['FORWARD', 'BACKWARD', 'LEFT', 'RIGHT', 'STOP'];
    const receivedDirections: string[] = [];

    robotSocket.on('command:move', (data) => {
      receivedDirections.push(data.direction);
    });

    // Send commands for each direction
    for (const direction of directions) {
      frontendSocket.emit('ui:command', {
        robotId: testRobotId,
        command: {
          type: 'MOVE',
          payload: { direction, speed: 0.5, duration: 1.0 },
        },
      });
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 300));

    // Should have received all directions
    expect(receivedDirections.length).toBeGreaterThanOrEqual(directions.length);
    directions.forEach(dir => {
      expect(receivedDirections).toContain(dir);
    });
  });

  it('should handle robot offline scenario', (done) => {
    // Disconnect robot
    robotSocket.disconnect();

    const moveCommand = {
      robotId: testRobotId,
      command: {
        type: 'MOVE',
        payload: { direction: 'FORWARD', speed: 0.5, duration: 1.0 },
      },
    };

    // Frontend should receive error acknowledgement
    frontendSocket.on('ui:command-ack', (ack) => {
      expect(ack.status).toBe('FAILED');
      expect(ack.error).toBe('ROBOT_OFFLINE');
      done();
    });

    setTimeout(() => {
      frontendSocket.emit('ui:command', moveCommand);
    }, 200);
  });
});

