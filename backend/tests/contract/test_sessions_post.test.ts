import request from "supertest";

import app from "../../src/server";
import {
  buildMapCreatePayload,
  buildRobotCreatePayload,
  buildSessionCreatePayload
} from "./helpers/testData";
import {
  expectLocationHeader,
  expectSessionSchema
} from "./helpers/schemaValidators";

describe("POST /api/v1/sessions", () => {
  it("creates a session according to the contract", async () => {
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

    const createPayload = buildSessionCreatePayload(robotId, mapId, { type: "CLEANING" });

    const response = await request(app)
      .post("/api/v1/sessions")
      .set("Accept", "application/json")
      .send(createPayload);

    expect(response.status).toBe(201);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expectSessionSchema(response.body);
    expect(response.body).toMatchObject({
      robotId,
      mapId,
      type: "CLEANING"
    });
    expectLocationHeader(response.headers as Record<string, string | string[] | undefined>);
  });

  it("rejects invalid payloads with a 400 response", async () => {
    const response = await request(app)
      .post("/api/v1/sessions")
      .set("Accept", "application/json")
      .send({});

    expect(response.status).toBe(400);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: expect.any(String)
      })
    );
  });
});
