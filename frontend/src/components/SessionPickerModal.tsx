import { useEffect, useMemo, useState } from 'react';
import type { SessionSummary } from '../types';
import { t } from '../i18n';

interface Props {
  sessions: SessionSummary[];
  onSelect: (file: string) => void;
  onClose: () => void;
}

function formatDuration(seconds?: number): string | null {
  if (seconds == null) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function SessionPickerModal({ sessions, onSelect, onClose }: Props) {
  const [filter, setFilter] = useState('');

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => [s.track, s.carName, s.sessionType, s.file].some((v) => v?.toLowerCase().includes(q)));
  }, [sessions, filter]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('tv.sessionPickerTitle')}</h2>
          <button className="modal-close" onClick={onClose} title={t('tv.sessionPickerClose')}>
            ✕
          </button>
        </div>

        <input
          className="modal-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('tv.sessionPickerFilterPlaceholder')}
          autoFocus
        />

        <div className="modal-table-wrap">
          <table className="modal-table">
            <thead>
              <tr>
                <th>{t('tv.sessionPickerTrack')}</th>
                <th>{t('tv.sessionPickerCar')}</th>
                <th>{t('tv.sessionPickerDuration')}</th>
                <th>{t('tv.sessionPickerLaps')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const duration = formatDuration(s.durationSeconds);
                return (
                  <tr key={s.file} className="modal-table-row" onClick={() => onSelect(s.file)}>
                    <td>
                      <div className="modal-table-primary">{s.track ?? s.file}</div>
                      <div className="modal-table-subtext">
                        {s.sessionType}
                        {s.recordingTime ? ` · ${s.recordingTime}` : ''}
                      </div>
                    </td>
                    <td>{s.carName ?? '–'}</td>
                    <td>{duration ?? '–'}</td>
                    <td>{s.lapCount ?? '–'}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="modal-table-empty">
                    {t('tv.sessionPickerEmpty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
