import { Router, Request, Response, NextFunction } from 'express';
import { SessionService } from '../../services/SessionService';

/**
 * Session API Routes
 * Implements T069
 * Endpoints: GET, POST, PATCH /sessions, /sessions/:id
 */

const router = Router();
const sessionService = new SessionService();

/**
 * GET /api/v1/sessions
 * List sessions with optional filters
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { robotId, type, status } = req.query;
    
    const filters: Parameters<typeof sessionService.findAll>[0] = {};
    if (robotId) filters.robotId = robotId as string;
    if (type) filters.type = type as 'EXPLORATION' | 'CLEANING';
    if (status) filters.status = status as 'IN_PROGRESS' | 'COMPLETED' | 'INTERRUPTED' | 'FAILED';

    const sessions = await sessionService.findAll(filters);
    res.json(sessions);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/sessions
 * Create a new session
 */
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { robotId, mapId, type } = req.body;

    if (!robotId || !mapId || !type) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields: robotId, mapId, type',
        statusCode: 400,
      });
    }

    if (type !== 'EXPLORATION' && type !== 'CLEANING') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'type must be either EXPLORATION or CLEANING',
        statusCode: 400,
      });
    }

    const session = await sessionService.create({ robotId, mapId, type });
    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/sessions/:sessionId
 * Get session details
 */
router.get('/:sessionId', async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { sessionId } = req.params;
    const session = await sessionService.findById(sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Session with id '${sessionId}' not found`,
        statusCode: 404,
      });
    }

    res.json(session);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/v1/sessions/:sessionId
 * Update session (e.g., mark complete)
 */
router.patch('/:sessionId', async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { sessionId } = req.params;
    const { status, completedAt, statistics } = req.body;

    const session = await sessionService.update(sessionId, { status, completedAt, statistics });
    res.json(session);
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

export default router;

