import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchTracks } from '../api';
import type { TrackCatalogEntry } from '../types';
import { t } from '../i18n';
import { TrackHero } from '../components/TrackHero';

export function TracksPage() {
  const [tracks, setTracks] = useState<TrackCatalogEntry[] | null>(null);

  useEffect(() => {
    fetchTracks().then(setTracks);
  }, []);

  return (
    <div className="page-shell">
      <h1>{t('tracks.title')}</h1>
      {!tracks ? (
        <div className="page-loading">
          <span className="spinner" />
        </div>
      ) : tracks.length === 0 ? (
        <div className="social-empty">{t('tracks.empty')}</div>
      ) : (
        <div className="tracks-grid">
          {tracks.map((track) => (
            <Link key={track.slug} to={`/tracks/${track.slug}`} className="track-hero-card-link">
              <TrackHero entry={track} headingTag="h2" compact />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
