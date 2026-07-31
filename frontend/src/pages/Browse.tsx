import { useState } from 'react';
import { fetchSessions, searchSharedLaps } from '../api';
import type { SessionSummary, SharedLapResult } from '../types';

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
      // "Parcourir" is for discovering what OTHERS have shared — the viewer's own
      // files (even public ones) already live in "Mes sessions"/the session picker,
      // not mixed into search results here.
      const filter = { track: track.trim() || undefined, car: car.trim() || undefined, excludeMine: true };
      const [s, l] = await Promise.all([fetchSessions(filter), searchSharedLaps(filter)]);
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
          <h1>Parcourir</h1>
          <p>Cherche des sessions ou des tours partagés par circuit ou par voiture.</p>
        </div>

        <form
          className="social-search-form"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch();
          }}
        >
          <input value={track} onChange={(e) => setTrack(e.target.value)} placeholder="Circuit…" />
          <input value={car} onChange={(e) => setCar(e.target.value)} placeholder="Voiture…" />
          <button className="auth-submit" type="submit" disabled={searching}>
            {searching ? 'Recherche…' : 'Chercher'}
          </button>
        </form>

        {searched && (
          <>
            <h2 className="social-subheading">Sessions</h2>
            <div className="user-list">
              {sessions.length === 0 && <div className="social-empty">Aucune session trouvée.</div>}
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

            <h2 className="social-subheading">Tours partagés</h2>
            <div className="user-list">
              {laps.length === 0 && <div className="social-empty">Aucun tour partagé trouvé.</div>}
              {laps.map((l) => (
                <div className="user-row" key={`${l.filename}-${l.lapNumber}`}>
                  <a href={`/partage/${encodeURIComponent(l.filename)}/${l.lapNumber}`} className="user-row-name">
                    {l.track ?? l.filename} — Tour {l.lapNumber}
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
