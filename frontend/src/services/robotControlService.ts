import { websocketService } from './websocketService';
import type { Mode } from '../stores/robotStore';

class RobotControlService {
  public async move(robotId: string, linear: number, angular: number) {
    return websocketService.sendUICommand({
      robotId,
      command: { type: 'MOVE', payload: { linear, angular } },
    });
  }

  public async setMode(robotId: string, mode: Mode) {
    return websocketService.sendUICommand({
      robotId,
      command: { type: 'SET_MODE', payload: { mode } },
    });
  }

  public async eStop(robotId: string) {
    return websocketService.sendUICommand({
      robotId,
      command: { type: 'E_STOP', payload: { reason: 'USER' } },
    });
  }

  public async setSpeed(robotId: string, speedPercent: number) {
    return websocketService.sendUICommand({
      robotId,
      command: { type: 'SET_SPEED', payload: { percent: speedPercent } },
    });
  }
}

export const robotControlService = new RobotControlService();


