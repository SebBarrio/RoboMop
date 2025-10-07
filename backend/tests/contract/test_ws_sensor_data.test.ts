/**
 * WebSocket Contract Test: robot:sensor-data Event
 * 
 * Tests the contract for the robot:sensor-data WebSocket event.
 * This event is emitted by the robot to send raw sensor readings.
 * 
 * Frequency: As needed (typically 10 Hz)
 * 
 * Requirements: T039 - WebSocket contract test robot:sensor-data event
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';

describe('WebSocket Contract: robot:sensor-data', () => {
  let httpServer: HttpServer;
  let ioServer: SocketIOServer;
  let serverPort: number;
  let robotSocket: ClientSocket;
  let frontendSocket: ClientSocket;

  const testRobotId = '550e8400-e29b-41d4-a716-446655440000';

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
      // Robot → Backend: Forward sensor data to frontend
      socket.on('robot:sensor-data', (data) => {
        // Broadcast to subscribed frontend clients
        ioServer.emit('frontend:sensor-data', data);
      });

      // Frontend → Backend: Subscribe to streams
      socket.on('subscribe', (data) => {
        socket.emit('subscribed', { streams: data.streams, robotId: data.robotId });
      });
    });

    // Start server
    httpServer.listen(0, () => {
      serverPort = (httpServer.address() as AddressInfo).port;
      done();
    });
  });

  afterAll((done) => {
    ioServer.close();
    httpServer.close(done);
  });

  beforeEach(() => {
    // Create fresh sockets for each test
    robotSocket = ioClient(`http://localhost:${serverPort}`, {
      query: { apiKey: 'test-api-key', robotId: testRobotId },
      transports: ['websocket'],
    });

    frontendSocket = ioClient(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
    });
  });

  afterEach(() => {
    // Disconnect sockets after each test
    if (robotSocket?.connected) robotSocket.disconnect();
    if (frontendSocket?.connected) frontendSocket.disconnect();
  });

  it('should accept valid sensor data payload with all sensors', (done) => {
    const validPayload = {
      robotId: testRobotId,
      timestamp: new Date().toISOString(),
      lidarScan: {
        scanId: 12345,
        points: [
          { angle: 0.0, distance: 2.5 },
          { angle: 1.0, distance: 2.3 },
          { angle: 2.0, distance: 2.1 },
        ],
      },
      imuData: {
        acceleration: { x: 0.1, y: 0.0, z: 9.8 },
        gyroscope: { x: 0.01, y: 0.0, z: 0.0 },
        magnetometer: { x: 0.3, y: 0.1, z: -0.4 },
      },
      encoders: {
        left: { ticks: 1250, velocity: 0.3 },
        right: { ticks: 1260, velocity: 0.3 },
      },
      ultrasonic: 0.25,
      waterLevel: 65.0,
      batteryVoltage: 24.5,
    };

    frontendSocket.on('connect', () => {
      frontendSocket.emit('subscribe', {
        streams: ['sensor-data'],
        robotId: testRobotId,
      });

      frontendSocket.once('frontend:sensor-data', (data) => {
        expect(data.robotId).toBe(testRobotId);
        expect(data.lidarScan.scanId).toBe(12345);
        expect(Array.isArray(data.lidarScan.points)).toBe(true);
        expect(data.imuData.acceleration).toBeDefined();
        expect(data.imuData.gyroscope).toBeDefined();
        expect(data.imuData.magnetometer).toBeDefined();
        expect(data.encoders.left).toBeDefined();
        expect(data.encoders.right).toBeDefined();
        expect(typeof data.ultrasonic).toBe('number');
        expect(typeof data.waterLevel).toBe('number');
        expect(typeof data.batteryVoltage).toBe('number');
        done();
      });
    });

    robotSocket.on('connect', () => {
      robotSocket.emit('robot:sensor-data', validPayload);
    });
  });

  it('should validate LIDAR scan structure', (done) => {
    const payload = {
      robotId: testRobotId,
      timestamp: new Date().toISOString(),
      lidarScan: {
        scanId: 12345,
        points: [
          { angle: 0.0, distance: 2.5 },
          { angle: 1.5708, distance: 1.8 },
          { angle: 3.1416, distance: 2.2 },
        ],
      },
      imuData: {
        acceleration: { x: 0, y: 0, z: 9.8 },
        gyroscope: { x: 0, y: 0, z: 0 },
        magnetometer: { x: 0, y: 0, z: 0 },
      },
      encoders: {
        left: { ticks: 0, velocity: 0 },
        right: { ticks: 0, velocity: 0 },
      },
      ultrasonic: 0.5,
      waterLevel: 50.0,
      batteryVoltage: 24.0,
    };

    frontendSocket.on('connect', () => {
      frontendSocket.once('frontend:sensor-data', (data) => {
        expect(data.lidarScan).toBeDefined();
        expect(typeof data.lidarScan.scanId).toBe('number');
        expect(Array.isArray(data.lidarScan.points)).toBe(true);
        
        data.lidarScan.points.forEach((point: any) => {
          expect(point).toHaveProperty('angle');
          expect(point).toHaveProperty('distance');
          expect(typeof point.angle).toBe('number');
          expect(typeof point.distance).toBe('number');
        });
        
        done();
      });
    });

    robotSocket.on('connect', () => {
      robotSocket.emit('robot:sensor-data', payload);
    });
  });

  it('should validate IMU data structure', (done) => {
    const payload = {
      robotId: testRobotId,
      timestamp: new Date().toISOString(),
      lidarScan: {
        scanId: 1,
        points: [],
      },
      imuData: {
        acceleration: { x: 0.1, y: 0.05, z: 9.81 },
        gyroscope: { x: 0.001, y: -0.002, z: 0.003 },
        magnetometer: { x: 0.3, y: 0.15, z: -0.45 },
      },
      encoders: {
        left: { ticks: 0, velocity: 0 },
        right: { ticks: 0, velocity: 0 },
      },
      ultrasonic: 0.3,
      waterLevel: 75.0,
      batteryVoltage: 25.2,
    };

    frontendSocket.on('connect', () => {
      frontendSocket.once('frontend:sensor-data', (data) => {
        expect(data.imuData).toBeDefined();
        
        // Validate acceleration
        expect(data.imuData.acceleration).toHaveProperty('x');
        expect(data.imuData.acceleration).toHaveProperty('y');
        expect(data.imuData.acceleration).toHaveProperty('z');
        expect(typeof data.imuData.acceleration.x).toBe('number');
        expect(typeof data.imuData.acceleration.y).toBe('number');
        expect(typeof data.imuData.acceleration.z).toBe('number');
        
        // Validate gyroscope
        expect(data.imuData.gyroscope).toHaveProperty('x');
        expect(data.imuData.gyroscope).toHaveProperty('y');
        expect(data.imuData.gyroscope).toHaveProperty('z');
        
        // Validate magnetometer
        expect(data.imuData.magnetometer).toHaveProperty('x');
        expect(data.imuData.magnetometer).toHaveProperty('y');
        expect(data.imuData.magnetometer).toHaveProperty('z');
        
        done();
      });
    });

    robotSocket.on('connect', () => {
      robotSocket.emit('robot:sensor-data', payload);
    });
  });

  it('should validate encoder data structure', (done) => {
    const payload = {
      robotId: testRobotId,
      timestamp: new Date().toISOString(),
      lidarScan: {
        scanId: 1,
        points: [],
      },
      imuData: {
        acceleration: { x: 0, y: 0, z: 9.8 },
        gyroscope: { x: 0, y: 0, z: 0 },
        magnetometer: { x: 0, y: 0, z: 0 },
      },
      encoders: {
        left: { ticks: 1250, velocity: 0.35 },
        right: { ticks: 1260, velocity: 0.33 },
      },
      ultrasonic: 0.4,
      waterLevel: 60.0,
      batteryVoltage: 24.8,
    };

    frontendSocket.on('connect', () => {
      frontendSocket.once('frontend:sensor-data', (data) => {
        expect(data.encoders).toBeDefined();
        
        // Validate left encoder
        expect(data.encoders.left).toHaveProperty('ticks');
        expect(data.encoders.left).toHaveProperty('velocity');
        expect(typeof data.encoders.left.ticks).toBe('number');
        expect(typeof data.encoders.left.velocity).toBe('number');
        
        // Validate right encoder
        expect(data.encoders.right).toHaveProperty('ticks');
        expect(data.encoders.right).toHaveProperty('velocity');
        expect(typeof data.encoders.right.ticks).toBe('number');
        expect(typeof data.encoders.right.velocity).toBe('number');
        
        done();
      });
    });

    robotSocket.on('connect', () => {
      robotSocket.emit('robot:sensor-data', payload);
    });
  });

  it('should include valid timestamp in ISO 8601 format', (done) => {
    const timestamp = new Date().toISOString();
    const payload = {
      robotId: testRobotId,
      timestamp,
      lidarScan: { scanId: 1, points: [] },
      imuData: {
        acceleration: { x: 0, y: 0, z: 9.8 },
        gyroscope: { x: 0, y: 0, z: 0 },
        magnetometer: { x: 0, y: 0, z: 0 },
      },
      encoders: {
        left: { ticks: 0, velocity: 0 },
        right: { ticks: 0, velocity: 0 },
      },
      ultrasonic: 0.5,
      waterLevel: 50.0,
      batteryVoltage: 24.0,
    };

    frontendSocket.on('connect', () => {
      frontendSocket.once('frontend:sensor-data', (data) => {
        expect(data.timestamp).toBe(timestamp);
        expect(() => new Date(data.timestamp)).not.toThrow();
        expect(new Date(data.timestamp).toISOString()).toBe(timestamp);
        done();
      });
    });

    robotSocket.on('connect', () => {
      robotSocket.emit('robot:sensor-data', payload);
    });
  });

  it('should validate required scalar sensor fields', (done) => {
    const payload = {
      robotId: testRobotId,
      timestamp: new Date().toISOString(),
      lidarScan: { scanId: 1, points: [] },
      imuData: {
        acceleration: { x: 0, y: 0, z: 9.8 },
        gyroscope: { x: 0, y: 0, z: 0 },
        magnetometer: { x: 0, y: 0, z: 0 },
      },
      encoders: {
        left: { ticks: 0, velocity: 0 },
        right: { ticks: 0, velocity: 0 },
      },
      ultrasonic: 0.25,
      waterLevel: 65.0,
      batteryVoltage: 24.5,
    };

    frontendSocket.on('connect', () => {
      frontendSocket.once('frontend:sensor-data', (data) => {
        // Validate ultrasonic
        expect(data).toHaveProperty('ultrasonic');
        expect(typeof data.ultrasonic).toBe('number');
        expect(data.ultrasonic).toBeGreaterThanOrEqual(0);
        
        // Validate waterLevel
        expect(data).toHaveProperty('waterLevel');
        expect(typeof data.waterLevel).toBe('number');
        expect(data.waterLevel).toBeGreaterThanOrEqual(0);
        expect(data.waterLevel).toBeLessThanOrEqual(100);
        
        // Validate batteryVoltage
        expect(data).toHaveProperty('batteryVoltage');
        expect(typeof data.batteryVoltage).toBe('number');
        expect(data.batteryVoltage).toBeGreaterThan(0);
        
        done();
      });
    });

    robotSocket.on('connect', () => {
      robotSocket.emit('robot:sensor-data', payload);
    });
  });
});
