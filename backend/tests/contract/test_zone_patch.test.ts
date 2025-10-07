/**
 * Contract Test: PATCH /api/v1/zones/{zoneId}
 * Validates zone update endpoint
 * Status: EXPECTED TO FAIL until T055-T066 are implemented
 */

import request from 'supertest';
import { describe, it, expect, beforeEach } from '@jest/globals';
import { app } from '../../src/server';
import { createTestZone } from '../helpers/testData';

describe('PATCH /api/v1/zones/{zoneId}', () => {
  let testZoneId: string = '';

  beforeEach(async () => {
    const zone = await createTestZone();
    testZoneId = zone.id;
  });

  it('should update zone name and return 200', async () => {
    expect(app).toBeDefined();

    const updateData = {
      name: 'Updated Zone Name',
    };

    const response = await request(app)
      .patch(`/api/v1/zones/${testZoneId}`)
      .send(updateData)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('id', testZoneId);
    expect(response.body.name).toBe(updateData.name);
  });

  it('should update zone geometry and return 200', async () => {
    const updateData = {
      geometry: {
        type: 'Polygon',
        coordinates: [[
          { x: 10.0, y: 10.0 },
          { x: 12.0, y: 10.0 },
          { x: 12.0, y: 12.0 },
          { x: 10.0, y: 12.0 },
          { x: 10.0, y: 10.0 },
        ]],
      },
    };

    const response = await request(app)
      .patch(`/api/v1/zones/${testZoneId}`)
      .send(updateData)
      .expect(200);

    expect(response.body.geometry).toMatchObject(updateData.geometry);
  });

  it('should return 400 for invalid geometry', async () => {
    const invalidData = {
      geometry: {
        type: 'Polygon',
        coordinates: [[
          { x: 10.0, y: 10.0 },
          { x: 12.0, y: 10.0 },
          // Too few points
        ]],
      },
    };

    const response = await request(app)
      .patch(`/api/v1/zones/${testZoneId}`)
      .send(invalidData)
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });

  it('should return 400 for name exceeding 100 characters', async () => {
    const invalidData = {
      name: 'A'.repeat(101),
    };

    const response = await request(app)
      .patch(`/api/v1/zones/${testZoneId}`)
      .send(invalidData)
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });

  it('should return 404 for non-existent zoneId', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    const response = await request(app)
      .patch(`/api/v1/zones/${nonExistentId}`)
      .send({ name: 'Test' })
      .expect(404);

    expect(response.body.statusCode).toBe(404);
  });

  it('should return 400 for invalid UUID format', async () => {
    const invalidId = 'not-a-uuid';

    const response = await request(app)
      .patch(`/api/v1/zones/${invalidId}`)
      .send({ name: 'Test' })
      .expect(400);

    expect(response.body.message).toMatch(/invalid|uuid/i);
  });
});

