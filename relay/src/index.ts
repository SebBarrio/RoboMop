/**
 * RoboMop relay — Worker entry point.
 *
 * The robot and the app both dial OUT to this Worker over WSS, so neither
 * needs to be reachable from the internet (no port forwarding, works through
 * NAT/CGNAT/cellular).
 *
 *   wss://<worker>/ws?robot=<robot-id>&role=robot&token=<ROBOT_TOKEN>
 *   wss://<worker>/ws?robot=<robot-id>&role=app&token=<APP_TOKEN>
 *
 * Each robot id maps to one RobotRoom Durable Object which relays messages:
 *   robot -> all connected apps   (telemetry: state + map frames)
 *   app   -> robot                (commands: estop, control)
 *
 * See src/room.ts for the message protocol.
 */

import { RobotRoom } from "./room";

export { RobotRoom };

export interface Env {
  ROBOT_ROOM: DurableObjectNamespace;
  ROBOT_TOKEN: string;
  APP_TOKEN: string;
}

const ROBOT_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json({ service: "robomop-relay", ok: true });
    }

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("Expected WebSocket upgrade", { status: 426 });
      }

      const robotId = url.searchParams.get("robot") ?? "";
      const role = url.searchParams.get("role") ?? "";
      const token = url.searchParams.get("token") ?? "";

      if (!ROBOT_ID_RE.test(robotId)) {
        return new Response("Invalid robot id", { status: 400 });
      }
      if (role !== "robot" && role !== "app") {
        return new Response("Invalid role", { status: 400 });
      }

      const expected = role === "robot" ? env.ROBOT_TOKEN : env.APP_TOKEN;
      if (!expected || !timingSafeEqual(token, expected)) {
        return new Response("Unauthorized", { status: 401 });
      }

      const id = env.ROBOT_ROOM.idFromName(robotId);
      return env.ROBOT_ROOM.get(id).fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};

/** Constant-time string comparison to avoid leaking token prefixes. */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}
