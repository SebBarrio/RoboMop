/**
 * Contract Test: PUT /api/v1/maps/{mapId}/data
 * Validates map grid data full replacement endpoint
 * Status: EXPECTED TO FAIL until T055-T066 are implemented
 */

import request from 'supertest';
import { describe, it, expect, beforeEach } from '@jest/globals';
import { app } from '../../src/server';
import { createTestMap } from '../helpers/testData';

describe('PUT /api/v1/maps/{mapId}/data', () => {
  let testMapId: string = '';

  beforeEach(async () => {
    const map = await createTestMap({ width: 100, height: 100 });
    testMapId = map.id;
  });

  it('should replace map data with binary and return 200', async () => {
    expect(app).toBeDefined();

    const gridSize = 100 * 100;
    const binaryData = Buffer.alloc(gridSize);
    // Fill with test data (0 = unknown)
    binaryData.fill(0);

    await request(app)
      .put(`/api/v1/maps/${testMapId}/data`)
      .set('Content-Type', 'application/octet-stream')
      .send(binaryData)
      .expect(200);
  });

  it('should replace map data with base64 JSON and return 200', async () => {
    const gridSize = 100 * 100;
    const binaryData = Buffer.alloc(gridSize);
    binaryData.fill(0);
    const base64Data = binaryData.toString('base64');

    await request(app)
      .put(`/api/v1/maps/${testMapId}/data`)
      .set('Content-Type', 'application/json')
      .send({ data: base64Data })
      .expect(200);
  });

  it('should return 400 for invalid data size', async () => {
    // Send data that doesn't match map dimensions
    const invalidData = Buffer.alloc(50);

    const response = await request(app)
      .put(`/api/v1/maps/${testMapId}/data`)
      .set('Content-Type', 'application/octet-stream')
      .send(invalidData)
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.message).toMatch(/size|dimension/i);
  });

  it('should return 400 for invalid base64 encoding', async () => {
    const invalidData = {
      data: 'not-valid-base64!!!',
    };

    const response = await request(app)
      .put(`/api/v1/maps/${testMapId}/data`)
      .set('Content-Type', 'application/json')
      .send(invalidData)
      .expect(400);

    expect(response.body.message).toMatch(/base64|encoding/i);
  });

  it('should return 404 for non-existent mapId', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';
    const testData = Buffer.alloc(100 * 100);

    const response = await request(app)
      .put(`/api/v1/maps/${nonExistentId}/data`)
      .set('Content-Type', 'application/octet-stream')
      .send(testData)
      .expect(404);

    expect(response.body.statusCode).toBe(404);
  });

  it('should return 400 for invalid UUID format', async () => {
    const invalidId = 'not-a-uuid';
    const testData = Buffer.alloc(100);

    const response = await request(app)
      .put(`/api/v1/maps/${invalidId}/data`)
      .send(testData)
      .expect(400);

    expect(response.body.message).toMatch(/invalid|uuid/i);
  });
});

