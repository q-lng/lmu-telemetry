import type { FastifyInstance } from 'fastify';
import { searchUsersByPseudo, toPublicUser } from './users.js';
import { toProfileSummary } from './social.js';
import { searchTrackNames } from './access.js';
import { findTrackCatalogEntryByName } from './tracks.js';
import { searchCars } from './cars.js';

/** Cross-entity navbar search (users/tracks/cars) — no auth required: user
 * results are already filtered to public profiles, track results to the
 * same visibility rule as Browse, car results come straight from the
 * public car catalog. */
export async function registerSearch(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { q?: string } }>('/api/search', async (req, reply) => {
    const q = (req.query.q ?? '').trim();
    if (q.length === 0) {
      reply.send({ users: [], tracks: [], cars: [] });
      return;
    }
    const [users, tracks, cars] = await Promise.all([
      searchUsersByPseudo(q, req.userId, 5),
      searchTrackNames(req.userId, q, 6),
      searchCars(q, 6),
    ]);
    const profiles = await Promise.all(users.map((u) => toProfileSummary(toPublicUser(u), req.userId)));
    // slug/country/photoExt are null when the track has no dedicated catalog
    // entry yet — the frontend falls back to a plain row + a filtered Browse
    // link in that case. Cars always have a full catalog entry since they
    // only ever come from the catalog now.
    const trackResults = await Promise.all(
      tracks.map(async (name) => {
        const entry = await findTrackCatalogEntryByName(name);
        return { name, slug: entry?.slug ?? null, country: entry?.country ?? null, photoExt: entry?.photoExt ?? null };
      }),
    );
    reply.send({ users: profiles, tracks: trackResults, cars });
  });
}
