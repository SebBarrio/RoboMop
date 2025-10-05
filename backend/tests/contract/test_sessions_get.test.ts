import request from "supertest";

import app from "../../src/server";
import {
  buildMapCreatePayload,
  buildRobotCreatePayload,
  buildSessionCreatePayload
} from "./helpers/testData";
import { expectSessionSchema } from "./helpers/schemaValidators";

const createRobotWithMap = async (): Promise<{ robotId: string; mapId: string }> => {
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

  return { robotId, mapId };
};

describe("GET /api/v1/sessions", () => {
  it("returns sessions matching the contract schema", async () => {
    const { robotId, mapId } = await createRobotWithMap();

    await request(app)
      .post("/api/v1/sessions")
      .set("Accept", "application/json")
      .send(buildSessionCreatePayload(robotId, mapId));

    const response = await request(app)
      .get("/api/v1/sessions")
      .set("Accept", "application/json");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(Array.isArray(response.body)).toBe(true);

    const sessions = response.body as unknown[];
    sessions.forEach((session) => expectSessionSchema(session));
  });

  it("supports filtering by robotId", async () => {
    const { robotId, mapId } = await createRobotWithMap();

    await request(app)
      .post("/api/v1/sessions")
      .set("Accept", "application/json")
      .send(buildSessionCreatePayload(robotId, mapId));

    const response = await request(app)
      .get(`/api/v1/sessions?robotId=${robotId}`)
      .set("Accept", "application/json");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(Array.isArray(response.body)).toBe(true);

    const sessions = response.body as Array<{ robotId: string }>;
    sessions.forEach((session) => {
      expectSessionSchema(session);
      expect(session.robotId).toBe(robotId);
    });
  });
});
