/**
 * Contract Test: GET /api/v1/maps
 * Validates maps list endpoint
 * Status: EXPECTED TO FAIL until T055-T066 are implemented
 */

import request from 'supertest';
import { describe, it, expect, beforeEach } from '@jest/globals';
import { app } from '../../src/server';
import { createTestRobot, createTestMap } from '../helpers/testData';

describe('GET /api/v1/maps', () => {
  let testRobotId: string = '';

  beforeEach(async () => {
    const robot = await createTestRobot();
    testRobotId = robot.id;
  });

  it('should return 200 with array of maps', async () => {
    expect(app).toBeDefined();

    const response = await request(app)
      .get('/api/v1/maps')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });

  it('should return empty array when no maps exist', async () => {
    const response = await request(app)
      .get('/api/v1/maps')
      .expect(200);

    expect(response.body).toEqual([]);
  });

  it('should filter maps by robotId query parameter', async () => {
    await createTestMap({ robotId: testRobotId });
    const otherRobot = await createTestRobot();
    await createTestMap({ robotId: otherRobot.id });

    const response = await request(app)
      .get(`/api/v1/maps?robotId=${testRobotId}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    
    // All returned maps should belong to the specified robot
    response.body.forEach((map: any) => {
      expect(map.robotId).toBe(testRobotId);
    });
  });

  it('should return maps with correct schema', async () => {
    await createTestMap({ robotId: testRobotId });

    const response = await request(app)
      .get('/api/v1/maps')
      .expect(200);

    if (response.body.length > 0) {
      const map = response.body[0];

      // Validate against OpenAPI schema
      expect(map).toHaveProperty('id');
      expect(map).toHaveProperty('robotId');
      expect(map).toHaveProperty('resolution');
      expect(map).toHaveProperty('width');
      expect(map).toHaveProperty('height');
      expect(map).toHaveProperty('origin');
      expect(map).toHaveProperty('completionPercentage');
      expect(map).toHaveProperty('createdAt');
      expect(map).toHaveProperty('updatedAt');

      // Validate types
      expect(typeof map.id).toBe('string');
      expect(typeof map.robotId).toBe('string');
      expect(typeof map.resolution).toBe('number');
      expect(typeof map.width).toBe('number');
      expect(typeof map.height).toBe('number');

      // Validate ranges
      expect(map.resolution).toBeGreaterThanOrEqual(0.01);
      expect(map.resolution).toBeLessThanOrEqual(0.1);
      expect(map.completionPercentage).toBeGreaterThanOrEqual(0);
      expect(map.completionPercentage).toBeLessThanOrEqual(100);

      // Validate origin object
      expect(map.origin).toHaveProperty('x');
      expect(map.origin).toHaveProperty('y');
      expect(map.origin).toHaveProperty('theta');
    }
  });

  it('should return 400 for invalid robotId format in query', async () => {
    const response = await request(app)
      .get('/api/v1/maps?robotId=invalid-uuid')
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.message).toMatch(/robotId|uuid/i);
  });

  it('should return 500 on database error', async () => {
    // TODO: Simulate database error
    // This tests error handling middleware (T115)
  });
});

