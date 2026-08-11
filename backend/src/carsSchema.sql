CREATE TABLE IF NOT EXISTS cars (
  slug         TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  manufacturer TEXT NOT NULL,
  category     TEXT NOT NULL CHECK (category IN ('gte', 'gt3', 'lmp3', 'lmp2-wec', 'lmp2-elms', 'hypercar'))
);

-- Nullable, additive — existing sessions keep their free-text `car` column
-- (see filesSchema.sql) untouched; this just adds an optional link to the
-- car catalog for future sessions once the upload flow's category-filtered
-- car picker exists (not built yet — see the tracking issue).
ALTER TABLE telemetry_files ADD COLUMN IF NOT EXISTS car_slug TEXT REFERENCES cars(slug);

-- Seeds the full Le Mans Ultimate car list Quentin provided (2026-08-11) —
-- ON CONFLICT DO NOTHING so re-running this at every startup never clobbers
-- edits (photos, renames) made later through the admin panel.
INSERT INTO cars (slug, name, manufacturer, category) VALUES
  ('alpine-a424', 'Alpine A424', 'Alpine', 'hypercar'),
  ('alpine-a424-2026', 'Alpine A424 (2026 Joker update)', 'Alpine', 'hypercar'),
  ('aston-martin-valkyrie-amr-lmh', 'Aston Martin Valkyrie AMR LMH Hypercar', 'Aston Martin', 'hypercar'),
  ('bmw-m-hybrid-v8', 'BMW M Hybrid V8', 'BMW', 'hypercar'),
  ('bmw-m-hybrid-v8-evo-2026', 'BMW M Hybrid V8 Evo (2026)', 'BMW', 'hypercar'),
  ('cadillac-v-series-r', 'Cadillac V-Series.R', 'Cadillac', 'hypercar'),
  ('cadillac-v-series-r-evo-2026', 'Cadillac V-Series.R Evo (2026)', 'Cadillac', 'hypercar'),
  ('ferrari-499p', 'Ferrari 499P', 'Ferrari', 'hypercar'),
  ('genesis-gmr-001-lmdh', 'Genesis GMR-001 LMDh', 'Genesis', 'hypercar'),
  ('glickenhaus-scg-007', 'Glickenhaus SCG 007', 'Glickenhaus', 'hypercar'),
  ('isotta-fraschini-tipo-6c', 'Isotta Fraschini Tipo 6-C', 'Isotta Fraschini', 'hypercar'),
  ('lamborghini-sc63', 'Lamborghini SC63', 'Lamborghini', 'hypercar'),
  ('peugeot-9x8-2023', 'Peugeot 9X8 2023', 'Peugeot', 'hypercar'),
  ('peugeot-9x8-2024', 'Peugeot 9X8 2024', 'Peugeot', 'hypercar'),
  ('porsche-963', 'Porsche 963', 'Porsche', 'hypercar'),
  ('toyota-gr010-hybrid', 'Toyota GR010 Hybrid', 'Toyota', 'hypercar'),
  ('toyota-tr010-hybrid-2026', 'Toyota TR010 Hybrid (2026)', 'Toyota', 'hypercar'),
  ('vanwall-vandervell-680', 'Vanwall Vandervell 680', 'Vanwall', 'hypercar'),

  ('oreca-07-gibson', 'Oreca 07 Gibson', 'Oreca', 'lmp2-wec'),
  ('oreca-07-gibson-elms', 'Oreca 07 Gibson ELMS', 'Oreca', 'lmp2-elms'),

  ('aston-martin-vantage-gte', 'Aston Martin Vantage GTE', 'Aston Martin', 'gte'),
  ('chevrolet-corvette-c8r', 'Chevrolet Corvette C8.R', 'Chevrolet', 'gte'),
  ('ferrari-488-gte-evo', 'Ferrari 488 GTE Evo', 'Ferrari', 'gte'),
  ('porsche-911-rsr-19', 'Porsche 911 RSR-19', 'Porsche', 'gte'),

  ('aston-martin-vantage-lmgt3-evo', 'Aston Martin Vantage AMR LMGT3 Evo', 'Aston Martin', 'gt3'),
  ('bmw-m4-lmgt3', 'BMW M4 LMGT3', 'BMW', 'gt3'),
  ('bmw-m4-lmgt3-evo', 'BMW M4 LMGT3 Evo', 'BMW', 'gt3'),
  ('chevrolet-corvette-z06-lmgt3r', 'Chevrolet Corvette Z06 LMGT3.R', 'Chevrolet', 'gt3'),
  ('ferrari-296-lmgt3', 'Ferrari 296 LMGT3', 'Ferrari', 'gt3'),
  ('ferrari-296-lmgt3-evo', 'Ferrari 296 LMGT3 Evo', 'Ferrari', 'gt3'),
  ('ford-mustang-lmgt3', 'Ford Mustang LMGT3', 'Ford', 'gt3'),
  ('ford-mustang-lmgt3-evo', 'Ford Mustang LMGT3 Evo', 'Ford', 'gt3'),
  ('lamborghini-huracan-lmgt3-evo2', 'Lamborghini Huracán LMGT3 Evo 2', 'Lamborghini', 'gt3'),
  ('lexus-rcf-lmgt3', 'Lexus RC F LMGT3', 'Lexus', 'gt3'),
  ('mercedes-amg-lmgt3', 'Mercedes-AMG LMGT3', 'Mercedes-AMG', 'gt3'),
  ('mclaren-720s-lmgt3-evo', 'McLaren 720S LMGT3 Evo', 'McLaren', 'gt3'),
  ('porsche-911-lmgt3r-992', 'Porsche 911 LMGT3 R (992)', 'Porsche', 'gt3'),
  ('porsche-911-lmgt3r-992-2026', 'Porsche 911 LMGT3 R (992) 2026', 'Porsche', 'gt3'),

  ('ligier-jsp325', 'Ligier JS P325', 'Ligier', 'lmp3'),
  ('ginetta-g61-ltp3-evo', 'Ginetta G61-LT-P3 Evo', 'Ginetta', 'lmp3'),
  ('duqueine-d09', 'Duqueine D09', 'Duqueine', 'lmp3'),
  ('adess-ad25', 'Adess AD25', 'Adess', 'lmp3')
ON CONFLICT (slug) DO NOTHING;
