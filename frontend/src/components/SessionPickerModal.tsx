import { useEffect, useMemo, useRef, useState } from 'react';
import type { SessionSummary, StorageUsage } from '../types';
import { t } from '../i18n';
import { fetchStorageUsage } from '../api';
import { useAuth } from '../AuthContext';

interface AsyncActionState {
  busy: boolean;
  error: string | null;
}

interface Props {
  sessions: SessionSummary[];
  onSelect: (file: string) => void;
  onClose: () => void;
  uploadState: AsyncActionState;
  onUploadFile: (file: File) => void;
  guestState: AsyncActionState;
  onOpenGuestFile: (file: File) => void;
  deleteState: AsyncActionState;
  onDeleteSession: (file: string) => void;
}

function formatDuration(seconds?: number): string | null {
  if (seconds == null) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

export function SessionPickerModal({
  sessions,
  onSelect,
  onClose,
  uploadState,
  onUploadFile,
  guestState,
  onOpenGuestFile,
  deleteState,
  onDeleteSession,
}: Props) {
  const [filter, setFilter] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const guestFileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const [storage, setStorage] = useState<StorageUsage | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!user) return;
    fetchStorageUsage()
      .then(setStorage)
      .catch(() => setStorage(null));
  }, [user, uploadState.busy, deleteState.busy]);

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

        <div className="modal-load-actions">
          <button className="upload-btn" disabled={uploadState.busy} onClick={() => fileInputRef.current?.click()}>
            {uploadState.busy ? t('tv.importing') : t('tv.importFile')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".duckdb"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUploadFile(file);
              e.target.value = '';
            }}
          />
          <button
            className="upload-btn"
            disabled={guestState.busy}
            onClick={() => guestFileInputRef.current?.click()}
            title={t('tv.openGuestTooltip')}
          >
            {guestState.busy ? t('tv.guestLoading') : t('tv.openGuestFile')}
          </button>
          <input
            ref={guestFileInputRef}
            type="file"
            accept=".duckdb"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onOpenGuestFile(file);
              e.target.value = '';
            }}
          />
        </div>
        {(uploadState.error || guestState.error || deleteState.error) && (
          <div className="upload-error modal-load-error">{uploadState.error || guestState.error || deleteState.error}</div>
        )}

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
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const duration = formatDuration(s.durationSeconds);
                const canDelete = user && s.ownerId === user.id;
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
                    <td>
                      {canDelete && (
                        <button
                          className="modal-table-delete"
                          disabled={deleteState.busy}
                          title={t('tv.deleteSession')}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(t('tv.confirmDeleteSession', { name: s.track ?? s.file }))) {
                              onDeleteSession(s.file);
                            }
                          }}
                        >
                          🗑
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="modal-table-empty">
                    {t('tv.sessionPickerEmpty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {storage && (
          <div className="modal-storage">
            <span>
              {t('tv.storageUsed', { used: formatBytes(storage.usedBytes), quota: formatBytes(storage.quotaBytes) })}
              {storage.plan === 'vip' ? ` · ${t('tv.storagePlanVip')}` : ''}
            </span>
            <div className="modal-storage-bar">
              <div
                className={`modal-storage-bar-fill${storage.usedBytes >= storage.quotaBytes ? ' modal-storage-bar-full' : ''}`}
                style={{ width: `${Math.min(100, (storage.usedBytes / storage.quotaBytes) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
