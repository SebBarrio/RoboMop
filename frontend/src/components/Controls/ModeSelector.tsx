import { robotControlService } from '../../services/robotControlService';

export type Mode = 'IDLE' | 'EXPLORATION' | 'CLEANING' | 'MANUAL' | 'RETURNING' | 'ERROR';

export function ModeSelector({ robotId, mode, onChange }: { robotId: string; mode: Mode; onChange: (m: Mode) => void }) {
  const update = async (newMode: Mode) => {
    onChange(newMode);
    await robotControlService.setMode(robotId, newMode);
  };

  return (
    <select className="select" data-testid="mode-selector" value={mode} onChange={(e) => update(e.target.value as Mode)}>
      <option value="IDLE">IDLE</option>
      <option value="EXPLORATION">EXPLORATION</option>
      <option value="CLEANING">CLEANING</option>
      <option value="MANUAL">MANUAL</option>
      <option value="RETURNING">RETURNING</option>
      <option value="ERROR">ERROR</option>
    </select>
  );
}

export default ModeSelector;


