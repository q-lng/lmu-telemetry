import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { pgQuery } from './pg.js';
import { DATA_DIR } from './db.js';

export interface TrackCatalogEntry {
  slug: string;
  name: string;
  country: string;
}

export const TRACK_PHOTOS_DIR = path.join(DATA_DIR, 'track-photos');

export const SLUG_RE = /^[a-z0-9-]{1,64}$/;

export async function listTracks(): Promise<TrackCatalogEntry[]> {
  return pgQuery<TrackCatalogEntry>(`SELECT slug, name, country FROM tracks ORDER BY name`);
}

export async function findTrackBySlug(slug: string): Promise<TrackCatalogEntry | null> {
  const rows = await pgQuery<TrackCatalogEntry>(`SELECT slug, name, country FROM tracks WHERE slug = $1`, [slug]);
  return rows[0] ?? null;
}

export async function findTrackCatalogEntryByName(name: string): Promise<TrackCatalogEntry | null> {
  const rows = await pgQuery<TrackCatalogEntry>(`SELECT slug, name, country FROM tracks WHERE name = $1`, [name]);
  return rows[0] ?? null;
}

export async function createTrack(entry: TrackCatalogEntry): Promise<void> {
  await pgQuery(`INSERT INTO tracks (slug, name, country) VALUES ($1, $2, $3)`, [entry.slug, entry.name, entry.country]);
}

export interface TrackPatch {
  name?: string;
  country?: string;
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
  if (sets.length === 0) return findTrackBySlug(slug);
  const rows = await pgQuery<TrackCatalogEntry>(
    `UPDATE tracks SET ${sets.join(', ')} WHERE slug = $1 RETURNING slug, name, country`,
    params,
  );
  return rows[0] ?? null;
}

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

export async function registerTracks(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { slug: string } }>('/api/tracks/:slug', async (req, reply) => {
    const entry = await findTrackBySlug(req.params.slug);
    if (!entry) {
      reply.code(404).send({ error: 'TRACK_NOT_FOUND' });
      return;
    }
    reply.send(entry);
  });

  // Public, unauthenticated — these are site content (hero photo / map),
  // not user data. path.basename guards against traversal; the extension
  // allow-list doubles as the content-type lookup.
  app.get<{ Params: { filename: string } }>('/api/track-photos/:filename', async (req, reply) => {
    const filename = path.basename(req.params.filename);
    const ext = path.extname(filename).toLowerCase();
    const contentType = CONTENT_TYPES[ext];
    if (!contentType) {
      reply.code(404).send({ error: 'NOT_FOUND' });
      return;
    }
    const filePath = path.join(TRACK_PHOTOS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      reply.code(404).send({ error: 'NOT_FOUND' });
      return;
    }
    reply.type(contentType).send(fs.createReadStream(filePath));
  });
}
