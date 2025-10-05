import { randomUUID } from "crypto";
import request from "supertest";

import app from "../../src/server";
import {
  buildMapCreatePayload,
  buildRobotCreatePayload,
  buildZoneCreatePayload
} from "./helpers/testData";
import { expectRestrictedZoneSchema } from "./helpers/schemaValidators";

describe("GET /api/v1/zones/:zoneId", () => {
  it("returns a restricted zone by id", async () => {
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

    const zoneResponse = await request(app)
      .post(`/api/v1/maps/${mapId}/zones`)
      .set("Accept", "application/json")
      .send(buildZoneCreatePayload());

    expect(zoneResponse.status).toBe(201);
    const { id: zoneId } = zoneResponse.body as { id: string };

    const response = await request(app)
      .get(`/api/v1/zones/${zoneId}`)
      .set("Accept", "application/json");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expectRestrictedZoneSchema(response.body);
  });

  it("returns 404 when the zone does not exist", async () => {
    const response = await request(app)
      .get(`/api/v1/zones/${randomUUID()}`)
      .set("Accept", "application/json");

    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
  });
});
