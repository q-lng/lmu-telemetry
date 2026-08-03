import { useEffect, useRef, useState } from 'react';
import { usePreferences } from '../PreferencesContext';
import { useSiteSettings } from '../SiteSettingsContext';
import { t } from '../i18n';
import { applyAccentColor, applyDataFontFamily, applyFontFamily, applyFontSizeScale, DEFAULT_ACCENT_COLOR, NEON_PRESETS } from '../theme';

/** Top-right navbar swatch + preset popover for the neon accent color — no
 * native <input type="color"> here, that would pop the OS's own picker,
 * which clashes with picking from a curated neon palette instead. */
export function AccentPicker() {
  const { preferences, setPreference } = usePreferences();
  const { settings: siteSettings } = useSiteSettings();
  const accentColor = (preferences.accentColor as string | undefined) ?? siteSettings?.defaultAccentColor ?? DEFAULT_ACCENT_COLOR;
  const presets = siteSettings?.accentPresets ?? NEON_PRESETS;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Applied here (rather than at the app root) because this component is
  // rendered from Navbar, which Layout mounts on every route — enough to
  // cover the whole app, guests included (their pick is in-memory only, see
  // PreferencesContext). Font + glow have no per-user override (yet), so they
  // always follow the site-wide admin setting directly.
  useEffect(() => {
    applyAccentColor(accentColor, siteSettings?.neonGlowEnabled ?? true);
  }, [accentColor, siteSettings?.neonGlowEnabled]);

  useEffect(() => {
    applyFontFamily(siteSettings?.font ?? 'system');
  }, [siteSettings?.font]);

  useEffect(() => {
    applyDataFontFamily(siteSettings?.dataFont ?? 'system-mono');
  }, [siteSettings?.dataFont]);

  useEffect(() => {
    applyFontSizeScale(siteSettings?.fontSizeScale ?? 1);
  }, [siteSettings?.fontSizeScale]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="accent-picker-wrap" ref={wrapRef}>
      <button
        type="button"
        className="accent-picker-swatch"
        style={{ background: accentColor }}
        onClick={() => setOpen((o) => !o)}
        title={t('nav.accentColor')}
      />
      {open && (
        <div className="accent-picker-popover">
          {presets.map((hex) => (
            <button
              key={hex}
              type="button"
              className={`accent-picker-option${hex === accentColor ? ' active' : ''}`}
              style={{ background: hex }}
              title={hex}
              onClick={() => {
                setPreference('accentColor', hex);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
