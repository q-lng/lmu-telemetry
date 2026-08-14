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

/** One ranked mini-table per car class present on this track — classes with
 * no public valid laps here are simply absent from the response, not shown
 * as empty sections (see backend/src/leaderboard.ts's computeTrackTopLaps). */
export function TrackLeaderboard({ slug }: Props) {
  const [classes, setClasses] = useState<Partial<Record<LeaderboardClass, LeaderboardEntry[]>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchTrackLeaderboard(slug)
      .then(setClasses)
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return null;

  const present = LEADERBOARD_CLASS_ORDER.filter((cls) => classes[cls]?.length);

  if (present.length === 0) {
    return <p className="field-hint">{t('track.leaderboardEmpty')}</p>;
  }

  return (
    <>
      {present.map((cls) => (
        <div key={cls} className="track-leaderboard-class">
          <Badge tone={LEADERBOARD_CLASS_TONES[cls]}>{LEADERBOARD_CLASS_LABELS[cls]}</Badge>
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
                {classes[cls]!.map((entry, i) => (
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
        </div>
      ))}
    </>
  );
}
