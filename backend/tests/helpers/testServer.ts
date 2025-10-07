/**
 * Shared test server utilities
 * Ensures only one server instance per test run
 */

import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

let testServer: HTTPServer | null = null;
let testIO: SocketIOServer | null = null;
let currentPort: number | null = null;

export async function startTestServer(port: number, initFn: () => void): Promise<void> {
  // Only start if not already running on this port
  if (testServer && currentPort === port) {
    return;
  }

  // If running on different port, close existing
  if (testServer && currentPort !== port) {
    await stopTestServer();
  }

  const { httpServer, initializeWebSocketHandlers } = await import('../../src/server');
  
  // Initialize WebSocket handlers
  initializeWebSocketHandlers();

  // Start server
  await new Promise<void>((resolve) => {
    httpServer.listen(port, () => {
      testServer = httpServer;
      currentPort = port;
      resolve();
    });
  });
}

export async function stopTestServer(): Promise<void> {
  if (testServer) {
    await new Promise<void>((resolve) => {
      testServer!.close(() => {
        testServer = null;
        currentPort = null;
        resolve();
      });
    });
  }
}

export function isServerRunning(port: number): boolean {
  return testServer !== null && currentPort === port;
}

