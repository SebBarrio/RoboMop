import request, { type SuperTest, type Test } from "supertest";
import { io, type Socket } from "socket.io-client";

import app, { createHttpServer } from "../../../src/server";

type StartServerResult = {
  url: string;
  agent: SuperTest<Test>;
  close: () => Promise<void>;
};

export const startTestServer = async (): Promise<StartServerResult> => {
  const httpServer = createHttpServer();

  console.log("before listen");
  await new Promise<void>((resolve, reject) => {
    httpServer.once("listening", resolve);
    httpServer.once("error", reject);
    httpServer.listen(0);
  });
  console.log("server listening");

  const address = httpServer.address();

  if (!address || typeof address === "string") {
    await new Promise<void>((_resolve, reject) => {
      httpServer.close((error) => {
        reject(error ?? new Error("Failed to determine server address"));
      });
    });
    throw new Error("Unable to determine listening address for test server");
  }

  const { port } = address;
  const url = `http://127.0.0.1:${port}`;

  const close = (): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      httpServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

  return {
    url,
    agent: request(httpServer),
    close
  };
};

type ConnectOptions = {
  path?: string;
  query?: Record<string, string>;
  auth?: Record<string, unknown>;
};

export const connectSocketClient = async (
  url: string,
  options: ConnectOptions = {}
): Promise<Socket> => {
  const socket = io(url, {
    autoConnect: false,
    transports: ["websocket"],
    path: options.path,
    query: options.query,
    auth: options.auth,
    reconnection: false
  });

  console.log("connecting socket", url, options.auth);
  await new Promise<void>((resolve, reject) => {
    socket.on("connect", () => resolve());
    socket.on("connect_error", (error) => reject(error));
    socket.connect();
  });

  return socket;
};

export const disconnectSocketClient = async (socket: Socket | undefined): Promise<void> => {
  if (!socket) {
    return;
  }

  await new Promise<void>((resolve) => {
    socket.removeAllListeners();
    socket.once("disconnect", () => resolve());
    socket.disconnect();
  });
};

export const emitWithAck = async <TResponse>(
  socket: Socket,
  event: string,
  payload: unknown,
  timeoutMs = 2000
): Promise<TResponse> =>
  new Promise<TResponse>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for ack on ${event}`));
    }, timeoutMs);

    console.log("emit event", event);
    socket.timeout(timeoutMs).emit(event, payload, (error: Error | null, response: TResponse) => {
      console.log("emit ack callback executed", event, error);
      clearTimeout(timeout);
      if (error) {
        reject(error);
        return;
      }
      resolve(response);
    });
  });

export const waitForEvent = async <TPayload = unknown>(
  socket: Socket,
  event: string,
  timeoutMs = 2000
): Promise<TPayload> =>
  new Promise<TPayload>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);

    socket.once(event, (payload: TPayload) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
