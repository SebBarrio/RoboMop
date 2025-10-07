import { AppDataSource } from '../config/database';
import { Log } from '../models/Log';
import { Repository } from 'typeorm';

/**
 * LogService
 * Handles log querying and clearing
 * Implements T065
 */
export class LogService {
  private repository: Repository<Log>;

  constructor() {
    this.repository = AppDataSource.getRepository(Log);
  }

  /**
   * Find logs with filters
   */
  async findAll(filters?: {
    robotId?: string;
    sessionId?: string;
    level?: Log['level'];
    since?: Date;
    limit?: number;
  }): Promise<Log[]> {
    const queryBuilder = this.repository.createQueryBuilder('log');

    if (filters?.robotId) {
      queryBuilder.andWhere('log.robotId = :robotId', { robotId: filters.robotId });
    }

    if (filters?.sessionId) {
      queryBuilder.andWhere('log.sessionId = :sessionId', { sessionId: filters.sessionId });
    }

    if (filters?.level) {
      queryBuilder.andWhere('log.level = :level', { level: filters.level });
    }

    if (filters?.since) {
      queryBuilder.andWhere('log.timestamp >= :since', { since: filters.since });
    }

    queryBuilder.orderBy('log.timestamp', 'DESC');

    if (filters?.limit) {
      queryBuilder.limit(filters.limit);
    } else {
      queryBuilder.limit(100); // Default limit
    }

    return await queryBuilder.getMany();
  }

  /**
   * Create log entry
   */
  async create(data: {
    robotId: string;
    sessionId?: string;
    level: Log['level'];
    module: string;
    message: string;
    data?: Record<string, unknown>;
  }): Promise<Log> {
    // Validate message length
    if (data.message.length > 500) {
      data.message = data.message.substring(0, 497) + '...';
    }

    const log = this.repository.create(data);
    return await this.repository.save(log);
  }

  /**
   * Clear logs with filters
   */
  async clear(filters?: { robotId?: string; before?: Date }): Promise<number> {
    const queryBuilder = this.repository.createQueryBuilder().delete();

    if (filters?.robotId) {
      queryBuilder.where('robotId = :robotId', { robotId: filters.robotId });
    }

    if (filters?.before) {
      queryBuilder.andWhere('timestamp < :before', { before: filters.before });
    }

    const result = await queryBuilder.execute();
    return result.affected || 0;
  }

  /**
   * Get log count
   */
  async count(filters?: { robotId?: string; level?: Log['level'] }): Promise<number> {
    return await this.repository.count({ where: filters });
  }
}

