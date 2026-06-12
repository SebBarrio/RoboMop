import { Bot } from "lucide-react";
import { useAppStore } from "../lib/store";
import { AlertsCard } from "./AlertsCard";
import { ConnectionBadge, RobotBadge } from "./StatusBadge";
import { Joystick } from "./Joystick";
import { MapView } from "./MapView";
import { ModeSwitch } from "./ModeSwitch";
import { StatCards } from "./StatCards";

export function HomeView({ onOpenRobots }: { onOpenRobots: () => void }) {
  const selectedRobotId = useAppStore((state) => state.selectedRobotId);

  if (!selectedRobotId) {
    return (
      <>
        <header className="page-head">
          <h1>Home</h1>
        </header>
        <div className="card setup-card">
          <h2>Select a robot</h2>
          <p>Pair a robot or select one from your robot list to open its live controls.</p>
          <button className="btn btn--primary" onClick={onOpenRobots}>
            <Bot size={16} aria-hidden />
            Open robots
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
