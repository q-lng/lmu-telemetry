import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchTrackLeaderboard } from '../api';
import type { LeaderboardClass, LeaderboardEntry } from '../types';
import { Badge } from './Badge';
import { DriverName } from './DriverName';
import { t } from '../i18n';
import { LEADERBOARD_CLASS_LABELS, LEADERBOARD_CLASS_ORDER, LEADERBOARD_CLASS_TONES } from '../leaderboardClasses';
import { formatLapTime } from '../lapTime';

interface Props {
  slug: string;
}

/** One ranked mini-table per car class, switched via tabs (the `.segmented`
 * control) rather than all stacked at once. Every REAL class always gets
 * its own tab, even ones with zero public valid laps on this track (the
 * backend omits those from the response entirely — see
 * backend/src/leaderboard.ts's computeTrackTopLaps) — picking such a tab
 * just shows a placeholder instead of an empty table, rather than the tab
 * disappearing depending on what's been uploaded so far. 'unknown' isn't a
 * real class (just the fallback bucket for laps whose car couldn't be
 * resolved to one), so unlike the others it stays hidden unless it
 * actually has something in it. */
export function TrackLeaderboard({ slug }: Props) {
  const [classes, setClasses] = useState<Partial<Record<LeaderboardClass, LeaderboardEntry[]>>>({});
  const [loading, setLoading] = useState(true);
  const [activeClass, setActiveClass] = useState<LeaderboardClass>(LEADERBOARD_CLASS_ORDER[0]);

  useEffect(() => {
    setLoading(true);
    fetchTrackLeaderboard(slug)
      .then((next) => {
        setClasses(next);
        // Lands on the first class that actually has data, so switching
        // tracks doesn't default to an empty tab when a populated one exists.
        const present = LEADERBOARD_CLASS_ORDER.filter((cls) => next[cls]?.length);
        setActiveClass(present[0] ?? LEADERBOARD_CLASS_ORDER[0]);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return null;

  const entries = classes[activeClass] ?? [];
  const tabs = LEADERBOARD_CLASS_ORDER.filter((cls) => cls !== 'unknown' || classes.unknown?.length);

  return (
    <div className="track-leaderboard">
      <div className="segmented track-leaderboard-tabs">
        {tabs.map((cls) => (
          <button key={cls} className={cls === activeClass ? 'active' : ''} onClick={() => setActiveClass(cls)}>
            {LEADERBOARD_CLASS_LABELS[cls]}
          </button>
        ))}
      </div>
      <div className="track-leaderboard-class">
        <Badge tone={LEADERBOARD_CLASS_TONES[activeClass]}>{LEADERBOARD_CLASS_LABELS[activeClass]}</Badge>
        {entries.length === 0 ? (
          <p className="field-hint">{t('track.leaderboardClassEmpty')}</p>
        ) : (
          <div className="modal-table-wrap">
            <table className="modal-table">
              <thead>
                <tr>
                  <th>{t('track.leaderboardRank')}</th>
                  <th>{t('track.leaderboardDriver')}</th>
                  <th>{t('track.leaderboardCar')}</th>
                  <th>{t('track.leaderboardTime')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => (
                  <tr key={`${entry.filename}-${entry.lapNumber}`}>
                    <td>{i + 1}</td>
                    <td>
                      <DriverName driverName={entry.driverName} matchedUser={entry.matchedUser} />
                    </td>
                    <td>{entry.car ?? '–'}</td>
                    <td className="modal-table-primary">{formatLapTime(entry.lapTime)}</td>
                    <td>
                      <Link to={`/shared/${encodeURIComponent(entry.filename)}/${entry.lapNumber}`} className="modal-table-action">
                        {t('lap.showTelemetry')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
