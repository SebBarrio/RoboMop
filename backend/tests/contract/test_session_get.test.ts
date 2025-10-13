import { randomUUID } from "crypto";
import request from "supertest";

import app from "../../src/server";
import {
  buildMapCreatePayload,
  buildRobotCreatePayload,
  buildSessionCreatePayload
} from "./helpers/testData";
import { expectSessionSchema } from "./helpers/schemaValidators";

describe("GET /api/v1/sessions/:sessionId", () => {
  const createSession = async (): Promise<{ sessionId: string }> => {
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

    const sessionResponse = await request(app)
      .post("/api/v1/sessions")
      .set("Accept", "application/json")
      .send(buildSessionCreatePayload(robotId, mapId));

    expect(sessionResponse.status).toBe(201);
    const { id: sessionId } = sessionResponse.body as { id: string };

    return { sessionId };
  };

  it("returns session details that match the contract", async () => {
    const { sessionId } = await createSession();

    const response = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("Accept", "application/json");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expectSessionSchema(response.body);
    expect(response.body.id).toBe(sessionId);
  });

  it("returns 404 when the session is not found", async () => {
    const response = await request(app)
      .get(`/api/v1/sessions/${randomUUID()}`)
      .set("Accept", "application/json");

    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
  });
});
