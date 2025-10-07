/**
 * Integration Test: Robot Registration and Connection (Scenario 1)
 * Tests T045: Complete robot registration flow with WebSocket connection
 * 
 * Scenario:
 * 1. Robot registers via REST API
 * 2. Robot connects via WebSocket with API key
 * 3. Robot sends heartbeat
 * 4. Backend updates robot status to ONLINE
 * 5. Frontend can query robot details
 */

import { io as ioClient, Socket } from 'socket.io-client';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { app, httpServer, initializeWebSocketHandlers } from '../../src/server';
import { AppDataSource } from '../../src/config/database';

describe('Integration: Robot Registration and Connection', () => {
  let robotSocket: Socket;
  let frontendSocket: Socket;
  let testRobotId: string;
  let testApiKey: string;
  const serverUrl = 'http://localhost:3002';

  beforeAll(async () => {
    // Initialize WebSocket handlers
    initializeWebSocketHandlers();

    // Start server on test port
    await new Promise<void>((resolve) => {
      httpServer.listen(3002, () => {
        resolve();
      });
    });
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

  afterEach(() => {
    if (robotSocket?.connected) {
      robotSocket.disconnect();
    }
    if (frontendSocket?.connected) {
      frontendSocket.disconnect();
    }
  });

  describe('Step 1: Robot Registration', () => {
    it('should register a new robot via REST API', async () => {
      const robotData = {
        name: 'RoboMop-Integration-001',
        serialNumber: 'INT-TEST-001',
        modelVersion: '1.0.0',
        firmwareVersion: '1.2.3',
      };

      const response = await request(app)
        .post('/api/v1/robots')
        .send(robotData)
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(robotData.name);
      expect(response.body.serialNumber).toBe(robotData.serialNumber);
      expect(response.body.status).toBe('OFFLINE'); // Initial status

      testRobotId = response.body.id;
      testApiKey = 'test-api-key-' + testRobotId;
    });

    it('should prevent duplicate serial number registration', async () => {
      const duplicateData = {
        name: 'RoboMop-Duplicate',
        serialNumber: 'INT-TEST-001', // Same as above
        modelVersion: '1.0.0',
        firmwareVersion: '1.2.3',
      };

      const response = await request(app)
        .post('/api/v1/robots')
        .send(duplicateData)
        .expect(400);

      expect(response.body.message).toMatch(/unique|exists|duplicate/i);
    });
  });

  describe('Step 2: Robot WebSocket Connection', () => {
    it('should establish WebSocket connection with authentication', (done) => {
      robotSocket = ioClient(serverUrl, {
        query: {
          apiKey: testApiKey,
          robotId: testRobotId,
        },
        transports: ['websocket'],
      });

      robotSocket.on('connect', () => {
        expect(robotSocket.connected).toBe(true);
        done();
      });

      robotSocket.on('connect_error', (error) => {
        done(error);
      });
    });

    it('should reject connection without API key', (done) => {
      const unauthorizedSocket = ioClient(serverUrl, {
        query: {
          robotId: testRobotId,
          // Missing apiKey
        },
        transports: ['websocket'],
      });

      unauthorizedSocket.on('connect', () => {
        done(new Error('Should not connect without API key'));
      });

      unauthorizedSocket.on('connect_error', (error) => {
        expect(error).toBeDefined();
        unauthorizedSocket.disconnect();
        done();
      });
    });

    it('should reject connection with invalid robot ID', (done) => {
      const invalidSocket = ioClient(serverUrl, {
        query: {
          apiKey: testApiKey,
          robotId: '00000000-0000-0000-0000-000000000000',
        },
        transports: ['websocket'],
      });

      invalidSocket.on('connect', () => {
        done(new Error('Should not connect with invalid robot ID'));
      });

      invalidSocket.on('connect_error', (error) => {
        expect(error).toBeDefined();
        invalidSocket.disconnect();
        done();
      });
    });
  });

  describe('Step 3: Heartbeat and Status Update', () => {
    beforeEach((done) => {
      robotSocket = ioClient(serverUrl, {
        query: {
          apiKey: testApiKey,
          robotId: testRobotId,
        },
        transports: ['websocket'],
      });

      robotSocket.on('connect', () => done());
      robotSocket.on('connect_error', (error) => done(error));
    });

    it('should send heartbeat and update robot to ONLINE status', async () => {
      // Send heartbeat from robot
      const heartbeatPayload = {
        robotId: testRobotId,
        timestamp: new Date().toISOString(),
        uptimeSeconds: 60,
        cpuUsagePercent: 35.0,
        memoryUsagePercent: 50.0,
        temperatureCelsius: 45.0,
      };

      robotSocket.emit('robot:heartbeat', heartbeatPayload);

      // Wait for heartbeat to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify robot status is now ONLINE
      const response = await request(app)
        .get(`/api/v1/robots/${testRobotId}`)
        .expect(200);

      expect(response.body.status).toBe('ONLINE');
      expect(new Date(response.body.lastSeenAt).getTime()).toBeGreaterThan(
        Date.now() - 5000
      );
    });

    it('should update lastSeenAt timestamp on each heartbeat', async () => {
      // Get initial lastSeenAt
      const initialResponse = await request(app)
        .get(`/api/v1/robots/${testRobotId}`)
        .expect(200);

      const initialLastSeen = new Date(initialResponse.body.lastSeenAt);

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Send another heartbeat
      robotSocket.emit('robot:heartbeat', {
        robotId: testRobotId,
        timestamp: new Date().toISOString(),
        uptimeSeconds: 120,
        cpuUsagePercent: 36.0,
        memoryUsagePercent: 51.0,
        temperatureCelsius: 46.0,
      });

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify lastSeenAt was updated
      const updatedResponse = await request(app)
        .get(`/api/v1/robots/${testRobotId}`)
        .expect(200);

      const updatedLastSeen = new Date(updatedResponse.body.lastSeenAt);
      expect(updatedLastSeen.getTime()).toBeGreaterThan(initialLastSeen.getTime());
    });
  });

  describe('Step 4: Frontend Query', () => {
    beforeEach((done) => {
      robotSocket = ioClient(serverUrl, {
        query: {
          apiKey: testApiKey,
          robotId: testRobotId,
        },
        transports: ['websocket'],
      });

      robotSocket.on('connect', () => {
        // Send heartbeat to set status to ONLINE
        robotSocket.emit('robot:heartbeat', {
          robotId: testRobotId,
          timestamp: new Date().toISOString(),
          uptimeSeconds: 60,
          cpuUsagePercent: 35.0,
          memoryUsagePercent: 50.0,
          temperatureCelsius: 45.0,
        });

        setTimeout(done, 100);
      });
    });

    it('should allow frontend to query registered robot details', async () => {
      const response = await request(app)
        .get(`/api/v1/robots/${testRobotId}`)
        .expect(200);

      expect(response.body.id).toBe(testRobotId);
      expect(response.body.serialNumber).toBe('INT-TEST-001');
      expect(response.body.status).toBe('ONLINE');
    });

    it('should list all robots including newly registered one', async () => {
      const response = await request(app)
        .get('/api/v1/robots')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      
      const registeredRobot = response.body.find(
        (robot: any) => robot.id === testRobotId
      );

      expect(registeredRobot).toBeDefined();
      expect(registeredRobot.serialNumber).toBe('INT-TEST-001');
    });
  });

  describe('Step 5: Real-time State Updates', () => {
    beforeEach((done) => {
      let connectedCount = 0;

      robotSocket = ioClient(serverUrl, {
        query: {
          apiKey: testApiKey,
          robotId: testRobotId,
        },
        transports: ['websocket'],
      });

      frontendSocket = ioClient(serverUrl, {
        transports: ['websocket'],
      });

      const checkBothConnected = () => {
        connectedCount++;
        if (connectedCount === 2) {
          done();
        }
      };

      robotSocket.on('connect', checkBothConnected);
      frontendSocket.on('connect', checkBothConnected);
    });

    it('should forward robot state updates to frontend clients', (done) => {
      const statePayload = {
        robotId: testRobotId,
        timestamp: new Date().toISOString(),
        mode: 'IDLE',
        position: { x: 0, y: 0, theta: 0, confidence: 1.0 },
        velocity: { linear: 0, angular: 0 },
        batteryLevel: 100,
        waterLevel: 100,
        motorCurrents: { left: 0, right: 0 },
        errors: [],
      };

      // Frontend listens for state updates
      frontendSocket.on('robot:state', (state) => {
        expect(state.robotId).toBe(testRobotId);
        expect(state.mode).toBe('IDLE');
        expect(state.batteryLevel).toBe(100);
        done();
      });

      // Robot sends state update
      setTimeout(() => {
        robotSocket.emit('robot:state', statePayload);
      }, 100);
    });
  });

  describe('Step 6: Connection Lifecycle', () => {
    it('should update status to OFFLINE when robot disconnects', async () => {
      // Connect robot
      robotSocket = ioClient(serverUrl, {
        query: {
          apiKey: testApiKey,
          robotId: testRobotId,
        },
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        robotSocket.on('connect', () => {
          // Send heartbeat to set ONLINE
          robotSocket.emit('robot:heartbeat', {
            robotId: testRobotId,
            timestamp: new Date().toISOString(),
            uptimeSeconds: 60,
            cpuUsagePercent: 35.0,
            memoryUsagePercent: 50.0,
            temperatureCelsius: 45.0,
          });
          setTimeout(resolve, 100);
        });
      });

      // Verify ONLINE status
      let response = await request(app)
        .get(`/api/v1/robots/${testRobotId}`)
        .expect(200);
      expect(response.body.status).toBe('ONLINE');

      // Disconnect robot
      robotSocket.disconnect();

      // Wait for disconnect to be processed
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify OFFLINE status
      response = await request(app)
        .get(`/api/v1/robots/${testRobotId}`)
        .expect(200);
      expect(response.body.status).toBe('OFFLINE');
    });
  });

  describe('Complete Integration Flow', () => {
    it('should complete full registration and connection flow', async () => {
      // 1. Register robot
      const robotData = {
        name: 'RoboMop-Full-Flow',
        serialNumber: 'FLOW-TEST-001',
        modelVersion: '1.0.0',
        firmwareVersion: '1.2.3',
      };

      const registerResponse = await request(app)
        .post('/api/v1/robots')
        .send(robotData)
        .expect(201);

      const flowRobotId = registerResponse.body.id;
      const flowApiKey = 'test-api-key-' + flowRobotId;

      // 2. Connect via WebSocket
      const flowRobotSocket = ioClient(serverUrl, {
        query: {
          apiKey: flowApiKey,
          robotId: flowRobotId,
        },
        transports: ['websocket'],
      });

      await new Promise<void>((resolve, reject) => {
        flowRobotSocket.on('connect', () => resolve());
        flowRobotSocket.on('connect_error', reject);
      });

      // 3. Send heartbeat
      flowRobotSocket.emit('robot:heartbeat', {
        robotId: flowRobotId,
        timestamp: new Date().toISOString(),
        uptimeSeconds: 60,
        cpuUsagePercent: 35.0,
        memoryUsagePercent: 50.0,
        temperatureCelsius: 45.0,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // 4. Verify status is ONLINE
      const statusResponse = await request(app)
        .get(`/api/v1/robots/${flowRobotId}`)
        .expect(200);

      expect(statusResponse.body.status).toBe('ONLINE');

      // 5. Send state update
      flowRobotSocket.emit('robot:state', {
        robotId: flowRobotId,
        timestamp: new Date().toISOString(),
        mode: 'IDLE',
        position: { x: 0, y: 0, theta: 0, confidence: 1.0 },
        velocity: { linear: 0, angular: 0 },
        batteryLevel: 95,
        waterLevel: 80,
        motorCurrents: { left: 0, right: 0 },
        errors: [],
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // 6. Query current state
      const stateResponse = await request(app)
        .get(`/api/v1/robots/${flowRobotId}/state`)
        .expect(200);

      expect(stateResponse.body.robotId).toBe(flowRobotId);
      expect(stateResponse.body.mode).toBe('IDLE');
      expect(stateResponse.body.batteryLevel).toBe(95);

      // Cleanup
      flowRobotSocket.disconnect();
    });
  });
});


