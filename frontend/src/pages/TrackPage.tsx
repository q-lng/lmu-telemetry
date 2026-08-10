import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deleteSession, fetchSessions, fetchTrackCatalogEntry } from '../api';
import type { SessionSummary, TrackCatalogEntry } from '../types';
import { t } from '../i18n';
import { SessionTable } from '../components/SessionTable';
import { Flag } from '../components/flags';

// Tries <public>/track-photos/<slug>.jpg then .png — plain static assets,
// not backend-served, since these are site content (not user uploads) and
// don't need any DB row to say whether one exists. Falls back to a plain
// gradient with a small hint once both attempts 404.
function TrackHeroPhoto({ slug }: { slug: string }) {
  const [attempt, setAttempt] = useState<'jpg' | 'png' | 'none'>('jpg');

  if (attempt === 'none') {
    return <div className="track-hero-fallback">{t('track.photoComingSoon')}</div>;
  }
  return (
    <img
      key={attempt}
      className="track-hero-photo"
      src={`/track-photos/${slug}.${attempt}`}
      alt=""
      onError={() => setAttempt((a) => (a === 'jpg' ? 'png' : 'none'))}
    />
  );
}

// Same pattern as TrackHeroPhoto, separate asset (<slug>-map.{png,jpg}) —
// the real official track layout, not a telemetry-derived outline. Renders
// nothing at all once both attempts fail, since it's a secondary decorative
// element in the corner, not the hero's main content.
function TrackHeroMap({ slug }: { slug: string }) {
  const [attempt, setAttempt] = useState<'png' | 'jpg' | 'none'>('png');

  if (attempt === 'none') return null;
  return (
    <img
      key={attempt}
      className="track-hero-map"
      src={`/track-photos/${slug}-map.${attempt}`}
      alt=""
      onError={() => setAttempt((a) => (a === 'png' ? 'jpg' : 'none'))}
    />
  );
}

export function TrackPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<TrackCatalogEntry | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [deleteState, setDeleteState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });

  useEffect(() => {
    setNotFound(false);
    setEntry(null);
    setSessions([]);
    fetchTrackCatalogEntry(slug)
      .then(setEntry)
      .catch(() => setNotFound(true));
  }, [slug]);

  useEffect(() => {
    if (!entry) return;
    fetchSessions({ track: entry.name }).then(setSessions);
  }, [entry]);

  async function handleDeleteSession(file: string) {
    setDeleteState({ busy: true, error: null });
    try {
      await deleteSession(file);
      setSessions((prev) => prev.filter((s) => s.file !== file));
      setDeleteState({ busy: false, error: null });
    } catch (err) {
      setDeleteState({ busy: false, error: (err as Error).message });
    }
  }

  if (notFound) {
    return (
      <div className="page-shell">
        <div className="social-empty">{t('track.notFound')}</div>
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
      <div className="track-hero">
        <TrackHeroPhoto slug={entry.slug} />
        <div className="track-hero-overlay">
          <h1>
            <Flag country={entry.country} size={22} /> {entry.name}
          </h1>
          <TrackHeroMap slug={entry.slug} />
        </div>
      </div>

      <div className="track-leaderboard-placeholder">
        <h2 className="social-subheading">{t('track.leaderboard')}</h2>
        <p className="field-hint">{t('track.leaderboardComingSoon')}</p>
      </div>

      <h2 className="social-subheading">{t('track.sessions')}</h2>
      {deleteState.error && <div className="upload-error">{deleteState.error}</div>}
      <SessionTable
        sessions={sessions}
        onSelect={(file) => navigate(`/telemetry?file=${encodeURIComponent(file)}`)}
        deleteState={deleteState}
        onDeleteSession={handleDeleteSession}
      />
    </div>
  );
}
