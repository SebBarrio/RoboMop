import { AppDataSource } from '../config/database';
import { Session } from '../models/Session';
import { Repository } from 'typeorm';

/**
 * SessionService
 * Handles session lifecycle management
 * Implements T063
 */
export class SessionService {
  private repository: Repository<Session>;

  constructor() {
    this.repository = AppDataSource.getRepository(Session);
  }

  /**
   * Find all sessions with optional filters
   */
  async findAll(filters?: {
    robotId?: string;
    type?: 'EXPLORATION' | 'CLEANING';
    status?: 'IN_PROGRESS' | 'COMPLETED' | 'INTERRUPTED' | 'FAILED';
  }): Promise<Session[]> {
    return await this.repository.find({
      where: filters,
      order: { startedAt: 'DESC' },
    });
  }

  /**
   * Find session by ID
   */
  async findById(id: string): Promise<Session | null> {
    return await this.repository.findOne({
      where: { id },
      relations: ['robot', 'map'],
    });
  }

  /**
   * Create new session
   */
  async create(data: {
    robotId: string;
    mapId: string;
    type: 'EXPLORATION' | 'CLEANING';
  }): Promise<Session> {
    const session = this.repository.create({
      ...data,
      status: 'IN_PROGRESS',
      statistics: {
        distanceTraveled: 0,
        areaCovered: 0,
        duration: 0,
        batteryUsed: 0,
        waterUsed: 0,
        errorsEncountered: 0,
        averageSpeed: 0,
      },
    });

    return await this.repository.save(session);
  }

  /**
   * Update session (typically to mark completion)
   */
  async update(
    id: string,
    data: Partial<Pick<Session, 'status' | 'completedAt' | 'statistics'>>
  ): Promise<Session> {
    const session = await this.findById(id);
    if (!session) {
      throw new Error(`Session with id ${id} not found`);
    }

    // Auto-calculate duration if completing
    if (data.status && data.status !== 'IN_PROGRESS' && !data.completedAt) {
      data.completedAt = new Date();
    }

    if (data.completedAt && session.startedAt) {
      const duration = Math.floor((data.completedAt.getTime() - session.startedAt.getTime()) / 1000);
      if (!data.statistics) {
        data.statistics = { ...session.statistics };
      }
      data.statistics.duration = duration;
    }

    Object.assign(session, data);
    return await this.repository.save(session);
  }

  /**
   * Update session statistics
   */
  async updateStatistics(id: string, statistics: Partial<Session['statistics']>): Promise<void> {
    const session = await this.findById(id);
    if (!session) {
      throw new Error(`Session with id ${id} not found`);
    }

    session.statistics = { ...session.statistics, ...statistics };
    await this.repository.save(session);
  }

  /**
   * Complete session
   */
  async complete(
    id: string,
    completionReason: string,
    finalStatistics?: Partial<Session['statistics']>
  ): Promise<Session> {
    const session = await this.findById(id);
    if (!session) {
      throw new Error(`Session with id ${id} not found`);
    }

    const completedAt = new Date();
    const duration = Math.floor((completedAt.getTime() - session.startedAt.getTime()) / 1000);

    session.status = 'COMPLETED';
    session.completedAt = completedAt;
    session.statistics = {
      ...session.statistics,
      ...finalStatistics,
      duration,
      completionReason,
    };

    return await this.repository.save(session);
  }

  /**
   * Interrupt session (e.g., low battery)
   */
  async interrupt(id: string, reason: string): Promise<Session> {
    return await this.update(id, {
      status: 'INTERRUPTED',
      completedAt: new Date(),
      statistics: { completionReason: reason },
    });
  }

  /**
   * Fail session
   */
  async fail(id: string, reason: string): Promise<Session> {
    return await this.update(id, {
      status: 'FAILED',
      completedAt: new Date(),
      statistics: { completionReason: reason },
    });
  }
}

