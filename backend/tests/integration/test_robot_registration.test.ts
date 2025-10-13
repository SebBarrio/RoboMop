import { createServer } from "http";
import type { AddressInfo } from "net";
import request from "supertest";
import { io as createClient, Socket } from "socket.io-client";

import app from "../../src/server";

jest.setTimeout(15000);

describe("Integration Scenario 1: Robot registration and connection", () => {
  let httpServer: ReturnType<typeof createServer>;
  let baseUrl: string;

  beforeAll(async () => {
    httpServer = createServer(app);

    await new Promise<void>((resolve) => {
      httpServer.listen(() => {
        const address = httpServer.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  });

  it("registers a robot, accepts WebSocket connection, and updates heartbeat state", async () => {
    const registrationPayload = {
      name: "Test Robot",
      serialNumber: "TEST-001",
      modelVersion: "1.0.0",
      firmwareVersion: "1.0.0",
    };

    const registerResponse = await request(app)
      .post("/api/v1/robots")
      .set("Accept", "application/json")
      .send(registrationPayload);

    expect(registerResponse.status).toBe(201);
    expect(registerResponse.headers["content-type"]).toMatch(/application\/json/);

    const { id: robotId, apiKey } = registerResponse.body as {
      id: string;
      apiKey: string;
    };

    expect(robotId).toBeDefined();
    expect(apiKey).toBeDefined();

    const initialRobotResponse = await request(app)
      .get(`/api/v1/robots/${robotId}`)
      .set("Accept", "application/json");

    expect(initialRobotResponse.status).toBe(200);
    expect(initialRobotResponse.body.status).toBe("OFFLINE");

    const socket = await connectRobotSocket(baseUrl, {
      robotId,
      apiKey,
    });

    try {
      const heartbeatTimestamp = new Date().toISOString();

      socket.emit("robot:heartbeat", {
        robotId,
        timestamp: heartbeatTimestamp,
        uptimeSeconds: 10,
        cpuUsagePercent: 15.2,
        memoryUsagePercent: 40.5,
        temperatureCelsius: 45.1,
      });

      const updatedRobot = await waitForRobotStatus(robotId, "ONLINE");

      expect(new Date(updatedRobot.lastSeenAt).getTime()).toBeGreaterThanOrEqual(
        Date.parse(heartbeatTimestamp)
      );
    } finally {
      socket.disconnect();
    }
  });
});

async function connectRobotSocket(
  url: string,
  credentials: { robotId: string; apiKey: string }
): Promise<Socket> {
  const socket = createClient(url, {
    autoConnect: false,
    transports: ["websocket"],
    auth: credentials,
  });

  return new Promise<Socket>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error("Timed out waiting for robot socket connection"));
    }, 4000);

    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve(socket);
    });

    socket.once("connect_error", (error) => {
      clearTimeout(timeout);
      socket.disconnect();
      reject(error);
    });

    socket.connect();
  });
}

interface RobotApiResponse {
  id: string;
  status: string;
  lastSeenAt: string;
}

async function waitForRobotStatus(
  robotId: string,
  expectedStatus: string
): Promise<RobotApiResponse> {
  const deadline = Date.now() + 4000;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const response = await request(app)
      .get(`/api/v1/robots/${robotId}`)
      .set("Accept", "application/json");

    if (
      response.status === 200 &&
      typeof response.body === "object" &&
      response.body !== null
    ) {
      const body = response.body as Partial<RobotApiResponse>;

      if (body.status === expectedStatus && typeof body.lastSeenAt === "string") {
        return {
          id: body.id ?? robotId,
          status: body.status,
          lastSeenAt: body.lastSeenAt,
        };
      }
    }

    if (Date.now() > deadline) {
      throw new Error(
        `Robot ${robotId} did not reach status ${expectedStatus} before timeout`
      );
    }

    await delay(250);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
