import { robotControlService } from '../../services/robotControlService';

type JoggingControlsProps = {
  robotId: string;
  speedPercent: number;
};

export function JoggingControls({ robotId, speedPercent }: JoggingControlsProps) {
  const send = (vx: number, wz: number) => {
    robotControlService.move(robotId, vx, wz);
  };

  const v = (speedPercent / 100) * 0.5; // max 0.5 m/s placeholder
  const w = (speedPercent / 100) * 1.0; // max 1.0 rad/s placeholder

  return (
    <div className="jog-grid">
      <div />
      <div className="button" data-testid="jogging-forward" onMouseDown={() => send(v, 0)} onMouseUp={() => send(0, 0)}>▲</div>
      <div />
      <div className="button" data-testid="jogging-left" onMouseDown={() => send(0, w)} onMouseUp={() => send(0, 0)}>◀</div>
      <div className="button jog-center" data-testid="jogging-stop" onClick={() => send(0, 0)}>■</div>
      <div className="button" data-testid="jogging-right" onMouseDown={() => send(0, -w)} onMouseUp={() => send(0, 0)}>▶</div>
      <div />
      <div className="button" data-testid="jogging-backward" onMouseDown={() => send(-v, 0)} onMouseUp={() => send(0, 0)}>▼</div>
      <div />
    </div>
  );
}

export default JoggingControls;


