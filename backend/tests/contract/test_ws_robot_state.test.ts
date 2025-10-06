import type { Socket } from "socket.io-client";

import {
  connectSocketClient,
  disconnectSocketClient,
  emitWithAck,
  startTestServer
} from "./helpers/websocketTestUtils";
import {
  buildRobotCreatePayload,
  buildRobotStateEventPayload
} from "./helpers/testData";
import {
  expectRobotStateAckSchema,
  expectRobotStateEventSchema
} from "./helpers/schemaValidators";

jest.setTimeout(15000);

describe("WebSocket contract - robot:state", () => {
  it("accepts robot state updates that satisfy the event contract", async () => {
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

      const payload = buildRobotStateEventPayload(robotId);
      expectRobotStateEventSchema(payload);

      const ack = await emitWithAck(robotSocket, "robot:state", payload);
      expectRobotStateAckSchema(ack);
    } finally {
      await disconnectSocketClient(robotSocket);
      await server.close();
    }
  });
});
