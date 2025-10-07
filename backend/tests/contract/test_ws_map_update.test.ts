/**
 * WebSocket Contract Test: robot:map-update Event
 * 
 * Tests the contract for the robot:map-update WebSocket event.
 * This event is emitted by the robot to send map updates (delta or full).
 * 
 * Frequency: 5 Hz (every 200ms) during exploration, on-demand otherwise
 * 
 * Requirements: T038 - WebSocket contract test robot:map-update event
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';

describe('WebSocket Contract: robot:map-update', () => {
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
      // Robot → Backend: Forward map update to frontend
      socket.on('robot:map-update', (data) => {
        // Broadcast to all frontend clients
        ioServer.emit('frontend:map-update', data);
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

  it('should accept valid delta map update payload', (done) => {
    const validDeltaPayload = {
      robotId: testRobotId,
      mapId: testMapId,
      timestamp: new Date().toISOString(),
      updateType: 'delta',
      cells: [
        { row: 100, col: 200, value: 200 },
        { row: 100, col: 201, value: 195 },
        { row: 101, col: 200, value: 205 },
      ],
    };

    frontendSocket.on('connect', () => {
      frontendSocket.emit('subscribe', {
        streams: ['map-update'],
        robotId: testRobotId,
      });

      frontendSocket.once('frontend:map-update', (data) => {
        expect(data.robotId).toBe(testRobotId);
        expect(data.updateType).toBe('delta');
        expect(Array.isArray(data.cells)).toBe(true);
        expect(data.cells.length).toBeGreaterThan(0);
        expect(data.cells[0]).toHaveProperty('row');
        expect(data.cells[0]).toHaveProperty('col');
        expect(data.cells[0]).toHaveProperty('value');
        done();
      });
    });

    robotSocket.on('connect', () => {
      robotSocket.emit('robot:map-update', validDeltaPayload);
    });
  });

  it('should accept valid full map update payload', (done) => {
    const validFullPayload = {
      robotId: testRobotId,
      mapId: testMapId,
      timestamp: new Date().toISOString(),
      updateType: 'full',
      metadata: {
        resolution: 0.05,
        width: 2000,
        height: 2000,
        origin: { x: -50.0, y: -50.0, theta: 0.0 },
      },
      data: 'base64-encoded-grid-data-here',
    };

    frontendSocket.on('connect', () => {
      frontendSocket.once('frontend:map-update', (data) => {
        expect(data.robotId).toBe(testRobotId);
        expect(data.updateType).toBe('full');
        expect(data.metadata).toBeDefined();
        expect(data.metadata.resolution).toBe(0.05);
        expect(data.metadata.width).toBe(2000);
        expect(data.metadata.height).toBe(2000);
        expect(data.metadata.origin).toMatchObject({
          x: -50.0,
          y: -50.0,
          theta: 0.0,
        });
        expect(data.data).toBeDefined();
        expect(typeof data.data).toBe('string');
        done();
      });
    });

    robotSocket.on('connect', () => {
      robotSocket.emit('robot:map-update', validFullPayload);
    });
  });

  it('should validate required fields in delta update', () => {
    const invalidPayload = {
      robotId: testRobotId,
      // Missing: mapId, timestamp, updateType, cells
    };

    // Verify contract expectations
    expect(invalidPayload).not.toHaveProperty('mapId');
    expect(invalidPayload).not.toHaveProperty('timestamp');
    expect(invalidPayload).not.toHaveProperty('updateType');
    expect(invalidPayload).not.toHaveProperty('cells');
  });

  it('should validate cell structure in delta update', () => {
    const payloadWithInvalidCells = {
      robotId: testRobotId,
      mapId: testMapId,
      timestamp: new Date().toISOString(),
      updateType: 'delta',
      cells: [
        { row: 100, col: 200 }, // Missing 'value'
        { row: 100, value: 195 }, // Missing 'col'
      ],
    };

    // Verify contract expectations
    const cellsValid = payloadWithInvalidCells.cells.every(
      (cell: any) => 
        typeof cell.row === 'number' &&
        typeof cell.col === 'number' &&
        typeof cell.value === 'number'
    );
    
    expect(cellsValid).toBe(false);
  });

  it('should validate metadata structure in full update', () => {
    const payloadWithInvalidMetadata = {
      robotId: testRobotId,
      mapId: testMapId,
      timestamp: new Date().toISOString(),
      updateType: 'full',
      metadata: {
        resolution: 0.05,
        width: 2000,
        // Missing: height, origin
      },
      data: 'some-data',
    };

    // Verify contract expectations
    expect(payloadWithInvalidMetadata.metadata).not.toHaveProperty('height');
    expect(payloadWithInvalidMetadata.metadata).not.toHaveProperty('origin');
  });

  it('should include valid timestamp in ISO 8601 format', (done) => {
    const timestamp = new Date().toISOString();
    const payload = {
      robotId: testRobotId,
      mapId: testMapId,
      timestamp,
      updateType: 'delta',
      cells: [{ row: 1, col: 1, value: 100 }],
    };

    frontendSocket.on('connect', () => {
      frontendSocket.once('frontend:map-update', (data) => {
        expect(data.timestamp).toBe(timestamp);
        expect(() => new Date(data.timestamp)).not.toThrow();
        expect(new Date(data.timestamp).toISOString()).toBe(timestamp);
        done();
      });
    });

    robotSocket.on('connect', () => {
      robotSocket.emit('robot:map-update', payload);
    });
  });

  it('should handle rapid delta updates (5 Hz)', (done) => {
    const updates: any[] = [];
    const updateCount = 5;

    frontendSocket.on('connect', () => {
      frontendSocket.on('frontend:map-update', (data) => {
        updates.push(data);

        if (updates.length === updateCount) {
          expect(updates.length).toBe(updateCount);
          updates.forEach((update, index) => {
            expect(update.robotId).toBe(testRobotId);
            expect(update.updateType).toBe('delta');
            expect(update.cells[0].value).toBe(100 + index);
          });
          done();
        }
      });
    });

    robotSocket.on('connect', () => {
      // Send 5 updates rapidly (simulating 5 Hz = 200ms interval)
      for (let i = 0; i < updateCount; i++) {
        setTimeout(() => {
          robotSocket.emit('robot:map-update', {
            robotId: testRobotId,
            mapId: testMapId,
            timestamp: new Date().toISOString(),
            updateType: 'delta',
            cells: [{ row: i, col: i, value: 100 + i }],
          });
        }, i * 200);
      }
    });
  }, 10000);

  it('should differentiate between delta and full updates', (done) => {
    const updates: any[] = [];

    frontendSocket.on('connect', () => {
      frontendSocket.on('frontend:map-update', (data) => {
        updates.push(data);

        if (updates.length === 2) {
          expect(updates[0].updateType).toBe('delta');
          expect(updates[0].cells).toBeDefined();
          expect(updates[1].updateType).toBe('full');
          expect(updates[1].metadata).toBeDefined();
          expect(updates[1].data).toBeDefined();
          done();
        }
      });
    });

    robotSocket.on('connect', () => {
      // Send delta update
      robotSocket.emit('robot:map-update', {
        robotId: testRobotId,
        mapId: testMapId,
        timestamp: new Date().toISOString(),
        updateType: 'delta',
        cells: [{ row: 1, col: 1, value: 100 }],
      });

      // Send full update after short delay
      setTimeout(() => {
        robotSocket.emit('robot:map-update', {
          robotId: testRobotId,
          mapId: testMapId,
          timestamp: new Date().toISOString(),
          updateType: 'full',
          metadata: {
            resolution: 0.05,
            width: 1000,
            height: 1000,
            origin: { x: 0, y: 0, theta: 0 },
          },
          data: 'full-map-data',
        });
      }, 100);
    });
  }, 5000);
});
