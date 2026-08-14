import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { fetchLeaderboard } from '../api';
import type { LeaderboardClass, LeaderboardEntry } from '../types';
import { Badge } from '../components/Badge';
import { DriverName } from '../components/DriverName';
import { ChevronIcon } from '../components/icons';
import { t } from '../i18n';
import { LEADERBOARD_CLASS_LABELS, LEADERBOARD_CLASS_ORDER, LEADERBOARD_CLASS_TONES } from '../leaderboardClasses';
import { formatLapTime } from '../lapTime';

type SortKey = 'track' | 'carClass' | 'car' | 'driverName' | 'lapTime';

function sortValue(e: LeaderboardEntry, key: SortKey): string | number {
  switch (key) {
    case 'track':
      return e.track.toLowerCase();
    case 'carClass':
      return e.carClass;
    case 'car':
      return (e.car ?? '').toLowerCase();
    case 'driverName':
      return (e.driverName ?? '').toLowerCase();
    case 'lapTime':
      return e.lapTime;
  }
}

export function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trackFilter, setTrackFilter] = useState('');
  const [classFilter, setClassFilter] = useState<LeaderboardClass | ''>('');
  const [sortKey, setSortKey] = useState<SortKey>('track');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    fetchLeaderboard()
      .then(setEntries)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const tracks = useMemo(() => [...new Set(entries.map((e) => e.track))].sort((a, b) => a.localeCompare(b)), [entries]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function sortIndicator(key: SortKey): ReactNode {
    if (sortKey !== key) return null;
    return (
      <span className="sort-icon">
        <ChevronIcon size={10} direction={sortDir === 'asc' ? 'up' : 'down'} />
      </span>
    );
  }

  const filtered = useMemo(
    () =>
      entries.filter((e) => (!trackFilter || e.track === trackFilter) && (!classFilter || e.carClass === classFilter)),
    [entries, trackFilter, classFilter],
  );

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  return (
    <div className="page-shell">
      <div className="auth-heading">
        <h1>{t('leaderboard.title')}</h1>
        <p>{t('leaderboard.subtitle')}</p>
      </div>

      <div className="social-search-form">
        <select value={trackFilter} onChange={(e) => setTrackFilter(e.target.value)}>
          <option value="">{t('leaderboard.filterTrackAll')}</option>
          {tracks.map((track) => (
            <option key={track} value={track}>
              {track}
            </option>
          ))}
        </select>
        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value as LeaderboardClass | '')}>
          <option value="">{t('leaderboard.filterClassAll')}</option>
          {LEADERBOARD_CLASS_ORDER.map((cls) => (
            <option key={cls} value={cls}>
              {LEADERBOARD_CLASS_LABELS[cls]}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="upload-error">{error}</div>}

      {!loading && (
        <div className="modal-table-wrap">
          <table className="modal-table">
            <thead>
              <tr>
                <th className="modal-table-sortable" onClick={() => toggleSort('track')}>
                  {t('leaderboard.colTrack')}
                  {sortIndicator('track')}
                </th>
                <th className="modal-table-sortable" onClick={() => toggleSort('carClass')}>
                  {t('leaderboard.colClass')}
                  {sortIndicator('carClass')}
                </th>
                <th className="modal-table-sortable" onClick={() => toggleSort('car')}>
                  {t('leaderboard.colCar')}
                  {sortIndicator('car')}
                </th>
                <th className="modal-table-sortable" onClick={() => toggleSort('driverName')}>
                  {t('leaderboard.colDriver')}
                  {sortIndicator('driverName')}
                </th>
                <th className="modal-table-sortable" onClick={() => toggleSort('lapTime')}>
                  {t('leaderboard.colLapTime')}
                  {sortIndicator('lapTime')}
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => (
                <tr key={`${e.track}::${e.carClass}`}>
                  <td className="modal-table-primary">{e.track}</td>
                  <td>
                    <Badge tone={LEADERBOARD_CLASS_TONES[e.carClass]}>{LEADERBOARD_CLASS_LABELS[e.carClass]}</Badge>
                  </td>
                  <td>{e.car ?? '–'}</td>
                  <td>
                    <DriverName driverName={e.driverName} matchedUser={e.matchedUser} />
                  </td>
                  <td>{formatLapTime(e.lapTime)}</td>
                  <td>
                    <Link to={`/shared/${encodeURIComponent(e.filename)}/${e.lapNumber}`} className="modal-table-action">
                      {t('lap.showTelemetry')}
                    </Link>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={6} className="modal-table-empty">
                    {t('leaderboard.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
