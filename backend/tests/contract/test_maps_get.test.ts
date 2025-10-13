import request from "supertest";

import app from "../../src/server";
import {
  buildMapCreatePayload,
  buildRobotCreatePayload
} from "./helpers/testData";
import { expectMapMetadataSchema } from "./helpers/schemaValidators";

describe("GET /api/v1/maps", () => {
  it("returns a list of maps matching the contract", async () => {
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

    const response = await request(app)
      .get("/api/v1/maps")
      .set("Accept", "application/json");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(Array.isArray(response.body)).toBe(true);

    const maps = response.body as unknown[];
    expect(maps.length).toBeGreaterThan(0);
    maps.forEach(expectMapMetadataSchema);
  });

  it("supports filtering by robotId", async () => {
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

    const response = await request(app)
      .get("/api/v1/maps")
      .query({ robotId })
      .set("Accept", "application/json");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    const maps = response.body as unknown[];
    expect(Array.isArray(maps)).toBe(true);
    maps.forEach((item) => {
      expectMapMetadataSchema(item);
      const map = item as { robotId: string };
      expect(map.robotId).toBe(robotId);
    });
  });
});
