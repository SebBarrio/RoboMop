import { Router, Request, Response, NextFunction } from 'express';
import { ZoneService } from '../../services/ZoneService';
import { MapService } from '../../services/MapService';
import { isValidUuid } from '../../utils/validation';

/**
 * Zone API Routes
 * Implements T068
 * Endpoints: GET, POST, PATCH, DELETE /zones/:id, /maps/:id/zones
 */

const router = Router();
const zoneService = new ZoneService();
const mapService = new MapService();

/**
 * GET /api/v1/maps/:mapId/zones
 * List restricted zones for a map
 */
router.get('/maps/:mapId/zones', async (req: Request, res: Response, next: NextFunction) => {
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

    const zones = await zoneService.findByMapId(mapId);
    res.json(zones);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/maps/:mapId/zones
 * Create a restricted zone
 */
router.post('/maps/:mapId/zones', async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { mapId } = req.params;
    const { name, geometry } = req.body;

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

    if (!geometry) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required field: geometry',
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

    const zone = await zoneService.create({ mapId, name, geometry });
    res.status(201).json(zone);
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
 * GET /api/v1/zones/:zoneId
 * Get zone details
 */
router.get('/:zoneId', async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { zoneId } = req.params;
    if (!isValidUuid(zoneId)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid zoneId format',
        statusCode: 400,
      });
    }
    const zone = await zoneService.findById(zoneId);

    if (!zone) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Zone with id '${zoneId}' not found`,
        statusCode: 404,
      });
    }

    res.json(zone);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/v1/zones/:zoneId
 * Update a restricted zone
 */
router.patch('/:zoneId', async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { zoneId } = req.params;
    const { name, geometry } = req.body;

    if (!isValidUuid(zoneId)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid zoneId format',
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

    const zone = await zoneService.update(zoneId, { name, geometry });
    res.json(zone);
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Not Found',
        message: error.message,
        statusCode: 404,
      });
    }
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
 * DELETE /api/v1/zones/:zoneId
 * Delete a restricted zone
 */
router.delete('/:zoneId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { zoneId } = req.params;
    if (!isValidUuid(zoneId)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid zoneId format',
        statusCode: 400,
      });
    }

    const zone = await zoneService.findById(zoneId);
    if (!zone) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Zone with id '${zoneId}' not found`,
        statusCode: 404,
      });
    }

    await zoneService.delete(zoneId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;

