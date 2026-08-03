import { useEffect, useRef, useState } from 'react';
import { HexColorInput, HexColorPicker } from 'react-colorful';

interface Props {
  color: string;
  onChange: (hex: string) => void;
  label?: string;
}

/** Swatch button → popover picker (react-colorful, ~2KB, no OS dialog) — same
 * click-outside/Escape pattern as every other popover in the app (AccentPicker,
 * AccountMenu, NotificationsBell). Replaces every native <input type="color">,
 * which pops the OS's own picker and looks completely out of place next to
 * the neon theme. */
export function ColorPicker({ color, onChange, label }: Props) {
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

  return (
    <div className="color-picker-wrap" ref={wrapRef}>
      <button
        type="button"
        className="color-picker-swatch"
        style={{ background: color }}
        onClick={() => setOpen((o) => !o)}
        title={label}
      />
      {open && (
        <div className="color-picker-popover">
          <HexColorPicker color={color} onChange={onChange} />
          <HexColorInput className="color-picker-hex-input" color={color} onChange={onChange} prefixed />
        </div>
      )}
    </div>
  );
}
