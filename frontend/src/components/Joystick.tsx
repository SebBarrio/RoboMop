import { useEffect, useRef, useState } from "react";
import { Move } from "lucide-react";
import { sendVelocity } from "../lib/connection";
import { MAX_ANGULAR_SPEED, MAX_LINEAR_SPEED } from "../lib/protocol";
import { useAppStore } from "../lib/store";

const KNOB_TRAVEL = 56; // px from center

/**
 * Virtual joystick for manual driving.
 * Up = forward, left/right = turn. Streams velocity at 10 Hz while held,
 * sends an immediate zero on release, page-hide, or disable.
 */
export function Joystick() {
  const mode = useAppStore((s) => s.controlMode);
  const online = useAppStore((s) => s.robotOnline);
  const connection = useAppStore((s) => s.connection);
  const estop = useAppStore((s) => s.estopActive);
  const enabled = connection === "connected" && online && mode === "manual" && !estop;

  const [speed, setSpeed] = useState(0.6);
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);
  const padRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const vector = useRef({ x: 0, y: 0 }); // normalized, y up = +1
  const speedRef = useRef(speed);
  speedRef.current = speed;

  // Stream velocities while the stick is held.
  useEffect(() => {
    if (!active) return;
    const send = () => {
      const { x, y } = vector.current;
      sendVelocity(y * MAX_LINEAR_SPEED * speedRef.current, -x * MAX_ANGULAR_SPEED * speedRef.current);
    };
    send();
    const id = window.setInterval(send, 100);
    return () => {
      window.clearInterval(id);
      sendVelocity(0, 0);
    };
  }, [active]);

  // Safety: stop the robot if the tab is hidden or the stick gets disabled mid-drag.
  useEffect(() => {
    const onHide = () => {
      if (document.hidden && vector.current.x + vector.current.y !== 0) sendVelocity(0, 0);
      if (document.hidden) release();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  useEffect(() => {
    if (!enabled) release();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  function setKnob(dx: number, dy: number) {
    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  }

  function release() {
    vector.current = { x: 0, y: 0 };
    setKnob(0, 0);
    activeRef.current = false;
    setActive(false);
  }

  function track(e: PointerEvent | React.PointerEvent) {
    const pad = padRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > KNOB_TRAVEL) {
      dx = (dx / len) * KNOB_TRAVEL;
      dy = (dy / len) * KNOB_TRAVEL;
    }
    vector.current = { x: dx / KNOB_TRAVEL, y: -dy / KNOB_TRAVEL };
    setKnob(dx, dy);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!enabled) return;
    try {
      padRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already-released pointer; tracking still works */
    }
    activeRef.current = true;
    setActive(true);
    track(e);
  }

  return (
    <section className="card" aria-label="Manual drive">
      <h2 className="card__title">Manual drive</h2>
      <div className="drive">
        <div
          ref={padRef}
          className="joystick"
          data-active={active}
          data-disabled={!enabled}
          role="application"
          aria-label="Drive joystick. Drag up to move forward, sideways to turn."
          onPointerDown={onPointerDown}
          onPointerMove={(e) => activeRef.current && track(e)}
          onPointerUp={release}
          onPointerCancel={release}
        >
          <svg className="joystick__cross" viewBox="0 0 176 176" aria-hidden>
            <line x1="88" y1="16" x2="88" y2="160" stroke="var(--border)" strokeWidth="1" />
            <line x1="16" y1="88" x2="160" y2="88" stroke="var(--border)" strokeWidth="1" />
          </svg>
          <div ref={knobRef} className="joystick__knob">
            <Move size={22} aria-hidden />
          </div>
        </div>
        <label className="speed">
          Speed
          <input
            type="range"
            min={20}
            max={100}
            step={5}
            value={Math.round(speed * 100)}
            onChange={(e) => setSpeed(Number(e.target.value) / 100)}
            aria-label="Drive speed percentage"
          />
          <span className="num">{Math.round(speed * 100)}%</span>
        </label>
      </div>
      {!enabled && (
        <p className="mode-hint">
          {estop
            ? "Release the emergency stop to drive."
            : mode !== "manual"
              ? "Switch to Manual mode to drive."
              : "Joystick is available while the robot is online."}
        </p>
      )}
    </section>
  );
}
