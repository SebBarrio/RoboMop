/**
 * Contract Test: PATCH /api/v1/maps/{mapId}/data
 * Validates map grid data delta update endpoint
 * Status: EXPECTED TO FAIL until T055-T066 are implemented
 */

import request from 'supertest';
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import { app as expressApp } from '../../src/server';
import { createTestMap } from '../helpers/testData';
import { MapService } from '../../src/services/MapService';

describe('PATCH /api/v1/maps/{mapId}/data', () => {
  let app: Express.Application;
  let testMapId: string;

  beforeAll(() => {
    app = expressApp;
  });

  beforeEach(async () => {
    const map = await createTestMap({ width: 100, height: 100 });
    const mapService = new MapService();
    await mapService.updateData(map.id, Buffer.alloc(map.width * map.height, 0));
    testMapId = map.id;
  });

  it('should update specific cells and return 200', async () => {
    expect(app).toBeDefined();

    const updateData = {
      cells: [
        { row: 10, col: 10, value: 255 }, // Occupied
        { row: 10, col: 11, value: 255 },
        { row: 11, col: 10, value: 1 },   // Free
        { row: 11, col: 11, value: 1 },
      ],
    };

    await request(app)
      .patch(`/api/v1/maps/${testMapId}/data`)
      .send(updateData)
      .expect(200);
  });

  it('should handle large batch of cell updates', async () => {
    // Generate 1000 cell updates
    const cells = [];
    for (let i = 0; i < 1000; i++) {
      cells.push({
        row: Math.floor(i / 100),
        col: i % 100,
        value: Math.floor(Math.random() * 256),
      });
    }

    await request(app)
      .patch(`/api/v1/maps/${testMapId}/data`)
      .send({ cells })
      .expect(200);
  });

  it('should return 400 for missing cells array', async () => {
    const invalidData = {};

    const response = await request(app)
      .patch(`/api/v1/maps/${testMapId}/data`)
      .send(invalidData)
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.message).toMatch(/cells|required/i);
  });

  it('should return 400 for invalid cell value', async () => {
    const invalidData = {
      cells: [
        { row: 10, col: 10, value: 300 }, // Exceeds maximum of 255
      ],
    };

    const response = await request(app)
      .patch(`/api/v1/maps/${testMapId}/data`)
      .send(invalidData)
      .expect(400);

    expect(response.body.message).toMatch(/value|range/i);
  });

  it('should return 400 for negative cell value', async () => {
    const invalidData = {
      cells: [
        { row: 10, col: 10, value: -10 }, // Below minimum of 0
      ],
    };

    const response = await request(app)
      .patch(`/api/v1/maps/${testMapId}/data`)
      .send(invalidData)
      .expect(400);

    expect(response.body.message).toMatch(/value|range/i);
  });

  it('should return 400 for cell coordinates out of bounds', async () => {
    const invalidData = {
      cells: [
        { row: 200, col: 10, value: 128 }, // Row exceeds map height
      ],
    };

    const response = await request(app)
      .patch(`/api/v1/maps/${testMapId}/data`)
      .send(invalidData)
      .expect(400);

    expect(response.body.message).toMatch(/row|col|bounds/i);
  });

  it('should return 400 for missing cell properties', async () => {
    const invalidData = {
      cells: [
        { row: 10, col: 10 }, // Missing value
      ],
    };

    const response = await request(app)
      .patch(`/api/v1/maps/${testMapId}/data`)
      .send(invalidData)
      .expect(400);

    expect(response.body.message).toMatch(/value|required/i);
  });

  it('should return 404 for non-existent mapId', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    const response = await request(app)
      .patch(`/api/v1/maps/${nonExistentId}/data`)
      .send({ cells: [{ row: 0, col: 0, value: 128 }] })
      .expect(404);

    expect(response.body.statusCode).toBe(404);
  });

  it('should return 400 for invalid UUID format', async () => {
    const invalidId = 'not-a-uuid';

    const response = await request(app)
      .patch(`/api/v1/maps/${invalidId}/data`)
      .send({ cells: [{ row: 0, col: 0, value: 128 }] })
      .expect(400);

    expect(response.body.message).toMatch(/invalid|uuid/i);
  });
});

