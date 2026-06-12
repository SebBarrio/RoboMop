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

/** Diagnosis of why the relay link keeps failing, from an HTTPS probe. */
export type ConnectionHint = "unauthorized" | "bad-robot-id" | "unreachable";

export interface Settings {
  relayUrl: string;
  robotId: string;
  token: string;
}

export interface AppState {
  settings: Settings;
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

const SETTINGS_KEY = "robomop.settings.v1";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { relayUrl: "", robotId: "robomop-s1", token: "", ...JSON.parse(raw) };
  } catch {
    /* corrupted storage; fall through to defaults */
  }
  return { relayUrl: "", robotId: "robomop-s1", token: "" };
}

let state: AppState = {
  settings: loadSettings(),
  connection: "idle",
  connectionHint: null,
  robotOnline: false,
  robotLastSeen: null,
  robotName: null,
  lastStateAt: 0,
  pose: null,
  ekfPose: null,
  trajectory: [],
  plannedVertices: [],
  lidarScan: [],
  controlMode: "manual",
  estopActive: false,
  explorePath: [],
  frontiers: [],
  robotFootprint: null,
  obstacleAvoidanceEnabled: true,
  collisionThreat: null,
  imuHeadingDeg: null,
  map: null,
};

const listeners = new Set<() => void>();

export function getState(): AppState {
  return state;
}

export function setState(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  setState({ settings });
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

export function useAppStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}
