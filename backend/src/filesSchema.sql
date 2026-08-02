CREATE TABLE IF NOT EXISTS telemetry_files (
  filename    TEXT PRIMARY KEY,
  owner_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  visibility  TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'friends', 'public')),
  track       TEXT,
  car         TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telemetry_files_owner_idx      ON telemetry_files (owner_id);
CREATE INDEX IF NOT EXISTS telemetry_files_visibility_idx ON telemetry_files (visibility);
CREATE INDEX IF NOT EXISTS telemetry_files_track_idx      ON telemetry_files (track);
CREATE INDEX IF NOT EXISTS telemetry_files_car_idx        ON telemetry_files (car);

-- Storage-quota accounting. Nullable: existing rows predate this column and are
-- backfilled from disk at startup (see storage.ts's backfillMissingFileSizes) —
-- new uploads always set it immediately.
ALTER TABLE telemetry_files ADD COLUMN IF NOT EXISTS size_bytes BIGINT;

-- A row here GRANTS wider access than the parent file's own visibility (never the
-- reverse) — no row means the lap just follows the file's visibility.
CREATE TABLE IF NOT EXISTS lap_shares (
  filename   TEXT NOT NULL REFERENCES telemetry_files(filename) ON DELETE CASCADE,
  lap_number INTEGER NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('friends', 'public')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (filename, lap_number)
);
