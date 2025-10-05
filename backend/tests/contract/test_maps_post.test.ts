import request from "supertest";

import app from "../../src/server";
import {
  buildMapCreatePayload,
  buildRobotCreatePayload
} from "./helpers/testData";
import { expectMapMetadataSchema } from "./helpers/schemaValidators";

describe("POST /api/v1/maps", () => {
  it("creates a map using the contract schema", async () => {
    const robotResponse = await request(app)
      .post("/api/v1/robots")
      .set("Accept", "application/json")
      .send(buildRobotCreatePayload());

    expect(robotResponse.status).toBe(201);
    const { id: robotId } = robotResponse.body as { id: string };

    const response = await request(app)
      .post("/api/v1/maps")
      .set("Accept", "application/json")
      .send(buildMapCreatePayload(robotId));

    expect(response.status).toBe(201);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expectMapMetadataSchema(response.body);
    expect(response.body.robotId).toBe(robotId);
  });

  it("rejects invalid payloads with a 400 response", async () => {
    const response = await request(app)
      .post("/api/v1/maps")
      .set("Accept", "application/json")
      .send({
        robotId: "not-a-uuid",
        resolution: 0,
        width: -5,
        height: 10,
        origin: { x: 0, y: 0 }
      });

    expect(response.status).toBe(400);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
  });
});
