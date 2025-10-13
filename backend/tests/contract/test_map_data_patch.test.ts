import { randomUUID } from "crypto";
import request from "supertest";

import app from "../../src/server";
import {
  buildMapCreatePayload,
  buildRobotCreatePayload
} from "./helpers/testData";

describe("PATCH /api/v1/maps/:mapId/data", () => {
  it("applies delta updates to stored map data", async () => {
    const robotResponse = await request(app)
      .post("/api/v1/robots")
      .set("Accept", "application/json")
      .send(buildRobotCreatePayload());

    expect(robotResponse.status).toBe(201);
    const { id: robotId } = robotResponse.body as { id: string };

    const mapResponse = await request(app)
      .post("/api/v1/maps")
      .set("Accept", "application/json")
      .send(buildMapCreatePayload(robotId));

    expect(mapResponse.status).toBe(201);
    const { id: mapId } = mapResponse.body as { id: string };

    const initialData = Buffer.from([0, 0, 0, 0]).toString("base64");

    const putResponse = await request(app)
      .put(`/api/v1/maps/${mapId}/data`)
      .set("Accept", "application/json")
      .send({ data: initialData });

    expect(putResponse.status).toBe(200);

    const patchResponse = await request(app)
      .patch(`/api/v1/maps/${mapId}/data`)
      .set("Accept", "application/json")
      .send({
        cells: [
          { row: 0, col: 1, value: 128 },
          { row: 0, col: 3, value: 200 }
        ]
      });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.headers["content-type"]).toMatch(/application\/json/);

    const getResponse = await request(app)
      .get(`/api/v1/maps/${mapId}/data`)
      .set("Accept", "application/json");

    expect(getResponse.status).toBe(200);
    const buffer = Buffer.from(getResponse.body.data as string, "base64");
    expect(buffer[1]).toBe(128);
    expect(buffer[3]).toBe(200);
  });

  it("requires a valid cells array in the payload", async () => {
    const robotResponse = await request(app)
      .post("/api/v1/robots")
      .set("Accept", "application/json")
      .send(buildRobotCreatePayload());

    expect(robotResponse.status).toBe(201);
    const { id: robotId } = robotResponse.body as { id: string };

    const mapResponse = await request(app)
      .post("/api/v1/maps")
      .set("Accept", "application/json")
      .send(buildMapCreatePayload(robotId));

    expect(mapResponse.status).toBe(201);
    const { id: mapId } = mapResponse.body as { id: string };

    const response = await request(app)
      .patch(`/api/v1/maps/${mapId}/data`)
      .set("Accept", "application/json")
      .send({ cells: [{ row: -1, col: 0, value: 10 }] });

    expect(response.status).toBe(400);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
  });

  it("returns 404 when the map does not exist", async () => {
    const response = await request(app)
      .patch(`/api/v1/maps/${randomUUID()}/data`)
      .set("Accept", "application/json")
      .send({
        cells: [{ row: 0, col: 0, value: 10 }]
      });

    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
  });
});
