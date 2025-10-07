import { AppDataSource } from '../config/database';
import { Robot } from '../models/Robot';
import { Repository } from 'typeorm';

/**
 * RobotService
 * Handles CRUD operations for Robot entities
 * Implements T061
 */
export class RobotService {
  private repository: Repository<Robot>;

  constructor() {
    this.repository = AppDataSource.getRepository(Robot);
  }

  /**
   * Find all robots
   */
  async findAll(): Promise<Robot[]> {
    return await this.repository.find({
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Find robot by ID
   */
  async findById(id: string): Promise<Robot | null> {
    return await this.repository.findOne({ where: { id } });
  }

  /**
   * Find robot by serial number
   */
  async findBySerialNumber(serialNumber: string): Promise<Robot | null> {
    return await this.repository.findOne({ where: { serialNumber } });
  }

  /**
   * Create new robot
   */
  async create(data: {
    name: string;
    serialNumber: string;
    modelVersion: string;
    firmwareVersion: string;
  }): Promise<Robot> {
    // Check for duplicate serial number
    const existing = await this.findBySerialNumber(data.serialNumber);
    if (existing) {
      throw new Error(`Robot with serial number ${data.serialNumber} already exists`);
    }

    const robot = this.repository.create({
      ...data,
      status: 'OFFLINE',
      lastSeenAt: new Date(),
    });

    return await this.repository.save(robot);
  }

  /**
   * Update robot
   */
  async update(id: string, data: Partial<Pick<Robot, 'name' | 'status'>>): Promise<Robot> {
    const robot = await this.findById(id);
    if (!robot) {
      throw new Error(`Robot with id ${id} not found`);
    }

    Object.assign(robot, data);
    return await this.repository.save(robot);
  }

  /**
   * Update lastSeenAt timestamp (called on heartbeat)
   */
  async updateLastSeen(id: string): Promise<void> {
    await this.repository.update(id, { lastSeenAt: new Date() });
  }

  /**
   * Update robot status
   */
  async updateStatus(id: string, status: Robot['status']): Promise<void> {
    await this.repository.update(id, { status, lastSeenAt: new Date() });
  }

  /**
   * Delete robot (soft delete - not implemented yet)
   */
  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}

