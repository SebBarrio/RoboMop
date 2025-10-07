/**
 * Contract Test: POST /api/v1/maps
 * Validates map creation endpoint
 * Status: EXPECTED TO FAIL until T055-T066 are implemented
 */

import request from 'supertest';
import { describe, it, expect, beforeEach } from '@jest/globals';
import { app } from '../../src/server';
import { createTestRobot } from '../helpers/testData';

describe('POST /api/v1/maps', () => {
  let testRobotId: string = '';

  const baseMapData = {
    name: 'Test Map',
    resolution: 0.05,
    width: 2000,
    height: 2000,
    origin: {
      x: -50.0,
      y: -50.0,
      theta: 0.0,
    },
  };

  const getValidMapData = () => ({
    ...baseMapData,
    origin: { ...baseMapData.origin },
    robotId: testRobotId,
  });

  beforeEach(async () => {
    const robot = await createTestRobot();
    testRobotId = robot.id;
  });

  it('should create map with valid data and return 201', async () => {
    expect(app).toBeDefined();

    const validMapData = getValidMapData();
    const response = await request(app)
      .post('/api/v1/maps')
      .send(validMapData)
      .expect('Content-Type', /json/)
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body.robotId).toBe(validMapData.robotId);
    expect(response.body.resolution).toBe(validMapData.resolution);
    expect(response.body.width).toBe(validMapData.width);
    expect(response.body.height).toBe(validMapData.height);
    expect(response.body.completionPercentage).toBe(0); // Initial value
  });

  it('should return 400 for missing required fields', async () => {
    const invalidData = {
      robotId: testRobotId,
      // Missing resolution, width, height, origin
    };

    const response = await request(app)
      .post('/api/v1/maps')
      .send(invalidData)
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.message).toMatch(/required/i);
  });

  it('should return 400 for resolution out of range', async () => {
    const invalidData = {
      ...getValidMapData(),
      resolution: 0.5, // Exceeds maximum of 0.1
    };

    const response = await request(app)
      .post('/api/v1/maps')
      .send(invalidData)
      .expect(400);

    expect(response.body.message).toMatch(/resolution/i);
  });

  it('should return 400 for width out of range', async () => {
    const invalidData = {
      ...getValidMapData(),
      width: 50, // Below minimum of 100
    };

    const response = await request(app)
      .post('/api/v1/maps')
      .send(invalidData)
      .expect(400);

    expect(response.body.message).toMatch(/width/i);
  });

  it('should return 400 for height out of range', async () => {
    const invalidData = {
      ...getValidMapData(),
      height: 15000, // Exceeds maximum of 10000
    };

    const response = await request(app)
      .post('/api/v1/maps')
      .send(invalidData)
      .expect(400);

    expect(response.body.message).toMatch(/height/i);
  });

  it('should return 400 for invalid robotId format', async () => {
    const invalidData = {
      ...getValidMapData(),
      robotId: 'not-a-uuid',
    };

    const response = await request(app)
      .post('/api/v1/maps')
      .send(invalidData)
      .expect(400);

    expect(response.body.message).toMatch(/robotId|uuid/i);
  });

  it('should return 400 for missing origin coordinates', async () => {
    const invalidData = {
      ...getValidMapData(),
      origin: {
        x: -50.0,
        // Missing y and theta
      },
    };

    const response = await request(app)
      .post('/api/v1/maps')
      .send(invalidData)
      .expect(400);

    expect(response.body.message).toMatch(/origin/i);
  });

  it('should return 400 for name exceeding 100 characters', async () => {
    const invalidData = {
      ...getValidMapData(),
      name: 'A'.repeat(101),
    };

    const response = await request(app)
      .post('/api/v1/maps')
      .send(invalidData)
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });
});

