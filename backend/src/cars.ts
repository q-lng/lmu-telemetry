import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { pgQuery } from './pg.js';
import { DATA_DIR } from './db.js';
import { resolveImageExt, serveImage, type ImageExt } from './imageAssets.js';
import { MANUFACTURER_PHOTOS_DIR } from './manufacturers.js';

export const CAR_CATEGORIES = ['gte', 'gt3', 'lmp3', 'lmp2-wec', 'lmp2-elms', 'hypercar'] as const;
export type CarCategory = (typeof CAR_CATEGORIES)[number];

export interface CarCatalogEntry {
  slug: string;
  name: string;
  category: CarCategory;
  manufacturerSlug: string;
  /** Display name, joined from manufacturers — never written directly. */
  manufacturer: string;
  photoExt: ImageExt | null;
  /** Resolved from the manufacturer's own badge upload, not the car's —
   * one badge per manufacturer, reused across every model. */
  manufacturerBadgeExt: ImageExt | null;
  dlcSlug: string | null;
  dlcName: string | null;
  dlcColor: string | null;
}

interface CarRow {
  slug: string;
  name: string;
  category: CarCategory;
  manufacturer_slug: string;
  manufacturer_name: string;
  dlc_slug: string | null;
  dlc_name: string | null;
  dlc_color: string | null;
}

export const CAR_PHOTOS_DIR = path.join(DATA_DIR, 'car-photos');

const SELECT_CAR_SQL = `
  SELECT c.slug, c.name, c.category, c.manufacturer_slug, m.name AS manufacturer_name,
         c.dlc_slug, d.name AS dlc_name, d.color AS dlc_color
  FROM cars c
  JOIN manufacturers m ON m.slug = c.manufacturer_slug
  LEFT JOIN dlcs d ON d.slug = c.dlc_slug
`;

function withAssets(row: CarRow): CarCatalogEntry {
  return {
    slug: row.slug,
    name: row.name,
    category: row.category,
    manufacturerSlug: row.manufacturer_slug,
    manufacturer: row.manufacturer_name,
    photoExt: resolveImageExt(CAR_PHOTOS_DIR, row.slug),
    manufacturerBadgeExt: resolveImageExt(MANUFACTURER_PHOTOS_DIR, row.manufacturer_slug),
    dlcSlug: row.dlc_slug,
    dlcName: row.dlc_name,
    dlcColor: row.dlc_color,
  };
}

export async function listCars(): Promise<CarCatalogEntry[]> {
  const rows = await pgQuery<CarRow>(`${SELECT_CAR_SQL} ORDER BY c.name`);
  return rows.map(withAssets);
}

export async function findCarBySlug(slug: string): Promise<CarCatalogEntry | null> {
  const rows = await pgQuery<CarRow>(`${SELECT_CAR_SQL} WHERE c.slug = $1`, [slug]);
  return rows[0] ? withAssets(rows[0]) : null;
}

/** Navbar search — matches by car name OR manufacturer (see access.ts's
 * searchTrackNames for why cars search the catalog directly instead of
 * distinct telemetry_files.car strings: the catalog has every real car,
 * uploaded sessions only have whichever ones someone's actually driven).
 * Returns full catalog entries (not just name/slug) so the search dropdown
 * can show the category badge + car photo, same as the /cars cards. */
export async function searchCars(query: string, limit = 6): Promise<CarCatalogEntry[]> {
  const rows = await pgQuery<CarRow>(`${SELECT_CAR_SQL} WHERE c.name ILIKE $1 OR m.name ILIKE $1 ORDER BY c.name LIMIT $2`, [
    `%${query}%`,
    limit,
  ]);
  return rows.map(withAssets);
}

export async function createCar(entry: {
  slug: string;
  name: string;
  manufacturerSlug: string;
  category: CarCategory;
}): Promise<CarCatalogEntry> {
  await pgQuery(`INSERT INTO cars (slug, name, manufacturer_slug, category) VALUES ($1, $2, $3, $4)`, [
    entry.slug,
    entry.name,
    entry.manufacturerSlug,
    entry.category,
  ]);
  return (await findCarBySlug(entry.slug))!;
}

export interface CarPatch {
  name?: string;
  manufacturerSlug?: string;
  category?: CarCategory;
  /** Empty string clears it back to base game (NULL) — see admin.ts's route. */
  dlcSlug?: string | null;
}

export async function updateCar(slug: string, patch: CarPatch): Promise<CarCatalogEntry | null> {
  const sets: string[] = [];
  const params: unknown[] = [slug];
  if (patch.name !== undefined) {
    params.push(patch.name);
    sets.push(`name = $${params.length}`);
  }
  if (patch.manufacturerSlug !== undefined) {
    params.push(patch.manufacturerSlug);
    sets.push(`manufacturer_slug = $${params.length}`);
  }
  if (patch.category !== undefined) {
    params.push(patch.category);
    sets.push(`category = $${params.length}`);
  }
  if (patch.dlcSlug !== undefined) {
    params.push(patch.dlcSlug);
    sets.push(`dlc_slug = $${params.length}`);
  }
  if (sets.length > 0) {
    await pgQuery(`UPDATE cars SET ${sets.join(', ')} WHERE slug = $1`, params);
  }
  return findCarBySlug(slug);
}

export async function registerCars(app: FastifyInstance): Promise<void> {
  // Public catalog listing — powers the /cars page. Unlike /api/admin/cars
  // this needs no auth: it's the same site content the individual car pages
  // already expose one at a time.
  app.get('/api/cars', async (_req, reply) => {
    reply.send({ cars: await listCars() });
  });

  app.get<{ Params: { slug: string } }>('/api/cars/:slug', async (req, reply) => {
    const entry = await findCarBySlug(req.params.slug);
    if (!entry) {
      reply.code(404).send({ error: 'CAR_NOT_FOUND' });
      return;
    }
    reply.send(entry);
  });

  app.get<{ Params: { filename: string } }>('/api/car-photos/:filename', async (req, reply) => {
    const found = serveImage(CAR_PHOTOS_DIR, req.params.filename);
    if (!found) {
      reply.code(404).send({ error: 'NOT_FOUND' });
      return;
    }
    // See tracks.ts's identical route for why `return` matters here — without
    // it this async handler's promise resolves before the stream has piped
    // any bytes, and Fastify ends the reply early with an empty body.
    return reply.type(found.contentType).send(found.stream);
  });
}
