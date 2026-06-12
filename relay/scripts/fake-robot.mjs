// Minimal fake robot for manual testing: connects to a local relay and
// streams pose frames so the app's live map has something to draw.
//   node scripts/fake-robot.mjs [url] [robotId] [token]
import WebSocket from "ws";

const url = process.argv[2] ?? "ws://localhost:8787";
const robotId = process.argv[3] ?? "robomop-s1";
const token = process.argv[4] ?? "dev-robot-token";

const ws = new WebSocket(`${url}/ws?robot=${robotId}&role=robot&token=${token}`);

ws.on("open", () => {
  console.log("fake robot connected");
  ws.send(JSON.stringify({ type: "hello", name: "RoboMop S1 (fake)" }));
  let t = 0;
  setInterval(() => {
    t += 0.1;
    const pose = { x: Math.cos(t * 0.3) * 0.8, y: Math.sin(t * 0.3) * 0.8, theta: t * 0.3 + Math.PI / 2 };
    const lidarScan = Array.from({ length: 90 }, (_, i) => {
      const a = (i / 90) * Math.PI * 2;
      return [a, 1.5 + 0.3 * Math.sin(a * 3 + t)];
    });
    ws.send(
      JSON.stringify({
        type: "triangle_update",
        pose,
        ekfPose: { ...pose, varX: 0.01, varY: 0.01, varTheta: 0.01 },
        lidarScan,
        controlMode: "manual",
        estopActive: false,
        robotFootprint: { width: 0.3, length: 0.3, circumscribedRadius: 0.18 },
        obstacleAvoidanceEnabled: true,
      }),
    );
  }, 100);
});

ws.on("message", (data) => console.log("<-", data.toString().slice(0, 120)));
ws.on("close", (code, reason) => {
  console.log("closed", code, reason.toString());
  process.exit(0);
});
ws.on("error", (err) => {
  console.error("error", err.message);
  process.exit(1);
});
