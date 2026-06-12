import { useState } from "react";
import { AlertTriangle, Loader2, Map as MapIcon } from "lucide-react";
import { normalizeRelayUrl, relay } from "../lib/connection";
import { saveSettings, useAppStore, type ConnectionHint } from "../lib/store";
import { ConnectionBadge } from "./StatusBadge";

/** Lucide-style check-in-circle whose strokes trace themselves on mount. */
function CheckDraw() {
  return (
    <svg
      className="check-draw"
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="10" cy="10" r="9" />
      <path d="M6 10.4l2.6 2.6L14 7.4" />
    </svg>
  );
}

const HINT_COPY: Record<ConnectionHint, string> = {
  unauthorized:
    "The relay rejected the app token. Check the APP_TOKEN secret on the worker and enter the same value here.",
  "bad-robot-id":
    "The relay rejected this robot ID. Use only letters, numbers, dashes and underscores.",
  unreachable:
    "Can't reach the relay at this URL. Check the address and that the worker is deployed.",
};

export function SettingsView({ onViewMap }: { onViewMap: () => void }) {
  const saved = useAppStore((s) => s.settings);
  const connection = useAppStore((s) => s.connection);
  const hint = useAppStore((s) => s.connectionHint);
  const robotOnline = useAppStore((s) => s.robotOnline);
  const [relayUrl, setRelayUrl] = useState(saved.relayUrl);
  const [robotId, setRobotId] = useState(saved.robotId);
  const [token, setToken] = useState(saved.token);

  const dirty =
    relayUrl !== saved.relayUrl || robotId !== saved.robotId || token !== saved.token;

  function connect(e: React.FormEvent) {
    e.preventDefault();
    const settings = {
      relayUrl: normalizeRelayUrl(relayUrl),
      robotId: robotId.trim(),
      token: token.trim(),
    };
    setRelayUrl(settings.relayUrl);
    saveSettings(settings);
    relay.start(settings);
  }

  function disconnect() {
    relay.stop();
  }

  let result: React.ReactNode = null;
  if (connection === "connected") {
    result = (
      <>
        <div className="alert alert--ok">
          <CheckDraw />
          <span>
            Connected to the relay.{" "}
            {robotOnline
              ? "Your robot is online."
              : "The robot hasn't checked in yet; the map fills in as soon as it does."}
          </span>
        </div>
        <button className="btn btn--primary" type="button" onClick={onViewMap}>
          <MapIcon size={16} aria-hidden />
          View live map
        </button>
      </>
    );
  } else if (connection === "connecting" || connection === "reconnecting") {
    result = hint ? (
      <div className="alert alert--danger">
        <AlertTriangle size={16} aria-hidden />
        <span>{HINT_COPY[hint]}</span>
      </div>
    ) : (
      <div className="alert alert--info">
        <Loader2 size={16} aria-hidden className="spin" />
        <span>{connection === "connecting" ? "Connecting to the relay…" : "Connection lost. Trying to reconnect…"}</span>
      </div>
    );
  }

  return (
    <div className="settings">
      <header className="page-head">
        <h1>Settings</h1>
        <ConnectionBadge />
      </header>

      <form className="card" onSubmit={connect}>
        <h2 className="card__title">Relay connection</h2>
        <div className="field">
          <label htmlFor="relay-url">Relay URL</label>
          <input
            id="relay-url"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="wss://robomop-relay.your-account.workers.dev"
            value={relayUrl}
            onChange={(e) => setRelayUrl(e.target.value)}
            required
          />
          <p className="field__hint">
            The Cloudflare Worker origin. Use ws://localhost:8787 for local development.
          </p>
        </div>
        <div className="field">
          <label htmlFor="robot-id">Robot ID</label>
          <input
            id="robot-id"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={robotId}
            onChange={(e) => setRobotId(e.target.value)}
            required
          />
          <p className="field__hint">Must match the --robot-id the robot runs with.</p>
        </div>
        <div className="field">
          <label htmlFor="app-token">App token</label>
          <input
            id="app-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
          />
          <p className="field__hint">The APP_TOKEN secret configured on the relay.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className={`btn ${connection === "connected" && !dirty ? "btn--ghost" : "btn--primary"}`}
            type="submit"
          >
            {dirty || connection === "idle" ? "Save and connect" : "Reconnect"}
          </button>
          {connection !== "idle" && (
            <button className="btn btn--ghost" type="button" onClick={disconnect}>
              Disconnect
            </button>
          )}
        </div>
        <div className="conn-result" aria-live="polite">
          {result}
        </div>
      </form>
    </div>
  );
}
