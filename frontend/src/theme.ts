import { dataFontStack, fontStack } from './fonts';
import type { DataFont, SiteFont, TelemetryFontMode } from './types';

// Curated preset palette for the navbar's accent picker — a plain <input
// type="color"> would pop the OS's own color dialog, which doesn't fit a
// neon theme; picking from a small curated set keeps every choice reading
// as "neon" instead of letting someone land on a dull, low-saturation hue.
export const NEON_PRESETS = [
  '#00e5ff', // cyan
  '#2979ff', // electric blue
  '#b026ff', // violet
  '#ff2fd1', // magenta
  '#ff2d55', // hot pink/red
  '#ff8c00', // orange
  '#f5ff00', // yellow
  '#39ff14', // green
];

// Fallback if the site-settings fetch hasn't resolved yet (or fails) — kept
// in sync with the DB's own DEFAULT, so there's no flash-of-wrong-color before
// either a saved user preference or the admin-configured default loads.
export const DEFAULT_ACCENT_COLOR = NEON_PRESETS[0];

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Applies the chosen accent globally: the base color plus two derived,
 * alpha-blended variants (a soft focus ring, a stronger glow for buttons) so
 * every element already styled with var(--accent-ring)/var(--accent-glow)
 * picks up the new color with no per-component changes. `glowEnabled` is the
 * site-wide admin toggle — false zeroes out the glow variable everywhere at
 * once instead of touching every box-shadow rule individually. */
export function applyAccentColor(hex: string, glowEnabled = true): void {
  const rgb = hexToRgb(hex);
  if (!rgb) return;
  const [r, g, b] = rgb;
  const root = document.documentElement.style;
  root.setProperty('--accent', hex);
  root.setProperty('--accent-ring', `rgba(${r}, ${g}, ${b}, 0.18)`);
  root.setProperty('--accent-glow', glowEnabled ? `rgba(${r}, ${g}, ${b}, 0.45)` : 'transparent');
}

/** Same "just set the custom property" approach as the accent color — the
 * font stacks themselves (and the @fontsource imports that back them) live
 * in fonts.ts, the single source of truth shared with the admin font picker. */
export function applyFontFamily(font: SiteFont): void {
  document.documentElement.style.setProperty('--font-family', fontStack(font));
}

/** Separate from the general site font — used wherever telemetry data is
 * displayed (tables, numeric readouts) via var(--font-family-mono), so
 * columns/digits line up regardless of which monospace face is picked. */
export function applyDataFontFamily(font: DataFont): void {
  document.documentElement.style.setProperty('--font-family-mono', dataFontStack(font));
}

/** The telemetry viewer page (sidebar + graph) as a whole follows this
 * instead of the general site font directly — it resolves to whichever of
 * --font-family/--font-family-mono is currently chosen, so the previous fixed
 * split (legend/laps table/in-graph label always mono, rest always site font)
 * becomes one explicit admin choice covering the entire page. Setting it to a
 * nested var() is valid CSS — it resolves transitively at computed-value time. */
export function applyTelemetryFont(mode: TelemetryFontMode): void {
  document.documentElement.style.setProperty(
    '--telemetry-font-family',
    mode === 'mono' ? 'var(--font-family-mono)' : 'var(--font-family)',
  );
}

/** Scales text only — every `font-size` in styles.css is written as
 * `calc(1rem * N / 16)`, and this drives the root `font-size` those are all
 * relative to (see the `html` rule), so icons/padding/layout stay put and
 * only text grows or shrinks. */
export function applyFontSizeScale(scale: number): void {
  document.documentElement.style.setProperty('--text-scale', String(scale));
}
