import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { deleteSession, fetchSessions, searchSharedLaps } from '../api';
import type { SessionSummary, SharedLapResult } from '../types';
import { t } from '../i18n';
import { SessionTable } from '../components/SessionTable';

export function Browse() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [track, setTrack] = useState('');
  const [car, setCar] = useState('');
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [laps, setLaps] = useState<SharedLapResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [lapsSearched, setLapsSearched] = useState(false);
  const [deleteState, setDeleteState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });

  // Sessions show up front, exactly like the "Load a session" modal — no
  // search required first. The form below narrows this same list AND (its
  // real reason to exist) searches shared laps, which have no equivalent
  // "show everything" fetch. A ?track=/?car= in the URL (arriving from the
  // navbar search) seeds the same filters and runs the search immediately
  // instead of showing the unfiltered list first.
  useEffect(() => {
    const urlTrack = searchParams.get('track') ?? '';
    const urlCar = searchParams.get('car') ?? '';
    if (urlTrack || urlCar) {
      setTrack(urlTrack);
      setCar(urlCar);
      runSearch({ track: urlTrack, car: urlCar });
    } else {
      fetchSessions().then(setSessions);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch(overrides?: { track?: string; car?: string }) {
    setSearching(true);
    try {
      const trackFilter = (overrides?.track ?? track).trim() || undefined;
      const carFilter = (overrides?.car ?? car).trim() || undefined;
      // No excludeMine here — SessionTable's own Mine/Public tabs already do
      // that split precisely (by ownerId), the same way the "Load a session"
      // modal does, so fetching the same full visible set keeps both places
      // in sync instead of layering a second, coarser exclusion on top.
      const [s, l] = await Promise.all([
        fetchSessions({ track: trackFilter, car: carFilter }),
        searchSharedLaps({ track: trackFilter, car: carFilter }),
      ]);
      setSessions(s);
      setLaps(l);
      setLapsSearched(true);
    } finally {
      setSearching(false);
    }
  }

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

  return (
    <div className="page-shell">
      <div className="auth-heading">
        <h1>{t('browse.title')}</h1>
        <p>{t('browse.subtitle')}</p>
      </div>

      <form
        className="social-search-form"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
      >
        <input value={track} onChange={(e) => setTrack(e.target.value)} placeholder={t('browse.trackPlaceholder')} />
        <input value={car} onChange={(e) => setCar(e.target.value)} placeholder={t('browse.carPlaceholder')} />
        <button className="auth-submit" type="submit" disabled={searching}>
          {searching ? t('common.searching') : t('common.search')}
        </button>
      </form>

      {lapsSearched && (track.trim() || car.trim()) && (
        <div className="browse-stats-placeholder">
          <strong>{track.trim() || car.trim()}</strong>
          <span>{t('browse.statsSessionCount', { count: sessions.length })}</span>
          <span className="field-hint">{t('browse.statsComingSoon')}</span>
        </div>
      )}

      <h2 className="social-subheading">{t('browse.sessions')}</h2>
      {deleteState.error && <div className="upload-error">{deleteState.error}</div>}
      <SessionTable
        sessions={sessions}
        onSelect={(file) => {
          navigate(`/telemetry?file=${encodeURIComponent(file)}`);
        }}
        deleteState={deleteState}
        onDeleteSession={handleDeleteSession}
      />

      {lapsSearched && (
        <>
          <h2 className="social-subheading">{t('browse.sharedLaps')}</h2>
          <div className="user-list">
            {laps.length === 0 && <div className="social-empty">{t('browse.noSharedLapsFound')}</div>}
            {laps.map((l) => (
              <div className="user-row" key={`${l.filename}-${l.lapNumber}`}>
                <Link to={`/shared/${encodeURIComponent(l.filename)}/${l.lapNumber}`} className="user-row-name">
                  {l.track ?? l.filename} — {t('lap.number', { n: l.lapNumber })}
                  <span className="user-row-fullname">{l.car}</span>
                </Link>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
