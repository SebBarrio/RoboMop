import { randomUUID } from "crypto";
import request from "supertest";

import app from "../../src/server";
import {
  buildMapCreatePayload,
  buildRobotCreatePayload
} from "./helpers/testData";
import { expectMapMetadataSchema } from "./helpers/schemaValidators";

describe("GET /api/v1/maps/:mapId", () => {
  it("returns map metadata matching the contract", async () => {
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

    const response = await request(app)
      .get(`/api/v1/maps/${mapId}`)
      .set("Accept", "application/json");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expectMapMetadataSchema(response.body);
    expect(response.body.id).toBe(mapId);
  });

  it("returns 404 for unknown maps", async () => {
    const response = await request(app)
      .get(`/api/v1/maps/${randomUUID()}`)
      .set("Accept", "application/json");

    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
  });
});
