// Default accent for the neon theme — matches the static fallback declared in
// styles.css's :root, so there's no flash-of-wrong-color before a saved
// preference (if any) loads.
export const DEFAULT_ACCENT_COLOR = '#00e5ff';

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Applies the chosen accent globally: the base color plus two derived,
 * alpha-blended variants (a soft focus ring, a stronger glow for the neon
 * look) so every element already styled with var(--accent-ring)/
 * var(--accent-glow) picks up the new color with no per-component changes. */
export function applyAccentColor(hex: string): void {
  const rgb = hexToRgb(hex);
  if (!rgb) return;
  const [r, g, b] = rgb;
  const root = document.documentElement.style;
  root.setProperty('--accent', hex);
  root.setProperty('--accent-ring', `rgba(${r}, ${g}, ${b}, 0.18)`);
  root.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.45)`);
}
