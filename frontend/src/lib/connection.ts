import type { Command, RelayMessage } from "./protocol";
import { decodeMap } from "./decodeMap";
import { applyStateUpdate, getState, setState, type Settings } from "./store";

/**
 * Supervised WebSocket connection to the relay.
 * Reconnects with exponential backoff, keeps the connection alive with
 * app-level pings (the relay answers even while hibernated), and feeds
 * every message into the store.
 */
class RelayConnection {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private backoff = 1000;
  private enabled = false;
  private decodingMap = false;

  start(settings: Settings): void {
    this.stop();
    if (!settings.relayUrl) return;
    this.enabled = true;
    setState({ connection: "connecting" });
    this.open(settings);
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
    setState({ connection: "idle", robotOnline: false });
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

  private url(settings: Settings): string {
    const base = settings.relayUrl.replace(/\/+$/, "");
    const params = new URLSearchParams({
      robot: settings.robotId,
      role: "app",
      token: settings.token,
    });
    return `${base}/ws?${params}`;
  }

  private open(settings: Settings): void {
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url(settings));
    } catch {
      this.scheduleReconnect(settings);
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.backoff = 1000;
      setState({ connection: "connected" });
      if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('{"type":"ping"}');
      }, 25000);
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      let msg: RelayMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      this.handle(msg);
    };

    ws.onclose = () => {
      if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
      this.pingTimer = null;
      this.ws = null;
      if (this.enabled) {
        setState({ connection: "reconnecting", robotOnline: false });
        this.scheduleReconnect(settings);
      }
    };
  }

  private scheduleReconnect(settings: Settings): void {
    if (!this.enabled) return;
    this.reconnectTimer = window.setTimeout(() => {
      if (this.enabled) this.open(settings);
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
        // Decode off the hot path; drop frames if one is already in flight.
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
