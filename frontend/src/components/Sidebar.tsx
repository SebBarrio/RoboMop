import { Home, Settings as SettingsIcon } from "lucide-react";
import type { View } from "../App";
import { useAppStore } from "../lib/store";
import { Badge } from "./StatusBadge";
import { EStopButton } from "./EStop";

export function Sidebar({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const robotName = useAppStore((s) => s.robotName);
  const online = useAppStore((s) => s.robotOnline);
  const connection = useAppStore((s) => s.connection);

  const presence =
    connection !== "connected" ? (
      <Badge tone="neutral" label="Unknown" />
    ) : online ? (
      <Badge tone="ok" label="Online" />
    ) : (
      <Badge tone="bad" label="Offline" />
    );

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <img src="./icons/icon.svg" alt="" />
        <div>
          <div className="sidebar__brand-name">RoboMop</div>
          <div className="sidebar__brand-sub">Operator console</div>
        </div>
      </div>

      <nav aria-label="Primary">
        <button
          className="nav-item"
          aria-current={view === "home" ? "page" : undefined}
          onClick={() => onNavigate("home")}
        >
          <Home size={18} aria-hidden />
          Home
        </button>
        <button
          className="nav-item"
          aria-current={view === "settings" ? "page" : undefined}
          onClick={() => onNavigate("settings")}
        >
          <SettingsIcon size={18} aria-hidden />
          Settings
        </button>
      </nav>

      <div className="sidebar__spacer" />

      <div className="sidebar__robot">
        <div>
          <div className="sidebar__robot-name">{robotName ?? "RoboMop"}</div>
          {presence}
        </div>
      </div>

      <EStopButton />
    </aside>
  );
}
