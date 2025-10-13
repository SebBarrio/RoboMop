import request from "supertest";

import app from "../../src/server";

import {
  expectLocationHeader,
  expectRobotSchema
} from "./helpers/schemaValidators";
import { buildRobotCreatePayload } from "./helpers/testData";

describe("POST /api/v1/robots", () => {
  it("creates a robot that matches the contract schema", async () => {
    const payload = buildRobotCreatePayload();

    const response = await request(app)
      .post("/api/v1/robots")
      .set("Accept", "application/json")
      .send(payload);

    expect(response.status).toBe(201);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expectRobotSchema(response.body);
    expect(response.body).toMatchObject(payload);
    expectLocationHeader(response.headers as Record<string, string | string[] | undefined>);
  });

  it("rejects invalid payloads with a 400 response", async () => {
    const invalidPayload = {
      name: "",
      serialNumber: "invalid serial",
      modelVersion: 123,
      firmwareVersion: null
    };

    const response = await request(app)
      .post("/api/v1/robots")
      .set("Accept", "application/json")
      .send(invalidPayload);

    expect(response.status).toBe(400);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: expect.any(String)
      })
    );
  });
});
