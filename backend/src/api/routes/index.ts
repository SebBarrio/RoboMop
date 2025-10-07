/**
 * API Routes Index
 * Aggregates all route modules
 */

import { Router } from 'express';
import robotsRouter from './robots';
import mapsRouter from './maps';
import zonesRouter from './zones';
import sessionsRouter from './sessions';
import logsRouter from './logs';

const router = Router();

// Mount routes
router.use('/robots', robotsRouter);
router.use('/maps', mapsRouter);
router.use('/sessions', sessionsRouter);
router.use('/logs', logsRouter);
router.use('/zones', zonesRouter); // zones/:id endpoints
router.use('/', zonesRouter); // maps/:mapId/zones endpoints (mount last to avoid conflicts)

export default router;

