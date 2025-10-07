/**
 * Contract Test: GET /api/v1/maps/{mapId}
 * Validates map retrieval endpoint
 * Status: EXPECTED TO FAIL until T057, T062, T067 are implemented
 */

import request from 'supertest';
import { describe, it, expect, beforeEach } from '@jest/globals';
import { app } from '../../src/server';
import { createTestMap } from '../helpers/testData';

describe('GET /api/v1/maps/{mapId}', () => {
  let testMapId: string = '';

  beforeEach(async () => {
    const map = await createTestMap();
    testMapId = map.id;
  });

  it('should return 200 with map metadata', async () => {
    const response = await request(app)
      .get(`/api/v1/maps/${testMapId}`)
      .expect('Content-Type', /json/)
      .expect(200);

    // Validate schema per OpenAPI spec
    expect(response.body).toHaveProperty('id');
    expect(response.body).toHaveProperty('robotId');
    expect(response.body).toHaveProperty('resolution');
    expect(response.body).toHaveProperty('width');
    expect(response.body).toHaveProperty('height');
    expect(response.body).toHaveProperty('origin');
    expect(response.body).toHaveProperty('completionPercentage');
    
    // Validate types
    expect(typeof response.body.resolution).toBe('number');
    expect(response.body.resolution).toBeGreaterThanOrEqual(0.01);
    expect(response.body.resolution).toBeLessThanOrEqual(0.1);
    
    expect(typeof response.body.completionPercentage).toBe('number');
    expect(response.body.completionPercentage).toBeGreaterThanOrEqual(0);
    expect(response.body.completionPercentage).toBeLessThanOrEqual(100);
  });

  it('should return 404 for non-existent map', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';
    
    const response = await request(app)
      .get(`/api/v1/maps/${nonExistentId}`)
      .expect('Content-Type', /json/)
      .expect(404);

    expect(response.body).toHaveProperty('error');
    expect(response.body.statusCode).toBe(404);
  });

  it('should return 400 for invalid UUID format', async () => {
    await request(app)
      .get('/api/v1/maps/invalid-uuid')
      .expect(400);
  });
});

