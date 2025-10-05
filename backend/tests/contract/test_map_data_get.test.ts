import { randomUUID } from "crypto";
import request from "supertest";

import app from "../../src/server";
import {
  buildMapCreatePayload,
  buildRobotCreatePayload
} from "./helpers/testData";

describe("GET /api/v1/maps/:mapId/data", () => {
  it("returns map data in JSON format", async () => {
    const robotResponse = await request(app)
      .post("/api/v1/robots")
      .set("Accept", "application/json")
      .send(buildRobotCreatePayload());

    expect(robotResponse.status).toBe(201);
    const { id: robotId } = robotResponse.body as { id: string };

    const createResponse = await request(app)
      .post("/api/v1/maps")
      .set("Accept", "application/json")
      .send(buildMapCreatePayload(robotId));

    expect(createResponse.status).toBe(201);
    const { id: mapId } = createResponse.body as { id: string };

    const base64Data = Buffer.from([0, 1, 2, 3]).toString("base64");

    const putResponse = await request(app)
      .put(`/api/v1/maps/${mapId}/data`)
      .set("Accept", "application/json")
      .send({ data: base64Data });

    expect(putResponse.status).toBe(200);

    const response = await request(app)
      .get(`/api/v1/maps/${mapId}/data`)
      .set("Accept", "application/json");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(
      expect.objectContaining({ data: base64Data })
    );
  });

  it("returns 404 for unknown maps", async () => {
    const response = await request(app)
      .get(`/api/v1/maps/${randomUUID()}/data`)
      .set("Accept", "application/json");

    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
  });
});
