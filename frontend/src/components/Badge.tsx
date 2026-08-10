import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'gold' | 'green' | 'red';

interface Props {
  tone: BadgeTone;
  children: ReactNode;
}

/** Soft pill label — tinted background + saturated text of the same hue, one
 * shared recipe across every tone (dark-mode take on the "color badge
 * system" reference Quentin sent: light pastel bg + saturated text, just
 * inverted — tinted-dark bg + bright text — since a literal pastel bg would
 * look like a bleached patch against this app's dark surfaces). Reuses
 * colors already established elsewhere (VIP gold, --danger red) rather than
 * inventing a whole new palette. */
export function Badge({ tone, children }: Props) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
