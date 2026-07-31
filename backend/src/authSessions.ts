import crypto from 'node:crypto';
import { pgQuery } from './pg.js';

export const SESSION_COOKIE_NAME = 'lmu_session';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createSession(
  userId: number,
  meta: { userAgent?: string; ip?: string } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await pgQuery(
    `INSERT INTO auth_sessions (token_hash, user_id, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5)`,
    [hashToken(token), userId, expiresAt, meta.userAgent ?? null, meta.ip ?? null],
  );
  return { token, expiresAt };
}

export async function findUserIdBySessionToken(token: string): Promise<number | null> {
  const rows = await pgQuery<{ user_id: number }>(
    `SELECT user_id FROM auth_sessions WHERE token_hash = $1 AND expires_at > now()`,
    [hashToken(token)],
  );
  return rows[0]?.user_id ?? null;
}

export async function destroySession(token: string): Promise<void> {
  await pgQuery(`DELETE FROM auth_sessions WHERE token_hash = $1`, [hashToken(token)]);
}

/** Invalidates every session for a user — used after a password reset, so a
 * previously stolen/leaked session cookie doesn't survive it. */
export async function destroyAllSessionsForUser(userId: number): Promise<void> {
  await pgQuery(`DELETE FROM auth_sessions WHERE user_id = $1`, [userId]);
}
