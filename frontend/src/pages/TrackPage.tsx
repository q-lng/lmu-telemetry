import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deleteSession, fetchSessions, fetchTrackCatalogEntry } from '../api';
import type { SessionSummary, TrackCatalogEntry } from '../types';
import { t } from '../i18n';
import { SessionTable } from '../components/SessionTable';
import { TrackHero } from '../components/TrackHero';
import { TrackLeaderboard } from '../components/TrackLeaderboard';

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
      <TrackHero entry={entry} />

      <h2 className="social-subheading">{t('track.leaderboard')}</h2>
      <TrackLeaderboard slug={slug} />

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
