import request from "supertest";

import app from "../../src/server";

import { expectRobotSchema } from "./helpers/schemaValidators";
import { buildRobotCreatePayload } from "./helpers/testData";

describe("PATCH /api/v1/robots/:robotId", () => {
  it("updates robot metadata according to contract", async () => {
    const createResponse = await request(app)
      .post("/api/v1/robots")
      .set("Accept", "application/json")
      .send(buildRobotCreatePayload());

    expect(createResponse.status).toBe(201);
    const { id: robotId } = createResponse.body as { id: string };

    const updatePayload = {
      name: "Updated Robot",
      status: "MAINTENANCE"
    };

    const response = await request(app)
      .patch(`/api/v1/robots/${robotId}`)
      .set("Accept", "application/json")
      .send(updatePayload);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expectRobotSchema(response.body);
    expect(response.body).toMatchObject(updatePayload);
  });

  it("rejects invalid updates with 400", async () => {
    const createResponse = await request(app)
      .post("/api/v1/robots")
      .set("Accept", "application/json")
      .send(buildRobotCreatePayload());

    expect(createResponse.status).toBe(201);
    const { id: robotId } = createResponse.body as { id: string };

    const response = await request(app)
      .patch(`/api/v1/robots/${robotId}`)
      .set("Accept", "application/json")
      .send({ status: "INVALID_STATUS" });

    expect(response.status).toBe(400);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
  });
});
