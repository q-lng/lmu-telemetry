import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createServerDataSource } from '../dataSource';
import { deleteSession, fetchSessions, fetchTrackCatalogEntry } from '../api';
import type { SessionSummary, TrackCatalogEntry } from '../types';
import { t } from '../i18n';
import { SessionTable } from '../components/SessionTable';
import { TrackMap } from '../components/TrackMap';

interface Gps {
  lat: number[];
  lon: number[];
  t: number[];
}

export function TrackPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<TrackCatalogEntry | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [gps, setGps] = useState<Gps | null>(null);
  const [mapLoading, setMapLoading] = useState(true);
  const [deleteState, setDeleteState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });

  useEffect(() => {
    setNotFound(false);
    setEntry(null);
    setSessions([]);
    setGps(null);
    setMapLoading(true);
    fetchTrackCatalogEntry(slug)
      .then(setEntry)
      .catch(() => setNotFound(true));
  }, [slug]);

  useEffect(() => {
    if (!entry) return;
    fetchSessions({ track: entry.name }).then(setSessions);
  }, [entry]);

  // Reuses the first (most recent) public session's own GPS trace as a
  // stand-in track outline — there's no separate "track map" asset, and
  // this needs no new backend work (GET .../channel/GPS Latitude already
  // works for any public file, unsliced). Falls back to a plain message if
  // that particular session has no GPS channel.
  useEffect(() => {
    if (sessions.length === 0) {
      setMapLoading(false);
      return;
    }
    setMapLoading(true);
    const ds = createServerDataSource(sessions[0].file);
    Promise.all([
      ds.fetchChannelSeries('GPS Latitude').catch(() => null),
      ds.fetchChannelSeries('GPS Longitude').catch(() => null),
    ])
      .then(([latS, lonS]) => {
        if (latS && lonS) {
          setGps({ lat: latS.values.value as number[], lon: lonS.values.value as number[], t: latS.t });
        } else {
          setGps(null);
        }
      })
      .finally(() => setMapLoading(false));
  }, [sessions]);

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
      <div className="track-header">
        <div className="track-photo-placeholder">{t('track.photoComingSoon')}</div>
        <div className="track-heading">
          <h1>{entry.name}</h1>
        </div>
      </div>

      <div className="track-map-block">
        {mapLoading && (
          <div className="page-loading">
            <span className="spinner" />
          </div>
        )}
        {!mapLoading && gps && <TrackMap lat={gps.lat} lon={gps.lon} t={gps.t} cursorT={null} viewRange={null} height={320} />}
        {!mapLoading && !gps && <div className="track-map-placeholder">{t('track.mapUnavailable')}</div>}
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
