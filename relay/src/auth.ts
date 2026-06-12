const PBKDF2_ITERATIONS = 100_000;
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1_000;
const encoder = new TextEncoder();

export interface SessionUser {
  id: string;
  email: string;
}

/** Hash a password into an upgradeable, self-describing PBKDF2 record. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derivePassword(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(derived)}`;
}

/** Verify a password without leaking how much of the derived hash matched. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, iterationsText, saltText, hashText, extra] = stored.split("$");
  const iterations = Number(iterationsText);
  if (
    algorithm !== "pbkdf2" ||
    extra !== undefined ||
    !Number.isInteger(iterations) ||
    iterations <= 0
  ) {
    return false;
  }

  try {
    const expected = fromBase64(hashText);
    const derived = await derivePassword(password, fromBase64(saltText), iterations);
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** Generate a bearer credential suitable for sessions or robot provisioning. */
export function generateToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/** Return a lowercase SHA-256 digest for storage instead of the bearer token. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison for derived hashes and fixed-format token digests. */
export function timingSafeEqual(a: Uint8Array | string, b: Uint8Array | string): boolean {
  const left = typeof a === "string" ? encoder.encode(a) : a;
  const right = typeof b === "string" ? encoder.encode(b) : b;
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

/** Create a 90-day session and return the bearer token exactly once. */
export async function createSession(db: D1Database, userId: string): Promise<string> {
  const token = generateToken();
  const now = Date.now();
  await db
    .prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256Hex(token), userId, now, now + SESSION_TTL_MS)
    .run();
  return token;
}

/** Resolve a non-expired bearer token to its user. */
export async function getSession(db: D1Database, bearer: string): Promise<SessionUser | null> {
  return db
    .prepare(
      `SELECT users.id, users.email
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.id = ? AND sessions.expires_at > ?`,
    )
    .bind(await sha256Hex(bearer), Date.now())
    .first<SessionUser>();
}

/** Login is a convenient low-frequency opportunity to purge expired sessions. */
export async function deleteExpiredSessions(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(Date.now()).run();
}

async function derivePassword(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
