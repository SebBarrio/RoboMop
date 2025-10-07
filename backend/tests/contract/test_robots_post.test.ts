/**
 * Contract Test: POST /api/v1/robots
 * Validates robot registration endpoint
 * Status: EXPECTED TO FAIL until T055-T066 are implemented
 */

import request from 'supertest';
import { describe, it, expect } from '@jest/globals';
import { app } from '../../src/server';

describe('POST /api/v1/robots', () => {

  const validRobotData = {
    name: 'Test Robot',
    serialNumber: 'TEST-001',
    modelVersion: '1.0.0',
    firmwareVersion: '1.0.0',
  };

  it('should create robot with valid data and return 201', async () => {
    const response = await request(app)
      .post('/api/v1/robots')
      .send(validRobotData)
      .expect('Content-Type', /json/)
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body.name).toBe(validRobotData.name);
    expect(response.body.serialNumber).toBe(validRobotData.serialNumber);
    expect(response.body.status).toBe('OFFLINE'); // Default status
  });

  it('should return 400 for missing required fields', async () => {
    const invalidData = {
      name: 'Test Robot',
      // Missing serialNumber, modelVersion, firmwareVersion
    };

    const response = await request(app)
      .post('/api/v1/robots')
      .send(invalidData)
      .expect('Content-Type', /json/)
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.message).toMatch(/required/i);
  });

  it('should return 400 for invalid serialNumber format', async () => {
    const invalidData = {
      ...validRobotData,
      serialNumber: 'invalid serial!', // Contains invalid characters
    };

    const response = await request(app)
      .post('/api/v1/robots')
      .send(invalidData)
      .expect(400);

    expect(response.body.message).toMatch(/serialNumber/i);
  });

  it('should return 400 for duplicate serialNumber', async () => {
    // Create first robot
    await request(app)
      .post('/api/v1/robots')
      .send(validRobotData)
      .expect(201);

    // Attempt to create duplicate
    const response = await request(app)
      .post('/api/v1/robots')
      .send(validRobotData)
      .expect(400);

    expect(response.body.message).toMatch(/unique|exists|duplicate/i);
  });

  it('should return 400 for name exceeding 100 characters', async () => {
    const invalidData = {
      ...validRobotData,
      name: 'A'.repeat(101),
    };

    await request(app)
      .post('/api/v1/robots')
      .send(invalidData)
      .expect(400);
  });
});


