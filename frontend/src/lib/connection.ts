import { relayHttpBase, relayWsBase } from "./api";
import { decodeMap } from "./decodeMap";
import type { Command, RelayMessage } from "./protocol";
import { applyStateUpdate, clearAuth, getState, resetRobotTelemetry, setState } from "./store";

interface Credentials {
  robotId: string;
  sessionToken: string;
}

/**
 * Supervised WebSocket connection to the relay.
 * Reconnects with exponential backoff, keeps the connection alive with
 * app-level pings, and feeds every message into the store.
 */
class RelayConnection {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private backoff = 1000;
  private enabled = false;
  private decodingMap = false;
  private failures = 0;
  private probing = false;

  start(robotId: string, sessionToken: string): void {
    this.stop();
    resetRobotTelemetry();
    if (!robotId || !sessionToken) return;
    const credentials = { robotId, sessionToken };
    this.enabled = true;
    this.failures = 0;
    setState({ connection: "connecting", connectionHint: null });
    this.open(credentials);
  }

  stop(): void {
    this.enabled = false;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
    this.reconnectTimer = null;
    this.pingTimer = null;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    setState({ connection: "idle", robotOnline: false, connectionHint: null });
  }

  send(command: Command): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(command));
      return true;
    }
    return false;
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private url(credentials: Credentials): string {
    const params = new URLSearchParams({
      robot: credentials.robotId,
      role: "app",
      token: credentials.sessionToken,
    });
    return `${relayWsBase()}/ws?${params}`;
  }

  private open(credentials: Credentials): void {
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url(credentials));
    } catch {
      this.scheduleReconnect(credentials);
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.backoff = 1000;
      this.failures = 0;
      setState({ connection: "connected", connectionHint: null });
      if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('{"type":"ping"}');
      }, 25000);
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      try {
        this.handle(JSON.parse(event.data) as RelayMessage);
      } catch {
        /* protocol is JSON text frames only */
      }
    };

    ws.onclose = () => {
      if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
      this.pingTimer = null;
      this.ws = null;
      if (this.enabled) {
        this.failures += 1;
        setState({ connection: "reconnecting", robotOnline: false });
        if (this.failures === 2 || this.failures % 6 === 0) void this.diagnose(credentials);
        this.scheduleReconnect(credentials);
      }
    };
  }

  private async diagnose(credentials: Credentials): Promise<void> {
    if (this.probing) return;
    this.probing = true;
    const base = relayHttpBase();
    try {
      const params = new URLSearchParams({
        robot: credentials.robotId,
        role: "app",
        token: credentials.sessionToken,
      });
      const response = await fetch(`${base}/ws?${params}`, { signal: AbortSignal.timeout(5000) });
      if (!this.enabled) return;
      if (response.status === 401) {
        this.stop();
        clearAuth();
      } else if (response.status === 403) setState({ connectionHint: "not-paired" });
      else if (response.status === 400) setState({ connectionHint: "bad-robot-id" });
      else if (response.status === 426) setState({ connectionHint: null });
      else setState({ connectionHint: "unreachable" });
    } catch {
      if (!this.enabled) return;
      try {
        await fetch(`${base}/health`, { mode: "no-cors", signal: AbortSignal.timeout(5000) });
        if (this.enabled) setState({ connectionHint: null });
      } catch {
        if (this.enabled) setState({ connectionHint: "unreachable" });
      }
    } finally {
      this.probing = false;
    }
  }

  private scheduleReconnect(credentials: Credentials): void {
    if (!this.enabled) return;
    this.reconnectTimer = window.setTimeout(() => {
      if (this.enabled) this.open(credentials);
    }, this.backoff);
    this.backoff = Math.min(this.backoff * 2, 15000);
  }

  private handle(msg: RelayMessage): void {
    if (msg.type === "robot_status") {
      setState({
        robotOnline: msg.online,
        robotLastSeen: msg.lastSeen,
        robotName: msg.robot?.name ?? getState().robotName,
      });
      return;
    }
    if (msg.type === "triangle_update") {
      if (msg.map) {
        if (this.decodingMap) return;
        this.decodingMap = true;
        decodeMap(msg.map)
          .then((decoded) => setState({ map: decoded }))
          .catch(() => undefined)
          .finally(() => {
            this.decodingMap = false;
          });
      } else {
        applyStateUpdate(msg);
      }
    }
  }
}

export const relay = new RelayConnection();

export function sendVelocity(linear: number, angular: number): void {
  relay.send({ type: "control", command: "velocity", linear, angular });
}

export function setMode(mode: "manual" | "clean" | "explore"): void {
  relay.send({ type: "control", command: "set_mode", mode });
}

export function setEstop(enabled: boolean): void {
  relay.send({ type: "estop", enabled });
}
