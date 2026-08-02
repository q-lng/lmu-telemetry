import { useEffect, useRef, useState } from 'react';
import type { SessionSummary, StorageUsage } from '../types';
import { t } from '../i18n';
import { fetchStorageUsage } from '../api';
import { useAuth } from '../AuthContext';
import { SessionTable } from './SessionTable';

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

        <SessionTable sessions={sessions} onSelect={onSelect} deleteState={deleteState} onDeleteSession={onDeleteSession} />

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
