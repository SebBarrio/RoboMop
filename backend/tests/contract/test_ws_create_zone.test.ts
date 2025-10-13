import type { Socket } from "socket.io-client";

import {
  connectSocketClient,
  disconnectSocketClient,
  startTestServer,
  waitForEvent
} from "./helpers/websocketTestUtils";
import {
  buildMapCreatePayload,
  buildRobotCreatePayload,
  buildUiCreateZonePayload
} from "./helpers/testData";
import {
  expectUiCreateZonePayloadSchema,
  expectUiZoneCreatedPayloadSchema
} from "./helpers/schemaValidators";

jest.setTimeout(15000);

describe("WebSocket contract - ui:create-zone", () => {
  it("acknowledges zone creation requests that match the contract", async () => {
    const server = await startTestServer();
    let uiSocket: Socket | undefined;

    try {
      const robotResponse = await server.agent
        .post("/api/v1/robots")
        .set("Accept", "application/json")
        .send(buildRobotCreatePayload());

      expect(robotResponse.status).toBe(201);
      const { id: robotId } = robotResponse.body as { id: string };

      const mapResponse = await server.agent
        .post("/api/v1/maps")
        .set("Accept", "application/json")
        .send(buildMapCreatePayload(robotId));

      expect(mapResponse.status).toBe(201);
      const { id: mapId } = mapResponse.body as { id: string };

      uiSocket = await connectSocketClient(server.url, {
        auth: { userId: "ui-test-user" }
      });

      const createdPromise = waitForEvent(uiSocket, "ui:zone-created");

      const payload = buildUiCreateZonePayload(mapId);
      expectUiCreateZonePayloadSchema(payload);

      uiSocket.emit("ui:create-zone", payload);

      const response = await createdPromise;
      expectUiZoneCreatedPayloadSchema(response);
    } finally {
      await disconnectSocketClient(uiSocket);
      await server.close();
    }
  });
});
