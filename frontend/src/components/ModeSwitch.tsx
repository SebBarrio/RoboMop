import { setMode } from "../lib/connection";
import type { ControlMode } from "../lib/protocol";
import { useAppStore } from "../lib/store";

const MODES: { id: ControlMode; label: string; hint: string }[] = [
  { id: "manual", label: "Manual", hint: "Drive with the joystick. Obstacle avoidance stays on." },
  { id: "clean", label: "Clean", hint: "Plans a coverage path over the mapped floor and follows it." },
  { id: "explore", label: "Explore", hint: "Seeks unmapped frontiers to grow the map autonomously." },
];

export function ModeSwitch() {
  const mode = useAppStore((s) => s.controlMode);
  const online = useAppStore((s) => s.robotOnline);
  const connection = useAppStore((s) => s.connection);
  const estop = useAppStore((s) => s.estopActive);
  const usable = connection === "connected" && online && !estop;

  const active = MODES.find((m) => m.id === mode) ?? MODES[0];

  return (
    <section className="card" aria-label="Control mode">
      <h2 className="card__title">Mode</h2>
      <div className="mode-switch" role="group" aria-label="Control mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            aria-pressed={mode === m.id}
            disabled={!usable}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="mode-hint">
        {estop ? "Release the emergency stop to change modes." : active.hint}
      </p>
    </section>
  );
}
