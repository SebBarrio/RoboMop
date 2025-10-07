/**
 * Contract Test: GET /api/v1/sessions
 * Validates sessions list endpoint
 * Status: EXPECTED TO FAIL until T055-T066 are implemented
 */

import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server';

describe('GET /api/v1/sessions', () => {
  let testRobotId: string = '';

  beforeAll(async () => {
    // App will be created in T114 (backend integration)
    // For now, this test will fail as expected (TDD)
  });

  it('should return 200 with array of sessions', async () => {
    expect(app).toBeDefined();

    const response = await request(app)
      .get('/api/v1/sessions')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });

  it('should return empty array when no sessions exist', async () => {
    const response = await request(app)
      .get('/api/v1/sessions')
      .expect(200);

    expect(response.body).toEqual([]);
  });

  it('should filter sessions by robotId query parameter', async () => {
    const response = await request(app)
      .get(`/api/v1/sessions?robotId=${testRobotId}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);

    // All returned sessions should belong to the specified robot
    response.body.forEach((session: any) => {
      expect(session.robotId).toBe(testRobotId);
    });
  });

  it('should filter sessions by type query parameter', async () => {
    const response = await request(app)
      .get('/api/v1/sessions?type=CLEANING')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);

    // All returned sessions should be of type CLEANING
    response.body.forEach((session: any) => {
      expect(session.type).toBe('CLEANING');
    });
  });

  it('should filter sessions by status query parameter', async () => {
    const response = await request(app)
      .get('/api/v1/sessions?status=COMPLETED')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);

    // All returned sessions should have status COMPLETED
    response.body.forEach((session: any) => {
      expect(session.status).toBe('COMPLETED');
    });
  });

  it('should combine multiple query filters', async () => {
    const response = await request(app)
      .get(`/api/v1/sessions?robotId=${testRobotId}&type=EXPLORATION&status=IN_PROGRESS`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);

    response.body.forEach((session: any) => {
      expect(session.robotId).toBe(testRobotId);
      expect(session.type).toBe('EXPLORATION');
      expect(session.status).toBe('IN_PROGRESS');
    });
  });

  it('should return sessions with correct schema', async () => {
    const response = await request(app)
      .get('/api/v1/sessions')
      .expect(200);

    if (response.body.length > 0) {
      const session = response.body[0];

      // Validate against OpenAPI schema
      expect(session).toHaveProperty('id');
      expect(session).toHaveProperty('robotId');
      expect(session).toHaveProperty('mapId');
      expect(session).toHaveProperty('type');
      expect(session).toHaveProperty('status');
      expect(session).toHaveProperty('startedAt');
      expect(session).toHaveProperty('statistics');

      // Validate types
      expect(typeof session.id).toBe('string');
      expect(typeof session.robotId).toBe('string');
      expect(typeof session.mapId).toBe('string');

      // Validate enums
      expect(['EXPLORATION', 'CLEANING']).toContain(session.type);
      expect(['IN_PROGRESS', 'COMPLETED', 'INTERRUPTED', 'FAILED']).toContain(session.status);
    }
  });

  it('should return 400 for invalid type enum', async () => {
    const response = await request(app)
      .get('/api/v1/sessions?type=INVALID_TYPE')
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.message).toMatch(/type/i);
  });

  it('should return 400 for invalid status enum', async () => {
    const response = await request(app)
      .get('/api/v1/sessions?status=INVALID_STATUS')
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.message).toMatch(/status/i);
  });

  it('should return 400 for invalid robotId format', async () => {
    const response = await request(app)
      .get('/api/v1/sessions?robotId=invalid-uuid')
      .expect(400);

    expect(response.body.message).toMatch(/robotId|uuid/i);
  });

  it('should return 500 on database error', async () => {
    // TODO: Simulate database error
    // This tests error handling middleware (T115)
  });
});

