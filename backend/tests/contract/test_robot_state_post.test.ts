import request from "supertest";

import app from "../../src/server";
import { expectRobotStateSchema } from "./helpers/schemaValidators";
import {
  buildRobotCreatePayload,
  buildRobotStateUpdatePayload
} from "./helpers/testData";

describe("POST /api/v1/robots/:robotId/state", () => {
  it("accepts robot state updates that match the contract", async () => {
    const createResponse = await request(app)
      .post("/api/v1/robots")
      .set("Accept", "application/json")
      .send(buildRobotCreatePayload());

    expect(createResponse.status).toBe(201);
    const { id: robotId } = createResponse.body as { id: string };

    const payload = buildRobotStateUpdatePayload({ mode: "CLEANING" });

    const response = await request(app)
      .post(`/api/v1/robots/${robotId}/state`)
      .set("Accept", "application/json")
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expectRobotStateSchema(response.body);
    expect(response.body.mode).toBe("CLEANING");
  });

  it("rejects invalid payloads with a 400 response", async () => {
    const createResponse = await request(app)
      .post("/api/v1/robots")
      .set("Accept", "application/json")
      .send(buildRobotCreatePayload());

    expect(createResponse.status).toBe(201);
    const { id: robotId } = createResponse.body as { id: string };

    const invalidPayload = {
      mode: "FLYING",
      position: { x: 0, y: 0, theta: 0, confidence: 1.5 },
      velocity: { linear: 0, angular: 0 },
      batteryLevel: 150,
      waterLevel: -10,
      motorCurrents: { left: -1, right: 10 }
    };

    const response = await request(app)
      .post(`/api/v1/robots/${robotId}/state`)
      .set("Accept", "application/json")
      .send(invalidPayload);

    expect(response.status).toBe(400);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
  });
});
