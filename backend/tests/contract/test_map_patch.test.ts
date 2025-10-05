import { randomUUID } from "crypto";
import request from "supertest";

import app from "../../src/server";
import {
  buildMapCreatePayload,
  buildMapUpdatePayload,
  buildRobotCreatePayload
} from "./helpers/testData";
import { expectMapMetadataSchema } from "./helpers/schemaValidators";

describe("PATCH /api/v1/maps/:mapId", () => {
  it("updates map metadata according to the contract", async () => {
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

    const updatePayload = buildMapUpdatePayload({ completionPercentage: 85 });

    const response = await request(app)
      .patch(`/api/v1/maps/${mapId}`)
      .set("Accept", "application/json")
      .send(updatePayload);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expectMapMetadataSchema(response.body);
    expect(response.body.completionPercentage).toBe(85);
    expect(response.body.metadata).toEqual(
      expect.objectContaining(updatePayload.metadata)
    );
  });

  it("returns 404 when the map does not exist", async () => {
    const response = await request(app)
      .patch(`/api/v1/maps/${randomUUID()}`)
      .set("Accept", "application/json")
      .send(buildMapUpdatePayload());

    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
  });

  it("rejects invalid payloads with a 400 response", async () => {
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
      .patch(`/api/v1/maps/${mapId}`)
      .set("Accept", "application/json")
      .send({ completionPercentage: 150 });

    expect(response.status).toBe(400);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
  });
});
