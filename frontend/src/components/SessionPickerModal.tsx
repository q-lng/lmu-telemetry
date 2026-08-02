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

function formatUploadedAt(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '–' : d.toLocaleString();
}

type SortKey = 'track' | 'car' | 'type' | 'sessionDate' | 'uploaded' | 'owner' | 'duration' | 'laps';

function sortValue(s: SessionSummary, key: SortKey): string | number {
  switch (key) {
    case 'track':
      return (s.track ?? s.file).toLowerCase();
    case 'car':
      return (s.carName ?? '').toLowerCase();
    case 'type':
      return (s.sessionType ?? '').toLowerCase();
    case 'sessionDate':
      return s.recordingTime ?? '';
    case 'uploaded':
      return s.uploadedAt;
    case 'owner':
      return (s.ownerPseudo ?? '').toLowerCase();
    case 'duration':
      return s.durationSeconds ?? -Infinity;
    case 'laps':
      return s.lapCount ?? -Infinity;
  }
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
  const [tab, setTab] = useState<'mine' | 'public'>('mine');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function sortIndicator(key: SortKey): string {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  }

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

  const tabFiltered = useMemo(() => {
    if (!user) return sessions;
    return sessions.filter((s) => (tab === 'mine' ? s.ownerId === user.id : s.ownerId !== user.id));
  }, [sessions, tab, user]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return tabFiltered;
    return tabFiltered.filter((s) =>
      [s.track, s.carName, s.sessionType, s.file, s.ownerPseudo].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [tabFiltered, filter]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
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

        {user && (
          <div className="modal-tabs segmented">
            <button className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>
              {t('tv.sessionPickerTabMine')}
            </button>
            <button className={tab === 'public' ? 'active' : ''} onClick={() => setTab('public')}>
              {t('tv.sessionPickerTabPublic')}
            </button>
          </div>
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
                <th className="modal-table-sortable" onClick={() => toggleSort('track')}>
                  {t('tv.sessionPickerTrack')}
                  {sortIndicator('track')}
                </th>
                <th className="modal-table-sortable" onClick={() => toggleSort('type')}>
                  {t('tv.sessionPickerType')}
                  {sortIndicator('type')}
                </th>
                <th className="modal-table-sortable" onClick={() => toggleSort('sessionDate')}>
                  {t('tv.sessionPickerSessionDate')}
                  {sortIndicator('sessionDate')}
                </th>
                <th className="modal-table-sortable" onClick={() => toggleSort('uploaded')}>
                  {t('tv.sessionPickerUploadedAt')}
                  {sortIndicator('uploaded')}
                </th>
                <th className="modal-table-sortable" onClick={() => toggleSort('owner')}>
                  {t('tv.sessionPickerUploader')}
                  {sortIndicator('owner')}
                </th>
                <th className="modal-table-sortable" onClick={() => toggleSort('duration')}>
                  {t('tv.sessionPickerDuration')}
                  {sortIndicator('duration')}
                </th>
                <th className="modal-table-sortable" onClick={() => toggleSort('laps')}>
                  {t('tv.sessionPickerLaps')}
                  {sortIndicator('laps')}
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => {
                const duration = formatDuration(s.durationSeconds);
                const canDelete = user && s.ownerId === user.id;
                return (
                  <tr key={s.file} className="modal-table-row" onClick={() => onSelect(s.file)}>
                    <td>
                      <div className="modal-table-primary">{s.track ?? s.file}</div>
                      <div className="modal-table-subtext">{s.carName ?? '–'}</div>
                    </td>
                    <td>{s.sessionType ?? '–'}</td>
                    <td>{s.recordingTime ?? '–'}</td>
                    <td>{formatUploadedAt(s.uploadedAt)}</td>
                    <td>{s.ownerPseudo ?? '–'}</td>
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
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="modal-table-empty">
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
