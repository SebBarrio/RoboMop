import { useState } from "react";
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { ApiError, pairRobot, renameRobot, unpairRobot } from "../lib/api";
import { relay } from "../lib/connection";
import {
  resetRobotTelemetry,
  selectRobot,
  setState,
  useAppStore,
  type RobotSummary,
} from "../lib/store";
import { Badge } from "./StatusBadge";

export function RobotsView({ onViewRobot }: { onViewRobot: () => void }) {
  const token = useAppStore((state) => state.auth.token)!;
  const robots = useAppStore((state) => state.robots);
  const selectedRobotId = useAppStore((state) => state.selectedRobotId);
  const connection = useAppStore((state) => state.connection);
  const robotOnline = useAppStore((state) => state.robotOnline);
  const [robotId, setRobotId] = useState("");
  const [claimCode, setClaimCode] = useState("");
  const [pairError, setPairError] = useState("");
  const [pairing, setPairing] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  function updateRobot(updated: RobotSummary) {
    setState({ robots: (robots ?? []).map((robot) => (robot.id === updated.id ? updated : robot)) });
  }

  function chooseRobot(id: string) {
    selectRobot(id);
    relay.start(id, token);
    onViewRobot();
  }

  async function addRobot(event: React.FormEvent) {
    event.preventDefault();
    setPairError("");
    setPairing(true);
    try {
      const robot = await pairRobot(token, robotId.trim(), claimCode.trim());
      setState({ robots: [...(robots ?? []).filter((item) => item.id !== robot.id), robot] });
      selectRobot(robot.id);
      relay.start(robot.id, token);
      onViewRobot();
    } catch (caught) {
      setPairError(
        caught instanceof ApiError && caught.status === 404
          ? "No robot matches that ID and claim code."
          : "Unable to pair this robot.",
      );
    } finally {
      setPairing(false);
    }
  }

  async function saveRename(robot: RobotSummary) {
    setActionError("");
    setSavingId(robot.id);
    try {
      updateRobot(await renameRobot(token, robot.id, nickname));
      setRenamingId(null);
    } catch {
      setActionError("Unable to rename this robot.");
    } finally {
      setSavingId(null);
    }
  }

  async function removeRobot(robot: RobotSummary) {
    setActionError("");
    setSavingId(robot.id);
    try {
      await unpairRobot(token, robot.id);
      setState({ robots: (robots ?? []).filter((item) => item.id !== robot.id) });
      if (selectedRobotId === robot.id) {
        relay.stop();
        resetRobotTelemetry();
        selectRobot(null);
      }
    } catch {
      setActionError("Unable to unpair this robot.");
    } finally {
      setSavingId(null);
      setConfirmingId(null);
    }
  }

  return (
    <div className="robots-view">
      <header className="page-head">
        <h1>Robots</h1>
      </header>

      <section className="card robot-list-card">
        <h2 className="card__title">Paired robots</h2>
        {robots === null ? (
          <div className="robots-loading">
            <Loader2 size={16} className="spin" aria-hidden />
            Loading robots...
          </div>
        ) : robots.length === 0 ? (
          <p className="empty-copy">
            No robots yet. Enter the robot ID and claim code printed when the robot was provisioned.
          </p>
        ) : (
          <div className="robot-list">
            {robots.map((robot) => {
              const selected = robot.id === selectedRobotId;
              const busy = savingId === robot.id;
              return (
                <div
                  className={`robot-row${selected ? " robot-row--selected" : ""}`}
                  key={robot.id}
                >
                  <button className="robot-row__select" type="button" onClick={() => chooseRobot(robot.id)}>
                    <span className="robot-row__radio" aria-hidden />
                    <span>
                      <strong>{robot.nickname ?? robot.name ?? robot.id}</strong>
                      <small>{robot.id}</small>
                    </span>
                    {selected && connection === "connected" && (
                      <Badge tone={robotOnline ? "ok" : "bad"} label={robotOnline ? "Online" : "Offline"} />
                    )}
                  </button>

                  {renamingId === robot.id ? (
                    <div className="robot-row__editor">
                      <input
                        aria-label={`Nickname for ${robot.id}`}
                        value={nickname}
                        onChange={(event) => setNickname(event.target.value)}
                        autoFocus
                      />
                      <button
                        className="icon-button"
                        type="button"
                        aria-label="Save nickname"
                        onClick={() => void saveRename(robot)}
                        disabled={busy}
                      >
                        {busy ? <Loader2 size={16} className="spin" aria-hidden /> : <Check size={16} aria-hidden />}
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label="Cancel rename"
                        onClick={() => setRenamingId(null)}
                        disabled={busy}
                      >
                        <X size={16} aria-hidden />
                      </button>
                    </div>
                  ) : confirmingId === robot.id ? (
                    <div className="robot-row__confirm">
                      <span>Unpair?</span>
                      <button className="btn btn--danger-ghost" type="button" onClick={() => void removeRobot(robot)} disabled={busy}>
                        {busy && <Loader2 size={15} className="spin" aria-hidden />}
                        Unpair
                      </button>
                      <button className="btn btn--ghost" type="button" onClick={() => setConfirmingId(null)} disabled={busy}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="robot-row__actions">
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={`Rename ${robot.id}`}
                        onClick={() => {
                          setRenamingId(robot.id);
                          setNickname(robot.nickname ?? "");
                        }}
                      >
                        <Pencil size={16} aria-hidden />
                      </button>
                      <button
                        className="icon-button icon-button--danger"
                        type="button"
                        aria-label={`Unpair ${robot.id}`}
                        onClick={() => setConfirmingId(robot.id)}
                      >
                        <Trash2 size={16} aria-hidden />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {actionError && <p className="form-error" role="alert">{actionError}</p>}
      </section>

      <form className="card pair-card" onSubmit={addRobot}>
        <h2 className="card__title">Add robot</h2>
        <div className="pair-card__fields">
          <div className="field">
            <label htmlFor="pair-robot-id">Robot ID</label>
            <input
              id="pair-robot-id"
              value={robotId}
              onChange={(event) => setRobotId(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              required
              disabled={pairing}
            />
          </div>
          <div className="field">
            <label htmlFor="pair-claim-code">Claim code</label>
            <input
              id="pair-claim-code"
              value={claimCode}
              onChange={(event) => setClaimCode(event.target.value.toUpperCase())}
              autoComplete="off"
              spellCheck={false}
              placeholder="XXXX-XXXX"
              required
              disabled={pairing}
            />
          </div>
        </div>
        {pairError && <p className="form-error" role="alert">{pairError}</p>}
        <button className="btn btn--primary" type="submit" disabled={pairing}>
          {pairing ? <Loader2 size={16} className="spin" aria-hidden /> : <Plus size={16} aria-hidden />}
          Add robot
        </button>
      </form>
    </div>
  );
}
