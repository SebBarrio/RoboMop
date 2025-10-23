import type { Server as HttpServer } from "node:http";

import ConnectionHandler from "./ConnectionHandler.js";
import CommandHandler from "./CommandHandler.js";

let handler: ConnectionHandler | undefined;

export function initializeWebSocketServer(httpServer: HttpServer): void {
  if (handler) {
    handler.close();
  }

  handler = new ConnectionHandler(httpServer);
}

export function resolveCommandHandler(): CommandHandler | undefined {
  return handler?.getCommandHandler();
}

export default {
  initializeWebSocketServer,
  resolveCommandHandler
};
