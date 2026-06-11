import { Settings as SettingsIcon } from "lucide-react";
import { useAppStore } from "../lib/store";
import { MapView } from "./MapView";
import { StatCards } from "./StatCards";
import { ModeSwitch } from "./ModeSwitch";
import { Joystick } from "./Joystick";
import { AlertsCard } from "./AlertsCard";
import { ConnectionBadge, RobotBadge } from "./StatusBadge";

export function HomeView({ onOpenSettings }: { onOpenSettings: () => void }) {
  const configured = useAppStore((s) => s.settings).relayUrl !== "";

  if (!configured) {
    return (
      <>
        <header className="page-head">
          <h1>Home</h1>
        </header>
        <div className="card setup-card">
          <h2>Connect to your robot</h2>
          <p>
            Point the app at your relay to see the live map and drive the robot from anywhere.
          </p>
          <button className="btn btn--primary" onClick={onOpenSettings}>
            <SettingsIcon size={16} aria-hidden />
            Open settings
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="page-head">
        <h1>Home</h1>
        <div className="page-head__meta">
          <ConnectionBadge />
          <RobotBadge />
        </div>
      </header>
      <div className="home">
        <div>
          <MapView />
        </div>
        <div className="rail">
          <StatCards />
          <ModeSwitch />
          <Joystick />
          <AlertsCard />
        </div>
      </div>
    </>
  );
}
