/**
 * RoboMop relay — Worker entry point.
 *
 * The robot and the app both dial OUT to this Worker over WSS, so neither
 * needs to be reachable from the internet (no port forwarding, works through
 * NAT/CGNAT/cellular).
 *
 * Robots authenticate with per-robot secrets stored as hashes in D1. Apps
 * authenticate with account session tokens and must be paired to the robot.
 *
 *   wss://<worker>/ws?robot=<robot-id>&role=robot&token=<robot-secret>
 *   wss://<worker>/ws?robot=<robot-id>&role=app&token=<session-token>
 *
 * Each robot id maps to one RobotRoom Durable Object which relays messages:
 *   robot -> all connected apps   (telemetry: state + map frames)
 *   app   -> robot                (commands: estop, control)
 *
 * See src/room.ts for the message protocol.
 */

import { handleApi } from "./api";
import { sha256Hex, timingSafeEqual } from "./auth";
import { RobotRoom } from "./room";

export { RobotRoom };

export interface Env {
  ROBOT_ROOM: DurableObjectNamespace;
  DB: D1Database;
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

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env);
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

      if (role === "robot") {
        const robot = await env.DB
          .prepare("SELECT secret_hash FROM robots WHERE id = ?")
          .bind(robotId)
          .first<{ secret_hash: string }>();
        if (!robot || !timingSafeEqual(await sha256Hex(token), robot.secret_hash)) {
          return plain("Unauthorized", 401);
        }
      } else {
        const session = await env.DB
          .prepare(
            `SELECT sessions.user_id, user_robots.robot_id AS paired_robot_id
             FROM sessions
             LEFT JOIN user_robots
               ON user_robots.user_id = sessions.user_id AND user_robots.robot_id = ?
             WHERE sessions.id = ? AND sessions.expires_at > ?`,
          )
          .bind(robotId, await sha256Hex(token), Date.now())
          .first<{ user_id: string; paired_robot_id: string | null }>();
        if (!session) {
          return plain("Unauthorized", 401);
        }
        if (!session.paired_robot_id) {
          return plain("Not paired", 403);
        }
      }

      // Checked last so clients can probe credentials with a plain GET:
      // 400/401/403 diagnose auth and pairing; 426 means credentials are fine.
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return plain("Expected WebSocket upgrade", 426);
      }

      const id = env.ROBOT_ROOM.idFromName(robotId);
      return env.ROBOT_ROOM.get(id).fetch(request);
    }

    return plain("Not found", 404);
  },
};
