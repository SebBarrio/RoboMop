import request from "supertest";

import app from "../../src/server";

import {
  buildRobotCommandPayload,
  buildRobotCreatePayload
} from "./helpers/testData";

const COMMAND_STATUS_VALUES = ["queued", "sent", "acknowledged"];

describe("POST /api/v1/robots/:robotId/command", () => {
  it("enqueues a valid command according to the contract", async () => {
    const createResponse = await request(app)
      .post("/api/v1/robots")
      .set("Accept", "application/json")
      .send(buildRobotCreatePayload());

    expect(createResponse.status).toBe(201);
    const { id: robotId } = createResponse.body as { id: string };

    const response = await request(app)
      .post(`/api/v1/robots/${robotId}/command`)
      .set("Accept", "application/json")
      .send(buildRobotCommandPayload());

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);

    const body = response.body as Record<string, unknown>;
    expect(typeof body.commandId).toBe("string");
    expect(typeof body.status).toBe("string");
    if (typeof body.status === "string") {
      expect(COMMAND_STATUS_VALUES).toContain(body.status);
    }
  });

  it("rejects invalid commands with a 400 response", async () => {
    const createResponse = await request(app)
      .post("/api/v1/robots")
      .set("Accept", "application/json")
      .send(buildRobotCreatePayload());

    expect(createResponse.status).toBe(201);
    const { id: robotId } = createResponse.body as { id: string };

    const response = await request(app)
      .post(`/api/v1/robots/${robotId}/command`)
      .set("Accept", "application/json")
      .send({ type: "INVALID", payload: {} });

    expect(response.status).toBe(400);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
  });
});
