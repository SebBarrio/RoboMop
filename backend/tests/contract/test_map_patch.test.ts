/**
 * Contract Test: PATCH /api/v1/maps/{mapId}
 * Validates map update endpoint
 * Status: EXPECTED TO FAIL until T055-T066 are implemented
 */

import request from 'supertest';
import { describe, it, expect, beforeEach } from '@jest/globals';
import { app } from '../../src/server';
import { createTestMap } from '../helpers/testData';

describe('PATCH /api/v1/maps/{mapId}', () => {
  let testMapId: string = '';

  beforeEach(async () => {
    const map = await createTestMap();
    testMapId = map.id;
  });

  it('should update map name and return 200', async () => {
    expect(app).toBeDefined();

    const updateData = {
      name: 'Updated Map Name',
    };

    const response = await request(app)
      .patch(`/api/v1/maps/${testMapId}`)
      .send(updateData)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('id', testMapId);
    expect(response.body.name).toBe(updateData.name);
  });

  it('should update map metadata and return 200', async () => {
    const updateData = {
      metadata: {
        environment: 'office',
        totalArea: 150.5,
        notes: 'Test update',
      },
    };

    const response = await request(app)
      .patch(`/api/v1/maps/${testMapId}`)
      .send(updateData)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body.metadata).toMatchObject(updateData.metadata);
  });

  it('should update completionPercentage and return 200', async () => {
    const updateData = {
      completionPercentage: 75.5,
    };

    const response = await request(app)
      .patch(`/api/v1/maps/${testMapId}`)
      .send(updateData)
      .expect(200);

    expect(response.body.completionPercentage).toBe(updateData.completionPercentage);
  });

  it('should return 400 for completionPercentage out of range', async () => {
    const invalidData = {
      completionPercentage: 150, // Exceeds maximum of 100
    };

    const response = await request(app)
      .patch(`/api/v1/maps/${testMapId}`)
      .send(invalidData)
      .expect(400);

    expect(response.body.message).toMatch(/completionPercentage/i);
  });

  it('should return 400 for name exceeding 100 characters', async () => {
    const invalidData = {
      name: 'A'.repeat(101),
    };

    const response = await request(app)
      .patch(`/api/v1/maps/${testMapId}`)
      .send(invalidData)
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });

  it('should return 404 for non-existent mapId', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    const response = await request(app)
      .patch(`/api/v1/maps/${nonExistentId}`)
      .send({ name: 'Test' })
      .expect(404);

    expect(response.body).toHaveProperty('error');
    expect(response.body.statusCode).toBe(404);
  });

  it('should return 400 for invalid UUID format', async () => {
    const invalidId = 'not-a-uuid';

    const response = await request(app)
      .patch(`/api/v1/maps/${invalidId}`)
      .send({ name: 'Test' })
      .expect(400);

    expect(response.body.message).toMatch(/invalid|uuid/i);
  });
});

