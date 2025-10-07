import { useEffect } from 'react';
import { websocketService } from '../services/websocketService';
import { useRobotStore } from '../stores/robotStore';

export function useRobotState(robotId: string) {
  const setMode = useRobotStore((s) => s.setMode);
  const setVelocity = useRobotStore((s) => s.setVelocity);
  const setBattery = useRobotStore((s) => s.setBattery);
  const setWater = useRobotStore((s) => s.setWater);

  useEffect(() => {
    websocketService.connect();
    websocketService.subscribe({ robotId, types: ['state', 'map', 'sensor'] });

    const onState = (data: any) => {
      if (data.mode) setMode(data.mode);
      if (data.velocity) setVelocity(data.velocity);
      if (typeof data.batteryLevel === 'number') setBattery(data.batteryLevel);
      if (typeof data.waterLevel === 'number') setWater(data.waterLevel);
      if (data.position) {
        // @ts-expect-error position setter not explicitly typed in store
        useRobotStore.setState((s) => ({ position: data.position }));
      }
    };

    websocketService.on('frontend:robot-state', onState);

    return () => {
      websocketService.unsubscribe({ robotId, types: ['state', 'map', 'sensor'] });
    };
  }, [robotId, setMode, setVelocity, setBattery, setWater]);
}


