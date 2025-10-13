import { randomUUID } from "crypto";
import request from "supertest";

import app from "../../src/server";
import { buildRobotCreatePayload } from "./helpers/testData";
import { expectLogSchema } from "./helpers/schemaValidators";

describe("GET /api/v1/logs", () => {
  it("returns logs that satisfy the contract schema", async () => {
    // Ensure the API can handle queries even when no logs exist.
    const response = await request(app)
      .get("/api/v1/logs?limit=10")
      .set("Accept", "application/json");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(Array.isArray(response.body)).toBe(true);

    const logs = response.body as unknown[];
    logs.forEach((log) => expectLogSchema(log));
  });

  it("rejects invalid query parameters with a 400 response", async () => {
    const response = await request(app)
      .get("/api/v1/logs?limit=-5")
      .set("Accept", "application/json");

    expect(response.status).toBe(400);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
  });

  it("supports filtering by robotId", async () => {
    const robotResponse = await request(app)
      .post("/api/v1/robots")
      .set("Accept", "application/json")
      .send(buildRobotCreatePayload());

    expect(robotResponse.status).toBe(201);
    const { id: robotId } = robotResponse.body as { id: string };

    const response = await request(app)
      .get(`/api/v1/logs?robotId=${robotId}`)
      .set("Accept", "application/json");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(Array.isArray(response.body)).toBe(true);

    const logs = response.body as Array<{ robotId: string }>;
    logs.forEach((log) => {
      expectLogSchema(log);
      expect(log.robotId).toBe(robotId);
    });
  });

  it("supports filtering by sessionId and returns an array", async () => {
    const response = await request(app)
      .get(`/api/v1/logs?sessionId=${randomUUID()}`)
      .set("Accept", "application/json");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(Array.isArray(response.body)).toBe(true);

    const logs = response.body as unknown[];
    logs.forEach((log) => expectLogSchema(log));
  });
});
