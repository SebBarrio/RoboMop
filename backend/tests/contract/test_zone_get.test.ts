/**
 * Contract Test: GET /api/v1/zones/{zoneId}
 * Validates zone details retrieval endpoint
 * Status: EXPECTED TO FAIL until T055-T066 are implemented
 */

import request from 'supertest';
import { describe, it, expect, beforeEach } from '@jest/globals';
import { app } from '../../src/server';
import { createTestZone } from '../helpers/testData';

describe('GET /api/v1/zones/{zoneId}', () => {
  let testZoneId: string = '';

  beforeEach(async () => {
    const zone = await createTestZone();
    testZoneId = zone.id;
  });

  it('should return 200 with zone details', async () => {
    expect(app).toBeDefined();

    const response = await request(app)
      .get(`/api/v1/zones/${testZoneId}`)
      .expect('Content-Type', /json/)
      .expect(200);

    // Validate against OpenAPI schema
    expect(response.body).toHaveProperty('id', testZoneId);
    expect(response.body).toHaveProperty('mapId');
    expect(response.body).toHaveProperty('geometry');
    expect(response.body).toHaveProperty('createdAt');
    expect(response.body).toHaveProperty('updatedAt');

    // Validate geometry
    expect(response.body.geometry).toHaveProperty('type', 'Polygon');
    expect(response.body.geometry).toHaveProperty('coordinates');
    expect(Array.isArray(response.body.geometry.coordinates)).toBe(true);
  });

  it('should return 404 for non-existent zoneId', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    const response = await request(app)
      .get(`/api/v1/zones/${nonExistentId}`)
      .expect(404);

    expect(response.body).toHaveProperty('error');
    expect(response.body.statusCode).toBe(404);
  });

  it('should return 400 for invalid UUID format', async () => {
    const invalidId = 'not-a-uuid';

    const response = await request(app)
      .get(`/api/v1/zones/${invalidId}`)
      .expect(400);

    expect(response.body.message).toMatch(/invalid|uuid/i);
  });

  it('should return 500 on database error', async () => {
    // TODO: Simulate database error
    // This tests error handling middleware (T115)
  });
});

