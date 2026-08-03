import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';

interface SizeOption {
  value: number;
  label: string;
  key: string;
}

interface Props {
  size: number;
  sizes: SizeOption[];
  onSelect: (value: number) => void;
}

/** One button opening a small popover of size choices, instead of always
 * showing every option side by side — same click-outside/Escape pattern as
 * AccentPicker. */
export function LaneSizeMenu({ size, sizes, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

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

  const current = sizes.find((s) => s.value === size);

  return (
    <div className="lane-size-menu" ref={wrapRef}>
      <button
        type="button"
        className="lane-size-menu-trigger"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title={t('tv.laneSizeToggle')}
      >
        {current?.key ?? '?'}
      </button>
      {open && (
        <div className="lane-size-menu-popover">
          {sizes.map((s) => (
            <button
              key={s.key}
              type="button"
              className={s.value === size ? 'active' : ''}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(s.value);
                setOpen(false);
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
