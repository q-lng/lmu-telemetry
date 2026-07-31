import { useEffect, useState } from 'react';
import { fetchLapShares, fetchLaps, fetchMyFiles, setFileVisibility, setLapVisibility } from '../api';
import type { FileRecord, LapInfo, LapVisibility, Visibility } from '../types';

export function MesSessions() {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [laps, setLaps] = useState<LapInfo[]>([]);
  const [lapShares, setLapShares] = useState<Record<number, LapVisibility>>({});
  const [lapsLoading, setLapsLoading] = useState(false);

  useEffect(() => {
    fetchMyFiles()
      .then(setFiles)
      .finally(() => setLoading(false));
  }, []);

  async function handleVisibilityChange(filename: string, visibility: Visibility) {
    await setFileVisibility(filename, visibility);
    setFiles((prev) => prev.map((f) => (f.filename === filename ? { ...f, visibility } : f)));
  }

  async function toggleExpand(filename: string) {
    if (expanded === filename) {
      setExpanded(null);
      return;
    }
    setExpanded(filename);
    setLapsLoading(true);
    const [lapList, shares] = await Promise.all([fetchLaps(filename), fetchLapShares(filename)]);
    setLaps(lapList);
    setLapShares(Object.fromEntries(shares.map((s) => [s.lapNumber, s.visibility])));
    setLapsLoading(false);
  }

  async function handleLapVisibilityChange(filename: string, lapNumber: number, value: string) {
    const visibility = value === 'file' ? null : (value as LapVisibility);
    await setLapVisibility(filename, lapNumber, visibility);
    setLapShares((prev) => {
      const next = { ...prev };
      if (visibility === null) delete next[lapNumber];
      else next[lapNumber] = visibility;
      return next;
    });
  }

  return (
    <div className="social-page">
      <div className="social-card">
        <div className="auth-heading">
          <h1>Mes sessions</h1>
          <p>Gère la visibilité de tes fichiers déposés, et de tours précis.</p>
        </div>

        {loading && <div className="social-empty">Chargement…</div>}
        {!loading && files.length === 0 && <div className="social-empty">Aucun fichier déposé pour l'instant.</div>}

        <div className="user-list">
          {files.map((f) => (
            <div key={f.filename} className="mes-sessions-item">
              <div className="user-row">
                <button className="mes-sessions-name" onClick={() => toggleExpand(f.filename)}>
                  {f.track ?? f.filename}
                  {f.car ? ` — ${f.car}` : ''}
                </button>
                <select
                  value={f.visibility}
                  onChange={(e) => handleVisibilityChange(f.filename, e.target.value as Visibility)}
                >
                  <option value="private">Privé</option>
                  <option value="friends">Amis</option>
                  <option value="public">Public</option>
                </select>
              </div>

              {expanded === f.filename && (
                <div className="mes-sessions-laps">
                  {lapsLoading && <div className="social-empty">Chargement des tours…</div>}
                  {!lapsLoading &&
                    laps.map((l) => (
                      <div key={l.lap} className="mes-sessions-lap-row">
                        <span>Tour {l.lap}</span>
                        <select
                          value={lapShares[l.lap] ?? 'file'}
                          onChange={(e) => handleLapVisibilityChange(f.filename, l.lap, e.target.value)}
                        >
                          <option value="file">Suit le fichier</option>
                          <option value="friends">Amis</option>
                          <option value="public">Public</option>
                        </select>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
