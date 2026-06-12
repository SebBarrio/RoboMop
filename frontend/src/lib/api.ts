import { clearAuth, setAuth, setState, type RobotSummary } from "./store";

export const DEFAULT_RELAY =
  import.meta.env.VITE_RELAY_URL ?? "https://robomop-relay.sebastian-barrio-b.workers.dev";

export const RELAY_OVERRIDE_KEY = "robomop.relayOverride.v1";

export interface User {
  id: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Normalize user-entered relay origins to an HTTP(S) base without a trailing slash. */
export function normalizeRelayUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, "");
  if (!url) return "";
  url = url.replace(/^wss:\/\//i, "https://").replace(/^ws:\/\//i, "http://");
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

export function relayHttpBase(): string {
  const override = localStorage.getItem(RELAY_OVERRIDE_KEY) ?? "";
  return normalizeRelayUrl(override) || normalizeRelayUrl(DEFAULT_RELAY);
}

export function relayWsBase(): string {
  return relayHttpBase().replace(/^https:\/\//i, "wss://").replace(/^http:\/\//i, "ws://");
}

export async function register(email: string, password: string): Promise<AuthResponse> {
  return request("/api/register", { method: "POST", body: JSON.stringify({ email, password }) });
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return request("/api/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export async function logout(token: string): Promise<void> {
  await authedRequest("/api/logout", token, { method: "POST" });
}

export async function me(token: string): Promise<User> {
  const result = await authedRequest<{ user: User }>("/api/me", token);
  setAuth(token, result.user.email);
  return result.user;
}

export async function listRobots(token: string): Promise<RobotSummary[]> {
  const result = await authedRequest<{ robots: RobotSummary[] }>("/api/robots", token);
  setState({ robots: result.robots });
  return result.robots;
}

export async function pairRobot(
  token: string,
  robotId: string,
  claimCode: string,
): Promise<RobotSummary> {
  const result = await authedRequest<{ robot: RobotSummary }>("/api/robots/pair", token, {
    method: "POST",
    body: JSON.stringify({ robotId, claimCode }),
  });
  return result.robot;
}

export async function unpairRobot(token: string, robotId: string): Promise<void> {
  await authedRequest(`/api/robots/${encodeURIComponent(robotId)}`, token, { method: "DELETE" });
}

export async function renameRobot(
  token: string,
  robotId: string,
  nickname: string,
): Promise<RobotSummary> {
  const result = await authedRequest<{ robot: RobotSummary }>(
    `/api/robots/${encodeURIComponent(robotId)}`,
    token,
    { method: "PATCH", body: JSON.stringify({ nickname }) },
  );
  return result.robot;
}

async function authedRequest<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  try {
    return await request<T>(path, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) clearAuth();
    throw error;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${relayHttpBase()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });

  if (response.ok) {
    return (response.status === 204 ? undefined : await response.json()) as T;
  }

  let message = `Request failed (${response.status})`;
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) message = body.error;
  } catch {
    /* preserve the status-based fallback */
  }
  throw new ApiError(message, response.status);
}
