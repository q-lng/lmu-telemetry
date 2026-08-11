import { useEffect, useState } from 'react';
import { createAdminDlc, fetchAdminDlcs, updateAdminDlc } from '../api';
import type { DlcCatalogEntry } from '../types';
import { t } from '../i18n';
import { PencilIcon } from '../components/icons';
import { ColorPicker } from '../components/ColorPicker';
import { Badge } from '../components/Badge';

interface RowProps {
  dlc: DlcCatalogEntry;
  onChange: (updated: DlcCatalogEntry) => void;
}

function DlcRow({ dlc, onChange }: RowProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(dlc.name);
  const [busy, setBusy] = useState<'name' | 'color' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setNameDraft(dlc.name), [dlc.name]);

  async function saveName() {
    const trimmed = nameDraft.trim();
    setEditingName(false);
    if (!trimmed || trimmed === dlc.name) {
      setNameDraft(dlc.name);
      return;
    }
    setBusy('name');
    setError(null);
    try {
      onChange(await updateAdminDlc(dlc.slug, { name: trimmed }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveColor(color: string) {
    setBusy('color');
    setError(null);
    try {
      onChange(await updateAdminDlc(dlc.slug, { color }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <tr>
      <td>{dlc.slug}</td>
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
                setNameDraft(dlc.name);
                setEditingName(false);
              }
            }}
          />
        ) : (
          <div className="admin-pseudo-cell">
            <span>{dlc.name}</span>
            <button className="admin-edit-trigger" disabled={busy === 'name'} onClick={() => setEditingName(true)} title={t('admin.editPseudo')}>
              <PencilIcon size={12} />
            </button>
          </div>
        )}
      </td>
      <td>
        <div className="admin-color-row">
          <ColorPicker color={dlc.color} onChange={saveColor} label={dlc.color} />
          <Badge color={dlc.color}>{dlc.name}</Badge>
        </div>
      </td>
      <td>{error && <div className="auth-error">{error}</div>}</td>
    </tr>
  );
}

function AddDlcForm({ onAdded }: { onAdded: (dlc: DlcCatalogEntry) => void }) {
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState('#60a5fa');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const created = await createAdminDlc({ slug: slug.trim().toLowerCase(), name: name.trim(), color });
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
      <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder={t('adminDlcs.slugPlaceholder')} disabled={busy} />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('adminDlcs.namePlaceholder')} disabled={busy} />
      <ColorPicker color={color} onChange={setColor} label={color} />
      <button className="auth-submit" type="submit" disabled={busy || !slug.trim() || !name.trim()}>
        {busy ? t('admin.saving') : t('adminDlcs.add')}
      </button>
      {error && <div className="auth-error">{error}</div>}
    </form>
  );
}

/** Embedded as the DLC tab of /admin/content (see AdminContent.tsx) — no
 * page-shell/heading of its own, the parent page owns that. */
export function DlcsAdminPanel() {
  const [dlcs, setDlcs] = useState<DlcCatalogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    fetchAdminDlcs()
      .then(setDlcs)
      .catch((err) => setError((err as Error).message));
  }

  useEffect(() => {
    refresh();
  }, []);

  function replaceDlc(updated: DlcCatalogEntry) {
    setDlcs((prev) => prev?.map((d) => (d.slug === updated.slug ? updated : d)) ?? prev);
  }

  return (
    <div>
      <p className="field-hint">{t('adminDlcs.subtitle')}</p>

      <AddDlcForm onAdded={(created) => setDlcs((prev) => [...(prev ?? []), created])} />

      {error && <div className="auth-error">{error}</div>}
      {!dlcs ? (
        <div className="page-loading">
          <span className="spinner" />
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="modal-table admin-users-table">
            <thead>
              <tr>
                <th>{t('adminDlcs.colSlug')}</th>
                <th>{t('adminDlcs.colName')}</th>
                <th>{t('adminDlcs.colColor')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {dlcs.map((dlc) => (
                <DlcRow key={dlc.slug} dlc={dlc} onChange={replaceDlc} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
