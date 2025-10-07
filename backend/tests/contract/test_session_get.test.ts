/**
 * Contract Test: GET /api/v1/sessions/{sessionId}
 * Validates session details retrieval endpoint
 * Status: EXPECTED TO FAIL until T055-T066 are implemented
 */

import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server';

describe('GET /api/v1/sessions/{sessionId}', () => {
  let testSessionId: string = '';

  beforeAll(async () => {
    // App will be created in T114 (backend integration)
    // For now, this test will fail as expected (TDD)
  });

  it('should return 200 with session details', async () => {
    expect(app).toBeDefined();

    const response = await request(app)
      .get(`/api/v1/sessions/${testSessionId}`)
      .expect('Content-Type', /json/)
      .expect(200);

    // Validate against OpenAPI schema
    expect(response.body).toHaveProperty('id', testSessionId);
    expect(response.body).toHaveProperty('robotId');
    expect(response.body).toHaveProperty('mapId');
    expect(response.body).toHaveProperty('type');
    expect(response.body).toHaveProperty('status');
    expect(response.body).toHaveProperty('startedAt');
    expect(response.body).toHaveProperty('statistics');

    // Validate enums
    expect(['EXPLORATION', 'CLEANING']).toContain(response.body.type);
    expect(['IN_PROGRESS', 'COMPLETED', 'INTERRUPTED', 'FAILED']).toContain(response.body.status);

    // Validate statistics object
    expect(typeof response.body.statistics).toBe('object');
  });

  it('should include completedAt for completed sessions', async () => {
    // TODO: Test with a completed session
    // Should have completedAt field
  });

  it('should return 404 for non-existent sessionId', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    const response = await request(app)
      .get(`/api/v1/sessions/${nonExistentId}`)
      .expect(404);

    expect(response.body).toHaveProperty('error');
    expect(response.body.statusCode).toBe(404);
  });

  it('should return 400 for invalid UUID format', async () => {
    const invalidId = 'not-a-uuid';

    const response = await request(app)
      .get(`/api/v1/sessions/${invalidId}`)
      .expect(400);

    expect(response.body.message).toMatch(/invalid|uuid/i);
  });

  it('should return 500 on database error', async () => {
    // TODO: Simulate database error
    // This tests error handling middleware (T115)
  });
});

