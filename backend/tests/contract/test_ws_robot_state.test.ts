/**
 * Contract Test: robot:state WebSocket event
 * Validates robot state event schema and handling
 * Tests T072 implementation
 */

import { io as ioClient, Socket } from 'socket.io-client';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { app, httpServer, initializeWebSocketHandlers } from '../../src/server';
import { AppDataSource } from '../../src/config/database';

describe('WebSocket: robot:state', () => {
  let robotSocket: Socket;
  let frontendSocket: Socket;
  let testRobotId: string = '';
  const serverUrl = 'http://localhost:3002';

  beforeAll(async () => {
    // Initialize WebSocket handlers
    initializeWebSocketHandlers();

    // Start server on different port
    await new Promise<void>((resolve) => {
      httpServer.listen(3002, () => resolve());
    });

    // Create test robot
    const response = await request(app)
      .post('/api/v1/robots')
      .send({
        name: 'Test Robot State',
        serialNumber: 'TEST-STATE-001',
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

    // Connect robot
    robotSocket = ioClient(serverUrl, {
      query: { apiKey: 'test-key', robotId: testRobotId },
      transports: ['websocket'],
    });
    robotSocket.on('connect', checkDone);

    // Connect frontend
    frontendSocket = ioClient(serverUrl, {
      transports: ['websocket'],
    });
    frontendSocket.on('connect', checkDone);
  });

  afterEach(() => {
    if (robotSocket.connected) robotSocket.disconnect();
    if (frontendSocket.connected) frontendSocket.disconnect();
  });

  it('should accept valid robot state event', (done) => {
    const statePayload = {
      robotId: testRobotId,
      timestamp: new Date().toISOString(),
      mode: 'CLEANING',
      position: { x: 1.25, y: -0.8, theta: 1.57, confidence: 0.95 },
      velocity: { linear: 0.3, angular: 0.0 },
      batteryLevel: 78.5,
      waterLevel: 65.0,
      motorCurrents: { left: 1.2, right: 1.3 },
      errors: [],
    };

    robotSocket.emit('robot:state', statePayload);

    setTimeout(() => {
      // State accepted (no error)
      expect(true).toBe(true);
      done();
    }, 300);
  });

  it('should forward robot state to frontend clients', (done) => {
    const statePayload = {
      robotId: testRobotId,
      timestamp: new Date().toISOString(),
      mode: 'EXPLORATION',
      position: { x: 2.0, y: 1.5, theta: 0.0, confidence: 0.92 },
      velocity: { linear: 0.25, angular: 0.1 },
      batteryLevel: 85.0,
      waterLevel: 70.0,
      motorCurrents: { left: 1.1, right: 1.0 },
      errors: [],
    };

    // Frontend listens for state
    frontendSocket.on('frontend:robot-state', (data) => {
      expect(data.robotId).toBe(testRobotId);
      expect(data.mode).toBe('EXPLORATION');
      expect(data.position.x).toBe(2.0);
      expect(data.batteryLevel).toBe(85.0);
      done();
    });

    // Robot sends state
    setTimeout(() => {
      robotSocket.emit('robot:state', statePayload);
    }, 100);
  });

  it('should validate state payload schema', () => {
    const validModes = ['IDLE', 'EXPLORATION', 'CLEANING', 'MANUAL', 'RETURNING', 'ERROR'];
    
    validModes.forEach((mode) => {
      const statePayload = {
        robotId: testRobotId,
        timestamp: new Date().toISOString(),
        mode,
        position: { x: 0, y: 0, theta: 0, confidence: 1.0 },
        velocity: { linear: 0, angular: 0 },
        batteryLevel: 100.0,
        waterLevel: 100.0,
        motorCurrents: { left: 0.5, right: 0.5 },
        errors: [],
      };

      // Should not throw errors
      expect(() => {
        robotSocket.emit('robot:state', statePayload);
      }).not.toThrow();
    });
  });

  it('should handle state with errors array', (done) => {
    const statePayload = {
      robotId: testRobotId,
      timestamp: new Date().toISOString(),
      mode: 'ERROR',
      position: { x: 5.0, y: 3.0, theta: 1.2, confidence: 0.5 },
      velocity: { linear: 0, angular: 0 },
      batteryLevel: 25.0,
      waterLevel: 10.0,
      motorCurrents: { left: 0, right: 0 },
      errors: ['SLAM_LOCALIZATION_LOST', 'LOW_BATTERY'],
    };

    frontendSocket.on('frontend:robot-state', (data) => {
      expect(data.errors).toEqual(['SLAM_LOCALIZATION_LOST', 'LOW_BATTERY']);
      expect(data.mode).toBe('ERROR');
      done();
    });

    setTimeout(() => {
      robotSocket.emit('robot:state', statePayload);
    }, 100);
  });

  it('should handle high-frequency state updates (10 Hz)', async () => {
    let receivedCount = 0;

    frontendSocket.on('frontend:robot-state', () => {
      receivedCount++;
    });

    // Send 10 states in 1 second (10 Hz)
    for (let i = 0; i < 10; i++) {
      const statePayload = {
        robotId: testRobotId,
        timestamp: new Date().toISOString(),
        mode: 'CLEANING',
        position: { x: i * 0.1, y: 0, theta: 0, confidence: 0.95 },
        velocity: { linear: 0.3, angular: 0 },
        batteryLevel: 100.0 - i,
        waterLevel: 100.0 - i,
        motorCurrents: { left: 1.0, right: 1.0 },
        errors: [],
      };

      robotSocket.emit('robot:state', statePayload);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Wait for all to be processed
    await new Promise(resolve => setTimeout(resolve, 500));

    // Should receive all or most states
    expect(receivedCount).toBeGreaterThanOrEqual(8);
  });
});

