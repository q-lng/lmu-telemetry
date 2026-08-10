import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { deleteAdminUser, fetchAdminUsers, sendAdminPasswordReset, updateAdminUser } from '../api';
import type { AdminUserSummary } from '../types';
import { t } from '../i18n';
import { KebabIcon } from '../components/icons';
import { Badge } from '../components/Badge';
import { StorageBar } from '../components/StorageBar';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

interface RowProps {
  target: AdminUserSummary;
  isSelf: boolean;
  onChange: () => void;
}

function AdminUserRow({ target, isSelf, onChange }: RowProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pseudoDraft, setPseudoDraft] = useState(target.pseudo);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setPseudoDraft(target.pseudo), [target.pseudo]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function savePseudo() {
    const trimmed = pseudoDraft.trim();
    if (trimmed === target.pseudo || !trimmed) {
      setPseudoDraft(target.pseudo);
      return;
    }
    run(() => updateAdminUser(target.id, { pseudo: trimmed }));
  }

  return (
    <tr>
      <td>
        <input
          className="admin-pseudo-input"
          value={pseudoDraft}
          disabled={busy}
          onChange={(e) => setPseudoDraft(e.target.value)}
          onBlur={savePseudo}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        {isSelf && <span className="field-hint">{t('admin.you')}</span>}
      </td>
      <td>{target.email}</td>
      <td>
        <div className="segmented admin-plan-toggle">
          <button
            className={`plan-free${target.plan === 'free' ? ' active' : ''}`}
            disabled={busy}
            onClick={() => run(() => updateAdminUser(target.id, { plan: 'free' }))}
          >
            {t('admin.planFree')}
          </button>
          <button
            className={`plan-vip${target.plan === 'vip' ? ' active' : ''}`}
            disabled={busy}
            onClick={() => run(() => updateAdminUser(target.id, { plan: 'vip' }))}
          >
            {t('admin.planVip')}
          </button>
        </div>
      </td>
      <td>{target.isAdmin && <Badge tone="neutral">{t('admin.adminBadge')}</Badge>}</td>
      <td>
        <Badge tone={target.isActive ? 'green' : 'red'}>{target.isActive ? t('admin.statusActive') : t('admin.statusDisabled')}</Badge>
      </td>
      <td>
        <div className="admin-storage-cell">
          <span className="field-hint">
            {formatBytes(target.storage.usedBytes)} / {formatBytes(target.storage.quotaBytes)}
          </span>
          <StorageBar usedBytes={target.storage.usedBytes} quotaBytes={target.storage.quotaBytes} />
        </div>
      </td>
      <td>
        <div className="admin-row-menu" ref={menuRef}>
          <button className="admin-row-menu-trigger" disabled={busy} onClick={() => setMenuOpen((o) => !o)} title={t('admin.rowMenu')}>
            <KebabIcon />
          </button>
          {menuOpen && (
            <div className="admin-row-menu-popover">
              <label className="admin-row-menu-toggle">
                <input
                  type="checkbox"
                  className="checkbox-custom"
                  checked={target.isAdmin}
                  disabled={busy || isSelf}
                  onChange={(e) => run(() => updateAdminUser(target.id, { isAdmin: e.target.checked }))}
                />
                {t('admin.toggleAdmin')}
              </label>
              <button
                disabled={busy || isSelf}
                onClick={() => {
                  if (target.isActive && !window.confirm(t('admin.confirmDeactivate', { pseudo: target.pseudo }))) return;
                  setMenuOpen(false);
                  run(() => updateAdminUser(target.id, { isActive: !target.isActive }));
                }}
              >
                {target.isActive ? t('admin.deactivate') : t('admin.reactivate')}
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  setMenuOpen(false);
                  run(() => sendAdminPasswordReset(target.id).then(() => setNotice(t('admin.passwordResetSent'))));
                }}
              >
                {t('admin.sendPasswordReset')}
              </button>
              <button
                className="admin-delete-btn"
                disabled={busy || isSelf || target.isActive}
                title={target.isActive ? t('admin.deleteNeedsDeactivateHint') : undefined}
                onClick={() => {
                  if (!window.confirm(t('admin.confirmDelete', { pseudo: target.pseudo }))) return;
                  setMenuOpen(false);
                  run(() => deleteAdminUser(target.id));
                }}
              >
                {t('admin.delete')}
              </button>
            </div>
          )}
        </div>
        {notice && <p className="field-hint">{notice}</p>}
        {error && <div className="auth-error">{error}</div>}
      </td>
    </tr>
  );
}

export function AdminUsers() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUserSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    fetchAdminUsers()
      .then(setUsers)
      .catch((err) => setError((err as Error).message));
  }

  useEffect(() => {
    refresh();
  }, []);

  if (!user) return null;

  return (
    <div className="page-shell">
      <Link to="/admin" className="admin-back-link">
        {t('admin.backToAdmin')}
      </Link>
      <h1>{t('admin.usersTitle')}</h1>
      {error && <div className="auth-error">{error}</div>}
      {!users ? (
        <div className="page-loading">
          <span className="spinner" />
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="modal-table">
            <thead>
              <tr>
                <th>{t('admin.colPseudo')}</th>
                <th>{t('admin.colEmail')}</th>
                <th>{t('admin.colPlan')}</th>
                <th>{t('admin.colAdmin')}</th>
                <th>{t('admin.colStatus')}</th>
                <th>{t('admin.colStorage')}</th>
                <th>{t('admin.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <AdminUserRow key={u.id} target={u} isSelf={u.id === user.id} onChange={refresh} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
