/**
 * Contract Test: GET /api/v1/maps/{mapId}/data
 * Validates map grid data retrieval endpoint
 * Status: EXPECTED TO FAIL until T055-T066 are implemented
 */

import request from 'supertest';
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import { app as expressApp } from '../../src/server';
import { createTestMap } from '../helpers/testData';
import { MapService } from '../../src/services/MapService';

describe('GET /api/v1/maps/{mapId}/data', () => {
  let app: Express.Application;
  let testMapId: string;

  beforeAll(() => {
    app = expressApp;
  });

  beforeEach(async () => {
    const map = await createTestMap({ width: 100, height: 100 });
    const buffer = Buffer.alloc(map.width * map.height, 127);
    const mapService = new MapService();
    await mapService.updateData(map.id, buffer);
    testMapId = map.id;
  });

  it('should return 200 with binary map data', async () => {
    expect(app).toBeDefined();

    const response = await request(app)
      .get(`/api/v1/maps/${testMapId}/data`)
      .expect(200);

    // Accept either binary or JSON format
    expect(
      response.headers['content-type'] === 'application/octet-stream' ||
      response.headers['content-type'].includes('application/json')
    ).toBe(true);
  });

  it('should return map data in JSON format when requested', async () => {
    const response = await request(app)
      .get(`/api/v1/maps/${testMapId}/data`)
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(typeof response.body.data).toBe('string'); // Base64-encoded
  });

  it('should return binary data in octet-stream format when requested', async () => {
    const response = await request(app)
      .get(`/api/v1/maps/${testMapId}/data`)
      .set('Accept', 'application/octet-stream')
      .expect('Content-Type', /octet-stream/)
      .expect(200);

    expect(Buffer.isBuffer(response.body) || response.body instanceof ArrayBuffer).toBe(true);
  });

  it('should return 404 for non-existent mapId', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    const response = await request(app)
      .get(`/api/v1/maps/${nonExistentId}/data`)
      .expect(404);

    expect(response.body).toHaveProperty('error');
    expect(response.body.statusCode).toBe(404);
  });

  it('should return 400 for invalid UUID format', async () => {
    const invalidId = 'not-a-uuid';

    const response = await request(app)
      .get(`/api/v1/maps/${invalidId}/data`)
      .expect(400);

    expect(response.body.message).toMatch(/invalid|uuid/i);
  });

  it('should return 500 on database error', async () => {
    // TODO: Simulate database error
    // This tests error handling middleware (T115)
  });
});

