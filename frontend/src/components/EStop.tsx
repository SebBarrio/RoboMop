import { OctagonX, Play } from "lucide-react";
import { setEstop } from "../lib/connection";
import { useAppStore } from "../lib/store";

function useEstop() {
  const engaged = useAppStore((s) => s.estopActive);
  const online = useAppStore((s) => s.robotOnline);
  const connection = useAppStore((s) => s.connection);
  const usable = connection === "connected" && online;
  return { engaged, usable, toggle: () => setEstop(!engaged) };
}

/** Sidebar / panel e-stop. Single tap engages; tap again resumes. */
export function EStopButton() {
  const { engaged, usable, toggle } = useEstop();
  return (
    <button
      className={engaged ? "estop estop--engaged" : "estop"}
      onClick={toggle}
      disabled={!usable}
      aria-label={engaged ? "Resume robot (release emergency stop)" : "Emergency stop"}
    >
      {engaged ? <Play size={20} aria-hidden /> : <OctagonX size={20} aria-hidden />}
      {engaged ? "Resume robot" : "Emergency stop"}
    </button>
  );
}

/** Mobile-only e-stop, raised out of the center of the bottom tab bar. */
export function EStopTab() {
  const { engaged, usable, toggle } = useEstop();
  return (
    <button
      className={engaged ? "tabbar__estop tabbar__estop--engaged" : "tabbar__estop"}
      onClick={toggle}
      disabled={!usable}
      aria-label={engaged ? "Resume robot (release emergency stop)" : "Emergency stop"}
    >
      {engaged ? <Play size={22} aria-hidden /> : <OctagonX size={22} aria-hidden />}
      {engaged ? "RESUME" : "STOP"}
    </button>
  );
}
