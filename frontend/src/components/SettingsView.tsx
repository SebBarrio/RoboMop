import { useState } from "react";
import { relay } from "../lib/connection";
import { saveSettings, useAppStore } from "../lib/store";
import { ConnectionBadge } from "./StatusBadge";

export function SettingsView() {
  const saved = useAppStore((s) => s.settings);
  const connection = useAppStore((s) => s.connection);
  const [relayUrl, setRelayUrl] = useState(saved.relayUrl);
  const [robotId, setRobotId] = useState(saved.robotId);
  const [token, setToken] = useState(saved.token);

  const dirty =
    relayUrl !== saved.relayUrl || robotId !== saved.robotId || token !== saved.token;

  function connect(e: React.FormEvent) {
    e.preventDefault();
    const settings = {
      relayUrl: relayUrl.trim().replace(/\/+$/, ""),
      robotId: robotId.trim(),
      token: token.trim(),
    };
    saveSettings(settings);
    relay.start(settings);
  }

  function disconnect() {
    relay.stop();
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
            type="url"
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
          <button className="btn btn--primary" type="submit">
            {dirty || connection === "idle" ? "Save and connect" : "Reconnect"}
          </button>
          {connection !== "idle" && (
            <button className="btn btn--ghost" type="button" onClick={disconnect}>
              Disconnect
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
