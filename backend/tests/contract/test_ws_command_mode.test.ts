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
import { expectCommandSetModePayloadSchema } from "./helpers/schemaValidators";

jest.setTimeout(15000);

describe("WebSocket contract - command:set-mode", () => {
  it("emits set-mode commands with the expected schema", async () => {
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

      const setModeEventPromise = waitForEvent(robotSocket, "command:set-mode");

      const commandResponse = await server.agent
        .post(`/api/v1/robots/${robotId}/command`)
        .set("Accept", "application/json")
        .send(
          buildRobotCommandPayload({
            type: "SET_MODE",
            payload: {
              mode: "DOCK"
            }
          })
        );

      expect(commandResponse.status).toBe(200);

      const payload = await setModeEventPromise;
      expectCommandSetModePayloadSchema(payload);
    } finally {
      await disconnectSocketClient(robotSocket);
      await server.close();
    }
  });
});
