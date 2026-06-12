import {
  createSession,
  deleteExpiredSessions,
  getSession,
  hashPassword,
  sha256Hex,
  verifyPassword,
  type SessionUser,
} from "./auth";

interface ApiEnv {
  DB: D1Database;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
}

interface RobotRow {
  id: string;
  name: string | null;
  nickname: string | null;
  pairedAt: number;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization,Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
};

/** Hand-rolled JSON router for the account and robot-pairing API. */
export async function handleApi(request: Request, env: ApiEnv): Promise<Response> {
  if (request.method === "OPTIONS") return empty(204);

  try {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "POST" && path === "/api/register") {
      return await register(request, env.DB);
    }
    if (request.method === "POST" && path === "/api/login") {
      return await login(request, env.DB);
    }

    const authenticated = await authenticate(request, env.DB);
    if (!authenticated) return json({ error: "Unauthorized" }, 401);
    const { bearer, user } = authenticated;

    if (request.method === "POST" && path === "/api/logout") {
      await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256Hex(bearer)).run();
      return empty(204);
    }
    if (request.method === "GET" && path === "/api/me") {
      return json({ user });
    }
    if (request.method === "GET" && path === "/api/robots") {
      return await listRobots(env.DB, user.id);
    }
    if (request.method === "POST" && path === "/api/robots/pair") {
      return await pairRobot(request, env.DB, user.id);
    }

    const robotMatch = path.match(/^\/api\/robots\/([^/]+)$/);
    if (robotMatch && request.method === "DELETE") {
      await env.DB
        .prepare("DELETE FROM user_robots WHERE user_id = ? AND robot_id = ?")
        .bind(user.id, decodeURIComponent(robotMatch[1]))
        .run();
      return empty(204);
    }
    if (robotMatch && request.method === "PATCH") {
      return await renameRobot(request, env.DB, user.id, decodeURIComponent(robotMatch[1]));
    }

    return json({ error: "Not found" }, 404);
  } catch (error) {
    if (error instanceof ApiInputError) return json({ error: error.message }, 400);
    console.error("API request failed", error);
    return json({ error: "Internal server error" }, 500);
  }
}

async function register(request: Request, db: D1Database): Promise<Response> {
  const body = await readJson(request);
  const email = stringField(body, "email")?.trim().toLowerCase() ?? "";
  const password = stringField(body, "password") ?? "";
  if (!email || password.length < 8) {
    return json({ error: "Email and password of at least 8 characters are required" }, 400);
  }

  const user = { id: crypto.randomUUID(), email };
  try {
    await db
      .prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
      .bind(user.id, user.email, await hashPassword(password), Date.now())
      .run();
  } catch (error) {
    if (isUniqueConstraint(error)) return json({ error: "Email already registered" }, 409);
    throw error;
  }

  return json({ token: await createSession(db, user.id), user }, 201);
}

async function login(request: Request, db: D1Database): Promise<Response> {
  const body = await readJson(request);
  const email = stringField(body, "email")?.trim().toLowerCase() ?? "";
  const password = stringField(body, "password") ?? "";

  await deleteExpiredSessions(db);
  const row = await db
    .prepare("SELECT id, email, password_hash FROM users WHERE email = ?")
    .bind(email)
    .first<UserRow>();
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return json({ error: "Invalid credentials" }, 401);
  }

  const user = { id: row.id, email: row.email };
  return json({ token: await createSession(db, user.id), user });
}

async function listRobots(db: D1Database, userId: string): Promise<Response> {
  const result = await db
    .prepare(
      `SELECT robots.id, robots.name, user_robots.nickname, user_robots.created_at AS pairedAt
       FROM user_robots
       JOIN robots ON robots.id = user_robots.robot_id
       WHERE user_robots.user_id = ?
       ORDER BY user_robots.created_at, robots.id`,
    )
    .bind(userId)
    .all<RobotRow>();
  return json({ robots: result.results });
}

async function pairRobot(request: Request, db: D1Database, userId: string): Promise<Response> {
  const body = await readJson(request);
  const robotId = stringField(body, "robotId")?.trim() ?? "";
  const claimCode = stringField(body, "claimCode")?.trim().toUpperCase() ?? "";
  const robot = await db
    .prepare("SELECT id, name FROM robots WHERE id = ? AND claim_code = ?")
    .bind(robotId, claimCode)
    .first<{ id: string; name: string | null }>();
  if (!robot) return json({ error: "Robot not found" }, 404);

  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO user_robots (user_id, robot_id, nickname, created_at)
       VALUES (?, ?, NULL, ?)
       ON CONFLICT (user_id, robot_id) DO NOTHING`,
    )
    .bind(userId, robot.id, now)
    .run();

  const paired = await pairedRobot(db, userId, robot.id);
  return json({ robot: paired });
}

async function renameRobot(
  request: Request,
  db: D1Database,
  userId: string,
  robotId: string,
): Promise<Response> {
  const body = await readJson(request);
  const nickname = stringField(body, "nickname");
  if (nickname === null) return json({ error: "Nickname is required" }, 400);

  const result = await db
    .prepare("UPDATE user_robots SET nickname = ? WHERE user_id = ? AND robot_id = ?")
    .bind(nickname.trim() || null, userId, robotId)
    .run();
  if (result.meta.changes === 0) return json({ error: "Robot not found" }, 404);

  return json({ robot: await pairedRobot(db, userId, robotId) });
}

async function pairedRobot(db: D1Database, userId: string, robotId: string): Promise<RobotRow | null> {
  return db
    .prepare(
      `SELECT robots.id, robots.name, user_robots.nickname, user_robots.created_at AS pairedAt
       FROM user_robots
       JOIN robots ON robots.id = user_robots.robot_id
       WHERE user_robots.user_id = ? AND user_robots.robot_id = ?`,
    )
    .bind(userId, robotId)
    .first<RobotRow>();
}

async function authenticate(
  request: Request,
  db: D1Database,
): Promise<{ bearer: string; user: SessionUser } | null> {
  const authorization = request.headers.get("Authorization") ?? "";
  const match = authorization.match(/^Bearer (.+)$/i);
  if (!match) return null;
  const user = await getSession(db, match[1]);
  return user ? { bearer: match[1], user } : null;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new ApiInputError("Invalid JSON body");
  }
}

function stringField(body: Record<string, unknown>, field: string): string | null {
  return typeof body[field] === "string" ? body[field] : null;
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes("unique");
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: CORS_HEADERS });
}

function empty(status: number): Response {
  return new Response(null, { status, headers: CORS_HEADERS });
}

class ApiInputError extends Error {}
