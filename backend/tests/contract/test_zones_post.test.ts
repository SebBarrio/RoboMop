import { randomUUID } from "crypto";
import request from "supertest";

import app from "../../src/server";
import {
  buildMapCreatePayload,
  buildRobotCreatePayload,
  buildZoneCreatePayload
} from "./helpers/testData";
import {
  expectLocationHeader,
  expectRestrictedZoneSchema
} from "./helpers/schemaValidators";

describe("POST /api/v1/maps/:mapId/zones", () => {
  it("creates a restricted zone according to the contract", async () => {
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

    const payload = buildZoneCreatePayload();

    const response = await request(app)
      .post(`/api/v1/maps/${mapId}/zones`)
      .set("Accept", "application/json")
      .send(payload);

    expect(response.status).toBe(201);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expectLocationHeader(response.headers as Record<string, string>);
    expectRestrictedZoneSchema(response.body);
    expect(response.body.name).toBe(payload.name);
  });

  it("rejects invalid payloads with a 400 response", async () => {
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
      .post(`/api/v1/maps/${mapId}/zones`)
      .set("Accept", "application/json")
      .send({ geometry: { type: "Polygon", coordinates: [] } });

    expect(response.status).toBe(400);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
  });

  it("returns 404 when the map does not exist", async () => {
    const payload = buildZoneCreatePayload();

    const response = await request(app)
      .post(`/api/v1/maps/${randomUUID()}/zones`)
      .set("Accept", "application/json")
      .send(payload);

    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
  });
});
