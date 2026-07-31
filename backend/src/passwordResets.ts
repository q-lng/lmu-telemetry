import crypto from 'node:crypto';
import { pgQuery } from './pg.js';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Drops any still-unused tokens for this user before issuing a fresh one — only
 * the latest reset link should ever be valid. */
export async function createResetToken(userId: number): Promise<{ token: string; expiresAt: Date }> {
  await pgQuery(`DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL`, [userId]);
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await pgQuery(
    `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
    [hashToken(token), userId, expiresAt],
  );
  return { token, expiresAt };
}

export async function findValidToken(token: string): Promise<{ tokenHash: string; userId: number } | null> {
  const tokenHash = hashToken(token);
  const rows = await pgQuery<{ user_id: number }>(
    `SELECT user_id FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [tokenHash],
  );
  return rows[0] ? { tokenHash, userId: rows[0].user_id } : null;
}

export async function consumeToken(tokenHash: string): Promise<void> {
  await pgQuery(`UPDATE password_reset_tokens SET used_at = now() WHERE token_hash = $1`, [tokenHash]);
}
