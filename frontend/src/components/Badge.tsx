import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'gold' | 'green' | 'red' | 'yellow' | 'green-dark' | 'purple' | 'blue-dark' | 'orange' | 'gray';

interface Props {
  /** One of the fixed tones above, or... */
  tone?: BadgeTone;
  /** ...an admin-picked hex color (DLC tags — see carCategories-style fixed
   * tones vs. DlcCatalogEntry.color) — there are, and will keep being, more
   * DLC packs than it makes sense to hardcode a CSS tone for each of, so
   * those get a free-form color instead, same tinted-bg/bright-fg recipe
   * computed inline. `color` takes precedence when both are given. */
  color?: string;
  children: ReactNode;
}

// Matches the fixed CSS tones' recipe (styles.css's --badge-*-bg vars):
// darken the color to ~35% brightness first, then apply 0.8 alpha — a tint
// of the full-brightness color at 0.8 would be nearly as bright as the text
// itself and kill the contrast between the two.
const DARKEN_FACTOR = 0.35;
const BADGE_BG_ALPHA = 0.8;

function badgeBackground(hex: string): string {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * DARKEN_FACTOR);
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * DARKEN_FACTOR);
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * DARKEN_FACTOR);
  return `rgba(${r}, ${g}, ${b}, ${BADGE_BG_ALPHA})`;
}

/** Soft pill label — darkened-tint background + full-brightness text of the
 * same hue, one shared recipe across every tone (dark-mode take on the
 * "color badge system" reference Quentin sent: light pastel bg + saturated
 * text, just inverted — dark-tinted bg + bright text — since a literal
 * pastel bg would look like a bleached patch against this app's dark
 * surfaces). Reuses colors already established elsewhere (VIP gold,
 * --danger red) rather than inventing a whole new palette. */
export function Badge({ tone, color, children }: Props) {
  if (color) {
    return (
      <span className="badge" style={{ background: badgeBackground(color), color }}>
        {children}
      </span>
    );
  }
  return <span className={`badge badge-${tone ?? 'neutral'}`}>{children}</span>;
}
