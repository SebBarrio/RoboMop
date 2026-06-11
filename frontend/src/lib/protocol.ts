/** Message protocol shared with the robot and the relay (see relay/src/room.ts). */

export interface Pose {
  x: number;
  y: number;
  theta: number;
}

export interface EkfPose extends Pose {
  varX: number;
  varY: number;
  varTheta: number;
}

export interface CollisionThreat {
  direction: string;
  distance: number;
  angle: number;
  severity: number;
  timeToCollision: number | null;
}

export interface RobotFootprint {
  width: number;
  length: number;
  circumscribedRadius: number;
}

export type ControlMode = "manual" | "clean" | "explore";

export interface MapMessage {
  width: number;
  height: number;
  resolution: number;
  origin: { x: number; y: number; theta: number };
  data: string; // gzip + base64
  encoding: string;
}

/** State frame streamed by the robot at ~10 Hz. */
export interface StateUpdate {
  type: "triangle_update";
  pose?: Pose;
  poseHeadingDeg?: number;
  trajectory?: [number, number][];
  plannedVertices?: [number, number][];
  lidarScan?: [number, number][]; // [angleRad (robot frame), distanceM]
  odomPose?: Pose;
  ekfPose?: EkfPose;
  slamPose?: Pose;
  imuHeadingDeg?: number;
  imuHeadingAgeSec?: number;
  controlMode?: ControlMode;
  estopActive?: boolean;
  explorePath?: [number, number][];
  exploreWaypointIndex?: number;
  frontiers?: [number, number][];
  robotFootprint?: RobotFootprint;
  obstacleAvoidanceEnabled?: boolean;
  collisionThreat?: CollisionThreat;
  map?: MapMessage;
}

export interface RobotStatusMessage {
  type: "robot_status";
  online: boolean;
  lastSeen: number | null;
  robot: { name?: string; startedAt?: number } | null;
}

export type RelayMessage = StateUpdate | RobotStatusMessage | { type: "pong" };

/** Commands sent to the robot. */
export type Command =
  | { type: "estop"; enabled: boolean }
  | { type: "control"; command: "set_mode"; mode: ControlMode }
  | { type: "control"; command: "velocity"; linear: number; angular: number };

export const MAX_LINEAR_SPEED = 0.3; // m/s, mirrors robot defaults
export const MAX_ANGULAR_SPEED = 0.8; // rad/s
