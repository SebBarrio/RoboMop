export type RobotStatePayload = {
  robotId: string;
  timestamp: string;
  mode: string;
  position: { x: number; y: number; theta: number; confidence: number };
  velocity: { linear: number; angular: number };
  batteryLevel: number;
  waterLevel: number;
  motorCurrents: { left: number; right: number };
};


