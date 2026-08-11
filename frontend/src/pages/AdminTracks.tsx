import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createAdminTrack, fetchAdminTracks, updateAdminTrack, uploadTrackMap, uploadTrackPhoto } from '../api';
import type { TrackCatalogEntry } from '../types';
import { t } from '../i18n';
import { Flag } from '../components/flags';
import { PencilIcon } from '../components/icons';

// Mirrors TrackPage.tsx's TrackHeroPhoto/TrackHeroMap fallback order exactly
// (photo: jpg then png; map: png then jpg) — a single-extension guess here
// would wrongly show "none" whenever the real file uses the other one.
// `version` forces a fresh attempt after a new upload (cache-busting via
// the querystring alone doesn't reset React state back to the first
// extension to try).
function PhotoThumbnail({ slug, version }: { slug: string; version: number }) {
  const [attempt, setAttempt] = useState<'jpg' | 'png' | 'none'>('jpg');
  useEffect(() => setAttempt('jpg'), [version]);
  if (attempt === 'none') return <span className="field-hint">{t('adminTracks.none')}</span>;
  return (
    <img
      key={`${attempt}-${version}`}
      className="admin-track-thumb"
      src={`/api/track-photos/${slug}.${attempt}?v=${version}`}
      alt=""
      onError={() => setAttempt((a) => (a === 'jpg' ? 'png' : 'none'))}
    />
  );
}

function MapThumbnail({ slug, version }: { slug: string; version: number }) {
  const [attempt, setAttempt] = useState<'png' | 'jpg' | 'none'>('png');
  useEffect(() => setAttempt('png'), [version]);
  if (attempt === 'none') return <span className="field-hint">{t('adminTracks.none')}</span>;
  return (
    <img
      key={`${attempt}-${version}`}
      className="admin-track-thumb"
      src={`/api/track-photos/${slug}-map.${attempt}?v=${version}`}
      alt=""
      onError={() => setAttempt((a) => (a === 'png' ? 'jpg' : 'none'))}
    />
  );
}

interface UploadButtonProps {
  label: string;
  busy: boolean;
  onFile: (file: File) => void;
}

