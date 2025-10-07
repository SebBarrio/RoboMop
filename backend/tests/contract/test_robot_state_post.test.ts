/**
 * Contract Test: POST /api/v1/robots/{robotId}/state
 * Validates robot state update endpoint (called by robot)
 * Status: EXPECTED TO FAIL until T055-T066 are implemented
 */

import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server';

describe('POST /api/v1/robots/{robotId}/state', () => {
  let testRobotId: string = '';

  const validStateData = {
    mode: 'CLEANING' as const,
    position: {
      x: 1.25,
      y: -0.8,
      theta: 1.57,
      confidence: 0.95,
    },
    velocity: {
      linear: 0.3,
      angular: 0.0,
    },
    batteryLevel: 78.5,
    waterLevel: 65.0,
    motorCurrents: {
      left: 1.2,
      right: 1.3,
    },
    errors: [],
  };

  beforeAll(async () => {
    // App will be created in T114 (backend integration)
    // For now, this test will fail as expected (TDD)
  });

  it('should update robot state and return 200', async () => {
    expect(app).toBeDefined();

    const response = await request(app)
      .post(`/api/v1/robots/${testRobotId}/state`)
      .send(validStateData)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('id');
    expect(response.body).toHaveProperty('robotId', testRobotId);
    expect(response.body.mode).toBe(validStateData.mode);
    expect(response.body.position.x).toBe(validStateData.position.x);
    expect(response.body.batteryLevel).toBe(validStateData.batteryLevel);
  });

  it('should return 400 for missing required fields', async () => {
    const invalidData = {
      mode: 'IDLE',
      // Missing position, velocity, batteryLevel, etc.
    };

    const response = await request(app)
      .post(`/api/v1/robots/${testRobotId}/state`)
      .send(invalidData)
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.message).toMatch(/required/i);
  });

  it('should return 400 for invalid mode enum', async () => {
    const invalidData = {
      ...validStateData,
      mode: 'INVALID_MODE',
    };

    const response = await request(app)
      .post(`/api/v1/robots/${testRobotId}/state`)
      .send(invalidData)
      .expect(400);

    expect(response.body.message).toMatch(/mode/i);
  });

  it('should return 400 for batteryLevel out of range', async () => {
    const invalidData = {
      ...validStateData,
      batteryLevel: 150, // Exceeds maximum of 100
    };

    const response = await request(app)
      .post(`/api/v1/robots/${testRobotId}/state`)
      .send(invalidData)
      .expect(400);

    expect(response.body.message).toMatch(/batteryLevel/i);
  });

  it('should return 400 for waterLevel out of range', async () => {
    const invalidData = {
      ...validStateData,
      waterLevel: -10, // Below minimum of 0
    };

    const response = await request(app)
      .post(`/api/v1/robots/${testRobotId}/state`)
      .send(invalidData)
      .expect(400);

    expect(response.body.message).toMatch(/waterLevel/i);
  });

  it('should return 400 for motorCurrents out of range', async () => {
    const invalidData = {
      ...validStateData,
      motorCurrents: {
        left: 10.0, // Exceeds maximum of 5.0
        right: 1.3,
      },
    };

    const response = await request(app)
      .post(`/api/v1/robots/${testRobotId}/state`)
      .send(invalidData)
      .expect(400);

    expect(response.body.message).toMatch(/motorCurrents/i);
  });

  it('should return 404 for non-existent robotId', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    const response = await request(app)
      .post(`/api/v1/robots/${nonExistentId}/state`)
      .send(validStateData)
      .expect(404);

    expect(response.body.statusCode).toBe(404);
  });
});

