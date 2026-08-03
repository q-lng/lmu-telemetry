import type { FastifyInstance } from 'fastify';
import { pgQuery } from './pg.js';

// Keys map 1:1 to frontend/src/fonts.ts's FONT_CATALOG — every non-'system'
// entry is a self-hosted @fontsource package (no external CDN at runtime).
export type SiteFont =
  | 'system'
  | 'inter'
  | 'roboto'
  | 'poppins'
  | 'montserrat'
  | 'work-sans'
  | 'space-grotesk'
  | 'manrope'
  | 'oswald'
  | 'orbitron'
  | 'rajdhani'
  | 'bebas-neue'
  | 'playfair-display'
  | 'nunito'
  | 'outfit'
  | 'lexend'
  | 'barlow-condensed'
  | 'merriweather'
  | 'lora'
  | 'roboto-slab'
  | 'caveat';
export const SITE_FONTS: SiteFont[] = [
  'system',
  'inter',
  'roboto',
  'poppins',
  'montserrat',
  'work-sans',
  'space-grotesk',
  'manrope',
  'oswald',
  'orbitron',
  'rajdhani',
  'bebas-neue',
  'playfair-display',
  'nunito',
  'outfit',
  'lexend',
  'barlow-condensed',
  'merriweather',
  'lora',
  'roboto-slab',
  'caveat',
];

// Keys map 1:1 to frontend/src/fonts.ts's DATA_FONT_CATALOG — monospace only,
// used for telemetry data displays (tables, numeric readouts) so columns/
// digits stay aligned regardless of which one is picked.
export type DataFont =
  | 'system-mono'
  | 'jetbrains-mono'
  | 'ibm-plex-mono'
  | 'space-mono'
  | 'roboto-mono'
  | 'fira-code'
  | 'source-code-pro'
  | 'dm-mono';
export const DATA_FONTS: DataFont[] = [
  'system-mono',
  'jetbrains-mono',
  'ibm-plex-mono',
  'space-mono',
  'roboto-mono',
  'fira-code',
  'source-code-pro',
  'dm-mono',
];

// Which of `font`/`dataFont` above the whole telemetry viewer page (sidebar +
// graph) uses — replaces the earlier fixed split where only the legend
// table/laps table/in-graph label were hardcoded to the data font.
export type TelemetryFontMode = 'site' | 'mono';
export const TELEMETRY_FONT_MODES: TelemetryFontMode[] = ['site', 'mono'];

export interface SiteSettings {
  siteName: string;
  font: SiteFont;
  dataFont: DataFont;
  telemetryFont: TelemetryFontMode;
  fontSizeScale: number;
  defaultAccentColor: string;
  accentPresets: string[];
  neonGlowEnabled: boolean;
}

interface SiteSettingsRow {
  site_name: string;
  font: SiteFont;
  data_font: DataFont;
  telemetry_font: TelemetryFontMode;
  font_size_scale: number;
  default_accent_color: string;
  accent_presets: string[];
  neon_glow_enabled: boolean;
}

function fromRow(r: SiteSettingsRow): SiteSettings {
  return {
    siteName: r.site_name,
    font: r.font,
    dataFont: r.data_font,
    telemetryFont: r.telemetry_font,
    fontSizeScale: r.font_size_scale,
    defaultAccentColor: r.default_accent_color,
    accentPresets: r.accent_presets,
    neonGlowEnabled: r.neon_glow_enabled,
  };
}

export async function getSiteSettings(): Promise<SiteSettings> {
  const rows = await pgQuery<SiteSettingsRow>(`SELECT * FROM site_settings WHERE id = 1`);
  return fromRow(rows[0]);
}

export interface SiteSettingsPatch {
  siteName?: string;
  font?: SiteFont;
  dataFont?: DataFont;
  telemetryFont?: TelemetryFontMode;
  fontSizeScale?: number;
  defaultAccentColor?: string;
  accentPresets?: string[];
  neonGlowEnabled?: boolean;
}

export async function updateSiteSettings(patch: SiteSettingsPatch): Promise<SiteSettings> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.siteName !== undefined) {
    params.push(patch.siteName);
    sets.push(`site_name = $${params.length}`);
  }
  if (patch.font !== undefined) {
    params.push(patch.font);
    sets.push(`font = $${params.length}`);
  }
  if (patch.dataFont !== undefined) {
    params.push(patch.dataFont);
    sets.push(`data_font = $${params.length}`);
  }
  if (patch.telemetryFont !== undefined) {
    params.push(patch.telemetryFont);
    sets.push(`telemetry_font = $${params.length}`);
  }
  if (patch.fontSizeScale !== undefined) {
    params.push(patch.fontSizeScale);
    sets.push(`font_size_scale = $${params.length}`);
  }
  if (patch.defaultAccentColor !== undefined) {
    params.push(patch.defaultAccentColor);
    sets.push(`default_accent_color = $${params.length}`);
  }
  if (patch.accentPresets !== undefined) {
    params.push(patch.accentPresets);
    sets.push(`accent_presets = $${params.length}`);
  }
  if (patch.neonGlowEnabled !== undefined) {
    params.push(patch.neonGlowEnabled);
    sets.push(`neon_glow_enabled = $${params.length}`);
  }
  if (sets.length === 0) return getSiteSettings();
  const rows = await pgQuery<SiteSettingsRow>(`UPDATE site_settings SET ${sets.join(', ')} WHERE id = 1 RETURNING *`, params);
  return fromRow(rows[0]);
}

/** Public — the site's display defaults apply to guests too (landing page,
 * login screen), so this can't live behind requireAuth. */
export async function registerSiteSettings(app: FastifyInstance): Promise<void> {
  app.get('/api/site-settings', async (_req, reply) => {
    reply.send(await getSiteSettings());
  });
}
