-- Maps a raw telemetry livery/team-skin name (telemetry_files.car, free text
-- read from the DuckDB file's own metadata.CarName) to a real car in the
-- catalog. Mapping one livery here resolves every session — past and
-- future — that uses that exact livery string, without per-session action.
-- See backend/src/leaderboard.ts for how this feeds car-class resolution.
CREATE TABLE IF NOT EXISTS livery_car_mappings (
  livery_name TEXT PRIMARY KEY,
  car_slug    TEXT NOT NULL REFERENCES cars(slug) ON DELETE CASCADE
);
