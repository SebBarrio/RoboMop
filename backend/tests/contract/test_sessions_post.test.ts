/**
 * Contract Test: POST /api/v1/sessions
 * Validates session creation endpoint
 * Status: EXPECTED TO FAIL until T055-T066 are implemented
 */

import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server';

describe('POST /api/v1/sessions', () => {
  let testRobotId: string = '';
  let testMapId: string = '';

  const validSessionData = {
    robotId: '', // Will be set in beforeAll
    mapId: '',   // Will be set in beforeAll
    type: 'EXPLORATION' as const,
  };

  beforeAll(async () => {
    // App will be created in T114 (backend integration)
    // For now, this test will fail as expected (TDD)
    validSessionData.robotId = testRobotId;
    validSessionData.mapId = testMapId;
  });

  it('should create session with valid data and return 201', async () => {
    expect(app).toBeDefined();

    const response = await request(app)
      .post('/api/v1/sessions')
      .send(validSessionData)
      .expect('Content-Type', /json/)
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body.robotId).toBe(validSessionData.robotId);
    expect(response.body.mapId).toBe(validSessionData.mapId);
    expect(response.body.type).toBe(validSessionData.type);
    expect(response.body.status).toBe('IN_PROGRESS'); // Default status
    expect(response.body).toHaveProperty('startedAt');
    expect(response.body).toHaveProperty('statistics');
  });

  it('should create CLEANING session', async () => {
    const cleaningSessionData = {
      ...validSessionData,
      type: 'CLEANING' as const,
    };

    const response = await request(app)
      .post('/api/v1/sessions')
      .send(cleaningSessionData)
      .expect(201);

    expect(response.body.type).toBe('CLEANING');
  });

  it('should return 400 for missing required fields', async () => {
    const invalidData = {
      robotId: testRobotId,
      // Missing mapId and type
    };

    const response = await request(app)
      .post('/api/v1/sessions')
      .send(invalidData)
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.message).toMatch(/required/i);
  });

  it('should return 400 for invalid session type', async () => {
    const invalidData = {
      ...validSessionData,
      type: 'INVALID_TYPE',
    };

    const response = await request(app)
      .post('/api/v1/sessions')
      .send(invalidData)
      .expect(400);

    expect(response.body.message).toMatch(/type/i);
  });

  it('should return 400 for invalid robotId format', async () => {
    const invalidData = {
      ...validSessionData,
      robotId: 'not-a-uuid',
    };

    const response = await request(app)
      .post('/api/v1/sessions')
      .send(invalidData)
      .expect(400);

    expect(response.body.message).toMatch(/robotId|uuid/i);
  });

  it('should return 400 for invalid mapId format', async () => {
    const invalidData = {
      ...validSessionData,
      mapId: 'not-a-uuid',
    };

    const response = await request(app)
      .post('/api/v1/sessions')
      .send(invalidData)
      .expect(400);

    expect(response.body.message).toMatch(/mapId|uuid/i);
  });

  it('should return 404 for non-existent robotId', async () => {
    const invalidData = {
      ...validSessionData,
      robotId: '00000000-0000-0000-0000-000000000000',
    };

    const response = await request(app)
      .post('/api/v1/sessions')
      .send(invalidData)
      .expect(404);

    expect(response.body.statusCode).toBe(404);
  });

  it('should return 404 for non-existent mapId', async () => {
    const invalidData = {
      ...validSessionData,
      mapId: '00000000-0000-0000-0000-000000000000',
    };

    const response = await request(app)
      .post('/api/v1/sessions')
      .send(invalidData)
      .expect(404);

    expect(response.body.statusCode).toBe(404);
  });
});

