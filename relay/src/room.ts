/**
 * RobotRoom — one Durable Object instance per robot id.
 *
 * Uses the WebSocket Hibernation API so an idle room costs nothing.
 *
 * Message protocol (all JSON text frames):
 *
 *  robot -> relay (broadcast to every connected app):
 *    { "type": "hello", "robot": {...} }            robot identity/config, cached
 *    { "type": "triangle_update", pose, trajectory, lidarScan, ... }   state @ ~10 Hz
 *    { "type": "triangle_update", map: {...} }      occupancy grid frame @ ~1 Hz
 *
 *  app -> relay (forwarded to the robot only):
 *    { "type": "estop", "enabled": true|false }
 *    { "type": "control", "command": "set_mode", "mode": "manual"|"clean"|"explore" }
 *    { "type": "control", "command": "velocity", "linear": f, "angular": f }
 *
 *  relay -> app (synthesized by the relay):
 *    { "type": "robot_status", "online": bool, "lastSeen": epochMs|null, "robot": {...}|null }
 *
 *  Latest state and map frames are cached in memory and replayed to apps on
 *  connect, so the UI renders instantly instead of waiting for the next frame.
 */

export interface RoomEnv {}

interface Attachment {
  role: "robot" | "app";
}

const LAST_SEEN_KEY = "lastSeen";
const ROBOT_INFO_KEY = "robotInfo";

export class RobotRoom implements DurableObject {
  private lastState: string | null = null;
  private lastMap: string | null = null;

  constructor(
    private ctx: DurableObjectState,
    private env: RoomEnv,
  ) {
    // Answer app-level keepalive pings even while hibernated.
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'),
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const role = url.searchParams.get("role") as "robot" | "app";

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.serializeAttachment({ role } satisfies Attachment);
    this.ctx.acceptWebSocket(server, [role]);

    if (role === "robot") {
      // Only one live robot connection per room: drop any stale one.
      for (const ws of this.ctx.getWebSockets("robot")) {
        if (ws !== server) {
          try {
            ws.close(1012, "Replaced by a new robot connection");
          } catch {
            /* already closed */
          }
        }
      }
      await this.ctx.storage.put(LAST_SEEN_KEY, Date.now());
      await this.broadcastStatus(true);
    } else {
      await this.sendSnapshot(server);
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    if (typeof message !== "string") return; // protocol is JSON text frames only
    const { role } = (ws.deserializeAttachment() ?? {}) as Partial<Attachment>;

    if (role === "robot") {
      await this.handleRobotMessage(message);
    } else if (role === "app") {
      this.sendToRobot(message);
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws);
  }

  private async handleRobotMessage(message: string): Promise<void> {
    // Peek at the message just enough to maintain the snapshot cache.
    try {
      const parsed = JSON.parse(message) as { type?: string; map?: unknown };
      if (parsed.type === "hello") {
        await this.ctx.storage.put(ROBOT_INFO_KEY, message);
        await this.broadcastStatus(true);
        return;
      }
      if (parsed.type === "triangle_update") {
        if (parsed.map !== undefined) {
          this.lastMap = message;
        } else {
          this.lastState = message;
        }
      }
    } catch {
      return; // drop non-JSON frames
    }

    for (const app of this.ctx.getWebSockets("app")) {
      this.trySend(app, message);
    }
  }

  private sendToRobot(message: string): void {
    // Validate that it's JSON before forwarding to the robot.
    try {
      JSON.parse(message);
    } catch {
      return;
    }
    for (const robot of this.ctx.getWebSockets("robot")) {
      this.trySend(robot, message);
    }
  }

  private async handleDisconnect(ws: WebSocket): Promise<void> {
    const { role } = (ws.deserializeAttachment() ?? {}) as Partial<Attachment>;
    if (role !== "robot") return;

    // Ignore if another robot socket is still alive (reconnect race).
    const remaining = this.ctx
      .getWebSockets("robot")
      .filter((s) => s !== ws && s.readyState === WebSocket.READY_STATE_OPEN);
    if (remaining.length > 0) return;

    this.lastState = null;
    this.lastMap = null;
    await this.ctx.storage.put(LAST_SEEN_KEY, Date.now());
    await this.broadcastStatus(false);
  }

  private async sendSnapshot(app: WebSocket): Promise<void> {
    const online = this.robotOnline();
    const lastSeen = (await this.ctx.storage.get<number>(LAST_SEEN_KEY)) ?? null;
    const robotInfo = await this.robotInfo();
    this.trySend(
      app,
      JSON.stringify({ type: "robot_status", online, lastSeen, robot: robotInfo }),
    );
    if (this.lastState) this.trySend(app, this.lastState);
    if (this.lastMap) this.trySend(app, this.lastMap);
  }

  private async broadcastStatus(online: boolean): Promise<void> {
    const lastSeen = (await this.ctx.storage.get<number>(LAST_SEEN_KEY)) ?? null;
    const robotInfo = await this.robotInfo();
    const status = JSON.stringify({ type: "robot_status", online, lastSeen, robot: robotInfo });
    for (const app of this.ctx.getWebSockets("app")) {
      this.trySend(app, status);
    }
  }

  private async robotInfo(): Promise<unknown> {
    const raw = await this.ctx.storage.get<string>(ROBOT_INFO_KEY);
    if (!raw) return null;
    try {
      return (JSON.parse(raw) as { robot?: unknown }).robot ?? null;
    } catch {
      return null;
    }
  }

  private robotOnline(): boolean {
    return this.ctx
      .getWebSockets("robot")
      .some((s) => s.readyState === WebSocket.READY_STATE_OPEN);
  }

  private trySend(ws: WebSocket, message: string): void {
    try {
      ws.send(message);
    } catch {
      /* socket closing; hibernation API will fire webSocketClose */
    }
  }
}
