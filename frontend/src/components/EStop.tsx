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

/** Mobile-only floating e-stop, always under the thumb. */
export function EStopFab() {
  const { engaged, usable, toggle } = useEstop();
  if (!usable) return null;
  return (
    <button
      className={engaged ? "estop-fab estop-fab--engaged" : "estop-fab"}
      onClick={toggle}
      aria-label={engaged ? "Resume robot (release emergency stop)" : "Emergency stop"}
    >
      {engaged ? <Play size={26} aria-hidden /> : <OctagonX size={26} aria-hidden />}
      {engaged ? "RESUME" : "STOP"}
    </button>
  );
}
