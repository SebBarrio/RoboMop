import { Bot, Home, Settings as SettingsIcon } from "lucide-react";
import type { View } from "../App";
import { useAppStore } from "../lib/store";
import { EStopButton } from "./EStop";
import { Badge } from "./StatusBadge";

export function Sidebar({ view, onNavigate }: { view: View; onNavigate: (view: View) => void }) {
  const selectedRobotId = useAppStore((state) => state.selectedRobotId);
  const robots = useAppStore((state) => state.robots);
  const robotName = useAppStore((state) => state.robotName);
  const online = useAppStore((state) => state.robotOnline);
  const connection = useAppStore((state) => state.connection);
  const selected = robots?.find((robot) => robot.id === selectedRobotId);

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
        <button className="nav-item" aria-current={view === "home" ? "page" : undefined} onClick={() => onNavigate("home")}>
          <Home size={18} aria-hidden />
          Home
        </button>
        <button className="nav-item" aria-current={view === "robots" ? "page" : undefined} onClick={() => onNavigate("robots")}>
          <Bot size={18} aria-hidden />
          Robots
        </button>
        <button className="nav-item" aria-current={view === "settings" ? "page" : undefined} onClick={() => onNavigate("settings")}>
          <SettingsIcon size={18} aria-hidden />
          Settings
        </button>
      </nav>

      <div className="sidebar__spacer" />
      <div className="sidebar__robot">
        <div>
          <div className="sidebar__robot-name">{selected?.nickname ?? robotName ?? selected?.name ?? selectedRobotId ?? "No robot selected"}</div>
          {selectedRobotId && presence}
        </div>
      </div>
      <EStopButton />
    </aside>
  );
}
