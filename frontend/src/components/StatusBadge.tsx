import { useEffect, useState } from "react";
import { useAppStore } from "../lib/store";

type Tone = "ok" | "bad" | "warn" | "neutral";

export function Badge({ tone, label }: { tone: Tone; label: string }) {
  const cls = tone === "neutral" ? "badge" : `badge badge--${tone}`;
  return (
    <span className={cls}>
      <span className="badge__dot" aria-hidden />
      {label}
    </span>
  );
}

/** Relay link status. */
export function ConnectionBadge() {
  const connection = useAppStore((s) => s.connection);
  switch (connection) {
    case "connected":
      return <Badge tone="ok" label="Relay connected" />;
    case "connecting":
      return <Badge tone="warn" label="Connecting…" />;
    case "reconnecting":
      return <Badge tone="warn" label="Reconnecting…" />;
    default:
      return <Badge tone="neutral" label="Not connected" />;
  }
}

function formatAgo(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Robot presence, including telemetry staleness. */
export function RobotBadge() {
  const connection = useAppStore((s) => s.connection);
  const online = useAppStore((s) => s.robotOnline);
  const lastSeen = useAppStore((s) => s.robotLastSeen);
  const lastStateAt = useAppStore((s) => s.lastStateAt);
  const [, tick] = useState(0);

  // Re-render every second so ages stay honest.
  useEffect(() => {
    const id = window.setInterval(() => tick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (connection !== "connected") return <Badge tone="neutral" label="Robot unknown" />;
  if (!online) {
    const label = lastSeen ? `Robot offline · ${formatAgo(Date.now() - lastSeen)}` : "Robot offline";
    return <Badge tone="bad" label={label} />;
  }
  const stale = lastStateAt > 0 && Date.now() - lastStateAt > 3000;
  if (stale) return <Badge tone="warn" label="Robot online · telemetry stale" />;
  return <Badge tone="ok" label="Robot online" />;
}
