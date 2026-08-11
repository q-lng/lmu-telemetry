import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { pgQuery } from './pg.js';
import { DATA_DIR } from './db.js';
import { resolveImageExt, serveImage, type ImageExt } from './imageAssets.js';

export type { ImageExt };

export interface TrackCatalogEntry {
  slug: string;
  name: string;
  country: string;
  photoExt: ImageExt | null;
  mapExt: ImageExt | null;
  dlcSlug: string | null;
  dlcName: string | null;
  dlcColor: string | null;
}

interface TrackRow {
  slug: string;
  name: string;
  country: string;
  dlc_slug: string | null;
  dlc_name: string | null;
  dlc_color: string | null;
}

export const TRACK_PHOTOS_DIR = path.join(DATA_DIR, 'track-photos');

export const SLUG_RE = /^[a-z0-9-]{1,64}$/;

const SELECT_TRACK_SQL = `
  SELECT t.slug, t.name, t.country, t.dlc_slug, d.name AS dlc_name, d.color AS dlc_color
  FROM tracks t
  LEFT JOIN dlcs d ON d.slug = t.dlc_slug
`;

function withAssets(row: TrackRow): TrackCatalogEntry {
  return {
    slug: row.slug,
    name: row.name,
    country: row.country,
    photoExt: resolveImageExt(TRACK_PHOTOS_DIR, row.slug),
    mapExt: resolveImageExt(TRACK_PHOTOS_DIR, `${row.slug}-map`),
    dlcSlug: row.dlc_slug,
    dlcName: row.dlc_name,
    dlcColor: row.dlc_color,
  };
}

export async function listTracks(): Promise<TrackCatalogEntry[]> {
  const rows = await pgQuery<TrackRow>(`${SELECT_TRACK_SQL} ORDER BY t.name`);
  return rows.map(withAssets);
}

export async function findTrackBySlug(slug: string): Promise<TrackCatalogEntry | null> {
  const rows = await pgQuery<TrackRow>(`${SELECT_TRACK_SQL} WHERE t.slug = $1`, [slug]);
  return rows[0] ? withAssets(rows[0]) : null;
}

export async function findTrackCatalogEntryByName(name: string): Promise<TrackCatalogEntry | null> {
  const rows = await pgQuery<TrackRow>(`${SELECT_TRACK_SQL} WHERE t.name = $1`, [name]);
  return rows[0] ? withAssets(rows[0]) : null;
}

export async function createTrack(entry: { slug: string; name: string; country: string }): Promise<TrackCatalogEntry> {
  await pgQuery(`INSERT INTO tracks (slug, name, country) VALUES ($1, $2, $3)`, [entry.slug, entry.name, entry.country]);
  return (await findTrackBySlug(entry.slug))!;
}

export interface TrackPatch {
  name?: string;
  country?: string;
  /** Empty string clears it back to base game (NULL) — see admin.ts's route. */
  dlcSlug?: string | null;
}

export async function updateTrack(slug: string, patch: TrackPatch): Promise<TrackCatalogEntry | null> {
  const sets: string[] = [];
  const params: unknown[] = [slug];
  if (patch.name !== undefined) {
    params.push(patch.name);
    sets.push(`name = $${params.length}`);
  }
  if (patch.country !== undefined) {
    params.push(patch.country);
    sets.push(`country = $${params.length}`);
  }
  if (patch.dlcSlug !== undefined) {
    params.push(patch.dlcSlug);
    sets.push(`dlc_slug = $${params.length}`);
  }
  if (sets.length > 0) {
    await pgQuery(`UPDATE tracks SET ${sets.join(', ')} WHERE slug = $1`, params);
  }
  return findTrackBySlug(slug);
}

export async function registerTracks(app: FastifyInstance): Promise<void> {
  // Public catalog listing — powers the /tracks page. Unlike /api/admin/tracks
  // this needs no auth: it's the same site content the individual track pages
  // already expose one at a time.
  app.get('/api/tracks', async (_req, reply) => {
    reply.send({ tracks: await listTracks() });
  });

  app.get<{ Params: { slug: string } }>('/api/tracks/:slug', async (req, reply) => {
    const entry = await findTrackBySlug(req.params.slug);
    if (!entry) {
      reply.code(404).send({ error: 'TRACK_NOT_FOUND' });
      return;
    }
    reply.send(entry);
  });

  app.get<{ Params: { filename: string } }>('/api/track-photos/:filename', async (req, reply) => {
    const found = serveImage(TRACK_PHOTOS_DIR, req.params.filename);
    if (!found) {
      reply.code(404).send({ error: 'NOT_FOUND' });
      return;
    }
    // `return` matters here: without it, this async handler's own promise
    // resolves right after send() is called (before the stream has piped any
    // bytes), and Fastify finalizes the response early — 200 with
    // Content-Length: 0 and an empty body, for every file, every time.
    return reply.type(found.contentType).send(found.stream);
  });
}
