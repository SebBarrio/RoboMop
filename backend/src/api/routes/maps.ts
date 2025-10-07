import { Router, Request, Response, NextFunction } from 'express';
import { MapService } from '../../services/MapService';
import { isValidUuid } from '../../utils/validation';

/**
 * Map API Routes
 * Implements T067
 * Endpoints: GET, POST, PATCH, DELETE /maps, /maps/:id, /maps/:id/data
 */

const router = Router();
const mapService = new MapService();

/**
 * GET /api/v1/maps
 * List all maps (optionally filter by robotId)
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { robotId } = req.query;
    if (robotId && !isValidUuid(robotId)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid robotId format',
        statusCode: 400,
      });
    }
    const maps = await mapService.findAll(robotId as string | undefined);
    res.json(maps);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/maps
 * Create a new map
 */
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { robotId, name, resolution, width, height, origin } = req.body;

    // Validation
    if (!robotId || resolution === undefined || width === undefined || height === undefined || !origin) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields: robotId, resolution, width, height, origin',
        statusCode: 400,
      });
    }

    if (!isValidUuid(robotId)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid robotId format',
        statusCode: 400,
      });
    }

    if (typeof resolution !== 'number' || resolution < 0.01 || resolution > 0.1) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'resolution must be between 0.01 and 0.1',
        statusCode: 400,
      });
    }

    if (typeof width !== 'number' || width < 100 || width > 10000) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'width must be between 100 and 10000',
        statusCode: 400,
      });
    }

    if (typeof height !== 'number' || height < 100 || height > 10000) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'height must be between 100 and 10000',
        statusCode: 400,
      });
    }

    if (!origin || typeof origin.x !== 'number' || typeof origin.y !== 'number' || typeof origin.theta !== 'number') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'origin must include numeric x, y, and theta',
        statusCode: 400,
      });
    }

    if (name && name.length > 100) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'name must not exceed 100 characters',
        statusCode: 400,
      });
    }

    const map = await mapService.create({ robotId, name, resolution, width, height, origin });
    res.status(201).json(map);
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({
        error: 'Bad Request',
        message: error.message,
        statusCode: 400,
      });
    }
    next(error);
  }
});

/**
 * GET /api/v1/maps/:mapId
 * Get map metadata
 */
router.get('/:mapId', async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { mapId } = req.params;

    // Validate UUID
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mapId)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid mapId format',
        statusCode: 400,
      });
    }

    const map = await mapService.findById(mapId);

    if (!map) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Map with id '${mapId}' not found`,
        statusCode: 404,
      });
    }

    // Don't include data buffer in metadata response
    const { data, ...metadata } = map;
    res.json(metadata);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/v1/maps/:mapId
 * Update map metadata
 */
router.patch('/:mapId', async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { mapId } = req.params;
    const { name, metadata, completionPercentage } = req.body;

    if (!isValidUuid(mapId)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid mapId format',
        statusCode: 400,
      });
    }

    if (name && name.length > 100) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'name must not exceed 100 characters',
        statusCode: 400,
      });
    }

    if (completionPercentage !== undefined) {
      if (
        typeof completionPercentage !== 'number' ||
        completionPercentage < 0 ||
        completionPercentage > 100
      ) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'completionPercentage must be between 0 and 100',
          statusCode: 400,
        });
      }
    }

    if (metadata && typeof metadata !== 'object') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'metadata must be an object',
        statusCode: 400,
      });
    }

    const map = await mapService.update(mapId, { name, metadata, completionPercentage });
    const { data, ...mapMetadata } = map;
    res.json(mapMetadata);
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Not Found',
        message: error.message,
        statusCode: 404,
      });
    }
    next(error);
  }
});

/**
 * DELETE /api/v1/maps/:mapId
 * Delete a map
 */
router.delete('/:mapId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mapId } = req.params;
    if (!isValidUuid(mapId)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid mapId format',
        statusCode: 400,
      });
    }

    const map = await mapService.findById(mapId);
    if (!map) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Map with id '${mapId}' not found`,
        statusCode: 404,
      });
    }
    await mapService.delete(mapId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/maps/:mapId/data
 * Get map grid data
 */
router.get('/:mapId/data', async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { mapId } = req.params;
    if (!isValidUuid(mapId)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid mapId format',
        statusCode: 400,
      });
    }

    const map = await mapService.findById(mapId);

    if (!map) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Map with id '${mapId}' not found`,
        statusCode: 404,
      });
    }

    if (!map.data) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Map data not found',
        statusCode: 404,
      });
    }

    // Return as base64 or binary
    const acceptHeader = req.headers.accept || '';
    if (acceptHeader.includes('application/json')) {
      res.json({ data: map.data.toString('base64') });
    } else {
      res.contentType('application/octet-stream');
      res.send(map.data);
    }
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/maps/:mapId/data
 * Update map grid data (full replacement)
 */
router.put('/:mapId/data', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mapId } = req.params;
    if (!isValidUuid(mapId)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid mapId format',
        statusCode: 400,
      });
    }

    const map = await mapService.findById(mapId);
    if (!map) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Map with id '${mapId}' not found`,
        statusCode: 404,
      });
    }

    let dataBuffer: Buffer;
    if (req.is('application/json')) {
      const { data } = req.body;
      if (typeof data !== 'string') {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'data must be a base64-encoded string',
          statusCode: 400,
        });
      }
      const base64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
      if (!base64Regex.test(data)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid base64 encoding for map data',
          statusCode: 400,
        });
      }
      try {
        dataBuffer = Buffer.from(data, 'base64');
      } catch (error) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid base64 encoding for map data',
          statusCode: 400,
        });
      }
    } else {
      if (!Buffer.isBuffer(req.body)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Binary payload required for octet-stream requests',
          statusCode: 400,
        });
      }
      dataBuffer = req.body;
    }

    const expectedSize = map.width * map.height;
    if (dataBuffer.length !== expectedSize) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Map data size must be exactly ${expectedSize} bytes`,
        statusCode: 400,
      });
    }

    await mapService.updateData(mapId, dataBuffer);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/v1/maps/:mapId/data
 * Update map grid cells (delta update)
 */
router.patch('/:mapId/data', async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { mapId } = req.params;
    const { cells } = req.body;

    if (!isValidUuid(mapId)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid mapId format',
        statusCode: 400,
      });
    }

    const map = await mapService.findById(mapId);
    if (!map) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Map with id '${mapId}' not found`,
        statusCode: 404,
      });
    }

    if (!map.data) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Map has no data buffer initialized',
        statusCode: 400,
      });
    }

    if (!cells || !Array.isArray(cells)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'cells array is required',
        statusCode: 400,
      });
    }

    for (const cell of cells) {
      if (
        typeof cell?.row !== 'number' ||
        typeof cell?.col !== 'number' ||
        typeof cell?.value !== 'number'
      ) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Each cell must include numeric row, col, and value',
          statusCode: 400,
        });
      }

      if (cell.value < 0 || cell.value > 255) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Cell value must be between 0 and 255',
          statusCode: 400,
        });
      }

      if (
        cell.row < 0 ||
        cell.row >= map.height ||
        cell.col < 0 ||
        cell.col >= map.width
      ) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Cell coordinates are out of map bounds',
          statusCode: 400,
        });
      }
    }

    await mapService.updateCells(mapId, cells);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;

