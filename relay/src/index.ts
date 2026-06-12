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

/**
 * Non-upgrade responses carry CORS headers so the app (served from another
 * origin) can probe credentials over plain HTTPS and read the status code.
 */
function plain(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json(
        { service: "robomop-relay", ok: true },
        { headers: { "Access-Control-Allow-Origin": "*" } },
      );
    }

    if (url.pathname === "/ws") {
      const robotId = url.searchParams.get("robot") ?? "";
      const role = url.searchParams.get("role") ?? "";
      const token = url.searchParams.get("token") ?? "";

      if (!ROBOT_ID_RE.test(robotId)) {
        return plain("Invalid robot id", 400);
      }
      if (role !== "robot" && role !== "app") {
        return plain("Invalid role", 400);
      }

      const expected = role === "robot" ? env.ROBOT_TOKEN : env.APP_TOKEN;
      if (!expected || !timingSafeEqual(token, expected)) {
        return plain("Unauthorized", 401);
      }

      // Checked last so clients can probe credentials with a plain GET:
      // 401/400 = fix your settings, 426 = credentials are fine.
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return plain("Expected WebSocket upgrade", 426);
      }

      const id = env.ROBOT_ROOM.idFromName(robotId);
      return env.ROBOT_ROOM.get(id).fetch(request);
    }

    return plain("Not found", 404);
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
