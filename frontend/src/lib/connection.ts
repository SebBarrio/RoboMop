import type { Command, RelayMessage } from "./protocol";
import { decodeMap } from "./decodeMap";
import { applyStateUpdate, getState, setState, type Settings } from "./store";

/**
 * Coerce whatever the user typed into a WebSocket origin:
 * https:// → wss://, http:// → ws://, bare host → wss://, no trailing slash.
 */
export function normalizeRelayUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, "");
  if (!url) return "";
  url = url.replace(/^https:\/\//i, "wss://").replace(/^http:\/\//i, "ws://");
  if (!/^wss?:\/\//i.test(url)) url = `wss://${url}`;
  return url;
}

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
  private failures = 0;
  private probing = false;

  start(settings: Settings): void {
    this.stop();
    if (!settings.relayUrl) return;
    this.enabled = true;
    this.failures = 0;
    setState({ connection: "connecting", connectionHint: null });
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
      this.failures = 0;
      setState({ connection: "connected", connectionHint: null });
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
        this.failures += 1;
        setState({ connection: "reconnecting", robotOnline: false });
        // After a couple of straight failures, find out WHY over plain HTTPS
        // (the browser hides WebSocket handshake status codes from us).
        if (this.failures === 2 || this.failures % 6 === 0) void this.diagnose(settings);
        this.scheduleReconnect(settings);
      }
    };
  }

  private async diagnose(settings: Settings): Promise<void> {
    if (this.probing) return;
    this.probing = true;
    const base = settings.relayUrl.replace(/^wss:\/\//i, "https://").replace(/^ws:\/\//i, "http://");
    try {
      const params = new URLSearchParams({ robot: settings.robotId, role: "app", token: settings.token });
      const res = await fetch(`${base}/ws?${params}`, { signal: AbortSignal.timeout(5000) });
      if (!this.enabled) return;
      if (res.status === 401) setState({ connectionHint: "unauthorized" });
      else if (res.status === 400) setState({ connectionHint: "bad-robot-id" });
      else if (res.status === 426) setState({ connectionHint: null }); // credentials fine; transient drop
      else setState({ connectionHint: "unreachable" });
    } catch {
      if (!this.enabled) return;
      // The probe needs CORS headers from the relay; an older relay blocks it.
      // An opaque no-cors ping still proves whether the host is reachable.
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
