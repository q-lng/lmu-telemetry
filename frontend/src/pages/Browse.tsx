import { useState } from 'react';
import { fetchSessions, searchSharedLaps } from '../api';
import type { SessionSummary, SharedLapResult } from '../types';
import { t } from '../i18n';

export function Browse() {
  const [track, setTrack] = useState('');
  const [car, setCar] = useState('');
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [laps, setLaps] = useState<SharedLapResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  async function runSearch() {
    setSearching(true);
    try {
      const trackFilter = track.trim() || undefined;
      const carFilter = car.trim() || undefined;
      // Sessions: excludeMine drops the "it's mine" ownership shortcut so only real
      // public/friends visibility counts — this still shows the viewer's own
      // PUBLIC sessions (visibility alone already grants that), just not their
      // private ones. Shared laps are already public-or-friends-only by
      // definition, no equivalent flag needed there.
      const [s, l] = await Promise.all([
        fetchSessions({ track: trackFilter, car: carFilter, excludeMine: true }),
        searchSharedLaps({ track: trackFilter, car: carFilter }),
      ]);
      setSessions(s);
      setLaps(l);
      setSearched(true);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="social-page">
      <div className="social-card">
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

        {searched && (
          <>
            <h2 className="social-subheading">{t('browse.sessions')}</h2>
            <div className="user-list">
              {sessions.length === 0 && <div className="social-empty">{t('browse.noSessionsFound')}</div>}
              {sessions.map((s) => (
                <div className="user-row" key={s.file}>
                  <a href={`/telemetrie?file=${encodeURIComponent(s.file)}`} className="user-row-name">
                    {s.track ?? s.file}
                    <span className="user-row-fullname">
                      {s.carName} {s.driverName ? `· ${s.driverName}` : ''}
                    </span>
                  </a>
                </div>
              ))}
            </div>

            <h2 className="social-subheading">{t('browse.sharedLaps')}</h2>
            <div className="user-list">
              {laps.length === 0 && <div className="social-empty">{t('browse.noSharedLapsFound')}</div>}
              {laps.map((l) => (
                <div className="user-row" key={`${l.filename}-${l.lapNumber}`}>
                  <a href={`/partage/${encodeURIComponent(l.filename)}/${l.lapNumber}`} className="user-row-name">
                    {l.track ?? l.filename} — {t('lap.number', { n: l.lapNumber })}
                    <span className="user-row-fullname">{l.car}</span>
                  </a>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
