CREATE TABLE IF NOT EXISTS manufacturers (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

INSERT INTO manufacturers (slug, name) VALUES
  ('alpine', 'Alpine'),
  ('aston-martin', 'Aston Martin'),
  ('bmw', 'BMW'),
  ('cadillac', 'Cadillac'),
  ('ferrari', 'Ferrari'),
  ('genesis', 'Genesis'),
  ('glickenhaus', 'Glickenhaus'),
  ('isotta-fraschini', 'Isotta Fraschini'),
  ('lamborghini', 'Lamborghini'),
  ('peugeot', 'Peugeot'),
  ('porsche', 'Porsche'),
  ('toyota', 'Toyota'),
  ('vanwall', 'Vanwall'),
  ('oreca', 'Oreca'),
  ('chevrolet', 'Chevrolet'),
  ('ford', 'Ford'),
  ('lexus', 'Lexus'),
  ('mercedes-amg', 'Mercedes-AMG'),
  ('mclaren', 'McLaren'),
  ('ligier', 'Ligier'),
  ('ginetta', 'Ginetta'),
  ('duqueine', 'Duqueine'),
  ('adess', 'Adess')
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE cars ADD COLUMN IF NOT EXISTS manufacturer_slug TEXT REFERENCES manufacturers(slug);

-- `cars.manufacturer` (free text) is superseded by manufacturer_slug — kept
-- around rather than dropped (a DROP COLUMN in a script that re-runs on
-- every startup is fragile: a later run would error trying to read/write a
-- column that no longer exists), just no longer required or read by the app.
ALTER TABLE cars ALTER COLUMN manufacturer DROP NOT NULL;

-- One-time backfill from that old free-text column into the new FK, for the
-- cars already seeded before this migration. Guarded by
-- `WHERE manufacturer_slug IS NULL` so it's a no-op on every run after the
-- first.
UPDATE cars SET manufacturer_slug = CASE manufacturer
  WHEN 'Alpine' THEN 'alpine'
  WHEN 'Aston Martin' THEN 'aston-martin'
  WHEN 'BMW' THEN 'bmw'
  WHEN 'Cadillac' THEN 'cadillac'
  WHEN 'Ferrari' THEN 'ferrari'
  WHEN 'Genesis' THEN 'genesis'
  WHEN 'Glickenhaus' THEN 'glickenhaus'
  WHEN 'Isotta Fraschini' THEN 'isotta-fraschini'
  WHEN 'Lamborghini' THEN 'lamborghini'
  WHEN 'Peugeot' THEN 'peugeot'
  WHEN 'Porsche' THEN 'porsche'
  WHEN 'Toyota' THEN 'toyota'
  WHEN 'Vanwall' THEN 'vanwall'
  WHEN 'Oreca' THEN 'oreca'
  WHEN 'Chevrolet' THEN 'chevrolet'
  WHEN 'Ford' THEN 'ford'
  WHEN 'Lexus' THEN 'lexus'
  WHEN 'Mercedes-AMG' THEN 'mercedes-amg'
  WHEN 'McLaren' THEN 'mclaren'
  WHEN 'Ligier' THEN 'ligier'
  WHEN 'Ginetta' THEN 'ginetta'
  WHEN 'Duqueine' THEN 'duqueine'
  WHEN 'Adess' THEN 'adess'
END
WHERE manufacturer_slug IS NULL;
