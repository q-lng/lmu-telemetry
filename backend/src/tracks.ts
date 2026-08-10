import type { FastifyInstance } from 'fastify';

export interface TrackCatalogEntry {
  slug: string;
  name: string;
}

/** Hand-maintained slug -> exact track name (as it appears in telemetry_files.track
 * and DuckDB's TrackName metadata field). There's no game-provided short/URL-safe
 * identifier for tracks, so this catalog is what turns "/tracks/spa" into
 * "Circuit de Spa-Francorchamps" for filtering sessions — add an entry here
 * whenever a new track should get its own page. */
export const TRACK_CATALOG: TrackCatalogEntry[] = [
  { slug: 'spa', name: 'Circuit de Spa-Francorchamps' },
  { slug: 'lagunaseca', name: 'WeatherTech Raceway Laguna Seca' },
  { slug: 'sebring', name: 'Sebring International Raceway' },
];

export function findTrackBySlug(slug: string): TrackCatalogEntry | undefined {
  return TRACK_CATALOG.find((t) => t.slug === slug);
}

export function findTrackCatalogEntryByName(name: string): TrackCatalogEntry | undefined {
  return TRACK_CATALOG.find((t) => t.name === name);
}

export async function registerTracks(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { slug: string } }>('/api/tracks/:slug', async (req, reply) => {
    const entry = findTrackBySlug(req.params.slug);
    if (!entry) {
      reply.code(404).send({ error: 'TRACK_NOT_FOUND' });
      return;
    }
    reply.send(entry);
  });
}
