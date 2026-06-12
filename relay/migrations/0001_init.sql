PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY, /* SHA-256 hex of the bearer token. */
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE robots (
  id TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  claim_code TEXT NOT NULL,
  name TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE user_robots (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  robot_id TEXT NOT NULL REFERENCES robots(id) ON DELETE CASCADE,
  nickname TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, robot_id)
);
