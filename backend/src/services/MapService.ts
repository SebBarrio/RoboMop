import { DataSource, FindManyOptions, QueryFailedError, Repository } from "typeorm";

import AppDataSource from "../config/database.js";
import { Map } from "../models/Map.js";
import { Origin } from "../models/embeddables.js";

import { DependencyError, InternalServiceError, NotFoundError, ValidationError } from "./errors.js";

export interface MapListOptions {
  robotId?: string;
}

export interface MapCellUpdate {
  row: number;
  col: number;
  value: number;
}

export interface CreateMapInput {
  robotId: string;
  name?: string | null;
  resolution: number;
  width: number;
  height: number;
  origin: Origin;
  metadata?: Record<string, unknown> | null;
  data?: Buffer;
  completionPercentage?: number;
}

export interface UpdateMapInput {
  name?: string | null;
  metadata?: Record<string, unknown> | null;
  completionPercentage?: number;
}

export class MapService {
  private readonly repository: Repository<Map>;

  constructor(dataSource: DataSource = AppDataSource) {
    this.repository = dataSource.getRepository(Map);
  }

  async list(options: MapListOptions = {}): Promise<Map[]> {
    const findOptions: FindManyOptions<Map> = {
      order: { createdAt: "DESC" }
    };

    if (options.robotId) {
      findOptions.where = { robotId: options.robotId };
    }

    return this.repository.find(findOptions);
  }

  async getById(id: string): Promise<Map> {
    const map = await this.repository.findOne({ where: { id } });
    if (!map) {
      throw new NotFoundError(`Map with id '${id}' not found`);
    }

    return map;
  }

  async create(input: CreateMapInput): Promise<Map> {
    this.validateCreateInput(input);

    const cellCount = input.width * input.height;
    const dataBuffer = input.data ?? Buffer.alloc(cellCount, 0);

    if (dataBuffer.length !== cellCount) {
      throw new ValidationError("Map data length does not match width * height", {
        expected: cellCount,
        actual: dataBuffer.length
      });
    }

    const map = this.repository.create({
      robotId: input.robotId,
      name: input.name ? input.name.trim() : null,
      resolution: input.resolution,
      width: input.width,
      height: input.height,
      origin: input.origin,
      metadata: input.metadata ?? null,
      data: Buffer.from(dataBuffer),
      completionPercentage: input.completionPercentage ?? 0
    });

    try {
      return await this.repository.save(map);
    } catch (error) {
      this.handleRepositoryError(error, "create map");
    }
  }

  async update(id: string, updates: UpdateMapInput): Promise<Map> {
    if (!updates || Object.keys(updates).length === 0) {
      throw new ValidationError("No updates provided for map");
    }

    const map = await this.getById(id);

    if (updates.metadata && typeof updates.metadata !== "object") {
      throw new ValidationError("Map metadata must be an object", updates.metadata);
    }

    if (
      updates.completionPercentage !== undefined &&
      (updates.completionPercentage < 0 || updates.completionPercentage > 100)
    ) {
      throw new ValidationError("Map completion percentage must be between 0 and 100", updates.completionPercentage);
    }

    if (updates.name !== undefined) {
      map.name = updates.name ? updates.name.trim() : null;
    }

    if (updates.metadata !== undefined) {
      map.metadata = updates.metadata ?? null;
    }

    if (updates.completionPercentage !== undefined) {
      map.completionPercentage = updates.completionPercentage;
    }

    try {
      return await this.repository.save(map);
    } catch (error) {
      this.handleRepositoryError(error, "update map");
    }
  }

  async getData(id: string): Promise<Buffer> {
    const map = await this.getById(id);
    return Buffer.from(map.data);
  }

  async replaceData(id: string, data: Buffer): Promise<Map> {
    if (!Buffer.isBuffer(data) || data.length === 0) {
      throw new ValidationError("Map data must be provided as a non-empty Buffer");
    }

    const map = await this.getById(id);

    map.data = Buffer.from(data);

    try {
      return await this.repository.save(map);
    } catch (error) {
      this.handleRepositoryError(error, "replace map data");
    }
  }

  async patchCells(id: string, updates: MapCellUpdate[]): Promise<Map> {
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new ValidationError("No map cell updates provided");
    }

    const map = await this.getById(id);
    const width = map.width;
    const height = map.height;
    const expectedLength = width * height;

    let buffer = Buffer.from(map.data);

    if (buffer.length < expectedLength) {
      const expanded = Buffer.alloc(expectedLength, 0);
      buffer.copy(expanded);
      buffer = expanded;
    }

    for (const update of updates) {
      this.validateCellUpdate(update, width, height);
      const index = update.row * width + update.col;
      buffer[index] = update.value;
    }

    map.data = buffer;

    try {
      return await this.repository.save(map);
    } catch (error) {
      this.handleRepositoryError(error, "patch map cells");
    }
  }

  async delete(id: string): Promise<void> {
    const result = await this.repository.delete({ id });
    if (result.affected === 0) {
      throw new NotFoundError(`Map with id '${id}' not found`);
    }
  }

  private validateCreateInput(input: CreateMapInput): void {
    if (!input.robotId) {
      throw new ValidationError("robotId is required when creating a map");
    }

    if (!Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width <= 0 || input.height <= 0) {
      throw new ValidationError("Map width and height must be positive integers", {
        width: input.width,
        height: input.height
      });
    }

    if (!input.origin) {
      throw new ValidationError("Map origin is required");
    }

    const { x, y, theta } = input.origin;
    if (![x, y, theta].every((value) => typeof value === "number" && Number.isFinite(value))) {
      throw new ValidationError("Map origin must contain numeric x, y, theta values", input.origin);
    }

    if (
      input.completionPercentage !== undefined &&
      (input.completionPercentage < 0 || input.completionPercentage > 100)
    ) {
      throw new ValidationError("Map completion percentage must be between 0 and 100", input.completionPercentage);
    }

    if (input.metadata !== undefined && input.metadata !== null && typeof input.metadata !== "object") {
      throw new ValidationError("Map metadata must be an object", input.metadata);
    }
  }

  private validateCellUpdate(update: MapCellUpdate, width: number, height: number): void {
    if (
      !Number.isInteger(update.row) ||
      !Number.isInteger(update.col) ||
      update.row < 0 ||
      update.row >= height ||
      update.col < 0 ||
      update.col >= width
    ) {
      throw new ValidationError("Map cell update is out of bounds", update);
    }

    if (!Number.isInteger(update.value) || update.value < 0 || update.value > 255) {
      throw new ValidationError("Map cell value must be between 0 and 255", update.value);
    }
  }

  private handleRepositoryError(error: unknown, action: string): never {
    if (error instanceof QueryFailedError) {
      const driverError = error.driverError as { code?: string } | undefined;
      const code = driverError?.code ?? "";
      if (code === "23503" || code === "SQLITE_CONSTRAINT" || code.includes("FOREIGN")) {
        throw new DependencyError("Referenced robot does not exist", error.driverError);
      }
    }

    throw new InternalServiceError(`Failed to ${action}`, error);
  }
}

export default MapService;
