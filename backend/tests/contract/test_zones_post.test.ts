/**
 * Contract Test: POST /api/v1/maps/{mapId}/zones
 * Validates restricted zone creation endpoint
 * Status: EXPECTED TO FAIL until T055-T066 are implemented
 */

import request from 'supertest';
import { describe, it, expect, beforeEach } from '@jest/globals';
import { app } from '../../src/server';
import { createTestMap } from '../helpers/testData';
import { MapService } from '../../src/services/MapService';

describe('POST /api/v1/maps/{mapId}/zones', () => {
  let testMapId: string = '';

  const validZoneData = {
    name: 'Storage Closet',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        { x: 5.0, y: 5.0 },
        { x: 7.0, y: 5.0 },
        { x: 7.0, y: 6.0 },
        { x: 5.0, y: 6.0 },
        { x: 5.0, y: 5.0 }, // Closed polygon
      ]],
    },
  };

  beforeAll(() => {
    app = expressApp;
  });

  beforeEach(async () => {
    const map = await createTestMap();
    testMapId = map.id;
  });

  it('should create zone with valid data and return 201', async () => {
    const mapService = new MapService();
    const map = await mapService.findById(testMapId);
    expect(map).toBeTruthy();

    expect(app).toBeDefined();

    const response = await request(app)
      .post(`/api/v1/maps/${testMapId}/zones`)
      .send(validZoneData)
      .expect('Content-Type', /json/)
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body.mapId).toBe(testMapId);
    expect(response.body.name).toBe(validZoneData.name);
    expect(response.body.geometry).toMatchObject(validZoneData.geometry);
  });

  it('should create zone without name', async () => {
    const dataWithoutName = {
      geometry: validZoneData.geometry,
    };

    const response = await request(app)
      .post(`/api/v1/maps/${testMapId}/zones`)
      .send(dataWithoutName)
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body.mapId).toBe(testMapId);
  });

  it('should return 400 for missing geometry', async () => {
    const invalidData = {
      name: 'Test Zone',
      // Missing geometry
    };

    const response = await request(app)
      .post(`/api/v1/maps/${testMapId}/zones`)
      .send(invalidData)
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.message).toMatch(/geometry|required/i);
  });

  it('should return 400 for polygon with less than 4 points', async () => {
    const invalidData = {
      geometry: {
        type: 'Polygon',
        coordinates: [[
          { x: 5.0, y: 5.0 },
          { x: 7.0, y: 5.0 },
          { x: 5.0, y: 5.0 }, // Only 3 points (not enough for a polygon)
        ]],
      },
    };

    const response = await request(app)
      .post(`/api/v1/maps/${testMapId}/zones`)
      .send(invalidData)
      .expect(400);

    expect(response.body.message).toMatch(/polygon|points/i);
  });

  it('should return 400 for non-closed polygon', async () => {
    const invalidData = {
      geometry: {
        type: 'Polygon',
        coordinates: [[
          { x: 5.0, y: 5.0 },
          { x: 7.0, y: 5.0 },
          { x: 7.0, y: 6.0 },
          { x: 5.0, y: 6.0 },
          // Missing closing point (should be same as first)
        ]],
      },
    };

    const response = await request(app)
      .post(`/api/v1/maps/${testMapId}/zones`)
      .send(invalidData)
      .expect(400);

    expect(response.body.message).toMatch(/closed|polygon/i);
  });

  it('should return 400 for invalid geometry type', async () => {
    const invalidData = {
      geometry: {
        type: 'Point', // Only Polygon is supported
        coordinates: [[{ x: 5.0, y: 5.0 }]],
      },
    };

    const response = await request(app)
      .post(`/api/v1/maps/${testMapId}/zones`)
      .send(invalidData)
      .expect(400);

    expect(response.body.message).toMatch(/type|polygon/i);
  });

  it('should return 400 for name exceeding 100 characters', async () => {
    const invalidData = {
      ...validZoneData,
      name: 'A'.repeat(101),
    };

    const response = await request(app)
      .post(`/api/v1/maps/${testMapId}/zones`)
      .send(invalidData)
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });

  it('should return 404 for non-existent mapId', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    const response = await request(app)
      .post(`/api/v1/maps/${nonExistentId}/zones`)
      .send(validZoneData)
      .expect(404);

    expect(response.body.statusCode).toBe(404);
  });

  it('should return 400 for invalid UUID format', async () => {
    const invalidId = 'not-a-uuid';

    const response = await request(app)
      .post(`/api/v1/maps/${invalidId}/zones`)
      .send(validZoneData)
      .expect(400);

    expect(response.body.message).toMatch(/invalid|uuid/i);
  });
});

