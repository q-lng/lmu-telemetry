import { pgQuery } from './pg.js';

export interface DlcCatalogEntry {
  slug: string;
  name: string;
  color: string;
}

export async function listDlcs(): Promise<DlcCatalogEntry[]> {
  return pgQuery<DlcCatalogEntry>(`SELECT slug, name, color FROM dlcs ORDER BY name`);
}

export async function findDlcBySlug(slug: string): Promise<DlcCatalogEntry | null> {
  const rows = await pgQuery<DlcCatalogEntry>(`SELECT slug, name, color FROM dlcs WHERE slug = $1`, [slug]);
  return rows[0] ?? null;
}

export async function createDlc(entry: DlcCatalogEntry): Promise<DlcCatalogEntry> {
  await pgQuery(`INSERT INTO dlcs (slug, name, color) VALUES ($1, $2, $3)`, [entry.slug, entry.name, entry.color]);
  return entry;
}

export interface DlcPatch {
  name?: string;
  color?: string;
}

export async function updateDlc(slug: string, patch: DlcPatch): Promise<DlcCatalogEntry | null> {
  const sets: string[] = [];
  const params: unknown[] = [slug];
  if (patch.name !== undefined) {
    params.push(patch.name);
    sets.push(`name = $${params.length}`);
  }
  if (patch.color !== undefined) {
    params.push(patch.color);
    sets.push(`color = $${params.length}`);
  }
  if (sets.length === 0) return findDlcBySlug(slug);
  const rows = await pgQuery<DlcCatalogEntry>(`UPDATE dlcs SET ${sets.join(', ')} WHERE slug = $1 RETURNING slug, name, color`, params);
  return rows[0] ?? null;
}
