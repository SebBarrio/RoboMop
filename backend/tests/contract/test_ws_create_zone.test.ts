/**
 * Contract Test: ui:create-zone WebSocket event
 * Validates zone creation via WebSocket
 * Tests T074 implementation
 */

import { io as ioClient, Socket } from 'socket.io-client';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { app, httpServer, initializeWebSocketHandlers } from '../../src/server';
import { AppDataSource } from '../../src/config/database';

describe('WebSocket: ui:create-zone', () => {
  let frontendSocket: Socket;
  let testRobotId: string = '';
  let testMapId: string = '';
  const serverUrl = 'http://localhost:3005';

  beforeAll(async () => {
    // Initialize WebSocket handlers
    initializeWebSocketHandlers();

    await new Promise<void>((resolve) => {
      httpServer.listen(3005, () => resolve());
    });

    // Create test robot
    const robotResponse = await request(app)
      .post('/api/v1/robots')
      .send({
        name: 'Test Robot Zone',
        serialNumber: 'TEST-ZONE-001',
        modelVersion: '1.0.0',
        firmwareVersion: '1.0.0',
      })
      .expect(201);

    testRobotId = robotResponse.body.id;

    // Create test map
    const mapResponse = await request(app)
      .post('/api/v1/maps')
      .send({
        robotId: testRobotId,
        name: 'Test Map',
        resolution: 0.05,
        width: 1000,
        height: 1000,
        origin: { x: -25, y: -25, theta: 0 },
      })
      .expect(201);

    testMapId = mapResponse.body.id;
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
    frontendSocket = ioClient(serverUrl, {
      transports: ['websocket'],
    });
    frontendSocket.on('connect', () => done());
  });

  afterEach(() => {
    if (frontendSocket.connected) {
      frontendSocket.disconnect();
    }
  });

  it('should create zone via WebSocket', (done) => {
    const zoneData = {
      mapId: testMapId,
      zone: {
        name: 'Storage Room',
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[
            { x: 1.0, y: 1.0 },
            { x: 2.0, y: 1.0 },
            { x: 2.0, y: 2.0 },
            { x: 1.0, y: 2.0 },
            { x: 1.0, y: 1.0 },
          ]],
        },
      },
    };

    frontendSocket.on('ui:zone-created', (response) => {
      expect(response.zone).toBeDefined();
      expect(response.zone.id).toBeDefined();
      expect(response.zone.name).toBe('Storage Room');
      expect(response.zone.mapId).toBe(testMapId);
      done();
    });

    frontendSocket.emit('ui:create-zone', zoneData);
  });

  it('should broadcast zone creation to all frontend clients', (done) => {
    // Create second frontend client
    const secondSocket = ioClient(serverUrl, {
      transports: ['websocket'],
    });

    secondSocket.on('connect', () => {
      const zoneData = {
        mapId: testMapId,
        zone: {
          name: 'Kitchen Area',
          geometry: {
            type: 'Polygon' as const,
            coordinates: [[
              { x: 5.0, y: 5.0 },
              { x: 7.0, y: 5.0 },
              { x: 7.0, y: 7.0 },
              { x: 5.0, y: 7.0 },
              { x: 5.0, y: 5.0 },
            ]],
          },
        },
      };

      // Second socket listens for broadcast
      secondSocket.on('frontend:zone-updated', (data) => {
        expect(data.event).toBe('CREATED');
        expect(data.zone.name).toBe('Kitchen Area');
        
        secondSocket.disconnect();
        done();
      });

      // First socket creates zone
      setTimeout(() => {
        frontendSocket.emit('ui:create-zone', zoneData);
      }, 100);
    });
  });

  it('should validate polygon geometry', (done) => {
    const invalidZone = {
      mapId: testMapId,
      zone: {
        name: 'Invalid Zone',
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            // Missing closing point and minimum vertices
          ]],
        },
      },
    };

    frontendSocket.on('error', (error) => {
      expect(error.code).toBe('ZONE_CREATE_ERROR');
      done();
    });

    frontendSocket.emit('ui:create-zone', invalidZone);
  });

  it('should support zone without name', (done) => {
    const zoneData = {
      mapId: testMapId,
      zone: {
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[
            { x: 3.0, y: 3.0 },
            { x: 4.0, y: 3.0 },
            { x: 4.0, y: 4.0 },
            { x: 3.0, y: 4.0 },
            { x: 3.0, y: 3.0 },
          ]],
        },
      },
    };

    frontendSocket.on('ui:zone-created', (response) => {
      expect(response.zone).toBeDefined();
      expect(response.zone.id).toBeDefined();
      done();
    });

    frontendSocket.emit('ui:create-zone', zoneData);
  });

  it('should update zone via WebSocket', (done) => {
    // First create a zone
    const createData = {
      mapId: testMapId,
      zone: {
        name: 'Original Name',
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[
            { x: 8.0, y: 8.0 },
            { x: 9.0, y: 8.0 },
            { x: 9.0, y: 9.0 },
            { x: 8.0, y: 9.0 },
            { x: 8.0, y: 8.0 },
          ]],
        },
      },
    };

    frontendSocket.on('ui:zone-created', (response) => {
      const zoneId = response.zone.id;

      // Now update it
      frontendSocket.emit('ui:update-zone', {
        zoneId,
        updates: { name: 'Updated Name' },
      });

      frontendSocket.on('ui:zone-updated', (updateResponse) => {
        expect(updateResponse.zone.name).toBe('Updated Name');
        done();
      });
    });

    frontendSocket.emit('ui:create-zone', createData);
  });

  it('should delete zone via WebSocket', (done) => {
    // First create a zone
    const createData = {
      mapId: testMapId,
      zone: {
        name: 'To Be Deleted',
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[
            { x: 10.0, y: 10.0 },
            { x: 11.0, y: 10.0 },
            { x: 11.0, y: 11.0 },
            { x: 10.0, y: 11.0 },
            { x: 10.0, y: 10.0 },
          ]],
        },
      },
    };

    frontendSocket.on('ui:zone-created', (response) => {
      const zoneId = response.zone.id;

      // Now delete it
      frontendSocket.emit('ui:delete-zone', { zoneId });

      frontendSocket.on('ui:zone-deleted', (deleteResponse) => {
        expect(deleteResponse.zoneId).toBe(zoneId);
        done();
      });
    });

    frontendSocket.emit('ui:create-zone', createData);
  });
});
