import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useSiteSettings } from '../SiteSettingsContext';
import { deleteAdminUser, fetchAdminUsers, sendAdminPasswordReset, updateAdminUser, updateSiteSettings } from '../api';
import type { AdminUserSummary, SiteSettings } from '../types';
import { t } from '../i18n';
import { CloseIcon } from '../components/icons';
import { ColorPicker } from '../components/ColorPicker';
import { Badge } from '../components/Badge';
import { DATA_FONT_CATALOG, FONT_CATALOG } from '../fonts';

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

  useEffect(() => setPseudoDraft(target.pseudo), [target.pseudo]);

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
      <td>
        <input
          type="checkbox"
          checked={target.isAdmin}
          disabled={busy || isSelf}
          onChange={(e) => run(() => updateAdminUser(target.id, { isAdmin: e.target.checked }))}
        />
      </td>
      <td>
        <div className="admin-status-cell">
          <Badge tone={target.isActive ? 'green' : 'red'}>{target.isActive ? t('admin.statusActive') : t('admin.statusDisabled')}</Badge>
          <button
            disabled={busy || isSelf}
            onClick={() => {
              if (target.isActive && !window.confirm(t('admin.confirmDeactivate', { pseudo: target.pseudo }))) return;
              run(() => updateAdminUser(target.id, { isActive: !target.isActive }));
            }}
          >
            {target.isActive ? t('admin.deactivate') : t('admin.reactivate')}
          </button>
        </div>
      </td>
      <td>
        {formatBytes(target.storage.usedBytes)} / {formatBytes(target.storage.quotaBytes)}
      </td>
      <td>
        <div className="admin-actions-cell">
          <button disabled={busy} onClick={() => run(() => sendAdminPasswordReset(target.id).then(() => setNotice(t('admin.passwordResetSent'))))}>
            {t('admin.sendPasswordReset')}
          </button>
          <button
            className="admin-delete-btn"
            disabled={busy || isSelf}
            onClick={() => {
              if (!window.confirm(t('admin.confirmDelete', { pseudo: target.pseudo }))) return;
              run(() => deleteAdminUser(target.id));
            }}
          >
            {t('admin.delete')}
          </button>
        </div>
        {notice && <p className="field-hint">{notice}</p>}
        {error && <div className="auth-error">{error}</div>}
      </td>
    </tr>
  );
}

const MAX_PRESETS = 12;

/** Site-wide "Affichage" settings — a local draft committed with one Save
 * (rather than auto-saving each field like the user table above) since these
 * are several related fields that read better as one form. Saving calls
 * refresh() on the shared context, which is what AccentPicker actually reads
 * to re-apply font/accent/glow globally — no separate live-preview wiring. */
