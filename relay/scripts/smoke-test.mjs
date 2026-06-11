// End-to-end smoke test against a running relay (default: local wrangler dev).
// Usage: node scripts/smoke-test.mjs [ws://localhost:8787] [robotToken] [appToken]
import WebSocket from "ws";

const base = process.argv[2] ?? "ws://localhost:8787";
const robotToken = process.argv[3] ?? "dev-robot-token";
const appToken = process.argv[4] ?? "dev-app-token";
const robotId = "smoketest";

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

// 1. Bad token must be rejected.
await connect("app", "wrong-token").then(
  () => check("rejects bad app token", false),
  () => check("rejects bad app token", true),
);

// 2. Robot connects, sends hello + state + map.
const robot = await connect("robot", robotToken);
robot.send(JSON.stringify({ type: "hello", robot: { name: "RoboMop S1", fw: "smoke" } }));
robot.send(JSON.stringify({ type: "triangle_update", pose: { x: 1, y: 2, theta: 0.5 } }));
robot.send(JSON.stringify({ type: "triangle_update", map: { width: 2, height: 2, data: "AA==" } }));
await new Promise((r) => setTimeout(r, 500));

// 3. App connects late and must receive status + cached state + cached map.
const app = await connect("app", appToken);
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
