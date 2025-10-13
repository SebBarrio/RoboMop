import { randomUUID } from "crypto";
import request from "supertest";

import app from "../../src/server";
import {
  buildMapCreatePayload,
  buildRobotCreatePayload
} from "./helpers/testData";

describe("PUT /api/v1/maps/:mapId/data", () => {
  it("replaces map data when provided as base64 JSON payload", async () => {
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

    const base64Data = Buffer.from([0, 1, 2, 3]).toString("base64");

    const putResponse = await request(app)
      .put(`/api/v1/maps/${mapId}/data`)
      .set("Accept", "application/json")
      .send({ data: base64Data });

    expect(putResponse.status).toBe(200);
    expect(putResponse.headers["content-type"]).toMatch(/application\/json/);

    const getResponse = await request(app)
      .get(`/api/v1/maps/${mapId}/data`)
      .set("Accept", "application/json");

    expect(getResponse.status).toBe(200);
    expect(getResponse.body).toEqual(
      expect.objectContaining({ data: base64Data })
    );
  });

  it("accepts binary payload uploads", async () => {
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

    const binaryData = Buffer.from([4, 5, 6, 7]);

    const putResponse = await request(app)
      .put(`/api/v1/maps/${mapId}/data`)
      .set("Accept", "application/json")
      .set("Content-Type", "application/octet-stream")
      .send(binaryData);

    expect(putResponse.status).toBe(200);
    expect(putResponse.headers["content-type"]).toMatch(/application\/json/);

    const expectedBase64 = binaryData.toString("base64");

    const getResponse = await request(app)
      .get(`/api/v1/maps/${mapId}/data`)
      .set("Accept", "application/json");

    expect(getResponse.status).toBe(200);
    expect(getResponse.body).toEqual(
      expect.objectContaining({ data: expectedBase64 })
    );
  });

  it("returns 400 when payload data is missing", async () => {
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

    const response = await request(app)
      .put(`/api/v1/maps/${mapId}/data`)
      .set("Accept", "application/json")
      .send({});

    expect(response.status).toBe(400);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
  });

  it("returns 404 when the map does not exist", async () => {
    const base64Data = Buffer.from([9, 8, 7, 6]).toString("base64");

    const response = await request(app)
      .put(`/api/v1/maps/${randomUUID()}/data`)
      .set("Accept", "application/json")
      .send({ data: base64Data });

    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
  });
});
