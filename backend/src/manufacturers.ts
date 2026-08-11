import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { pgQuery } from './pg.js';
import { DATA_DIR } from './db.js';
import { resolveImageExt, serveImage, type ImageExt } from './imageAssets.js';

export interface ManufacturerCatalogEntry {
  slug: string;
  name: string;
  badgeExt: ImageExt | null;
}

interface ManufacturerRow {
  slug: string;
  name: string;
}

export const MANUFACTURER_PHOTOS_DIR = path.join(DATA_DIR, 'manufacturer-photos');

function withAssets(row: ManufacturerRow): ManufacturerCatalogEntry {
  return { ...row, badgeExt: resolveImageExt(MANUFACTURER_PHOTOS_DIR, row.slug) };
}

export async function listManufacturers(): Promise<ManufacturerCatalogEntry[]> {
  const rows = await pgQuery<ManufacturerRow>(`SELECT slug, name FROM manufacturers ORDER BY name`);
  return rows.map(withAssets);
}

export async function findManufacturerBySlug(slug: string): Promise<ManufacturerCatalogEntry | null> {
  const rows = await pgQuery<ManufacturerRow>(`SELECT slug, name FROM manufacturers WHERE slug = $1`, [slug]);
  return rows[0] ? withAssets(rows[0]) : null;
}

export async function createManufacturer(entry: { slug: string; name: string }): Promise<ManufacturerCatalogEntry> {
  await pgQuery(`INSERT INTO manufacturers (slug, name) VALUES ($1, $2)`, [entry.slug, entry.name]);
  return withAssets(entry);
}

export interface ManufacturerPatch {
  name?: string;
}

export async function updateManufacturer(slug: string, patch: ManufacturerPatch): Promise<ManufacturerCatalogEntry | null> {
  if (patch.name === undefined) return findManufacturerBySlug(slug);
  const rows = await pgQuery<ManufacturerRow>(`UPDATE manufacturers SET name = $2 WHERE slug = $1 RETURNING slug, name`, [
    slug,
    patch.name,
  ]);
  return rows[0] ? withAssets(rows[0]) : null;
}

export async function registerManufacturers(app: FastifyInstance): Promise<void> {
  // Public catalog listing — cars reference these by slug (see cars.ts's
  // join) so their badge only needs uploading once per manufacturer, not
  // once per car model.
  app.get('/api/manufacturers', async (_req, reply) => {
    reply.send({ manufacturers: await listManufacturers() });
  });

  app.get<{ Params: { slug: string } }>('/api/manufacturers/:slug', async (req, reply) => {
    const entry = await findManufacturerBySlug(req.params.slug);
    if (!entry) {
      reply.code(404).send({ error: 'MANUFACTURER_NOT_FOUND' });
      return;
    }
    reply.send(entry);
  });

  app.get<{ Params: { filename: string } }>('/api/manufacturer-photos/:filename', async (req, reply) => {
    const found = serveImage(MANUFACTURER_PHOTOS_DIR, req.params.filename);
    if (!found) {
      reply.code(404).send({ error: 'NOT_FOUND' });
      return;
    }
    // See tracks.ts's identical route for why `return` matters here.
    return reply.type(found.contentType).send(found.stream);
  });
}
