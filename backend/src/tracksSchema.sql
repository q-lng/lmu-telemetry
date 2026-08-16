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
-- (see frontend/src/trackMapDraw.ts) — offset/scale are normalized fractions
-- of the trace's own bounding box, not raw pixels, so they stay correct
-- regardless of the canvas size the map is actually rendered at. The trace
-- itself is always centered (offset 0/0 draws the map centered on it too) —
-- position exists because the map image's own crop rarely centers the track
-- exactly the same way the GPS trace's bounding box does.
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS map_rotation_deg DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS map_offset_x DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS map_offset_y DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS map_scale DOUBLE PRECISION NOT NULL DEFAULT 1;
