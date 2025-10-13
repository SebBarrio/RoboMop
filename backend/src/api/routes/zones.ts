import { Router, Request, Response, NextFunction } from "express";

import { ZoneService } from "../../services/ZoneService.js";
import { RestrictedZoneGeometry } from "../../models/RestrictedZone.js";

const router = Router();
const zoneService = new ZoneService();

interface ZoneUpdateBody {
  name?: string;
  geometry?: RestrictedZoneGeometry;
}

router.get("/:zoneId", (req: Request, res: Response, next: NextFunction) => {
  void zoneService
    .getById(req.params.zoneId)
    .then((zone) => {
      res.status(200).json(zone);
    })
    .catch(next);
});

router.patch("/:zoneId", (req: Request, res: Response, next: NextFunction) => {
  const { name, geometry } = req.body as ZoneUpdateBody;
  void zoneService
    .update(req.params.zoneId, {
      name,
      geometry
    })
    .then((zone) => {
      res.status(200).json(zone);
    })
    .catch(next);
});

router.delete("/:zoneId", (req: Request, res: Response, next: NextFunction) => {
  void zoneService
    .delete(req.params.zoneId)
    .then(() => {
      res.status(204).send();
    })
    .catch(next);
});

export default router;
