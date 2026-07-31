CREATE TABLE IF NOT EXISTS friend_requests (
  id           SERIAL PRIMARY KEY,
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (requester_id <> addressee_id),
  UNIQUE (requester_id, addressee_id)
);

-- Canonical pair (user_a_id < user_b_id) so a friendship has exactly one row,
-- symmetric by construction — no direction, no duplicate risk.
CREATE TABLE IF NOT EXISTS friendships (
  user_a_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a_id, user_b_id),
  CHECK (user_a_id < user_b_id)
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);

CREATE INDEX IF NOT EXISTS friend_requests_addressee_idx ON friend_requests (addressee_id);
CREATE INDEX IF NOT EXISTS follows_followee_idx ON follows (followee_id);
