/**
 * Contract Test: ui:command WebSocket event
 * Validates UI command proxying and handling
 * Tests T074 implementation
 */

import { io as ioClient, Socket } from 'socket.io-client';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { app, httpServer, initializeWebSocketHandlers } from '../../src/server';
import { AppDataSource } from '../../src/config/database';

describe('WebSocket: ui:command', () => {
  let robotSocket: Socket;
  let frontendSocket: Socket;
  let testRobotId: string = '';
  const serverUrl = 'http://localhost:3004';

  beforeAll(async () => {
    // Initialize WebSocket handlers
    initializeWebSocketHandlers();

    await new Promise<void>((resolve) => {
      httpServer.listen(3004, () => resolve());
    });

    const response = await request(app)
      .post('/api/v1/robots')
      .send({
        name: 'Test Robot UI Command',
        serialNumber: 'TEST-UI-CMD-001',
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

  it('should proxy MOVE command to robot', (done) => {
    frontendSocket.emit('ui:command', {
      robotId: testRobotId,
      command: {
        type: 'MOVE',
        payload: { direction: 'FORWARD', speed: 0.5, duration: 1.0 },
      },
    });

    robotSocket.on('command:move', (data) => {
      expect(data.direction).toBe('FORWARD');
      done();
    });
  });

  it('should proxy SET_MODE command to robot', (done) => {
    frontendSocket.emit('ui:command', {
      robotId: testRobotId,
      command: {
        type: 'SET_MODE',
        payload: { mode: 'CLEANING', parameters: {} },
      },
    });

    robotSocket.on('command:set-mode', (data) => {
      expect(data.mode).toBe('CLEANING');
      done();
    });
  });

  it('should proxy E_STOP command to robot', (done) => {
    frontendSocket.emit('ui:command', {
      robotId: testRobotId,
      command: {
        type: 'E_STOP',
        payload: { reason: 'USER_INITIATED' },
      },
    });

    robotSocket.on('command:e-stop', (data) => {
      expect(data.reason).toBe('USER_INITIATED');
      done();
    });
  });

  it('should proxy SET_SPEED command to robot', (done) => {
    frontendSocket.emit('ui:command', {
      robotId: testRobotId,
      command: {
        type: 'SET_SPEED',
        payload: { speedMultiplier: 0.75 },
      },
    });

    robotSocket.on('command:set-speed', (data) => {
      expect(data.speedMultiplier).toBe(0.75);
      done();
    });
  });

  it('should reject unknown command type', (done) => {
    frontendSocket.emit('ui:command', {
      robotId: testRobotId,
      command: {
        type: 'UNKNOWN_COMMAND',
        payload: {},
      },
    });

    frontendSocket.on('ui:command-ack', (ack) => {
      expect(ack.status).toBe('FAILED');
      expect(ack.error).toBe('UNKNOWN_COMMAND_TYPE');
      done();
    });
  });

  it('should acknowledge successful command dispatch', (done) => {
    frontendSocket.emit('ui:command', {
      robotId: testRobotId,
      command: {
        type: 'MOVE',
        payload: { direction: 'FORWARD', speed: 0.3, duration: 1.0 },
      },
    });

    frontendSocket.on('ui:command-ack', (ack) => {
      expect(ack.commandId).toBeDefined();
      expect(ack.status).toBe('SENT');
      expect(ack.timestamp).toBeDefined();
      done();
    });
  });
});

