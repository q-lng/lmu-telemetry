import type { ElementType } from 'react';
import type { CarCatalogEntry } from '../types';
import { CAR_CATEGORY_LABELS, CAR_CATEGORY_TONES } from '../carCategories';
import { t } from '../i18n';
import { Badge } from './Badge';

// Same resolve-on-the-backend pattern as TrackHeroPhoto (see components/TrackHero.tsx)
// — no client-side extension guessing.
export function CarHeroPhoto({ slug, ext }: { slug: string; ext: 'jpg' | 'png' | null }) {
  if (!ext) {
    return <div className="car-hero-fallback">{t('car.photoComingSoon')}</div>;
  }
  return <img className="car-hero-photo" src={`/api/car-photos/${slug}.${ext}`} alt="" />;
}

// Manufacturer badge sits inline with the name, in the flag's spot (see
// TrackHero's <Flag/> usage). Served from /api/manufacturer-photos, not
// /api/car-photos — one badge per manufacturer, reused across every model
// instead of re-uploaded per car.
function CarHeroBadgeInline({ manufacturerSlug, ext }: { manufacturerSlug: string; ext: 'jpg' | 'png' | null }) {
  if (!ext) return null;
  return <img className="car-hero-manufacturer-badge" src={`/api/manufacturer-photos/${manufacturerSlug}.${ext}`} alt="" />;
}

interface CarHeroProps {
  entry: CarCatalogEntry;
  /** The individual car page is the only place this is the page's actual
   * <h1> — a card in a /cars grid must use a lower heading level. */
  headingTag?: ElementType;
  /** Shrinks the heading/badge for grid-card use. */
  compact?: boolean;
}

export function CarHero({ entry, headingTag: Heading = 'h1', compact = false }: CarHeroProps) {
  return (
    <div className={compact ? 'car-hero car-hero--card' : 'car-hero'}>
      <CarHeroPhoto slug={entry.slug} ext={entry.photoExt} />
      <div className="car-hero-overlay">
        <div className="car-hero-title">
          <div className="car-hero-badges">
            <Badge tone={CAR_CATEGORY_TONES[entry.category]}>{CAR_CATEGORY_LABELS[entry.category]}</Badge>
            {/* Base game (dlcColor null) shows no tag at all — only DLC content gets one. */}
            {entry.dlcColor && <Badge color={entry.dlcColor}>{entry.dlcName}</Badge>}
          </div>
          <Heading>
            <CarHeroBadgeInline manufacturerSlug={entry.manufacturerSlug} ext={entry.manufacturerBadgeExt} /> {entry.name}
          </Heading>
        </div>
      </div>
    </div>
  );
}
