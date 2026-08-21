-- Singleton table (always exactly one row, id fixed at 1) holding site-wide
-- display defaults, editable from the admin panel's "Affichage" section (see
-- siteSettings.ts / admin.ts). Unlike user_preferences, this isn't per-user —
-- it's the fallback/global look for everyone, guests included.
CREATE TABLE IF NOT EXISTS site_settings (
  id                    SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  site_name             TEXT NOT NULL DEFAULT 'LMU Telemetry',
  font                  TEXT NOT NULL DEFAULT 'system',
  default_accent_color  TEXT NOT NULL DEFAULT '#00e5ff',
  accent_presets        TEXT[] NOT NULL DEFAULT ARRAY['#00e5ff', '#2979ff', '#b026ff', '#ff2fd1', '#ff2d55', '#ff8c00', '#f5ff00', '#39ff14'],
  neon_glow_enabled     BOOLEAN NOT NULL DEFAULT true
);

-- Postgres evaluates a row's column DEFAULTs (and checks them against CHECK
-- constraints) before it gets to the ON CONFLICT DO NOTHING check below —
-- CREATE TABLE IF NOT EXISTS above never updates an existing table's stored
-- column default, so without this the insert fails every time this file runs
-- once font's allowed values no longer include whatever the original default was.
ALTER TABLE site_settings ALTER COLUMN font SET DEFAULT 'system';

INSERT INTO site_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Remap ancient values forward — this file re-runs on every startup (it's
-- not a one-shot migration), so these just no-op once nothing matches them
-- anymore. Kept separate from the constraint itself below: this file used to
-- widen font_check incrementally (narrow → validate → wider → validate,
-- repeated per round of new fonts), which broke the moment live data already
-- held a value only valid under a LATER round — re-running from the top would
-- re-apply an intermediate, too-narrow constraint and fail validating
-- whatever's actually in the row right now. One constraint, defined once
-- below with the full current set, avoids that entirely.
UPDATE site_settings SET font = 'system' WHERE font = 'sans';
UPDATE site_settings SET font = 'jetbrains-mono' WHERE font = 'mono';
UPDATE site_settings SET font = 'playfair-display' WHERE font = 'serif';
UPDATE site_settings SET font = 'system' WHERE font IN ('jetbrains-mono', 'ibm-plex-mono');

-- Text-size multiplier (see theme.ts's applyFontSizeScale — every font-size
-- in styles.css is `calc(1rem * N / 16)`, driven by this via the `html` rule).
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS font_size_scale REAL NOT NULL DEFAULT 1.0;

-- Widened from the initial 0.8-1.5 range — Quentin wants room to dial in
-- whatever the actual right base size turns out to be, not just tweak it.
ALTER TABLE site_settings DROP CONSTRAINT IF EXISTS site_settings_font_size_scale_check;
ALTER TABLE site_settings ADD CONSTRAINT site_settings_font_size_scale_check CHECK (font_size_scale >= 0.8 AND font_size_scale <= 2.0);

-- Separate monospace-only font for telemetry data displays (tables, numeric
-- readouts throughout the app) — kept apart from the general site font below
-- so columns/digits stay aligned no matter which monospace face is picked.
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS data_font TEXT NOT NULL DEFAULT 'system-mono' CHECK (
  data_font IN ('system-mono', 'jetbrains-mono', 'ibm-plex-mono', 'space-mono', 'roboto-mono', 'fira-code', 'source-code-pro', 'dm-mono')
);

-- General site font — current full set (has grown a few rounds: dropped the
-- 2 monospace-only entries in favor of data_font above, then widened twice
-- more across genres since the shorter lists weren't to Quentin's taste).
ALTER TABLE site_settings DROP CONSTRAINT IF EXISTS site_settings_font_check;
ALTER TABLE site_settings ADD CONSTRAINT site_settings_font_check CHECK (
  font IN (
    'system', 'inter', 'roboto', 'poppins', 'montserrat', 'work-sans', 'space-grotesk', 'manrope', 'oswald',
    'orbitron', 'rajdhani', 'bebas-neue', 'playfair-display', 'nunito', 'outfit', 'lexend', 'barlow-condensed',
    'merriweather', 'lora', 'roboto-slab', 'caveat'
  )
) NOT VALID;
ALTER TABLE site_settings VALIDATE CONSTRAINT site_settings_font_check;

-- Which of the two fonts above the telemetry viewer page (sidebar + graph)
-- uses, as a whole — previously a handful of specific spots (legend table,
-- laps table, in-graph label) were hardcoded to always use the data font
-- while the rest of the sidebar stayed on the site font; this replaces that
-- fixed split with one explicit choice covering the entire page.
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS telemetry_font TEXT NOT NULL DEFAULT 'mono' CHECK (telemetry_font IN ('site', 'mono'));

-- Top-level navbar items an admin has hidden (see siteSettings.ts's
-- NAV_ITEM_KEYS) — validated at the app layer, not a DB CHECK, since
-- checking every element of an array against a whitelist isn't a plain
-- column CHECK the way the enum columns above are. Defaults to hiding
-- 'leaderboard' — the page wasn't pulling its weight yet — reversible any
-- time from the admin display settings.
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS hidden_nav_items TEXT[] NOT NULL DEFAULT ARRAY['leaderboard'];
