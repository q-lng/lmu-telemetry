import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSiteSettings } from '../SiteSettingsContext';
import { updateSiteSettings } from '../api';
import type { NavItemKey, SiteSettings } from '../types';
import { NAV_ITEM_KEYS } from '../types';
import { t } from '../i18n';
import { CloseIcon } from '../components/icons';
import { ColorPicker } from '../components/ColorPicker';
import { DATA_FONT_CATALOG, FONT_CATALOG } from '../fonts';

const MAX_PRESETS = 12;

// Reuses the navbar's own labels (nav.*) rather than inventing separate
// admin-only copy for the same items.
const NAV_ITEM_LABEL_KEYS: Record<NavItemKey, 'nav.app' | 'nav.browse' | 'nav.leaderboard' | 'nav.content' | 'nav.mySessions'> = {
  telemetry: 'nav.app',
  browse: 'nav.browse',
  leaderboard: 'nav.leaderboard',
  content: 'nav.content',
  mySessions: 'nav.mySessions',
};

/** Site-wide "Affichage" settings — a local draft committed with one Save
 * (rather than auto-saving each field like the users table) since these are
 * several related fields that read better as one form. Saving calls
 * refresh() on the shared context, which is what AccentPicker actually reads
 * to re-apply font/accent/glow globally — no separate live-preview wiring. */
export function AdminDisplay() {
  const { settings, refresh } = useSiteSettings();
  const [draft, setDraft] = useState<SiteSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);

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

  function toggleNavItem(key: NavItemKey, visible: boolean) {
    setDraft((d) => {
      if (!d) return d;
      const hiddenNavItems = visible ? d.hiddenNavItems.filter((k) => k !== key) : [...d.hiddenNavItems, key];
      return { ...d, hiddenNavItems };
    });
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
    <div className="page-shell">
      <Link to="/admin" className="admin-back-link">
        {t('admin.backToAdmin')}
      </Link>
      <div className="narrow-form-section">
        <h2 className="social-subheading">{t('admin.displayTitle')}</h2>

          {!draft ? (
            <div className="page-loading">
              <span className="spinner" />
            </div>
          ) : (
            <>
              <label className="field">
                <strong>{t('admin.siteName')}</strong>
                <input value={draft.siteName} onChange={(e) => update('siteName', e.target.value)} />
              </label>

              <div className="field">
                <strong>{t('admin.font')}</strong>
                <select
                  className="admin-font-select"
                  value={draft.font}
                  onChange={(e) => update('font', e.target.value as SiteSettings['font'])}
                >
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
                  <ColorPicker
                    color={draft.defaultAccentColor}
                    onChange={(hex) => update('defaultAccentColor', hex)}
                    label={t('admin.defaultAccentColor')}
                  />
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
                  <input
                    type="checkbox"
                    className="checkbox-custom"
                    checked={draft.neonGlowEnabled}
                    onChange={(e) => update('neonGlowEnabled', e.target.checked)}
                  />
                  {t('admin.neonGlow')}
                </label>
                <p className="field-hint">{t('admin.neonGlowHint')}</p>
              </div>

              <div className="field">
                <strong>{t('admin.navVisibility')}</strong>
                <div className="admin-nav-visibility-list">
                  {NAV_ITEM_KEYS.map((key) => (
                    <label className="admin-toggle-row" key={key}>
                      <input
                        type="checkbox"
                        className="checkbox-custom"
                        checked={!draft.hiddenNavItems.includes(key)}
                        onChange={(e) => toggleNavItem(key, e.target.checked)}
                      />
                      {t(NAV_ITEM_LABEL_KEYS[key])}
                    </label>
                  ))}
                </div>
                <p className="field-hint">{t('admin.navVisibilityHint')}</p>
              </div>

              <div className="admin-display-actions">
                <button className="upload-btn" disabled={saving} onClick={save}>
                  {saving ? t('admin.saving') : t('admin.save')}
                </button>
                {saved && <span className="field-hint">{t('admin.saved')}</span>}
              </div>
            {error && <div className="auth-error">{error}</div>}
          </>
        )}
      </div>
    </div>
  );
}
