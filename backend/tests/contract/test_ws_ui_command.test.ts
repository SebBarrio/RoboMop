import type { Socket } from "socket.io-client";

import {
  connectSocketClient,
  disconnectSocketClient,
  startTestServer,
  waitForEvent
} from "./helpers/websocketTestUtils";
import {
  buildRobotCreatePayload,
  buildUiCommandPayload
} from "./helpers/testData";
import {
  expectUiCommandAckPayloadSchema,
  expectUiCommandPayloadSchema
} from "./helpers/schemaValidators";

jest.setTimeout(15000);

describe("WebSocket contract - ui:command", () => {
  it("acknowledges UI commands that match the contract schema", async () => {
    const server = await startTestServer();
    let uiSocket: Socket | undefined;

    try {
      const robotResponse = await server.agent
        .post("/api/v1/robots")
        .set("Accept", "application/json")
        .send(buildRobotCreatePayload());

      expect(robotResponse.status).toBe(201);
      const { id: robotId } = robotResponse.body as { id: string };

      uiSocket = await connectSocketClient(server.url, {
        auth: { userId: "ui-test-user" }
      });

      const ackPromise = waitForEvent(uiSocket, "ui:command-ack");

      const payload = buildUiCommandPayload(robotId);
      expectUiCommandPayloadSchema(payload);

      uiSocket.emit("ui:command", payload);

      const ack = await ackPromise;
      expectUiCommandAckPayloadSchema(ack);
    } finally {
      await disconnectSocketClient(uiSocket);
      await server.close();
    }
  });
});
