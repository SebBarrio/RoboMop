# RoboMop

A DIY SLAM floor-mopping robot with a cloud-connected operator console. Three
pieces:

```
robot (Raspberry Pi, Python)  ── wss ──►  relay (Cloudflare Worker)  ◄── wss ──  app (PWA, anywhere)
```

- **`robot/`** — Python control stack: RPLidar + IMU + encoders, particle-filter
  SLAM, EKF pose fusion, A* exploration, coverage cleaning, obstacle avoidance.
  Entry point: [robot/src/main.py](robot/src/main.py).
- **`relay/`** — tiny Cloudflare Worker + Durable Object that brokers WebSocket
  traffic between the robot and any number of app clients. Both sides dial out,
  so nothing needs port forwarding. Free tier is enough.
- **`frontend/`** — Vite + React PWA operator console: live occupancy-grid map,
  lidar overlay, trajectory, mode control (manual / clean / explore), virtual
  joystick, emergency stop. Installable on a phone; deployable to GitHub
  Pages / Vercel / any static host.

The old LAN-only viewer
([robot/tests/manual_tests/triangle_viewer.py](robot/tests/manual_tests/triangle_viewer.py))
still works — the robot speaks the same protocol to either endpoint.

## 1. Deploy the relay (once)

```bash
cd relay
npm install
npx wrangler login
npx wrangler secret put ROBOT_TOKEN   # invent a long random string
npx wrangler secret put APP_TOKEN     # a different long random string
npm run deploy                        # prints https://robomop-relay.<account>.workers.dev
```

## 2. Run the robot against the relay

```bash
sudo python robot/src/main.py \
  --relay-url wss://robomop-relay.<account>.workers.dev \
  --robot-id robomop-s1 \
  --robot-token <ROBOT_TOKEN> \
  --lidar-port /dev/ttyUSB0
```

The connection is supervised: the robot starts and runs fine with no internet
and reconnects with backoff whenever the relay becomes reachable.
`--viewer ws://<laptop>:8765` still works for the LAN triangle viewer.

## 3. Deploy the app

**GitHub Pages** — enable Settings → Pages → Source: *GitHub Actions*, then push.
[.github/workflows/deploy-frontend.yml](.github/workflows/deploy-frontend.yml)
builds and publishes `frontend/` automatically.

**Vercel** — `cd frontend && npx vercel` (config in
[frontend/vercel.json](frontend/vercel.json)).

Open the app → Settings → enter the relay URL
(`wss://robomop-relay.<account>.workers.dev`), the robot id, and the
`APP_TOKEN`. On a phone, use "Add to Home Screen" to install it as an app.

## Local development (no hardware needed)

```bash
# Terminal 1 — relay
cd relay && copy .dev.vars.example .dev.vars && npm run dev      # ws://localhost:8787

# Terminal 2 — simulated robot (drives around a fake room)
python robot/tools/fake_robot.py

# Terminal 3 — app
cd frontend && npm install && npm run dev                        # http://localhost:5173
```

In the app settings use relay URL `ws://localhost:8787`, robot id `robomop-s1`,
token `dev-app-token`.

Relay protocol tests: `cd relay && node scripts/smoke-test.mjs` (with `npm run dev` running).

## Message protocol

JSON text frames over WebSocket; documented in
[relay/src/room.ts](relay/src/room.ts) and typed in
[frontend/src/lib/protocol.ts](frontend/src/lib/protocol.ts).

- Robot → apps: `triangle_update` state frames (~10 Hz: pose, lidar, trajectory,
  mode, e-stop, threats) and map frames (~1 Hz: gzip+base64 occupancy grid).
- Apps → robot: `{"type":"estop","enabled":bool}` and
  `{"type":"control","command":"set_mode"|"velocity",...}`.
- Relay → apps: `robot_status` (online/offline + last seen), plus a cached
  state/map snapshot replayed on connect.

## Repository layout

| Path | What it is |
|---|---|
| `robot/src/` | On-robot Python (control, sensors, slam, navigation, comms) |
| `robot/tools/fake_robot.py` | Hardware-free simulator for app/relay development |
| `relay/` | Cloudflare Worker WebSocket relay |
| `frontend/` | Operator console PWA |
| `PRODUCT.md`, `DESIGN.md` | Product + design system context for the app |
| `Datasheets/`, `specs/` | Hardware datasheets and legacy design docs |
