/**
 * Contract Test: GET /api/v1/robots/{robotId}
 * Validates API contract against OpenAPI spec
 * Status: EXPECTED TO FAIL until T055-T066 are implemented
 */

import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { app } from '../../src/server';
import { AppDataSource } from '../../src/config/database';

describe('GET /api/v1/robots/{robotId}', () => {
  let testRobotId: string = '';

  beforeAll(async () => {
    // Create test robot
    const robotData = {
      name: 'Test Robot Get',
      serialNumber: 'TEST-GET-001',
      modelVersion: '1.0.0',
      firmwareVersion: '1.0.0',
    };

    try {
      const response = await request(app)
        .post('/api/v1/robots')
        .send(robotData);
      
      if (response.status === 201) {
        testRobotId = response.body.id;
      }
    } catch (error) {
      // Expected to fail in TDD - no implementation yet
    }
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });

  it('should return 200 with robot details for valid robotId', async () => {
    expect(app).toBeDefined();
    
    const response = await request(app)
      .get(`/api/v1/robots/${testRobotId}`)
      .expect('Content-Type', /json/)
      .expect(200);

    // Validate against OpenAPI schema
    expect(response.body).toHaveProperty('id');
    expect(response.body).toHaveProperty('name');
    expect(response.body).toHaveProperty('serialNumber');
    expect(response.body).toHaveProperty('modelVersion');
    expect(response.body).toHaveProperty('firmwareVersion');
    expect(response.body).toHaveProperty('createdAt');
    expect(response.body).toHaveProperty('lastSeenAt');
    expect(response.body).toHaveProperty('status');

    // Validate types
    expect(typeof response.body.id).toBe('string');
    expect(typeof response.body.name).toBe('string');
    expect(typeof response.body.serialNumber).toBe('string');

    // Validate enum values
    expect(['ONLINE', 'OFFLINE', 'ERROR', 'MAINTENANCE']).toContain(response.body.status);
  });

  it('should return 404 for non-existent robotId', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    const response = await request(app)
      .get(`/api/v1/robots/${nonExistentId}`)
      .expect('Content-Type', /json/)
      .expect(404);

    expect(response.body).toHaveProperty('error');
    expect(response.body).toHaveProperty('message');
    expect(response.body.statusCode).toBe(404);
  });

  it('should return 400 for invalid UUID format', async () => {
    const invalidId = 'not-a-uuid';

    const response = await request(app)
      .get(`/api/v1/robots/${invalidId}`)
      .expect('Content-Type', /json/)
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.message).toMatch(/invalid|uuid/i);
  });

  it('should return 500 on database error', async () => {
    // TODO: Simulate database error
    // This tests error handling middleware (T115)
  });
});

