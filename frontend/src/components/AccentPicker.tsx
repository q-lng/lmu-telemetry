import { useEffect, useRef, useState } from 'react';
import { usePreferences } from '../PreferencesContext';
import { t } from '../i18n';
import { applyAccentColor, DEFAULT_ACCENT_COLOR, NEON_PRESETS } from '../theme';

/** Top-right navbar swatch + preset popover for the neon accent color — no
 * native <input type="color"> here, that would pop the OS's own picker,
 * which clashes with picking from a curated neon palette instead. */
export function AccentPicker() {
  const { preferences, setPreference } = usePreferences();
  const accentColor = (preferences.accentColor as string | undefined) ?? DEFAULT_ACCENT_COLOR;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Applied here (rather than at the app root) because this component is
  // rendered from Navbar, which Layout mounts on every route — enough to
  // cover the whole app, guests included (their pick is in-memory only, see
  // PreferencesContext).
  useEffect(() => {
    applyAccentColor(accentColor);
  }, [accentColor]);

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
          {NEON_PRESETS.map((hex) => (
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
