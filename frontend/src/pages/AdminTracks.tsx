import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createAdminTrack,
  fetchAdminDlcs,
  fetchAdminTracks,
  updateAdminTrack,
  uploadTrackMap,
  uploadTrackMapFromMas,
  uploadTrackPhoto,
} from '../api';
import type { DlcCatalogEntry, TrackCatalogEntry } from '../types';
import { t } from '../i18n';
import { Flag } from '../components/flags';
import { PencilIcon } from '../components/icons';
import { AssetThumbnail, UploadButton } from '../components/AdminAssetUpload';

interface RowProps {
  track: TrackCatalogEntry;
  dlcs: DlcCatalogEntry[];
  onChange: (updated: TrackCatalogEntry) => void;
}

function TrackRow({ track, dlcs, onChange }: RowProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(track.name);
  const [countryDraft, setCountryDraft] = useState(track.country);
  const [busy, setBusy] = useState<'name' | 'country' | 'dlc' | 'photo' | 'map' | 'mas' | null>(null);
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

  async function saveDlc(dlcSlug: string) {
    setBusy('dlc');
    setError(null);
    try {
      onChange(await updateAdminTrack(track.slug, { dlcSlug }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handlePhoto(file: File) {
    setBusy('photo');
    setError(null);
    try {
      onChange(await uploadTrackPhoto(track.slug, file));
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
      onChange(await uploadTrackMap(track.slug, file));
      setPhotoVersion((v) => v + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleMas(file: File) {
    setBusy('mas');
    setError(null);
    try {
      onChange(await uploadTrackMapFromMas(track.slug, file));
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
        <select value={track.dlcSlug ?? ''} disabled={busy === 'dlc'} onChange={(e) => saveDlc(e.target.value)}>
          <option value="">{t('dlc.baseGame')}</option>
          {dlcs.map((dlc) => (
            <option key={dlc.slug} value={dlc.slug}>
              {dlc.name}
            </option>
          ))}
        </select>
      </td>
      <td>
        <div className="admin-track-asset">
          <AssetThumbnail src={track.photoExt ? `/api/track-photos/${track.slug}.${track.photoExt}?v=${photoVersion}` : null} />
          <UploadButton label={t('adminTracks.uploadPhoto')} busy={busy === 'photo'} onFile={handlePhoto} />
        </div>
      </td>
      <td>
        <div className="admin-track-asset">
          <AssetThumbnail
            src={track.mapExt ? `/api/track-photos/${track.slug}-map.${track.mapExt}?v=${photoVersion}` : null}
          />
          <UploadButton label={t('adminTracks.uploadMap')} busy={busy === 'map'} onFile={handleMap} />
          <UploadButton label={t('adminTracks.uploadFromMas')} busy={busy === 'mas'} onFile={handleMas} accept=".mas" />
          {track.mapExt && (
            <Link to={`/admin/content/tracks/${track.slug}/calibrate`} className="modal-table-action">
              {t('adminTracks.calibrateMap')}
            </Link>
          )}
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

/** Embedded as the Tracks tab of /admin/content (see AdminContent.tsx) — no
 * page-shell/heading of its own, the parent page owns that. */
export function TracksAdminPanel() {
  const [tracks, setTracks] = useState<TrackCatalogEntry[] | null>(null);
  const [dlcs, setDlcs] = useState<DlcCatalogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    fetchAdminTracks()
      .then(setTracks)
      .catch((err) => setError((err as Error).message));
  }

  useEffect(() => {
    refresh();
    fetchAdminDlcs().then(setDlcs);
  }, []);

  function replaceTrack(updated: TrackCatalogEntry) {
    setTracks((prev) => prev?.map((track) => (track.slug === updated.slug ? updated : track)) ?? prev);
  }

  return (
    <div>
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
                <th>{t('adminTracks.colDlc')}</th>
                <th>{t('adminTracks.colPhoto')}</th>
                <th>{t('adminTracks.colMap')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((track) => (
                <TrackRow key={track.slug} track={track} dlcs={dlcs} onChange={replaceTrack} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
