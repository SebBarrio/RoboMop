/**
 * Contract Test: POST /api/v1/robots/{robotId}/command
 * Validates robot command endpoint
 * Status: EXPECTED TO FAIL until T055-T066 are implemented
 */

import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server';

describe('POST /api/v1/robots/{robotId}/command', () => {
  let testRobotId: string = '';

  beforeAll(async () => {
    // App will be created in T114 (backend integration)
    // For now, this test will fail as expected (TDD)
  });

  it('should send MOVE command and return 200', async () => {
    expect(app).toBeDefined();

    const commandData = {
      type: 'MOVE',
      payload: {
        linear: 0.3,
        angular: 0.1,
      },
    };

    const response = await request(app)
      .post(`/api/v1/robots/${testRobotId}/command`)
      .send(commandData)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('commandId');
    expect(response.body).toHaveProperty('status');
    expect(['queued', 'sent', 'acknowledged']).toContain(response.body.status);
  });

  it('should send SET_MODE command and return 200', async () => {
    const commandData = {
      type: 'SET_MODE',
      payload: {
        mode: 'CLEANING',
      },
    };

    const response = await request(app)
      .post(`/api/v1/robots/${testRobotId}/command`)
      .send(commandData)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('commandId');
    expect(response.body).toHaveProperty('status');
  });

  it('should send E_STOP command and return 200', async () => {
    const commandData = {
      type: 'E_STOP',
      payload: {},
    };

    const response = await request(app)
      .post(`/api/v1/robots/${testRobotId}/command`)
      .send(commandData)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('commandId');
  });

  it('should send SET_SPEED command and return 200', async () => {
    const commandData = {
      type: 'SET_SPEED',
      payload: {
        speedPercent: 75,
      },
    };

    const response = await request(app)
      .post(`/api/v1/robots/${testRobotId}/command`)
      .send(commandData)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('commandId');
  });

  it('should return 400 for missing command type', async () => {
    const invalidData = {
      payload: {},
    };

    const response = await request(app)
      .post(`/api/v1/robots/${testRobotId}/command`)
      .send(invalidData)
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.message).toMatch(/type|required/i);
  });

  it('should return 400 for invalid command type', async () => {
    const invalidData = {
      type: 'INVALID_COMMAND',
      payload: {},
    };

    const response = await request(app)
      .post(`/api/v1/robots/${testRobotId}/command`)
      .send(invalidData)
      .expect(400);

    expect(response.body.message).toMatch(/type/i);
  });

  it('should return 400 for missing payload', async () => {
    const invalidData = {
      type: 'MOVE',
      // Missing payload
    };

    const response = await request(app)
      .post(`/api/v1/robots/${testRobotId}/command`)
      .send(invalidData)
      .expect(400);

    expect(response.body.message).toMatch(/payload|required/i);
  });

  it('should return 404 for non-existent robotId', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    const commandData = {
      type: 'E_STOP',
      payload: {},
    };

    const response = await request(app)
      .post(`/api/v1/robots/${nonExistentId}/command`)
      .send(commandData)
      .expect(404);

    expect(response.body.statusCode).toBe(404);
  });
});

