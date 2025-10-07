/**
 * Contract Test: DELETE /api/v1/zones/{zoneId}
 * Validates zone deletion endpoint
 * Status: EXPECTED TO FAIL until T055-T066 are implemented
 */

import request from 'supertest';
import { describe, it, expect, beforeEach } from '@jest/globals';
import { app } from '../../src/server';
import { createTestZone } from '../helpers/testData';

describe('DELETE /api/v1/zones/{zoneId}', () => {
  let testZoneId: string = '';

  beforeEach(async () => {
    const zone = await createTestZone();
    testZoneId = zone.id;
  });

  it('should delete zone and return 204', async () => {
    expect(app).toBeDefined();

    await request(app)
      .delete(`/api/v1/zones/${testZoneId}`)
      .expect(204);

    // Verify zone is deleted
    await request(app)
      .get(`/api/v1/zones/${testZoneId}`)
      .expect(404);
  });

  it('should return 404 for non-existent zoneId', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    const response = await request(app)
      .delete(`/api/v1/zones/${nonExistentId}`)
      .expect(404);

    expect(response.body).toHaveProperty('error');
    expect(response.body.statusCode).toBe(404);
  });

  it('should return 400 for invalid UUID format', async () => {
    const invalidId = 'not-a-uuid';

    const response = await request(app)
      .delete(`/api/v1/zones/${invalidId}`)
      .expect(400);

    expect(response.body.message).toMatch(/invalid|uuid/i);
  });

  it('should return 500 on database error', async () => {
    // TODO: Simulate database error
    // This tests error handling middleware (T115)
  });
});

