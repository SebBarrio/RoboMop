import { Router } from "express";

import robotsRouter from "./robots.js";
import mapsRouter from "./maps.js";
import zonesRouter from "./zones.js";
import sessionsRouter from "./sessions.js";
import logsRouter from "./logs.js";

const router = Router();

router.use("/robots", robotsRouter);
router.use("/maps", mapsRouter);
router.use("/zones", zonesRouter);
router.use("/sessions", sessionsRouter);
router.use("/logs", logsRouter);

export default router;