function UploadButton({ label, busy, onFile }: UploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
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

interface RowProps {
  track: TrackCatalogEntry;
  onChange: (updated: TrackCatalogEntry) => void;
}

function TrackRow({ track, onChange }: RowProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(track.name);
  const [countryDraft, setCountryDraft] = useState(track.country);
  const [busy, setBusy] = useState<'name' | 'country' | 'photo' | 'map' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoVersion, setPhotoVersion] = useState(0);

  useEffect(() => setNameDraft(track.name), [track.name]);
  useEffect(() => setCountryDraft(track.country), [track.country]);

  async function saveName() {
    const trimmed = nameDraft.trim();
    setEditingName(false);
    if (!trimmed || trimmed === track.name) {
      setNameDraft(track.name);
      return;
    }
    setBusy('name');
    setError(null);
    try {
      onChange(await updateAdminTrack(track.slug, { name: trimmed }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveCountry() {
    const trimmed = countryDraft.trim().toUpperCase();
    if (!trimmed || trimmed === track.country) {
      setCountryDraft(track.country);
      return;
    }
    setBusy('country');
    setError(null);
    try {
      onChange(await updateAdminTrack(track.slug, { country: trimmed }));
    } catch (err) {
      setError((err as Error).message);
      setCountryDraft(track.country);
    } finally {
      setBusy(null);
    }
  }

  async function handlePhoto(file: File) {
    setBusy('photo');
    setError(null);
    try {
      await uploadTrackPhoto(track.slug, file);
      setPhotoVersion((v) => v + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleMap(file: File) {
    setBusy('map');
    setError(null);
    try {
      await uploadTrackMap(track.slug, file);
      setPhotoVersion((v) => v + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <tr>
      <td>
        <Link to={`/tracks/${track.slug}`} className="admin-track-slug">
          /tracks/{track.slug}
        </Link>
      </td>
      <td>
        {editingName ? (
          <input
            className="admin-pseudo-input"
            value={nameDraft}
            autoFocus
            disabled={busy === 'name'}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setNameDraft(track.name);
                setEditingName(false);
              }
            }}
          />
        ) : (
          <div className="admin-pseudo-cell">
            <span>{track.name}</span>
            <button className="admin-edit-trigger" disabled={busy === 'name'} onClick={() => setEditingName(true)} title={t('admin.editPseudo')}>
              <PencilIcon size={12} />
            </button>
          </div>
        )}
      </td>
      <td>
        <div className="admin-track-country">
          <Flag country={countryDraft || track.country} size={16} />
          <input
            className="admin-track-country-input"
            value={countryDraft}
            maxLength={2}
            disabled={busy === 'country'}
            onChange={(e) => setCountryDraft(e.target.value.toUpperCase())}
            onBlur={saveCountry}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
        </div>
      </td>
      <td>
        <div className="admin-track-asset">
          <PhotoThumbnail slug={track.slug} version={photoVersion} />
          <UploadButton label={t('adminTracks.uploadPhoto')} busy={busy === 'photo'} onFile={handlePhoto} />
        </div>
      </td>
      <td>
        <div className="admin-track-asset">
          <MapThumbnail slug={track.slug} version={photoVersion} />
          <UploadButton label={t('adminTracks.uploadMap')} busy={busy === 'map'} onFile={handleMap} />
        </div>
      </td>
      <td>{error && <div className="auth-error">{error}</div>}</td>
    </tr>
  );
}

function AddTrackForm({ onAdded }: { onAdded: (track: TrackCatalogEntry) => void }) {
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const created = await createAdminTrack({ slug: slug.trim().toLowerCase(), name: name.trim(), country: country.trim().toUpperCase() });
      onAdded(created);
      setSlug('');
      setName('');
      setCountry('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="social-search-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder={t('adminTracks.slugPlaceholder')} disabled={busy} />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('adminTracks.namePlaceholder')} disabled={busy} />
      <input
        value={country}
        onChange={(e) => setCountry(e.target.value.toUpperCase())}
        placeholder={t('adminTracks.countryPlaceholder')}
        maxLength={2}
        style={{ width: 60 }}
        disabled={busy}
      />
      <button className="auth-submit" type="submit" disabled={busy || !slug.trim() || !name.trim() || country.trim().length !== 2}>
        {busy ? t('admin.saving') : t('adminTracks.add')}
      </button>
      {error && <div className="auth-error">{error}</div>}
    </form>
  );
}

export function AdminTracks() {
  const [tracks, setTracks] = useState<TrackCatalogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    fetchAdminTracks()
      .then(setTracks)
      .catch((err) => setError((err as Error).message));
  }

  useEffect(() => {
    refresh();
  }, []);

  function replaceTrack(updated: TrackCatalogEntry) {
    setTracks((prev) => prev?.map((track) => (track.slug === updated.slug ? updated : track)) ?? prev);
  }

  return (
    <div className="page-shell">
      <Link to="/admin" className="admin-back-link">
        {t('admin.backToAdmin')}
      </Link>
      <h1>{t('adminTracks.title')}</h1>
      <p className="field-hint">{t('adminTracks.subtitle')}</p>

      <AddTrackForm onAdded={(created) => setTracks((prev) => [...(prev ?? []), created])} />

      {error && <div className="auth-error">{error}</div>}
      {!tracks ? (
        <div className="page-loading">
          <span className="spinner" />
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="modal-table admin-users-table">
            <thead>
              <tr>
                <th>{t('adminTracks.colSlug')}</th>
                <th>{t('adminTracks.colName')}</th>
                <th>{t('adminTracks.colCountry')}</th>
                <th>{t('adminTracks.colPhoto')}</th>
                <th>{t('adminTracks.colMap')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((track) => (
                <TrackRow key={track.slug} track={track} onChange={replaceTrack} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
