import { useSyncExternalStore } from "react";
import type {
  CollisionThreat,
  ControlMode,
  EkfPose,
  Pose,
  RobotFootprint,
  StateUpdate,
} from "./protocol";
import type { DecodedMap } from "./decodeMap";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting";
export type ConnectionHint = "unauthorized" | "not-paired" | "bad-robot-id" | "unreachable";

export interface AuthState {
  token: string | null;
  email: string | null;
}

export interface RobotSummary {
  id: string;
  name: string | null;
  nickname: string | null;
  pairedAt: number;
}

export interface AppState {
  auth: AuthState;
  robots: RobotSummary[] | null;
  selectedRobotId: string | null;
  connection: ConnectionStatus;
  connectionHint: ConnectionHint | null;
  robotOnline: boolean;
  robotLastSeen: number | null;
  robotName: string | null;
  /** epoch ms of the last state frame; 0 = never */
  lastStateAt: number;
  pose: Pose | null;
  ekfPose: EkfPose | null;
  trajectory: [number, number][];
  plannedVertices: [number, number][];
  lidarScan: [number, number][];
  controlMode: ControlMode;
  estopActive: boolean;
  explorePath: [number, number][];
  frontiers: [number, number][];
  robotFootprint: RobotFootprint | null;
  obstacleAvoidanceEnabled: boolean;
  collisionThreat: CollisionThreat | null;
  imuHeadingDeg: number | null;
  map: DecodedMap | null;
}

const AUTH_KEY = "robomop.auth.v1";
const SELECTED_ROBOT_KEY = "robomop.selectedRobot.v1";

function loadAuth(): AuthState {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (raw) return { token: null, email: null, ...JSON.parse(raw) };
  } catch {
    /* corrupted storage; fall through to defaults */
  }
  return { token: null, email: null };
}

localStorage.removeItem("robomop.settings.v1");

let state: AppState = {
  auth: loadAuth(),
  robots: null,
  selectedRobotId: localStorage.getItem(SELECTED_ROBOT_KEY),
  connection: "idle",
  connectionHint: null,
  ...emptyRobotTelemetry(),
};

const listeners = new Set<() => void>();

export function getState(): AppState {
  return state;
}

export function setState(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export function setAuth(token: string, email: string): void {
  const auth = { token, email };
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  setState({ auth });
}

export function clearAuth(): void {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(SELECTED_ROBOT_KEY);
  setState({
    auth: { token: null, email: null },
    robots: null,
    selectedRobotId: null,
    connection: "idle",
    connectionHint: null,
    ...emptyRobotTelemetry(),
  });
}

export function selectRobot(robotId: string | null): void {
  if (robotId) localStorage.setItem(SELECTED_ROBOT_KEY, robotId);
  else localStorage.removeItem(SELECTED_ROBOT_KEY);
  setState({ selectedRobotId: robotId });
}

export function resetRobotTelemetry(): void {
  setState(emptyRobotTelemetry());
}

export function applyStateUpdate(msg: StateUpdate): void {
  const patch: Partial<AppState> = { lastStateAt: Date.now() };
  if (msg.pose) patch.pose = msg.pose;
  if (msg.ekfPose) patch.ekfPose = msg.ekfPose;
  if (msg.trajectory) patch.trajectory = msg.trajectory;
  if (msg.plannedVertices) patch.plannedVertices = msg.plannedVertices;
  if (msg.lidarScan) patch.lidarScan = msg.lidarScan;
  if (msg.controlMode) patch.controlMode = msg.controlMode;
  if (msg.estopActive !== undefined) patch.estopActive = msg.estopActive;
  patch.explorePath = msg.explorePath ?? [];
  patch.frontiers = msg.frontiers ?? [];
  if (msg.robotFootprint) patch.robotFootprint = msg.robotFootprint;
  if (msg.obstacleAvoidanceEnabled !== undefined)
    patch.obstacleAvoidanceEnabled = msg.obstacleAvoidanceEnabled;
  patch.collisionThreat = msg.collisionThreat ?? null;
  if (msg.imuHeadingDeg !== undefined) patch.imuHeadingDeg = msg.imuHeadingDeg;
  setState(patch);
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppStore<T>(selector: (state: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

function emptyRobotTelemetry() {
  return {
    robotOnline: false,
    robotLastSeen: null,
    robotName: null,
    lastStateAt: 0,
    pose: null,
    ekfPose: null,
    trajectory: [],
    plannedVertices: [],
    lidarScan: [],
    controlMode: "manual" as const,
    estopActive: false,
    explorePath: [],
    frontiers: [],
    robotFootprint: null,
    obstacleAvoidanceEnabled: true,
    collisionThreat: null,
    imuHeadingDeg: null,
    map: null,
  };
}
