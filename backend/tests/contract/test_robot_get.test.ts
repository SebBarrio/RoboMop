import { randomUUID } from "crypto";
import request from "supertest";

import app from "../../src/server";

import { expectRobotSchema } from "./helpers/schemaValidators";
import { buildRobotCreatePayload } from "./helpers/testData";

describe("GET /api/v1/robots/:robotId", () => {
  it("returns a robot that matches the contract schema", async () => {
    const createResponse = await request(app)
      .post("/api/v1/robots")
      .set("Accept", "application/json")
      .send(buildRobotCreatePayload());

    expect(createResponse.status).toBe(201);
    const { id: robotId } = createResponse.body as { id: string };
    expect(typeof robotId).toBe("string");

    const response = await request(app)
      .get(`/api/v1/robots/${robotId}`)
      .set("Accept", "application/json");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expectRobotSchema(response.body);
    expect(response.body.id).toBe(robotId);
  });

  it("returns 404 for an unknown robot", async () => {
    const response = await request(app)
      .get(`/api/v1/robots/${randomUUID()}`)
      .set("Accept", "application/json");

    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: expect.any(String)
      })
    );
  });
});
