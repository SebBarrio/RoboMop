/**
 * Contract Test: GET /api/v1/maps/{mapId}/zones
 * Validates restricted zones list endpoint
 * Status: EXPECTED TO FAIL until T055-T066 are implemented
 */

import request from 'supertest';
import { describe, it, expect, beforeEach } from '@jest/globals';
import { app } from '../../src/server';
import { createTestMap, createTestZone } from '../helpers/testData';

describe('GET /api/v1/maps/{mapId}/zones', () => {
  let testMapId: string = '';

  beforeEach(async () => {
    const map = await createTestMap();
    testMapId = map.id;
  });

  it('should return 200 with array of zones', async () => {
    expect(app).toBeDefined();

    await createTestZone({ mapId: testMapId });

    const response = await request(app)
      .get(`/api/v1/maps/${testMapId}/zones`)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });

  it('should return empty array when no zones exist', async () => {
    const response = await request(app)
      .get(`/api/v1/maps/${testMapId}/zones`)
      .expect(200);

    expect(response.body).toEqual([]);
  });

  it('should return zones with correct schema', async () => {
    await createTestZone({ mapId: testMapId });

    const response = await request(app)
      .get(`/api/v1/maps/${testMapId}/zones`)
      .expect(200);

    if (response.body.length > 0) {
      const zone = response.body[0];

      // Validate against OpenAPI schema
      expect(zone).toHaveProperty('id');
      expect(zone).toHaveProperty('mapId', testMapId);
      expect(zone).toHaveProperty('geometry');
      expect(zone).toHaveProperty('createdAt');
      expect(zone).toHaveProperty('updatedAt');

      // Validate geometry
      expect(zone.geometry).toHaveProperty('type', 'Polygon');
      expect(zone.geometry).toHaveProperty('coordinates');
      expect(Array.isArray(zone.geometry.coordinates)).toBe(true);
      expect(zone.geometry.coordinates.length).toBeGreaterThanOrEqual(1);

      // Validate polygon has at least 4 points (triangle + closing point)
      const ring = zone.geometry.coordinates[0];
      expect(Array.isArray(ring)).toBe(true);
      expect(ring.length).toBeGreaterThanOrEqual(4);

      // Validate points have x and y coordinates
      ring.forEach((point: any) => {
        expect(point).toHaveProperty('x');
        expect(point).toHaveProperty('y');
        expect(typeof point.x).toBe('number');
        expect(typeof point.y).toBe('number');
      });

      // Validate polygon is closed (first and last points match)
      expect(ring[0].x).toBe(ring[ring.length - 1].x);
      expect(ring[0].y).toBe(ring[ring.length - 1].y);
    }
  });

  it('should return 404 for non-existent mapId', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    const response = await request(app)
      .get(`/api/v1/maps/${nonExistentId}/zones`)
      .expect(404);

    expect(response.body).toHaveProperty('error');
    expect(response.body.statusCode).toBe(404);
  });

  it('should return 400 for invalid UUID format', async () => {
    const invalidId = 'not-a-uuid';

    const response = await request(app)
      .get(`/api/v1/maps/${invalidId}/zones`)
      .expect(400);

    expect(response.body.message).toMatch(/invalid|uuid/i);
  });

  it('should return 500 on database error', async () => {
    // TODO: Simulate database error
    // This tests error handling middleware (T115)
  });
});

