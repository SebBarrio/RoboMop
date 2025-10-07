import { AppDataSource } from '../config/database';
import { Map } from '../models/Map';
import { Repository } from 'typeorm';

/**
 * MapService
 * Handles CRUD and map data operations
 * Implements T062
 */
export class MapService {
  private repository: Repository<Map>;

  constructor() {
    this.repository = AppDataSource.getRepository(Map);
  }

  /**
   * Find all maps (optionally filter by robotId)
   */
  async findAll(robotId?: string): Promise<Map[]> {
    const where = robotId ? { robotId } : {};
    return await this.repository.find({
      where,
      order: { updatedAt: 'DESC' },
    });
  }

  /**
   * Find map by ID
   */
  async findById(id: string): Promise<Map | null> {
    return await this.repository.findOne({
      where: { id },
      relations: ['zones'],
    });
  }

  /**
   * Create new map
   */
  async create(data: {
    robotId: string;
    name?: string;
    resolution: number;
    width: number;
    height: number;
    origin: { x: number; y: number; theta: number };
  }): Promise<Map> {
    // Validate resolution range
    if (data.resolution < 0.01 || data.resolution > 0.1) {
      throw new Error('Resolution must be between 0.01 and 0.1');
    }

    // Validate dimensions
    if (data.width < 100 || data.width > 10000 || data.height < 100 || data.height > 10000) {
      throw new Error('Map dimensions must be between 100 and 10000 cells');
    }

    const map = this.repository.create({
      ...data,
      completionPercentage: 0,
      metadata: {},
    });

    return await this.repository.save(map);
  }

  /**
   * Update map metadata
   */
  async update(
    id: string,
    data: Partial<Pick<Map, 'name' | 'metadata' | 'completionPercentage'>>
  ): Promise<Map> {
    const map = await this.findById(id);
    if (!map) {
      throw new Error(`Map with id ${id} not found`);
    }

    Object.assign(map, data);
    return await this.repository.save(map);
  }

  /**
   * Update map grid data (full replacement)
   */
  async updateData(id: string, data: Buffer): Promise<void> {
    const map = await this.findById(id);
    if (!map) {
      throw new Error(`Map with id ${id} not found`);
    }

    map.data = data;
    map.updatedAt = new Date();
    await this.repository.save(map);
  }

  /**
   * Update map grid cells (delta update)
   */
  async updateCells(id: string, cells: Array<{ row: number; col: number; value: number }>): Promise<void> {
    const map = await this.findById(id);
    if (!map) {
      throw new Error(`Map with id ${id} not found`);
    }

    if (!map.data) {
      throw new Error('Map has no data buffer initialized');
    }

    // Update individual cells in the buffer
    for (const cell of cells) {
      const index = cell.row * map.width + cell.col;
      if (index >= 0 && index < map.data.length) {
        map.data[index] = cell.value;
      }
    }

    map.updatedAt = new Date();
    await this.repository.save(map);
  }

  /**
   * Get map data
   */
  async getData(id: string): Promise<Buffer | null> {
    const map = await this.findById(id);
    return map?.data || null;
  }

  /**
   * Delete map
   */
  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  /**
   * Calculate completion percentage based on unknown cells
   */
  async calculateCompletion(id: string): Promise<number> {
    const map = await this.findById(id);
    if (!map || !map.data) {
      return 0;
    }

    const totalCells = map.width * map.height;
    const unknownCells = map.data.filter((cell) => cell === 0).length;
    const completion = ((totalCells - unknownCells) / totalCells) * 100;

    return Math.min(100, Math.max(0, completion));
  }
}

