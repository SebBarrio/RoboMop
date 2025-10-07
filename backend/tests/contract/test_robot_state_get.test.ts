/**
 * Contract Test: GET /api/v1/robots/{robotId}/state
 * Validates robot state retrieval endpoint
 * Status: EXPECTED TO FAIL until T055-T066 are implemented
 */

import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server';

describe('GET /api/v1/robots/{robotId}/state', () => {
  let testRobotId: string = '';

  beforeAll(async () => {
    // App will be created in T114 (backend integration)
    // For now, this test will fail as expected (TDD)
  });

  it('should return 200 with current robot state', async () => {
    expect(app).toBeDefined();

    const response = await request(app)
      .get(`/api/v1/robots/${testRobotId}/state`)
      .expect('Content-Type', /json/)
      .expect(200);

    // Validate against OpenAPI schema
    expect(response.body).toHaveProperty('id');
    expect(response.body).toHaveProperty('robotId', testRobotId);
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('mode');
    expect(response.body).toHaveProperty('position');
    expect(response.body).toHaveProperty('velocity');
    expect(response.body).toHaveProperty('batteryLevel');
    expect(response.body).toHaveProperty('waterLevel');
    expect(response.body).toHaveProperty('motorCurrents');

    // Validate mode enum
    expect(['IDLE', 'EXPLORATION', 'CLEANING', 'MANUAL', 'RETURNING', 'ERROR']).toContain(response.body.mode);

    // Validate position object
    expect(response.body.position).toHaveProperty('x');
    expect(response.body.position).toHaveProperty('y');
    expect(response.body.position).toHaveProperty('theta');
    expect(response.body.position).toHaveProperty('confidence');
    expect(response.body.position.confidence).toBeGreaterThanOrEqual(0);
    expect(response.body.position.confidence).toBeLessThanOrEqual(1);

    // Validate velocity object
    expect(response.body.velocity).toHaveProperty('linear');
    expect(response.body.velocity).toHaveProperty('angular');

    // Validate battery and water levels
    expect(response.body.batteryLevel).toBeGreaterThanOrEqual(0);
    expect(response.body.batteryLevel).toBeLessThanOrEqual(100);
    expect(response.body.waterLevel).toBeGreaterThanOrEqual(0);
    expect(response.body.waterLevel).toBeLessThanOrEqual(100);

    // Validate motor currents
    expect(response.body.motorCurrents).toHaveProperty('left');
    expect(response.body.motorCurrents).toHaveProperty('right');
    expect(response.body.motorCurrents.left).toBeGreaterThanOrEqual(0);
    expect(response.body.motorCurrents.left).toBeLessThanOrEqual(5);
    expect(response.body.motorCurrents.right).toBeGreaterThanOrEqual(0);
    expect(response.body.motorCurrents.right).toBeLessThanOrEqual(5);
  });

  it('should return 404 for non-existent robotId', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    const response = await request(app)
      .get(`/api/v1/robots/${nonExistentId}/state`)
      .expect('Content-Type', /json/)
      .expect(404);

    expect(response.body).toHaveProperty('error');
    expect(response.body.statusCode).toBe(404);
  });

  it('should return 400 for invalid UUID format', async () => {
    const invalidId = 'not-a-uuid';

    const response = await request(app)
      .get(`/api/v1/robots/${invalidId}/state`)
      .expect(400);

    expect(response.body.message).toMatch(/invalid|uuid/i);
  });
});

