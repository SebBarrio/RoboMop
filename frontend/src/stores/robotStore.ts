import { create } from 'zustand';

export type Mode = 'IDLE' | 'EXPLORATION' | 'CLEANING' | 'MANUAL' | 'RETURNING' | 'ERROR';

type Velocity = { linear: number; angular: number };

type RobotState = {
  mode: Mode;
  batteryLevel: number | null;
  waterLevel: number | null;
  velocity: Velocity;
  position: { x: number; y: number; theta: number };
};

type RobotStore = RobotState & {
  setMode: (mode: Mode) => void;
  setVelocity: (velocity: Velocity) => void;
  setBattery: (percent: number) => void;
  setWater: (percent: number) => void;
};

export const useRobotStore = create<RobotStore>((set) => ({
  mode: 'IDLE',
  batteryLevel: null,
  waterLevel: null,
  velocity: { linear: 0, angular: 0 },
  position: { x: 0, y: 0, theta: 0 },
  setMode: (mode) => set({ mode }),
  setVelocity: (velocity) => set({ velocity }),
  setBattery: (batteryLevel) => set({ batteryLevel }),
  setWater: (waterLevel) => set({ waterLevel }),
}));


