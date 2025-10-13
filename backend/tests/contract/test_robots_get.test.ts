import request from "supertest";

import app from "../../src/server";

import { expectRobotSchema } from "./helpers/schemaValidators";

describe("GET /api/v1/robots", () => {
  it("returns robots matching contract schema", async () => {
    const response = await request(app)
      .get("/api/v1/robots")
      .set("Accept", "application/json");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(Array.isArray(response.body)).toBe(true);

    const robots = response.body as unknown[];
    robots.forEach((robot) => expectRobotSchema(robot));
  });
});
