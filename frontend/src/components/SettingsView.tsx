import { useState } from "react";
import { AlertTriangle, Check, Loader2, LogOut, Map as MapIcon, Save } from "lucide-react";
import {
  DEFAULT_RELAY,
  RELAY_OVERRIDE_KEY,
  logout,
  normalizeRelayUrl,
  relayHttpBase,
} from "../lib/api";
import { relay } from "../lib/connection";
import { clearAuth, useAppStore, type ConnectionHint } from "../lib/store";
import { ConnectionBadge } from "./StatusBadge";

const HINT_COPY: Record<ConnectionHint, string> = {
  unauthorized: "Your session expired. Sign in again.",
  "not-paired": "This robot isn't paired to your account. Add it in Robots.",
  "bad-robot-id": "The relay rejected this robot ID. Use only letters, numbers, dashes and underscores.",
  unreachable: "Can't reach the relay. Check the advanced relay URL and that the worker is deployed.",
};

export function SettingsView({ onViewMap }: { onViewMap: () => void }) {
  const token = useAppStore((state) => state.auth.token)!;
  const email = useAppStore((state) => state.auth.email);
  const selectedRobotId = useAppStore((state) => state.selectedRobotId);
  const connection = useAppStore((state) => state.connection);
  const hint = useAppStore((state) => state.connectionHint);
  const robotOnline = useAppStore((state) => state.robotOnline);
  const [override, setOverride] = useState(localStorage.getItem(RELAY_OVERRIDE_KEY) ?? "");
  const [overrideSaved, setOverrideSaved] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await logout(token);
    } catch {
      /* local sign-out still clears an expired or unreachable session */
    } finally {
      relay.stop();
      clearAuth();
    }
  }

  function saveOverride(event: React.FormEvent) {
    event.preventDefault();
    const normalized = normalizeRelayUrl(override);
    if (normalized) localStorage.setItem(RELAY_OVERRIDE_KEY, normalized);
    else localStorage.removeItem(RELAY_OVERRIDE_KEY);
    setOverride(normalized);
    setOverrideSaved(true);
    window.setTimeout(() => setOverrideSaved(false), 2500);
    if (selectedRobotId) relay.start(selectedRobotId, token);
  }

  return (
    <div className="settings">
      <header className="page-head">
        <h1>Settings</h1>
        <ConnectionBadge />
      </header>

      <section className="card settings-card">
        <h2 className="card__title">Account</h2>
        <div className="account-row">
          <div>
            <span className="account-row__label">Signed in as</span>
            <strong>{email}</strong>
          </div>
          <button className="btn btn--ghost" type="button" onClick={() => void signOut()} disabled={signingOut}>
            {signingOut ? <Loader2 size={16} className="spin" aria-hidden /> : <LogOut size={16} aria-hidden />}
            Sign out
          </button>
        </div>
      </section>

      <section className="card settings-card">
        <h2 className="card__title">Connection</h2>
        <div className="connection-summary">
          <ConnectionBadge />
          <span>{selectedRobotId ?? "No robot selected"}</span>
        </div>
        {hint && (
          <div className="alert alert--danger">
            <AlertTriangle size={16} aria-hidden />
            <span>{HINT_COPY[hint]}</span>
          </div>
        )}
        {!hint && connection === "connected" && (
          <div className="alert alert--ok">
            <Check size={16} aria-hidden />
            <span>{robotOnline ? "The selected robot is online." : "The relay is connected; the selected robot is offline."}</span>
          </div>
        )}
        {!hint && (connection === "connecting" || connection === "reconnecting") && (
          <div className="alert alert--info">
            <Loader2 size={16} className="spin" aria-hidden />
            <span>{connection === "connecting" ? "Connecting to the relay..." : "Connection lost. Trying to reconnect..."}</span>
          </div>
        )}
        {selectedRobotId && (
          <button className="btn btn--primary" type="button" onClick={onViewMap}>
            <MapIcon size={16} aria-hidden />
            View live map
          </button>
        )}
      </section>

      <details className="card advanced">
        <summary>Advanced</summary>
        <form onSubmit={saveOverride}>
          <div className="field">
            <label htmlFor="relay-override">Relay URL override</label>
            <input
              id="relay-override"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder={DEFAULT_RELAY}
              value={override}
              onChange={(event) => setOverride(event.target.value)}
            />
            <p className="field__hint">
              Leave empty to use the default. Active relay: {relayHttpBase()}
            </p>
          </div>
          <button className="btn btn--ghost" type="submit">
            {overrideSaved ? <Check size={16} aria-hidden /> : <Save size={16} aria-hidden />}
            {overrideSaved ? "Saved" : "Save override"}
          </button>
        </form>
      </details>
    </div>
  );
}
