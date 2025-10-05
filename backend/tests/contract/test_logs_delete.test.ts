import request from "supertest";

import app from "../../src/server";
import { buildRobotCreatePayload } from "./helpers/testData";

describe("DELETE /api/v1/logs", () => {
  it("clears logs according to the contract", async () => {
    const response = await request(app)
      .delete("/api/v1/logs")
      .set("Accept", "application/json");

    expect(response.status).toBe(204);
    expect(response.text).toBe("");
  });

  it("supports filtering by robotId and before timestamp", async () => {
    const robotResponse = await request(app)
      .post("/api/v1/robots")
      .set("Accept", "application/json")
      .send(buildRobotCreatePayload());

    expect(robotResponse.status).toBe(201);
    const { id: robotId } = robotResponse.body as { id: string };

    const response = await request(app)
      .delete(`/api/v1/logs?robotId=${robotId}&before=${encodeURIComponent(new Date().toISOString())}`)
      .set("Accept", "application/json");

    expect(response.status).toBe(204);
    expect(response.text).toBe("");
  });

  it("rejects invalid timestamps with a 400 response", async () => {
    const response = await request(app)
      .delete("/api/v1/logs?before=not-a-date")
      .set("Accept", "application/json");

    expect(response.status).toBe(400);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
  });
});
