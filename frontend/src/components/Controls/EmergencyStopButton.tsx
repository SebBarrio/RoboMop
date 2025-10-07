import { robotControlService } from '../../services/robotControlService';

export function EmergencyStopButton({ robotId }: { robotId: string }) {
  const onClick = async () => {
    await robotControlService.eStop(robotId);
  };

  return (
    <button className="button danger" onClick={onClick} data-testid="emergency-stop">
      Emergency Stop
    </button>
  );
}

export default EmergencyStopButton;


