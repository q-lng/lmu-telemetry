CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  pseudo        TEXT NOT NULL UNIQUE,
  nom           TEXT NOT NULL,
  prenom        TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Storage plan — 'free' (1GB quota) by default, 'vip' assigned by hand for now
-- (no admin panel yet). CREATE TABLE IF NOT EXISTS above is a no-op on an
-- already-existing users table, so this needs its own idempotent migration.
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'vip'));

-- Site administrator flag — assigned by hand for now, same as plan above
-- (no admin panel to self-serve this yet).
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Login sessions (not telemetry sessions — named auth_sessions to avoid confusion
-- with data/*.duckdb "sessions").
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  user_agent TEXT,
  ip         TEXT
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx    ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions (expires_at);
