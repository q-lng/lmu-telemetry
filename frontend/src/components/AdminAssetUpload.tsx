import { useRef } from 'react';
import { t } from '../i18n';

// Shared by AdminTracks.tsx and AdminCars.tsx — both catalogs resolve which
// extension actually exists on disk server-side (see TrackCatalogEntry/
// CarCatalogEntry's *Ext fields) rather than having the client guess, which
// used to spam the console with a 404 for every asset missing the guessed
// format.
export function AssetThumbnail({ src }: { src: string | null }) {
  if (!src) return <span className="field-hint">{t('adminTracks.none')}</span>;
  return <img className="admin-track-thumb" src={src} alt="" />;
}

interface UploadButtonProps {
  label: string;
  busy: boolean;
  onFile: (file: File) => void;
}

export function UploadButton({ label, busy, onFile }: UploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        disabled={busy}
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
      <button className="upload-btn" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? t('admin.saving') : label}
      </button>
    </>
  );
}
