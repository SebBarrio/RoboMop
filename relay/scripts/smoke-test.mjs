// End-to-end smoke test against a running relay (default: local wrangler dev).
// Apply local D1 migrations and start wrangler dev before running this script.
// Usage: node scripts/smoke-test.mjs [ws://localhost:8787]
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import WebSocket from "ws";

const base = process.argv[2] ?? "ws://localhost:8787";
const httpBase = base.replace(/^ws/, "http").replace(/\/$/, "");
const relayRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const robotId = `smoketest-${suffix}`;
const unpairedRobotId = `smoketest-unpaired-${suffix}`;
const email = `smoketest-${suffix}@example.com`;
const password = "smoketest-password";

const url = (role, token) => `${base}/ws?robot=${robotId}&role=${role}&token=${token}`;

let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures++;
};

const connect = (role, token) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(url(role, token));
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
    setTimeout(() => reject(new Error("connect timeout")), 5000);
  });

const nextMessage = (ws, timeoutMs = 5000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("message timeout")), timeoutMs);
    ws.once("message", (data) => {
      clearTimeout(t);
      resolve(JSON.parse(data.toString()));
    });
  });

const provision = (id) => {
  const output = execFileSync(
    process.execPath,
    ["scripts/provision-robot.mjs", id, "--name", "RoboMop Smoke Test", "--local", "--rotate-secret"],
    { cwd: relayRoot, encoding: "utf8" },
  );
  const secret = output.match(/Robot secret: (\S+)/)?.[1];
  const claimCode = output.match(/Claim code: (\S+)/)?.[1];
  if (!secret || !claimCode) throw new Error(`Could not parse provisioning output:\n${output}`);
  return { secret, claimCode };
};

const api = async (pathName, options = {}) => {
  const response = await fetch(`${httpBase}${pathName}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
};

const robotCredentials = provision(robotId);
provision(unpairedRobotId);

// 1. Establish an account session and pair it to the test robot.
const registration = await api("/api/register", {
  method: "POST",
  body: JSON.stringify({ email, password }),
});
check("registers throwaway user", registration.response.status === 201);

const login = await api("/api/login", {
  method: "POST",
  body: JSON.stringify({ email, password }),
});
check("logs in throwaway user", login.response.status === 200);
const sessionToken = login.body?.token;
if (!sessionToken) throw new Error("Login did not return a session token");

const pairing = await api("/api/robots/pair", {
  method: "POST",
  headers: { Authorization: `Bearer ${sessionToken}` },
  body: JSON.stringify({ robotId, claimCode: robotCredentials.claimCode }),
});
check("pairs robot by claim code", pairing.response.status === 200);

const probe = (id, role, token) =>
  fetch(`${httpBase}/ws?robot=${id}&role=${role}&token=${encodeURIComponent(token)}`);

check("rejects bad robot secret", (await probe(robotId, "robot", "wrong-secret")).status === 401);
check(
  "rejects valid session for unpaired robot",
  (await probe(unpairedRobotId, "app", sessionToken)).status === 403,
);

// 2. Robot connects, sends hello + state + map.
const robot = await connect("robot", robotCredentials.secret);
robot.send(JSON.stringify({ type: "hello", robot: { name: "RoboMop S1", fw: "smoke" } }));
robot.send(JSON.stringify({ type: "triangle_update", pose: { x: 1, y: 2, theta: 0.5 } }));
robot.send(JSON.stringify({ type: "triangle_update", map: { width: 2, height: 2, data: "AA==" } }));
await new Promise((r) => setTimeout(r, 500));

// 3. App connects late and must receive status + cached state + cached map.
const app = await connect("app", sessionToken);
const m1 = await nextMessage(app);
check("snapshot: robot_status online", m1.type === "robot_status" && m1.online === true);
check("snapshot: robot info cached", m1.robot?.name === "RoboMop S1");
const m2 = await nextMessage(app);
check("snapshot: cached state replayed", m2.type === "triangle_update" && m2.pose?.x === 1);
const m3 = await nextMessage(app);
check("snapshot: cached map replayed", m3.type === "triangle_update" && m3.map?.width === 2);

// 4. Live telemetry flows robot -> app.
robot.send(JSON.stringify({ type: "triangle_update", pose: { x: 9, y: 9, theta: 1 } }));
const live = await nextMessage(app);
check("live state relayed to app", live.pose?.x === 9);

// 5. Commands flow app -> robot.
const cmdPromise = nextMessage(robot);
app.send(JSON.stringify({ type: "control", command: "set_mode", mode: "manual" }));
const cmd = await cmdPromise;
check("command relayed to robot", cmd.type === "control" && cmd.mode === "manual");

// 6. App-level ping keepalive.
app.send(JSON.stringify({ type: "ping" }));
const pong = await nextMessage(app);
check("ping answered with pong", pong.type === "pong");

// 7. Robot disconnect -> apps get offline status.
robot.close();
const offline = await nextMessage(app);
check("robot_status offline on disconnect", offline.type === "robot_status" && offline.online === false);

app.close();
console.log(failures === 0 ? "\nAll smoke tests passed." : `\n${failures} test(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
