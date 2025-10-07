import { AppDataSource } from '../config/database';
import { RestrictedZone } from '../models/RestrictedZone';
import { Repository } from 'typeorm';

/**
 * ZoneService
 * Handles restricted zone management
 * Implements T064
 */
export class ZoneService {
  private repository: Repository<RestrictedZone>;

  constructor() {
    this.repository = AppDataSource.getRepository(RestrictedZone);
  }

  /**
   * Find all zones for a map
   */
  async findByMapId(mapId: string): Promise<RestrictedZone[]> {
    return await this.repository.find({
      where: { mapId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Find zone by ID
   */
  async findById(id: string): Promise<RestrictedZone | null> {
    return await this.repository.findOne({ where: { id } });
  }

  /**
   * Create new restricted zone
   */
  async create(data: {
    mapId: string;
    name?: string;
    geometry: {
      type: 'Polygon';
      coordinates: Array<Array<{ x: number; y: number }>>;
    };
  }): Promise<RestrictedZone> {
    // Validate polygon
    this.validatePolygon(data.geometry);

    const zone = this.repository.create(data);
    return await this.repository.save(zone);
  }

  /**
   * Update restricted zone
   */
  async update(
    id: string,
    data: Partial<Pick<RestrictedZone, 'name' | 'geometry'>>
  ): Promise<RestrictedZone> {
    const zone = await this.findById(id);
    if (!zone) {
      throw new Error(`Zone with id ${id} not found`);
    }

    // Validate geometry if provided
    if (data.geometry) {
      this.validatePolygon(data.geometry);
    }

    Object.assign(zone, data);
    return await this.repository.save(zone);
  }

  /**
   * Delete restricted zone
   */
  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  /**
   * Validate polygon geometry
   */
  private validatePolygon(geometry: RestrictedZone['geometry']): void {
    if (geometry.type !== 'Polygon') {
      throw new Error('Geometry type must be Polygon');
    }

    if (!geometry.coordinates || geometry.coordinates.length === 0) {
      throw new Error('Polygon must have coordinates');
    }

    const ring = geometry.coordinates[0];
    if (!ring || ring.length < 4) {
      throw new Error('Polygon must have at least 4 points (including closing point)');
    }

    // Verify polygon is closed (first and last points match)
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first.x !== last.x || first.y !== last.y) {
      throw new Error('Polygon must be closed (first and last points must match)');
    }

    // Calculate area to validate
    const area = this.calculatePolygonArea(ring);
    if (area < 0.01 || area > 1000) {
      throw new Error('Polygon area must be between 0.01 and 1000 square meters');
    }
  }

  /**
   * Calculate polygon area (shoelace formula)
   */
  private calculatePolygonArea(points: Array<{ x: number; y: number }>): number {
    let area = 0;
    for (let i = 0; i < points.length - 1; i++) {
      area += points[i].x * points[i + 1].y - points[i + 1].x * points[i].y;
    }
    return Math.abs(area / 2);
  }

  /**
   * Check if a point is inside a zone
   */
  isPointInZone(point: { x: number; y: number }, zone: RestrictedZone): boolean {
    const ring = zone.geometry.coordinates[0];
    let inside = false;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i].x,
        yi = ring[i].y;
      const xj = ring[j].x,
        yj = ring[j].y;

      const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

      if (intersect) inside = !inside;
    }

    return inside;
  }
}

