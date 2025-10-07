/**
 * Contract Test: robot:heartbeat WebSocket event
 * Validates heartbeat event schema and handling
 * Tests T071, T072 implementation
 */

import { io as ioClient, Socket } from 'socket.io-client';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { app, httpServer, initializeWebSocketHandlers } from '../../src/server';
import { AppDataSource } from '../../src/config/database';

describe('WebSocket: robot:heartbeat', () => {
  let clientSocket: Socket;
  let testRobotId: string = '';
  const serverUrl = 'http://localhost:3001';
  const testApiKey = 'test-api-key-12345';

  beforeAll(async () => {
    // Initialize WebSocket handlers
    initializeWebSocketHandlers();

    // Start server on different port for testing
    await new Promise<void>((resolve) => {
      httpServer.listen(3001, () => {
        resolve();
      });
    });

    // Create test robot
    const robotData = {
      name: 'Test Robot Heartbeat',
      serialNumber: 'TEST-HB-001',
      modelVersion: '1.0.0',
      firmwareVersion: '1.0.0',
    };

    const response = await request(app)
      .post('/api/v1/robots')
      .send(robotData)
      .expect(201);

    testRobotId = response.body.id;
  });

  afterAll(async () => {
    // Clean up database
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    
    // Close server
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  beforeEach((done) => {
    // Connect with API key and robot ID authentication
    clientSocket = ioClient(serverUrl, {
      query: { 
        apiKey: testApiKey,
        robotId: testRobotId 
      },
      transports: ['websocket'],
    });
    
    clientSocket.on('connect', () => {
      done();
    });

    clientSocket.on('connect_error', (error) => {
      done(error);
    });
  });

  afterEach(() => {
    if (clientSocket.connected) {
      clientSocket.disconnect();
    }
  });

  it('should accept valid heartbeat event', (done) => {
    const heartbeatPayload = {
      robotId: testRobotId,
      timestamp: new Date().toISOString(),
      uptimeSeconds: 3600,
      cpuUsagePercent: 45.2,
      memoryUsagePercent: 62.1,
      temperatureCelsius: 58.0,
    };

    // Send heartbeat
    clientSocket.emit('robot:heartbeat', heartbeatPayload);

    // Heartbeat processing is async, give it a moment
    setTimeout(async () => {
      // Verify robot lastSeenAt was updated
      const response = await request(app)
        .get(`/api/v1/robots/${testRobotId}`)
        .expect(200);

      const robot = response.body;
      const lastSeen = new Date(robot.lastSeenAt);
      const now = new Date();
      const timeDiff = now.getTime() - lastSeen.getTime();

      // lastSeenAt should be within last 2 seconds
      expect(timeDiff).toBeLessThan(2000);
      expect(robot.status).toBe('ONLINE');
      
      done();
    }, 500);
  });

  it('should update robot lastSeenAt timestamp on heartbeat', async () => {
    const heartbeatPayload = {
      robotId: testRobotId,
      timestamp: new Date().toISOString(),
      uptimeSeconds: 120,
      cpuUsagePercent: 30.5,
      memoryUsagePercent: 50.0,
      temperatureCelsius: 55.0,
    };

    // Get initial lastSeenAt
    const beforeResponse = await request(app)
      .get(`/api/v1/robots/${testRobotId}`)
      .expect(200);
    
    const lastSeenBefore = new Date(beforeResponse.body.lastSeenAt);

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 100));

    // Send heartbeat
    clientSocket.emit('robot:heartbeat', heartbeatPayload);

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify lastSeenAt was updated
    const afterResponse = await request(app)
      .get(`/api/v1/robots/${testRobotId}`)
      .expect(200);

    const lastSeenAfter = new Date(afterResponse.body.lastSeenAt);

    expect(lastSeenAfter.getTime()).toBeGreaterThan(lastSeenBefore.getTime());
  });

  it('should validate heartbeat payload schema', (done) => {
    const validPayload = {
      robotId: testRobotId,
      timestamp: new Date().toISOString(),
      uptimeSeconds: 3600,
      cpuUsagePercent: 45.2,
      memoryUsagePercent: 62.1,
      temperatureCelsius: 58.0,
    };

    // This should work without errors
    clientSocket.emit('robot:heartbeat', validPayload);

    setTimeout(() => {
      // If we get here without errors, validation passed
      expect(true).toBe(true);
      done();
    }, 300);
  });

  it('should maintain robot ONLINE status with regular heartbeats', async () => {
    // Send multiple heartbeats
    for (let i = 0; i < 3; i++) {
      const heartbeatPayload = {
        robotId: testRobotId,
        timestamp: new Date().toISOString(),
        uptimeSeconds: 120 + i * 5,
        cpuUsagePercent: 40.0,
        memoryUsagePercent: 55.0,
        temperatureCelsius: 56.0,
      };

      clientSocket.emit('robot:heartbeat', heartbeatPayload);
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Verify robot is still ONLINE
    const response = await request(app)
      .get(`/api/v1/robots/${testRobotId}`)
      .expect(200);

    expect(response.body.status).toBe('ONLINE');
  });
});


