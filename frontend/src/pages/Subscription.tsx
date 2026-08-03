import { useEffect, useState } from 'react';
import { fetchStorageUsage } from '../api';
import type { StorageUsage } from '../types';
import { useAuth } from '../AuthContext';
import { t } from '../i18n';

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

export function Subscription() {
  const { user } = useAuth();
  const [storage, setStorage] = useState<StorageUsage | null>(null);

  useEffect(() => {
    fetchStorageUsage()
      .then(setStorage)
      .catch(() => setStorage(null));
  }, []);

  if (!user) return null;

  return (
    <div className="social-page">
      <div className="social-card">
        <div className="auth-heading">
          <h1>{t('subscription.title')}</h1>
        </div>

        <div className="info-panel">
          <div>
            <strong>{t('subscription.currentPlan')}</strong>{' '}
            {user.plan === 'vip' ? t('subscription.planVip') : t('subscription.planFree')}
          </div>
        </div>

        {storage && (
          <div className="subscription-storage">
            <span>
              {t('tv.storageUsed', { used: formatBytes(storage.usedBytes), quota: formatBytes(storage.quotaBytes) })}
            </span>
            <div className="modal-storage-bar">
              <div
                className={`modal-storage-bar-fill${storage.usedBytes >= storage.quotaBytes ? ' modal-storage-bar-full' : ''}`}
                style={{ width: `${Math.min(100, (storage.usedBytes / storage.quotaBytes) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {user.plan === 'free' && <p className="field-hint">{t('subscription.upgradeHint')}</p>}
      </div>
    </div>
  );
}
