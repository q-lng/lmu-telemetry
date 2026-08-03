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

// Default accent for the neon theme — matches the static fallback declared in
// styles.css's :root, so there's no flash-of-wrong-color before a saved
// preference (if any) loads.
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
 * picks up the new color with no per-component changes. */
export function applyAccentColor(hex: string): void {
  const rgb = hexToRgb(hex);
  if (!rgb) return;
  const [r, g, b] = rgb;
  const root = document.documentElement.style;
  root.setProperty('--accent', hex);
  root.setProperty('--accent-ring', `rgba(${r}, ${g}, ${b}, 0.18)`);
  root.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.45)`);
}
