import { Router, Request, Response, NextFunction } from "express";

import { MapService, MapCellUpdate } from "../../services/MapService.js";
import { ZoneService } from "../../services/ZoneService.js";
import { Origin } from "../../models/embeddables.js";
import { RestrictedZoneGeometry } from "../../models/RestrictedZone.js";

const router = Router();
const mapService = new MapService();
const zoneService = new ZoneService();

interface MapCreateBody {
  robotId: string;
  name?: string;
  resolution: number;
  width: number;
  height: number;
  origin: Origin;
  metadata?: Record<string, unknown>;
}

interface MapUpdateBody {
  name?: string;
  metadata?: Record<string, unknown>;
  completionPercentage?: number;
}

interface MapDataBody {
  data: string;
}

interface MapCellsBody {
  cells: MapCellUpdate[];
}

interface ZoneCreateBody {
  name?: string;
  geometry: RestrictedZoneGeometry;
}

router.get("/", (req: Request, res: Response, next: NextFunction) => {
  const options = {
    robotId: req.query.robotId as string | undefined
  };
  void mapService
    .list(options)
    .then((maps) => {
      res.status(200).json(maps);
    })
    .catch(next);
});

router.post("/", (req: Request, res: Response, next: NextFunction) => {
  const { robotId, name, resolution, width, height, origin, metadata } = req.body as MapCreateBody;
  void mapService
    .create({
      robotId,
      name,
      resolution,
      width,
      height,
      origin,
      metadata
    })
    .then((map) => {
      res.status(201).json(map);
    })
    .catch(next);
});

router.get("/:mapId", (req: Request, res: Response, next: NextFunction) => {
  void mapService
    .getById(req.params.mapId)
    .then((map) => {
      res.status(200).json(map);
    })
    .catch(next);
});

router.patch("/:mapId", (req: Request, res: Response, next: NextFunction) => {
  const { name, metadata, completionPercentage } = req.body as MapUpdateBody;
  void mapService
    .update(req.params.mapId, {
      name,
      metadata,
      completionPercentage
    })
    .then((map) => {
      res.status(200).json(map);
    })
    .catch(next);
});

router.delete("/:mapId", (req: Request, res: Response, next: NextFunction) => {
  void mapService
    .delete(req.params.mapId)
    .then(() => {
      res.status(204).send();
    })
    .catch(next);
});

router.get("/:mapId/data", (req: Request, res: Response, next: NextFunction) => {
  void mapService
    .getData(req.params.mapId)
    .then((data) => {
      if (req.accepts("application/octet-stream")) {
        res.status(200).type("application/octet-stream").send(data);
      } else {
        res.status(200).json({ data: data.toString("base64") });
      }
    })
    .catch(next);
});

router.put("/:mapId/data", (req: Request, res: Response, next: NextFunction) => {
  let dataBuffer: Buffer;

  if (req.is("application/octet-stream")) {
    dataBuffer = req.body as Buffer;
  } else {
    const body = req.body as MapDataBody;
    if (!body.data) {
      res.status(400).json({ error: "Map data is required" });
      return;
    }
    dataBuffer = Buffer.from(body.data, "base64");
  }

  void mapService
    .replaceData(req.params.mapId, dataBuffer)
    .then(() => {
      res.status(200).json({ message: "Map data updated successfully" });
    })
    .catch(next);
});

router.patch("/:mapId/data", (req: Request, res: Response, next: NextFunction) => {
  const body = req.body as MapCellsBody;

  if (!body.cells || !Array.isArray(body.cells)) {
    res.status(400).json({ error: "cells array is required" });
    return;
  }

  void mapService
    .patchCells(req.params.mapId, body.cells)
    .then(() => {
      res.status(200).json({ message: "Map cells updated successfully" });
    })
    .catch(next);
});

router.get("/:mapId/zones", (req: Request, res: Response, next: NextFunction) => {
  void zoneService
    .list({ mapId: req.params.mapId })
    .then((zones) => {
      res.status(200).json(zones);
    })
    .catch(next);
});

router.post("/:mapId/zones", (req: Request, res: Response, next: NextFunction) => {
  const { name, geometry } = req.body as ZoneCreateBody;
  void zoneService
    .create({
      mapId: req.params.mapId,
      name,
      geometry
    })
    .then((zone) => {
      res.status(201).json(zone);
    })
    .catch(next);
});

export default router;
