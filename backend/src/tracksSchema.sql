CREATE TABLE IF NOT EXISTS tracks (
  slug    TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  country TEXT NOT NULL
);

-- Seeds the tracks already hardcoded before this became admin-editable —
-- ON CONFLICT DO NOTHING so re-running this at every startup never
-- clobbers edits made later through the admin panel.
INSERT INTO tracks (slug, name, country) VALUES
  ('spa', 'Circuit de Spa-Francorchamps', 'BE'),
  ('lagunaseca', 'WeatherTech Raceway Laguna Seca', 'US'),
  ('sebring', 'Sebring International Raceway', 'US')
ON CONFLICT (slug) DO NOTHING;

-- How the track's map.png overlays behind a session's GPS trace on TrackMap
-- (see frontend/src/trackMapDraw.ts) — both the map and the trace are always
-- centered in the canvas, only rotation/scale are admin-adjustable.
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS map_rotation_deg DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS map_scale DOUBLE PRECISION NOT NULL DEFAULT 1;
