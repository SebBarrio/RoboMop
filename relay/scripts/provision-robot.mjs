// Provision a robot directly through Wrangler's authenticated D1 admin surface.
// Usage: node scripts/provision-robot.mjs <robot-id> [--name "..."] [--local] [--rotate-secret]
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROBOT_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const CLAIM_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

const args = process.argv.slice(2);
const robotId = args.shift() ?? "";
let name = null;
let local = false;
let rotateSecret = false;

while (args.length > 0) {
  const arg = args.shift();
  if (arg === "--name") {
    name = args.shift() ?? usage("--name requires a value");
  } else if (arg === "--local") {
    local = true;
  } else if (arg === "--rotate-secret") {
    rotateSecret = true;
  } else {
    usage(`Unknown argument: ${arg}`);
  }
}

if (!ROBOT_ID_RE.test(robotId)) {
  usage("Robot id must match ^[a-zA-Z0-9_-]{1,64}$");
}

const secret = randomBytes(32).toString("base64url");
const secretHash = createHash("sha256").update(secret).digest("hex");
const claimCode = `${claimPart()}-${claimPart()}`;
const now = Date.now();

const values = [
  sqlString(robotId),
  sqlString(secretHash),
  sqlString(claimCode),
  name === null ? "NULL" : sqlString(name),
  String(now),
].join(", ");

const command = rotateSecret
  ? `INSERT INTO robots (id, secret_hash, claim_code, name, created_at)
     VALUES (${values})
     ON CONFLICT(id) DO UPDATE SET
       secret_hash = excluded.secret_hash,
       claim_code = excluded.claim_code,
       name = COALESCE(excluded.name, robots.name);`
  : `INSERT INTO robots (id, secret_hash, claim_code, name, created_at) VALUES (${values});`;

const relayRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wranglerCli = path.join(relayRoot, "node_modules", "wrangler", "bin", "wrangler.js");
const result = spawnSync(
  process.execPath,
  [wranglerCli, "d1", "execute", "robomop-db", local ? "--local" : "--remote", "--command", command],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
);

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || result.error?.message || "Wrangler failed");
  if (!rotateSecret) {
    console.error("Provisioning failed. If the robot already exists, pass --rotate-secret.");
  }
  process.exit(result.status ?? 1);
}

console.log(`Provisioned robot: ${robotId}`);
console.log(`Robot secret: ${secret}`);
console.log(`Claim code: ${claimCode}`);

function claimPart() {
  let result = "";
  while (result.length < 4) {
    const byte = randomBytes(1)[0];
    if (byte < 224) result += CLAIM_ALPHABET[byte % CLAIM_ALPHABET.length];
  }
  return result;
}

function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function usage(message) {
  if (message) console.error(message);
  console.error(
    'Usage: node scripts/provision-robot.mjs <robot-id> [--name "..."] [--local] [--rotate-secret]',
  );
  process.exit(2);
}
