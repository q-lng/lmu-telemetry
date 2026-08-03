// Self-hosted font library (@fontsource — no external CDN at runtime, fits
// this project's Docker/self-contained constraint) for the admin panel's
// "Affichage" section. Two independent choices: a general site font (any
// style) and a data font (monospace only, so tables/numeric readouts stay
// aligned regardless of which specific monospace typeface is picked). Side-
// effect imports below register the @font-face rules; every font is loaded
// once, up front, so switching the selection in the admin UI previews
// instantly with no network wait.
import '@fontsource/inter/400.css';
import '@fontsource/inter/700.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/700.css';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/700.css';
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/work-sans/400.css';
import '@fontsource/work-sans/700.css';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/700.css';
import '@fontsource/oswald/400.css';
import '@fontsource/oswald/700.css';
import '@fontsource/orbitron/400.css';
import '@fontsource/orbitron/700.css';
import '@fontsource/rajdhani/400.css';
import '@fontsource/rajdhani/700.css';
import '@fontsource/bebas-neue/400.css';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/700.css';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/700.css';
import '@fontsource/lexend/400.css';
import '@fontsource/lexend/700.css';
import '@fontsource/barlow-condensed/400.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/merriweather/400.css';
import '@fontsource/merriweather/700.css';
import '@fontsource/lora/400.css';
import '@fontsource/lora/700.css';
import '@fontsource/roboto-slab/400.css';
import '@fontsource/roboto-slab/700.css';
import '@fontsource/caveat/400.css';
import '@fontsource/caveat/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/700.css';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import '@fontsource/roboto-mono/400.css';
import '@fontsource/roboto-mono/700.css';
import '@fontsource/fira-code/400.css';
import '@fontsource/fira-code/700.css';
import '@fontsource/source-code-pro/400.css';
import '@fontsource/source-code-pro/700.css';
import '@fontsource/dm-mono/400.css';
import type { DataFont, SiteFont } from './types';

export interface FontCatalogEntry<K extends string> {
  key: K;
  label: string;
  stack: string;
}

export const FONT_CATALOG: FontCatalogEntry<SiteFont>[] = [
  { key: 'system', label: 'System UI', stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  { key: 'inter', label: 'Inter', stack: "'Inter', sans-serif" },
  { key: 'roboto', label: 'Roboto', stack: "'Roboto', sans-serif" },
  { key: 'poppins', label: 'Poppins', stack: "'Poppins', sans-serif" },
  { key: 'montserrat', label: 'Montserrat', stack: "'Montserrat', sans-serif" },
  { key: 'work-sans', label: 'Work Sans', stack: "'Work Sans', sans-serif" },
  { key: 'space-grotesk', label: 'Space Grotesk', stack: "'Space Grotesk', sans-serif" },
  { key: 'manrope', label: 'Manrope', stack: "'Manrope', sans-serif" },
  { key: 'oswald', label: 'Oswald', stack: "'Oswald', sans-serif" },
  { key: 'orbitron', label: 'Orbitron', stack: "'Orbitron', sans-serif" },
  { key: 'rajdhani', label: 'Rajdhani', stack: "'Rajdhani', sans-serif" },
  { key: 'bebas-neue', label: 'Bebas Neue', stack: "'Bebas Neue', sans-serif" },
  { key: 'playfair-display', label: 'Playfair Display', stack: "'Playfair Display', serif" },
  { key: 'nunito', label: 'Nunito', stack: "'Nunito', sans-serif" },
  { key: 'outfit', label: 'Outfit', stack: "'Outfit', sans-serif" },
  { key: 'lexend', label: 'Lexend', stack: "'Lexend', sans-serif" },
  { key: 'barlow-condensed', label: 'Barlow Condensed', stack: "'Barlow Condensed', sans-serif" },
  { key: 'merriweather', label: 'Merriweather', stack: "'Merriweather', serif" },
  { key: 'lora', label: 'Lora', stack: "'Lora', serif" },
  { key: 'roboto-slab', label: 'Roboto Slab', stack: "'Roboto Slab', serif" },
  { key: 'caveat', label: 'Caveat', stack: "'Caveat', cursive" },
];

export const DATA_FONT_CATALOG: FontCatalogEntry<DataFont>[] = [
  { key: 'system-mono', label: 'System monospace', stack: "ui-monospace, 'SF Mono', 'Cascadia Code', Consolas, monospace" },
  { key: 'jetbrains-mono', label: 'JetBrains Mono', stack: "'JetBrains Mono', monospace" },
  { key: 'ibm-plex-mono', label: 'IBM Plex Mono', stack: "'IBM Plex Mono', monospace" },
  { key: 'space-mono', label: 'Space Mono', stack: "'Space Mono', monospace" },
  { key: 'roboto-mono', label: 'Roboto Mono', stack: "'Roboto Mono', monospace" },
  { key: 'fira-code', label: 'Fira Code', stack: "'Fira Code', monospace" },
  { key: 'source-code-pro', label: 'Source Code Pro', stack: "'Source Code Pro', monospace" },
  { key: 'dm-mono', label: 'DM Mono', stack: "'DM Mono', monospace" },
];

export function fontStack(key: SiteFont): string {
  return FONT_CATALOG.find((f) => f.key === key)?.stack ?? FONT_CATALOG[0].stack;
}

export function dataFontStack(key: DataFont): string {
  return DATA_FONT_CATALOG.find((f) => f.key === key)?.stack ?? DATA_FONT_CATALOG[0].stack;
}
