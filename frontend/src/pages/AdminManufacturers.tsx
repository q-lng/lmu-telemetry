import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createAdminManufacturer, fetchAdminManufacturers, updateAdminManufacturer, uploadManufacturerBadge } from '../api';
import type { ManufacturerCatalogEntry } from '../types';
import { t } from '../i18n';
import { PencilIcon } from '../components/icons';
import { AssetThumbnail, UploadButton } from '../components/AdminAssetUpload';

interface RowProps {
  manufacturer: ManufacturerCatalogEntry;
  onChange: (updated: ManufacturerCatalogEntry) => void;
}

function ManufacturerRow({ manufacturer, onChange }: RowProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(manufacturer.name);
  const [busy, setBusy] = useState<'name' | 'badge' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [badgeVersion, setBadgeVersion] = useState(0);

  useEffect(() => setNameDraft(manufacturer.name), [manufacturer.name]);

  async function saveName() {
    const trimmed = nameDraft.trim();
    setEditingName(false);
    if (!trimmed || trimmed === manufacturer.name) {
      setNameDraft(manufacturer.name);
      return;
    }
    setBusy('name');
    setError(null);
    try {
      onChange(await updateAdminManufacturer(manufacturer.slug, { name: trimmed }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleBadge(file: File) {
    setBusy('badge');
    setError(null);
    try {
      onChange(await uploadManufacturerBadge(manufacturer.slug, file));
      setBadgeVersion((v) => v + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <tr>
      <td>{manufacturer.slug}</td>
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
                setNameDraft(manufacturer.name);
                setEditingName(false);
              }
            }}
          />
        ) : (
          <div className="admin-pseudo-cell">
            <span>{manufacturer.name}</span>
            <button className="admin-edit-trigger" disabled={busy === 'name'} onClick={() => setEditingName(true)} title={t('admin.editPseudo')}>
              <PencilIcon size={12} />
            </button>
          </div>
        )}
      </td>
      <td>
        <div className="admin-track-asset">
          <AssetThumbnail
            src={manufacturer.badgeExt ? `/api/manufacturer-photos/${manufacturer.slug}.${manufacturer.badgeExt}?v=${badgeVersion}` : null}
          />
          <UploadButton label={t('adminManufacturers.uploadBadge')} busy={busy === 'badge'} onFile={handleBadge} />
        </div>
      </td>
      <td>{error && <div className="auth-error">{error}</div>}</td>
    </tr>
  );
}

function AddManufacturerForm({ onAdded }: { onAdded: (manufacturer: ManufacturerCatalogEntry) => void }) {
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const created = await createAdminManufacturer({ slug: slug.trim().toLowerCase(), name: name.trim() });
      onAdded(created);
      setSlug('');
      setName('');
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
      <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder={t('adminManufacturers.slugPlaceholder')} disabled={busy} />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('adminManufacturers.namePlaceholder')} disabled={busy} />
      <button className="auth-submit" type="submit" disabled={busy || !slug.trim() || !name.trim()}>
        {busy ? t('admin.saving') : t('adminManufacturers.add')}
      </button>
      {error && <div className="auth-error">{error}</div>}
    </form>
  );
}

export function AdminManufacturers() {
  const [manufacturers, setManufacturers] = useState<ManufacturerCatalogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    fetchAdminManufacturers()
      .then(setManufacturers)
      .catch((err) => setError((err as Error).message));
  }

  useEffect(() => {
    refresh();
  }, []);

  function replaceManufacturer(updated: ManufacturerCatalogEntry) {
    setManufacturers((prev) => prev?.map((m) => (m.slug === updated.slug ? updated : m)) ?? prev);
  }

  return (
    <div className="page-shell">
      <Link to="/admin/content/cars" className="admin-back-link">
        {t('adminManufacturers.backToCars')}
      </Link>
      <h1>{t('adminManufacturers.title')}</h1>
      <p className="field-hint">{t('adminManufacturers.subtitle')}</p>

      <AddManufacturerForm onAdded={(created) => setManufacturers((prev) => [...(prev ?? []), created])} />

      {error && <div className="auth-error">{error}</div>}
      {!manufacturers ? (
        <div className="page-loading">
          <span className="spinner" />
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="modal-table admin-users-table">
            <thead>
              <tr>
                <th>{t('adminManufacturers.colSlug')}</th>
                <th>{t('adminManufacturers.colName')}</th>
                <th>{t('adminManufacturers.colBadge')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {manufacturers.map((m) => (
                <ManufacturerRow key={m.slug} manufacturer={m} onChange={replaceManufacturer} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
