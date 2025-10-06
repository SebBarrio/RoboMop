import type { Socket } from "socket.io-client";

import {
  connectSocketClient,
  disconnectSocketClient,
  startTestServer,
  waitForEvent
} from "./helpers/websocketTestUtils";
import {
  buildRobotCommandPayload,
  buildRobotCreatePayload
} from "./helpers/testData";
import { expectCommandMovePayloadSchema } from "./helpers/schemaValidators";

jest.setTimeout(15000);

describe("WebSocket contract - command:move", () => {
  it("emits move commands with the expected payload shape", async () => {
    const server = await startTestServer();
    let robotSocket: Socket | undefined;

    try {
      const createResponse = await server.agent
        .post("/api/v1/robots")
        .set("Accept", "application/json")
        .send(buildRobotCreatePayload());

      expect(createResponse.status).toBe(201);
      const { id: robotId } = createResponse.body as { id: string };

      robotSocket = await connectSocketClient(server.url, {
        auth: { robotId }
      });

      const moveEventPromise = waitForEvent(robotSocket, "command:move");

      const commandResponse = await server.agent
        .post(`/api/v1/robots/${robotId}/command`)
        .set("Accept", "application/json")
        .send(buildRobotCommandPayload());

      expect(commandResponse.status).toBe(200);

      const payload = await moveEventPromise;
      expectCommandMovePayloadSchema(payload);
    } finally {
      await disconnectSocketClient(robotSocket);
      await server.close();
    }
  });
});
