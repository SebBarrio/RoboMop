/**
 * Contract Test: command:e-stop WebSocket event
 * Validates emergency stop command (CRITICAL SAFETY REQUIREMENT)
 * Tests T073 implementation
 * CRITICAL: Must have < 500ms latency end-to-end
 */

import { io as ioClient, Socket } from 'socket.io-client';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { app, httpServer, initializeWebSocketHandlers } from '../../src/server';
import { AppDataSource } from '../../src/config/database';

describe('WebSocket: command:e-stop (CRITICAL)', () => {
  let robotSocket: Socket;
  let frontendSocket: Socket;
  let testRobotId: string = '';
  const serverUrl = 'http://localhost:3006';

  beforeAll(async () => {
    // Initialize WebSocket handlers
    initializeWebSocketHandlers();

    await new Promise<void>((resolve) => {
      httpServer.listen(3006, () => resolve());
    });

    const response = await request(app)
      .post('/api/v1/robots')
      .send({
        name: 'Test Robot E-Stop',
        serialNumber: 'TEST-ESTOP-001',
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

  it('should send e-stop command from frontend to robot', (done) => {
    const eStopCommand = {
      robotId: testRobotId,
      command: {
        type: 'E_STOP',
        payload: { reason: 'USER_INITIATED' },
      },
    };

    // Robot listens for e-stop
    robotSocket.on('command:e-stop', (data) => {
      expect(data.commandId).toBeDefined();
      expect(data.reason).toBe('USER_INITIATED');
      expect(data.timestamp).toBeDefined();
      done();
    });

    // Frontend sends e-stop
    setTimeout(() => {
      frontendSocket.emit('ui:command', eStopCommand);
    }, 100);
  });

  it('should acknowledge e-stop within 500ms (NFR-003 CRITICAL)', (done) => {
    const startTime = Date.now();
    
    const eStopCommand = {
      robotId: testRobotId,
      command: {
        type: 'E_STOP',
        payload: { reason: 'OBSTACLE_DETECTED' },
      },
    };

    frontendSocket.on('ui:command-ack', (ack) => {
      const latency = Date.now() - startTime;
      
      expect(ack.commandId).toBeDefined();
      expect(ack.status).toBe('SENT');
      expect(latency).toBeLessThan(500);
      
      done();
    });

    frontendSocket.emit('ui:command', eStopCommand);

    // Fail if not acknowledged in 500ms
    setTimeout(() => {
      done(new Error('E-stop not acknowledged within 500ms - SAFETY VIOLATION'));
    }, 500);
  });

  it('should have highest priority (bypasses validation)', (done) => {
    // E-stop should work even if other commands are pending
    // First send a move command
    frontendSocket.emit('ui:command', {
      robotId: testRobotId,
      command: {
        type: 'MOVE',
        payload: { direction: 'FORWARD', speed: 0.5, duration: 10.0 },
      },
    });

    // Immediately send e-stop (should not be blocked)
    setTimeout(() => {
      const eStopCommand = {
        robotId: testRobotId,
        command: {
          type: 'E_STOP',
          payload: { reason: 'USER_INITIATED' },
        },
      };

      robotSocket.on('command:e-stop', (data) => {
        expect(data.reason).toBe('USER_INITIATED');
        done();
      });

      frontendSocket.emit('ui:command', eStopCommand);
    }, 50);
  });

  it('should support different e-stop reasons', async () => {
    const reasons = [
      'USER_INITIATED',
      'OBSTACLE_DETECTED',
      'CLIFF_DETECTED',
      'SYSTEM_ERROR',
      'LOW_BATTERY',
    ];

    const receivedReasons: string[] = [];

    robotSocket.on('command:e-stop', (data) => {
      receivedReasons.push(data.reason);
    });

    for (const reason of reasons) {
      frontendSocket.emit('ui:command', {
        robotId: testRobotId,
        command: {
          type: 'E_STOP',
          payload: { reason },
        },
      });
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 300));

    // Should have received all reasons
    expect(receivedReasons.length).toBeGreaterThanOrEqual(reasons.length);
  });

  it('should clear robot velocity on e-stop acknowledgement', (done) => {
    // This test simulates the expected behavior
    // Robot should acknowledge and send state with zero velocity

    let eStopReceived = false;

    robotSocket.on('command:e-stop', (data) => {
      eStopReceived = true;
      
      // Robot acknowledges
      robotSocket.emit('command:ack', {
        commandId: data.commandId,
        status: 'ACKNOWLEDGED',
        robotId: testRobotId,
      });

      // Robot sends updated state with zero velocity
      setTimeout(() => {
        robotSocket.emit('robot:state', {
          robotId: testRobotId,
          timestamp: new Date().toISOString(),
          mode: 'IDLE',
          position: { x: 0, y: 0, theta: 0, confidence: 0.95 },
          velocity: { linear: 0, angular: 0 },
          batteryLevel: 80.0,
          waterLevel: 70.0,
          motorCurrents: { left: 0, right: 0 },
          errors: [],
        });
      }, 100);
    });

    frontendSocket.on('frontend:robot-state', (state) => {
      if (eStopReceived) {
        expect(state.velocity.linear).toBe(0);
        expect(state.velocity.angular).toBe(0);
        expect(state.mode).toBe('IDLE');
        done();
      }
    });

    // Send e-stop
    frontendSocket.emit('ui:command', {
      robotId: testRobotId,
      command: {
        type: 'E_STOP',
        payload: { reason: 'USER_INITIATED' },
      },
    });
  });
});
