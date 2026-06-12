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
          <h2 style={{ "--i": 0 } as React.CSSProperties}>Connect to your robot</h2>
          <p style={{ "--i": 1 } as React.CSSProperties}>
            Enter the relay details once. The app remembers them, reconnects automatically, and
            works from anywhere.
          </p>
          <ul className="setup-list" style={{ "--i": 2 } as React.CSSProperties}>
            <li>
              <strong>Relay URL</strong> Your Cloudflare Worker address
            </li>
            <li>
              <strong>Robot ID</strong> The ID the robot was started with
            </li>
            <li>
              <strong>App token</strong> The APP_TOKEN secret on the relay
            </li>
          </ul>
          <button
            className="btn btn--primary"
            style={{ "--i": 3 } as React.CSSProperties}
            onClick={onOpenSettings}
          >
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
        <div className="home__map">
          <MapView />
        </div>
        <div className="rail">
          <Joystick />
          <ModeSwitch />
          <StatCards />
          <AlertsCard />
        </div>
      </div>
    </>
  );
}
