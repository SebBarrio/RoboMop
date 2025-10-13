import { randomUUID } from "crypto";
import request from "supertest";

import app from "../../src/server";
import {
  buildMapCreatePayload,
  buildRobotCreatePayload
} from "./helpers/testData";

describe("DELETE /api/v1/maps/:mapId", () => {
  it("deletes a map and returns 204", async () => {
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
    const { id: mapId } = createResponse.body as { id: string };

    const response = await request(app)
      .delete(`/api/v1/maps/${mapId}`)
      .set("Accept", "application/json");

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
  });

  it("returns 404 when the map does not exist", async () => {
    const response = await request(app)
      .delete(`/api/v1/maps/${randomUUID()}`)
      .set("Accept", "application/json");

    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
  });
});
