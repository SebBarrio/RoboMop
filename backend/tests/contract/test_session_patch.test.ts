import { randomUUID } from "crypto";
import request from "supertest";

import app from "../../src/server";
import {
  buildMapCreatePayload,
  buildRobotCreatePayload,
  buildSessionCreatePayload,
  buildSessionUpdatePayload
} from "./helpers/testData";
import { expectSessionSchema } from "./helpers/schemaValidators";

const createSession = async (): Promise<{ sessionId: string; robotId: string; mapId: string }> => {
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

  return { sessionId, robotId, mapId };
};

describe("PATCH /api/v1/sessions/:sessionId", () => {
  it("updates a session according to the contract", async () => {
    const { sessionId } = await createSession();
    const updatePayload = buildSessionUpdatePayload({ status: "COMPLETED" });

    const response = await request(app)
      .patch(`/api/v1/sessions/${sessionId}`)
      .set("Accept", "application/json")
      .send(updatePayload);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expectSessionSchema(response.body);
    expect(response.body.status).toBe("COMPLETED");
    expect(response.body.completedAt).toBe(updatePayload.completedAt);
    expect(response.body.statistics).toEqual(
      expect.objectContaining(updatePayload.statistics ?? {})
    );
  });

  it("returns 404 for unknown session identifiers", async () => {
    const response = await request(app)
      .patch(`/api/v1/sessions/${randomUUID()}`)
      .set("Accept", "application/json")
      .send(buildSessionUpdatePayload());

    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
  });

  it("rejects invalid payloads with a 400 response", async () => {
    const { sessionId } = await createSession();

    const response = await request(app)
      .patch(`/api/v1/sessions/${sessionId}`)
      .set("Accept", "application/json")
      .send({ status: "UNKNOWN" });

    expect(response.status).toBe(400);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
  });
});
