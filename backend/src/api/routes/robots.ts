import { Router, Request, Response, NextFunction } from 'express';
import { RobotService } from '../../services/RobotService';

/**
 * Robot API Routes
 * Implements T066
 * Endpoints: GET, POST, PATCH /robots, /robots/:id, /robots/:id/state, /robots/:id/command
 */

const router = Router();
const robotService = new RobotService();

/**
 * GET /api/v1/robots
 * List all robots
 */
router.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const robots = await robotService.findAll();
    return res.json(robots);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/robots
 * Register a new robot
 */
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { name, serialNumber, modelVersion, firmwareVersion } = req.body;

    // Validation
    if (!name || !serialNumber || !modelVersion || !firmwareVersion) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields: name, serialNumber, modelVersion, firmwareVersion',
        statusCode: 400,
      });
    }

    // Validate serialNumber format (alphanumeric and hyphens only)
    if (!/^[A-Z0-9-]+$/.test(serialNumber)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'serialNumber must contain only uppercase letters, numbers, and hyphens',
        statusCode: 400,
      });
    }

    // Validate name length
    if (name.length > 100) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'name must not exceed 100 characters',
        statusCode: 400,
      });
    }

    const robot = await robotService.create({ name, serialNumber, modelVersion, firmwareVersion });
    res.status(201).json(robot);
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
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
 * GET /api/v1/robots/:robotId
 * Get robot details
 */
router.get('/:robotId', async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { robotId } = req.params;

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(robotId)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid robotId format',
        statusCode: 400,
      });
    }

    const robot = await robotService.findById(robotId);

    if (!robot) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Robot with id '${robotId}' not found`,
        statusCode: 404,
      });
    }

    res.json(robot);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/v1/robots/:robotId
 * Update robot metadata
 */
router.patch('/:robotId', async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { robotId } = req.params;
    const { name, status } = req.body;

    const robot = await robotService.update(robotId, { name, status });
    res.json(robot);
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
 * GET /api/v1/robots/:robotId/state
 * Get current robot state
 * TODO: Implement with RobotState entity
 */
router.get('/:robotId/state', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { robotId } = req.params;

    // TODO: Fetch latest state from RobotState table
    // For now, return placeholder
    res.json({
      robotId,
      timestamp: new Date().toISOString(),
      mode: 'IDLE',
      position: { x: 0, y: 0, theta: 0, confidence: 1.0 },
      velocity: { linear: 0, angular: 0 },
      batteryLevel: 100,
      waterLevel: 100,
      motorCurrents: { left: 0, right: 0 },
      errors: [],
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/robots/:robotId/state
 * Update robot state (called by robot)
 * TODO: Implement with RobotState entity
 */
router.post('/:robotId/state', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { robotId } = req.params;
    const stateData = req.body;

    // TODO: Save state to database
    // Update robot lastSeenAt
    await robotService.updateLastSeen(robotId);

    res.json({ ...stateData, id: 'state-id-placeholder', robotId });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/robots/:robotId/command
 * Send command to robot (proxied via WebSocket)
 * TODO: Integrate with WebSocket handler
 */
router.post('/:robotId/command', async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { robotId: _robotId } = req.params;
    const { type, payload } = req.body;

    if (!type || !payload) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields: type, payload',
        statusCode: 400,
      });
    }

    // TODO: Send command via WebSocket to robot
    // For now, return success
    res.json({
      commandId: `cmd-${Date.now()}`,
      status: 'queued',
    });
  } catch (error) {
    next(error);
  }
});

export default router;

