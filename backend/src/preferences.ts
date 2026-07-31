import type { FastifyInstance } from 'fastify';
import { requireAuth } from './auth.js';
import { pgQuery } from './pg.js';

async function getPreferences(userId: number): Promise<Record<string, unknown>> {
  const rows = await pgQuery<{ data: Record<string, unknown> }>(
    `SELECT data FROM user_preferences WHERE user_id = $1`,
    [userId],
  );
  return rows[0]?.data ?? {};
}

/** Shallow-merges `patch`'s top-level keys into whatever the user already has —
 * unrelated features each own their own key, so a PUT from one never clobbers
 * another's data. */
async function mergePreferences(userId: number, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  const current = await getPreferences(userId);
  const merged = { ...current, ...patch };
  await pgQuery(
    `INSERT INTO user_preferences (user_id, data, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET data = $2, updated_at = now()`,
    [userId, JSON.stringify(merged)],
  );
  return merged;
}

export async function registerPreferences(app: FastifyInstance): Promise<void> {
  app.get('/api/preferences', { preHandler: requireAuth }, async (req) => {
    const data = await getPreferences(req.userId!);
    return { data };
  });

  app.put<{ Body: { data?: unknown } }>('/api/preferences', { preHandler: requireAuth }, async (req, reply) => {
    const { data } = req.body ?? {};
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      reply.code(400).send({ error: 'INVALID_REQUEST' });
      return;
    }
    const merged = await mergePreferences(req.userId!, data as Record<string, unknown>);
    return { data: merged };
  });
}
