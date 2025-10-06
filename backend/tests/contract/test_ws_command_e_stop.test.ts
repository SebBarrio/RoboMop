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
import { expectCommandEStopPayloadSchema } from "./helpers/schemaValidators";

jest.setTimeout(15000);

describe("WebSocket contract - command:e-stop", () => {
  it("emits emergency stop commands with the expected schema", async () => {
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

      const eStopEventPromise = waitForEvent(robotSocket, "command:e-stop");

      const commandResponse = await server.agent
        .post(`/api/v1/robots/${robotId}/command`)
        .set("Accept", "application/json")
        .send(
          buildRobotCommandPayload({
            type: "E_STOP",
            payload: {
              reason: "EMERGENCY_STOP"
            }
          })
        );

      expect(commandResponse.status).toBe(200);

      const payload = await eStopEventPromise;
      expectCommandEStopPayloadSchema(payload);
    } finally {
      await disconnectSocketClient(robotSocket);
      await server.close();
    }
  });
});
