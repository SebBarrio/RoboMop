import type { Socket } from "socket.io-client";

import {
  connectSocketClient,
  disconnectSocketClient,
  emitWithAck,
  startTestServer
} from "./helpers/websocketTestUtils";
import {
  buildMapCreatePayload,
  buildRobotCreatePayload,
  buildRobotMapUpdatePayload
} from "./helpers/testData";
import {
  expectRobotMapUpdateAckSchema,
  expectRobotMapUpdatePayloadSchema
} from "./helpers/schemaValidators";

jest.setTimeout(15000);

describe("WebSocket contract - robot:map-update", () => {
  it("accepts map update events that match the contract schema", async () => {
    const server = await startTestServer();
    let robotSocket: Socket | undefined;

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

      robotSocket = await connectSocketClient(server.url, {
        auth: { robotId }
      });

      const payload = buildRobotMapUpdatePayload(robotId, mapId);
      expectRobotMapUpdatePayloadSchema(payload);

      const ack = await emitWithAck(robotSocket, "robot:map-update", payload);
      expectRobotMapUpdateAckSchema(ack);
    } finally {
      await disconnectSocketClient(robotSocket);
      await server.close();
    }
  });
});
