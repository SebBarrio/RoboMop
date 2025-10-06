import type { Socket } from "socket.io-client";

import {
  connectSocketClient,
  disconnectSocketClient,
  emitWithAck,
  startTestServer
} from "./helpers/websocketTestUtils";
import {
  buildRobotCreatePayload,
  buildRobotSensorDataPayload
} from "./helpers/testData";
import {
  expectRobotSensorDataAckSchema,
  expectRobotSensorDataPayloadSchema
} from "./helpers/schemaValidators";

jest.setTimeout(15000);

describe("WebSocket contract - robot:sensor-data", () => {
  it("accepts sensor data events that conform to the contract schema", async () => {
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

      const payload = buildRobotSensorDataPayload(robotId);
      expectRobotSensorDataPayloadSchema(payload);

      const ack = await emitWithAck(robotSocket, "robot:sensor-data", payload);
      expectRobotSensorDataAckSchema(ack);
    } finally {
      await disconnectSocketClient(robotSocket);
      await server.close();
    }
  });
});
