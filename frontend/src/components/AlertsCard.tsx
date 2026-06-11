import { AlertTriangle, Info, ShieldOff } from "lucide-react";
import { useAppStore } from "../lib/store";

export function AlertsCard() {
  const threat = useAppStore((s) => s.collisionThreat);
  const avoidance = useAppStore((s) => s.obstacleAvoidanceEnabled);
  const estop = useAppStore((s) => s.estopActive);
  const online = useAppStore((s) => s.robotOnline);
  const connection = useAppStore((s) => s.connection);

  const alerts: React.ReactNode[] = [];

  if (estop) {
    alerts.push(
      <div key="estop" className="alert alert--danger" role="alert">
        <AlertTriangle size={16} aria-hidden />
        <span>Emergency stop is engaged. The robot will not move until you resume.</span>
      </div>,
    );
  }
  if (threat && threat.severity > 0.4) {
    const sev = threat.severity > 0.8 ? "danger" : "warn";
    alerts.push(
      <div key="threat" className={`alert alert--${sev}`} role="alert">
        <AlertTriangle size={16} aria-hidden />
        <span>
          Obstacle {threat.direction} at <span className="num">{threat.distance.toFixed(2)} m</span>
          {threat.severity > 0.8 ? " — robot is braking." : " — slowing down."}
        </span>
      </div>,
    );
  }
  if (online && !avoidance) {
    alerts.push(
      <div key="avoid" className="alert alert--warn">
        <ShieldOff size={16} aria-hidden />
        <span>Obstacle avoidance is disabled on the robot.</span>
      </div>,
    );
  }
  if (connection === "connected" && !online) {
    alerts.push(
      <div key="offline" className="alert alert--info">
        <Info size={16} aria-hidden />
        <span>Robot is offline. Telemetry resumes when it reconnects to the relay.</span>
      </div>,
    );
  }

  return (
    <section className="card" aria-label="Alerts">
      <h2 className="card__title">Alerts</h2>
      {alerts.length > 0 ? alerts : <p className="alerts-empty">Nothing needs attention.</p>}
    </section>
  );
}
