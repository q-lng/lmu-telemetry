import type { ElementType } from 'react';
import type { TrackCatalogEntry } from '../types';
import { t } from '../i18n';
import { Flag } from './flags';
import { Badge } from './Badge';

// The backend resolves which extension (.jpg/.png) actually exists on disk
// (TrackCatalogEntry.photoExt) — this used to guess client-side (try .jpg,
// fall back to .png on error), which meant a guaranteed 404 for every track
// missing the guessed format. Falls back to a plain gradient with a small
// hint when there's no photo at all.
export function TrackHeroPhoto({ slug, ext }: { slug: string; ext: 'jpg' | 'png' | null }) {
  if (!ext) {
    return <div className="track-hero-fallback">{t('track.photoComingSoon')}</div>;
  }
  return <img className="track-hero-photo" src={`/api/track-photos/${slug}.${ext}`} alt="" />;
}

// Same pattern as TrackHeroPhoto, separate asset (<slug>-map.{png,jpg}) —
// the real official track layout, not a telemetry-derived outline. Renders
// nothing at all when there's no map, since it's a secondary decorative
// element in the corner, not the hero's main content. The gradient lives on
// the wrapper, not the <img> itself — filter: invert(1) applies to an
// element's whole rendered output, so a black gradient painted on the same
// element as the invert would come out white.
export function TrackHeroMap({ slug, ext }: { slug: string; ext: 'jpg' | 'png' | null }) {
  if (!ext) return null;
  return (
    <div className="track-hero-map-frame">
      <img className="track-hero-map" src={`/api/track-photos/${slug}-map.${ext}`} alt="" />
    </div>
  );
}

interface TrackHeroProps {
  entry: TrackCatalogEntry;
  /** The individual track page is the only place this is the page's actual
   * <h1> — everywhere else (e.g. a card in a /tracks grid) it must be a
   * lower heading level so a listing page doesn't end up with N <h1>s. */
  headingTag?: ElementType;
  /** Shrinks the flag/heading for grid-card use — the full-size heading and
   * 320px gradient band/160px map frame are tuned for a full-width hero. */
  compact?: boolean;
}

export function TrackHero({ entry, headingTag: Heading = 'h1', compact = false }: TrackHeroProps) {
  return (
    <div className={compact ? 'track-hero track-hero--card' : 'track-hero'}>
      <TrackHeroPhoto slug={entry.slug} ext={entry.photoExt} />
      <div className="track-hero-overlay">
        <div className="track-hero-title">
          {/* Base game (dlcColor null) shows no tag at all — only DLC content gets one. */}
          {entry.dlcColor && <Badge color={entry.dlcColor}>{entry.dlcName}</Badge>}
          <Heading>
            <Flag country={entry.country} size={compact ? 16 : 22} /> {entry.name}
          </Heading>
        </div>
        <TrackHeroMap slug={entry.slug} ext={entry.mapExt} />
      </div>
    </div>
  );
}
