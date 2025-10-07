import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial Schema Migration
 * Creates all tables for RoboMop system
 * Updated for T008 with complete schema
 */
export class InitialSchema1696000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable UUID extension for PostgreSQL
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`).catch(() => {
      // SQLite doesn't need this, ignore error
    });

    // Create robots table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS robots (
        id TEXT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        serialNumber VARCHAR(50) UNIQUE NOT NULL,
        modelVersion VARCHAR(20) NOT NULL,
        firmwareVersion VARCHAR(20) NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        lastSeenAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'OFFLINE'
      )
    `);

    // Create maps table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS maps (
        id TEXT PRIMARY KEY,
        robotId TEXT NOT NULL,
        name VARCHAR(100),
        resolution REAL NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        origin TEXT NOT NULL,
        data BLOB,
        metadata TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        completionPercentage REAL DEFAULT 0,
        FOREIGN KEY (robotId) REFERENCES robots(id)
      )
    `);

    // Create restricted_zones table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS restricted_zones (
        id TEXT PRIMARY KEY,
        mapId TEXT NOT NULL,
        name VARCHAR(100),
        geometry TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (mapId) REFERENCES maps(id) ON DELETE CASCADE
      )
    `);

    // Create sessions table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        robotId TEXT NOT NULL,
        mapId TEXT NOT NULL,
        type VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL,
        startedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        completedAt DATETIME,
        statistics TEXT NOT NULL,
        FOREIGN KEY (robotId) REFERENCES robots(id),
        FOREIGN KEY (mapId) REFERENCES maps(id)
      )
    `);

    // Create robot_states table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS robot_states (
        id TEXT PRIMARY KEY,
        robotId TEXT NOT NULL,
        sessionId TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        mode VARCHAR(20) NOT NULL,
        position TEXT NOT NULL,
        velocity TEXT NOT NULL,
        batteryLevel REAL NOT NULL,
        waterLevel REAL NOT NULL,
        motorCurrents TEXT NOT NULL,
        errors TEXT,
        FOREIGN KEY (robotId) REFERENCES robots(id),
        FOREIGN KEY (sessionId) REFERENCES sessions(id)
      )
    `);

    // Create logs table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY,
        robotId TEXT NOT NULL,
        sessionId TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        level VARCHAR(20) NOT NULL,
        module VARCHAR(50) NOT NULL,
        message VARCHAR(500) NOT NULL,
        data TEXT,
        FOREIGN KEY (robotId) REFERENCES robots(id),
        FOREIGN KEY (sessionId) REFERENCES sessions(id)
      )
    `);

    // Create indexes for better query performance
    await queryRunner.query(`CREATE INDEX idx_maps_robotId ON maps(robotId)`);
    await queryRunner.query(`CREATE INDEX idx_zones_mapId ON restricted_zones(mapId)`);
    await queryRunner.query(`CREATE INDEX idx_sessions_robotId ON sessions(robotId)`);
    await queryRunner.query(`CREATE INDEX idx_states_robotId ON robot_states(robotId)`);
    await queryRunner.query(`CREATE INDEX idx_states_timestamp ON robot_states(timestamp)`);
    await queryRunner.query(`CREATE INDEX idx_logs_robotId ON logs(robotId)`);
    await queryRunner.query(`CREATE INDEX idx_logs_timestamp ON logs(timestamp)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS logs`);
    await queryRunner.query(`DROP TABLE IF EXISTS robot_states`);
    await queryRunner.query(`DROP TABLE IF EXISTS sessions`);
    await queryRunner.query(`DROP TABLE IF EXISTS restricted_zones`);
    await queryRunner.query(`DROP TABLE IF EXISTS maps`);
    await queryRunner.query(`DROP TABLE IF EXISTS robots`);
  }
}


