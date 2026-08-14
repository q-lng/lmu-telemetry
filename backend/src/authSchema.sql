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

-- Account deactivation — set by an admin from the admin panel. Blocks new
-- logins (see auth.ts's login handler) and every existing session for the
-- user is destroyed the moment this flips to false (see admin.ts); existing
-- data/relationships are left untouched otherwise.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Private profiles block new incoming friend requests/follows (enforced in
-- social.ts) — existing friendships/follows aren't retroactively affected by
-- toggling this, it only gates new ones.
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_visibility TEXT NOT NULL DEFAULT 'public' CHECK (profile_visibility IN ('public', 'private'));

-- Cutoff for the notifications bell (friend requests + new followers derived
-- from friend_requests/follows, see notifications.ts) — items created after
-- this timestamp are "unread". Defaults to now() so existing users don't get
-- flooded with every historical follower as "new" the first time this ships.
ALTER TABLE users ADD COLUMN IF NOT EXISTS notifications_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- In-game LMU/RaceControl display name — deliberately separate from the site
-- `pseudo` above (no reason the two match), used to match this user against
-- the free-text DriverName recorded in telemetry files (see leaderboard.ts).
ALTER TABLE users ADD COLUMN IF NOT EXISTS lmu_pseudo TEXT;

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
