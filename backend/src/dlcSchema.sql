CREATE TABLE IF NOT EXISTS dlcs (
  slug  TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  color TEXT NOT NULL
);

INSERT INTO dlcs (slug, name, color) VALUES
  ('2024-pack-1', '2024 Pack 1', '#f59e0b'),
  ('2024-pack-2', '2024 Pack 2', '#22c55e'),
  ('2024-pack-3', '2024 Pack 3', '#3b82f6'),
  ('2024-pack-4', '2024 Pack 4', '#a78bfa'),
  ('2024-pack-5', '2024 Pack 5', '#ec4899'),
  ('elms-pack-1', 'ELMS Pack 1', '#fb923c'),
  ('elms-pack-2', 'ELMS Pack 2', '#14b8a6'),
  ('elms-pack-3', 'ELMS Pack 3', '#eab308'),
  ('us-track-pass', 'US Track Pass', '#60a5fa'),
  ('free-dlc', 'Free DLC', '#94a3b8')
ON CONFLICT (slug) DO NOTHING;

-- Nullable — null means base game, no tag shown.
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS dlc_slug TEXT REFERENCES dlcs(slug);
ALTER TABLE cars ADD COLUMN IF NOT EXISTS dlc_slug TEXT REFERENCES dlcs(slug);

-- Backfill from the DLC list Quentin provided (2026-08-11, see GitHub issue
-- #11) — guarded by `WHERE dlc_slug IS NULL` so it's a no-op after the first
-- run and never overwrites a later admin edit. Only the confidently-mapped
-- tracks/cars are set here; spa/sebring (base game) and every car left out
-- below stay NULL (base game or genuinely unconfirmed — see the admin UI to
-- fix any that are wrong, issue #11 lists exactly which ones are unclear:
-- the 2026 evo variants on BMW/Cadillac/Toyota hypercars, Ford Mustang
-- LMGT3 (± Evo), and Mercedes-AMG LMGT3).
UPDATE tracks SET dlc_slug = 'us-track-pass' WHERE slug = 'lagunaseca' AND dlc_slug IS NULL;

UPDATE cars SET dlc_slug = '2024-pack-1' WHERE slug IN ('lamborghini-sc63', 'peugeot-9x8-2024') AND dlc_slug IS NULL;
UPDATE cars SET dlc_slug = '2024-pack-2' WHERE slug IN ('alpine-a424', 'alpine-a424-2026', 'isotta-fraschini-tipo-6c') AND dlc_slug IS NULL;
UPDATE cars SET dlc_slug = '2024-pack-3'
  WHERE slug IN ('bmw-m4-lmgt3', 'bmw-m4-lmgt3-evo', 'chevrolet-corvette-z06-lmgt3r', 'ferrari-296-lmgt3', 'ferrari-296-lmgt3-evo')
  AND dlc_slug IS NULL;
UPDATE cars SET dlc_slug = '2024-pack-4'
  WHERE slug IN ('aston-martin-vantage-lmgt3-evo', 'porsche-911-lmgt3r-992', 'porsche-911-lmgt3r-992-2026')
  AND dlc_slug IS NULL;
UPDATE cars SET dlc_slug = '2024-pack-5' WHERE slug IN ('lamborghini-huracan-lmgt3-evo2', 'lexus-rcf-lmgt3') AND dlc_slug IS NULL;
UPDATE cars SET dlc_slug = 'free-dlc' WHERE slug = 'mclaren-720s-lmgt3-evo' AND dlc_slug IS NULL;
UPDATE cars SET dlc_slug = 'elms-pack-1' WHERE slug = 'ligier-jsp325' AND dlc_slug IS NULL;
UPDATE cars SET dlc_slug = 'elms-pack-2' WHERE slug = 'ginetta-g61-ltp3-evo' AND dlc_slug IS NULL;
UPDATE cars SET dlc_slug = 'elms-pack-3' WHERE slug = 'duqueine-d09' AND dlc_slug IS NULL;
