import { Router, Request, Response, NextFunction } from 'express';
import { LogService } from '../../services/LogService';

/**
 * Log API Routes
 * Implements T070
 * Endpoints: GET, DELETE /logs with filtering
 */

const router = Router();
const logService = new LogService();

/**
 * GET /api/v1/logs
 * Query logs with filters
 */
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { robotId, sessionId, level, since, limit } = req.query;

    const filters: Parameters<typeof logService.findAll>[0] = {};
    
    if (robotId) filters.robotId = robotId as string;
    if (sessionId) filters.sessionId = sessionId as string;
    if (level) filters.level = level as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
    if (since) filters.since = new Date(since as string);
    if (limit) {
      const limitNum = parseInt(limit as string, 10);
      if (limitNum > 1000) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'limit cannot exceed 1000',
          statusCode: 400,
        });
      }
      filters.limit = limitNum;
    }

    const logs = await logService.findAll(filters);
    res.json(logs);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid date')) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid date format for since parameter',
        statusCode: 400,
      });
    }
    next(error);
  }
});

/**
 * DELETE /api/v1/logs
 * Clear logs with filters
 */
router.delete('/', async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { robotId, before } = req.query;

    const filters: Parameters<typeof logService.clear>[0] = {};
    
    if (robotId) filters.robotId = robotId as string;
    if (before) filters.before = new Date(before as string);

    await logService.clear(filters);
    res.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid date')) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid date format for before parameter',
        statusCode: 400,
      });
    }
    next(error);
  }
});

export default router;

