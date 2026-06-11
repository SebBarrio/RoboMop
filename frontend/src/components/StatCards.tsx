import { useAppStore } from "../lib/store";

const MODE_LABEL: Record<string, string> = {
  manual: "Manual",
  clean: "Cleaning",
  explore: "Exploring",
};

export function StatCards() {
  const pose = useAppStore((s) => s.pose);
  const ekf = useAppStore((s) => s.ekfPose);
  const mode = useAppStore((s) => s.controlMode);
  const estop = useAppStore((s) => s.estopActive);
  const hasData = useAppStore((s) => s.lastStateAt) > 0;

  const heading = pose ? `${((pose.theta * 180) / Math.PI).toFixed(1)}°` : "—";
  const position = pose ? `${pose.x.toFixed(2)}, ${pose.y.toFixed(2)}` : "—";
  const uncertainty =
    ekf && hasData ? `±${Math.sqrt(Math.max(ekf.varX, ekf.varY)).toFixed(2)} m` : "no data";

  return (
    <div className="stats" role="group" aria-label="Robot telemetry">
      <div className="stat stat--wide">
        <div className="stat__label">Position</div>
        <div className="stat__value num">{position}</div>
        <div className="stat__caption num">{uncertainty}</div>
      </div>
      <div className="stat">
        <div className="stat__label">Heading</div>
        <div className="stat__value num">{heading}</div>
        <div className="stat__caption">EKF fused</div>
      </div>
      <div className="stat">
        <div className="stat__label">Mode</div>
        <div className="stat__value">{estop ? "Stopped" : (MODE_LABEL[mode] ?? mode)}</div>
        <div className="stat__caption">{estop ? "E-stop engaged" : "Active"}</div>
      </div>
    </div>
  );
}
