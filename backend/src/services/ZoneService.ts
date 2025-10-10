import { DataSource, FindManyOptions, QueryFailedError, Repository } from "typeorm";

import AppDataSource from "../config/database.js";
import { RestrictedZone, RestrictedZoneGeometry } from "../models/RestrictedZone.js";
import { DependencyError, InternalServiceError, NotFoundError, ValidationError } from "./errors.js";

export interface ZoneListOptions {
  mapId?: string;
}

export interface CreateZoneInput {
  mapId: string;
  name?: string | null;
  geometry: RestrictedZoneGeometry;
}

export interface UpdateZoneInput {
  name?: string | null;
  geometry?: RestrictedZoneGeometry;
}

export class ZoneService {
  private readonly repository: Repository<RestrictedZone>;

  constructor(dataSource: DataSource = AppDataSource) {
    this.repository = dataSource.getRepository(RestrictedZone);
  }

  async list(options: ZoneListOptions = {}): Promise<RestrictedZone[]> {
    const findOptions: FindManyOptions<RestrictedZone> = {
      order: { createdAt: "DESC" }
    };

    if (options.mapId) {
      findOptions.where = { mapId: options.mapId };
    }

    return this.repository.find(findOptions);
  }

  async getById(id: string): Promise<RestrictedZone> {
    const zone = await this.repository.findOne({ where: { id } });
    if (!zone) {
      throw new NotFoundError(`Restricted zone with id '${id}' not found`);
    }

    return zone;
  }

  async create(input: CreateZoneInput): Promise<RestrictedZone> {
    this.validateGeometry(input.geometry);

    if (!input.mapId) {
      throw new ValidationError("mapId is required when creating a restricted zone");
    }

    const zone = this.repository.create({
      mapId: input.mapId,
      name: input.name ?? null,
      geometry: input.geometry
    });

    try {
      return await this.repository.save(zone);
    } catch (error) {
      this.handleRepositoryError(error, "create restricted zone");
    }
  }

  async update(id: string, updates: UpdateZoneInput): Promise<RestrictedZone> {
    if (!updates || Object.keys(updates).length === 0) {
      throw new ValidationError("No updates provided for restricted zone");
    }

    const zone = await this.getById(id);

    if (updates.geometry) {
      this.validateGeometry(updates.geometry);
      zone.geometry = updates.geometry;
    }

    if (updates.name !== undefined) {
      zone.name = updates.name ?? null;
    }

    try {
      return await this.repository.save(zone);
    } catch (error) {
      this.handleRepositoryError(error, "update restricted zone");
    }
  }

  async delete(id: string): Promise<void> {
    const result = await this.repository.delete({ id });
    if (result.affected === 0) {
      throw new NotFoundError(`Restricted zone with id '${id}' not found`);
    }
  }

  private validateGeometry(geometry: RestrictedZoneGeometry): void {
    if (!geometry || geometry.type !== "Polygon" || !Array.isArray(geometry.coordinates)) {
      throw new ValidationError("Restricted zone geometry must be a polygon", geometry);
    }

    if (geometry.coordinates.length === 0) {
      throw new ValidationError("Restricted zone polygon must contain at least one ring", geometry);
    }

    const outerRing = geometry.coordinates[0];

    if (!Array.isArray(outerRing) || outerRing.length < 4) {
      throw new ValidationError("Restricted zone polygon must contain at least 4 points", geometry);
    }

    for (const point of outerRing) {
      if (typeof point.x !== "number" || typeof point.y !== "number") {
        throw new ValidationError("Restricted zone polygon points must be numeric", point);
      }
    }

    const firstPoint = outerRing[0];
    const lastPoint = outerRing[outerRing.length - 1];

    if (firstPoint.x !== lastPoint.x || firstPoint.y !== lastPoint.y) {
      throw new ValidationError("Restricted zone polygon must be closed (first and last points equal)", geometry);
    }
  }

  private handleRepositoryError(error: unknown, action: string): never {
    if (error instanceof QueryFailedError) {
      const code = (error.driverError?.code ?? "") as string;
      if (code === "23503" || code === "SQLITE_CONSTRAINT" || code.includes("FOREIGN")) {
        throw new DependencyError("Referenced map does not exist", error.driverError);
      }
    }

    throw new InternalServiceError(`Failed to ${action}`, error);
  }
}

export default ZoneService;
