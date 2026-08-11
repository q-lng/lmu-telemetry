import type { FastifyInstance } from 'fastify';
import { searchUsersByPseudo, toPublicUser } from './users.js';
import { toProfileSummary } from './social.js';
import { searchTrackCarNames } from './access.js';
import { findTrackCatalogEntryByName } from './tracks.js';

/** Cross-entity navbar search (users/tracks/cars) — no dedicated table joins
 * either side needs, just the two existing lookups merged into one response
 * so the frontend fires a single request per keystroke. No auth required:
 * user results are already filtered to public profiles, track/car results
 * to the same visibility rule as Browse. */
export async function registerSearch(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { q?: string } }>('/api/search', async (req, reply) => {
    const q = (req.query.q ?? '').trim();
    if (q.length === 0) {
      reply.send({ users: [], tracks: [], cars: [] });
      return;
    }
    const [users, { tracks, cars }] = await Promise.all([
      searchUsersByPseudo(q, req.userId, 5),
      searchTrackCarNames(req.userId, q, 6),
    ]);
    const profiles = await Promise.all(users.map((u) => toProfileSummary(toPublicUser(u), req.userId)));
    // slug is null when the track has no dedicated page yet — the frontend
    // falls back to a filtered Browse link in that case.
    const trackResults = await Promise.all(
      tracks.map(async (name) => ({ name, slug: (await findTrackCatalogEntryByName(name))?.slug ?? null })),
    );
    reply.send({ users: profiles, tracks: trackResults, cars });
  });
}
