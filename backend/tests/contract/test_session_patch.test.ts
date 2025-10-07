/**
 * Contract Test: PATCH /api/v1/sessions/{sessionId}
 * Validates session update endpoint (e.g., mark complete)
 * Status: EXPECTED TO FAIL until T055-T066 are implemented
 */

import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server';

describe('PATCH /api/v1/sessions/{sessionId}', () => {
  let testSessionId: string = '';

  beforeAll(async () => {
    // App will be created in T114 (backend integration)
    // For now, this test will fail as expected (TDD)
  });

  it('should update session status to COMPLETED and return 200', async () => {
    expect(app).toBeDefined();

    const updateData = {
      status: 'COMPLETED',
      completedAt: new Date().toISOString(),
      statistics: {
        distanceTraveled: 120.0,
        areaCovered: 100.0,
        duration: 1800,
        batteryUsed: 25.0,
        completionReason: 'FINISHED',
      },
    };

    const response = await request(app)
      .patch(`/api/v1/sessions/${testSessionId}`)
      .send(updateData)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('id', testSessionId);
    expect(response.body.status).toBe('COMPLETED');
    expect(response.body).toHaveProperty('completedAt');
    expect(response.body.statistics).toMatchObject(updateData.statistics);
  });

  it('should update session status to INTERRUPTED', async () => {
    const updateData = {
      status: 'INTERRUPTED',
      completedAt: new Date().toISOString(),
      statistics: {
        completionReason: 'LOW_BATTERY',
      },
    };

    const response = await request(app)
      .patch(`/api/v1/sessions/${testSessionId}`)
      .send(updateData)
      .expect(200);

    expect(response.body.status).toBe('INTERRUPTED');
  });

  it('should update session status to FAILED', async () => {
    const updateData = {
      status: 'FAILED',
      completedAt: new Date().toISOString(),
      statistics: {
        completionReason: 'ERROR',
      },
    };

    const response = await request(app)
      .patch(`/api/v1/sessions/${testSessionId}`)
      .send(updateData)
      .expect(200);

    expect(response.body.status).toBe('FAILED');
  });

  it('should update only statistics without changing status', async () => {
    const updateData = {
      statistics: {
        distanceTraveled: 50.0,
        areaCovered: 40.0,
      },
    };

    const response = await request(app)
      .patch(`/api/v1/sessions/${testSessionId}`)
      .send(updateData)
      .expect(200);

    expect(response.body.statistics.distanceTraveled).toBe(50.0);
    expect(response.body.statistics.areaCovered).toBe(40.0);
  });

  it('should return 400 for invalid status enum', async () => {
    const invalidData = {
      status: 'INVALID_STATUS',
    };

    const response = await request(app)
      .patch(`/api/v1/sessions/${testSessionId}`)
      .send(invalidData)
      .expect(400);

    expect(response.body.message).toMatch(/status/i);
  });

  it('should return 400 for invalid completedAt format', async () => {
    const invalidData = {
      completedAt: 'not-a-date',
    };

    const response = await request(app)
      .patch(`/api/v1/sessions/${testSessionId}`)
      .send(invalidData)
      .expect(400);

    expect(response.body.message).toMatch(/completedAt|date/i);
  });

  it('should return 404 for non-existent sessionId', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    const response = await request(app)
      .patch(`/api/v1/sessions/${nonExistentId}`)
      .send({ status: 'COMPLETED' })
      .expect(404);

    expect(response.body.statusCode).toBe(404);
  });

  it('should return 400 for invalid UUID format', async () => {
    const invalidId = 'not-a-uuid';

    const response = await request(app)
      .patch(`/api/v1/sessions/${invalidId}`)
      .send({ status: 'COMPLETED' })
      .expect(400);

    expect(response.body.message).toMatch(/invalid|uuid/i);
  });
});

