import request from "supertest";

import app from "../../src/server";
import { expectRobotStateSchema } from "./helpers/schemaValidators";
import {
  buildRobotCreatePayload,
  buildRobotStateUpdatePayload
} from "./helpers/testData";

describe("GET /api/v1/robots/:robotId/state", () => {
  it("returns the latest robot state matching the contract", async () => {
    const createResponse = await request(app)
      .post("/api/v1/robots")
      .set("Accept", "application/json")
      .send(buildRobotCreatePayload());

    expect(createResponse.status).toBe(201);
    const { id: robotId } = createResponse.body as { id: string };

    const statePayload = buildRobotStateUpdatePayload({ mode: "EXPLORATION" });

    const postStateResponse = await request(app)
      .post(`/api/v1/robots/${robotId}/state`)
      .set("Accept", "application/json")
      .send(statePayload);

    expect(postStateResponse.status).toBe(200);

    const response = await request(app)
      .get(`/api/v1/robots/${robotId}/state`)
      .set("Accept", "application/json");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expectRobotStateSchema(response.body);
    expect(response.body.mode).toBe("EXPLORATION");
  });

  it("returns 404 when no state exists", async () => {
    const createResponse = await request(app)
      .post("/api/v1/robots")
      .set("Accept", "application/json")
      .send(buildRobotCreatePayload());

    expect(createResponse.status).toBe(201);
    const { id: robotId } = createResponse.body as { id: string };

    const response = await request(app)
      .get(`/api/v1/robots/${robotId}/state`)
      .set("Accept", "application/json");

    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
  });
});