function DisplaySettingsSection() {
  const { settings, refresh } = useSiteSettings();
  const [draft, setDraft] = useState<SiteSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);

  if (!draft) {
    return (
      <div className="page-loading">
        <span className="spinner" />
      </div>
    );
  }

  function update<K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    setSaved(false);
  }

  function updatePreset(index: number, hex: string) {
    setDraft((d) => (d ? { ...d, accentPresets: d.accentPresets.map((c, i) => (i === index ? hex : c)) } : d));
    setSaved(false);
  }

  function addPreset() {
    setDraft((d) => (d && d.accentPresets.length < MAX_PRESETS ? { ...d, accentPresets: [...d.accentPresets, '#ffffff'] } : d));
    setSaved(false);
  }

  function removePreset(index: number) {
    setDraft((d) => (d && d.accentPresets.length > 1 ? { ...d, accentPresets: d.accentPresets.filter((_, i) => i !== index) } : d));
    setSaved(false);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      await updateSiteSettings(draft);
      refresh();
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-display-section">
      <h2 className="social-subheading">{t('admin.displayTitle')}</h2>

      <label className="field">
        <strong>{t('admin.siteName')}</strong>
        <input value={draft.siteName} onChange={(e) => update('siteName', e.target.value)} />
      </label>

      <div className="field">
        <strong>{t('admin.font')}</strong>
        <select className="admin-font-select" value={draft.font} onChange={(e) => update('font', e.target.value as SiteSettings['font'])}>
          {FONT_CATALOG.map((f) => (
            <option key={f.key} value={f.key} style={{ fontFamily: f.stack }}>
              {f.label}
            </option>
          ))}
        </select>
        <p
          className="admin-font-preview"
          style={{ fontFamily: FONT_CATALOG.find((f) => f.key === draft.font)?.stack, fontSize: `${16 * draft.fontSizeScale}px` }}
        >
          {t('admin.fontPreviewText')}
        </p>
      </div>

      <div className="field">
        <strong>{t('admin.dataFont')}</strong>
        <select
          className="admin-font-select"
          value={draft.dataFont}
          onChange={(e) => update('dataFont', e.target.value as SiteSettings['dataFont'])}
        >
          {DATA_FONT_CATALOG.map((f) => (
            <option key={f.key} value={f.key} style={{ fontFamily: f.stack }}>
              {f.label}
            </option>
          ))}
        </select>
        <p
          className="admin-font-preview"
          style={{
            fontFamily: DATA_FONT_CATALOG.find((f) => f.key === draft.dataFont)?.stack,
            fontSize: `${16 * draft.fontSizeScale}px`,
          }}
        >
          {t('admin.dataFontPreviewText')}
        </p>
        <p className="field-hint">{t('admin.dataFontHint')}</p>
      </div>

      <div className="field">
        <strong>{t('admin.telemetryFont')}</strong>
        <div className="segmented">
          <button className={draft.telemetryFont === 'site' ? 'active' : ''} onClick={() => update('telemetryFont', 'site')}>
            {t('admin.telemetryFontSite')}
          </button>
          <button className={draft.telemetryFont === 'mono' ? 'active' : ''} onClick={() => update('telemetryFont', 'mono')}>
            {t('admin.telemetryFontMono')}
          </button>
        </div>
        <p className="field-hint">{t('admin.telemetryFontHint')}</p>
      </div>

      <div className="field">
        <strong>{t('admin.fontSizeScale')}</strong>
        <div className="admin-scale-row">
          <input
            type="range"
            min={0.8}
            max={2.0}
            step={0.05}
            value={draft.fontSizeScale}
            onChange={(e) => update('fontSizeScale', Number(e.target.value))}
          />
          <span className="admin-scale-value">{Math.round(draft.fontSizeScale * 100)}%</span>
        </div>
        <p className="field-hint">{t('admin.fontSizeScaleHint')}</p>
      </div>

      <div className="field">
        <strong>{t('admin.defaultAccentColor')}</strong>
        <div className="admin-color-row">
          <ColorPicker color={draft.defaultAccentColor} onChange={(hex) => update('defaultAccentColor', hex)} label={t('admin.defaultAccentColor')} />
          <span className="field-hint">{draft.defaultAccentColor}</span>
        </div>
        <p className="field-hint">{t('admin.defaultAccentColorHint')}</p>
      </div>

      <div className="field">
        <strong>{t('admin.accentPresets')}</strong>
        <div className="admin-preset-list">
          {draft.accentPresets.map((hex, i) => (
            <div className="admin-preset-item" key={i}>
              <ColorPicker color={hex} onChange={(next) => updatePreset(i, next)} label={hex} />
              <button disabled={draft.accentPresets.length <= 1} onClick={() => removePreset(i)} title={t('admin.removeColor')}>
                <CloseIcon size={10} />
              </button>
            </div>
          ))}
          <button disabled={draft.accentPresets.length >= MAX_PRESETS} onClick={addPreset}>
            {t('admin.addColor')}
          </button>
        </div>
        <p className="field-hint">{t('admin.accentPresetsHint')}</p>
      </div>

      <div className="field">
        <label className="admin-toggle-row">
          <input type="checkbox" checked={draft.neonGlowEnabled} onChange={(e) => update('neonGlowEnabled', e.target.checked)} />
          {t('admin.neonGlow')}
        </label>
        <p className="field-hint">{t('admin.neonGlowHint')}</p>
      </div>

      <div className="admin-display-actions">
        <button className="upload-btn" disabled={saving} onClick={save}>
          {saving ? t('admin.saving') : t('admin.save')}
        </button>
        {saved && <span className="field-hint">{t('admin.saved')}</span>}
      </div>
      {error && <div className="auth-error">{error}</div>}
    </div>
  );
}

export function Admin() {
  const { user, loading } = useAuth();
  const [users, setUsers] = useState<AdminUserSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    fetchAdminUsers()
      .then(setUsers)
      .catch((err) => setError((err as Error).message));
  }

  useEffect(() => {
    if (user?.isAdmin) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.isAdmin]);

  if (loading) return null;
  if (!user || !user.isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="social-page admin-page">
      <div className="social-card">
        <div className="auth-heading">
          <h1>{t('admin.title')}</h1>
        </div>
        {error && <div className="auth-error">{error}</div>}
        {!users ? (
          <div className="page-loading">
            <span className="spinner" />
          </div>
        ) : (
          <div className="modal-table-wrap">
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
      <div className="social-card">
        <DisplaySettingsSection />
      </div>
    </div>
  );
}
