import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchCarCatalogEntry } from '../api';
import type { CarCatalogEntry } from '../types';
import { t } from '../i18n';
import { CarHero } from '../components/CarHero';

export function CarPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [entry, setEntry] = useState<CarCatalogEntry | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setNotFound(false);
    setEntry(null);
    fetchCarCatalogEntry(slug)
      .then(setEntry)
      .catch(() => setNotFound(true));
  }, [slug]);

  if (notFound) {
    return (
      <div className="page-shell">
        <div className="social-empty">{t('car.notFound')}</div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="page-loading">
        <span className="spinner" />
      </div>
    );
  }

  return (
    <div className="page-shell">
      <CarHero entry={entry} />
      <p className="field-hint">{entry.manufacturer}</p>

      {/* Sessions using this car aren't linked to the catalog yet — the
          upload flow's category-filtered car picker is a follow-up (see
          the tracking issue), so there's no car_slug data to query against
          for existing sessions. */}
      <h2 className="social-subheading">{t('car.sessions')}</h2>
      <p className="field-hint">{t('car.sessionsComingSoon')}</p>
    </div>
  );
}
