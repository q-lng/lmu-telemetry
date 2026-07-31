import { pgQuery, withTransaction } from './pg.js';
import { findUserById, toPublicUser, type PublicUser } from './users.js';

export interface FriendRequestSummary {
  id: number;
  user: PublicUser;
  createdAt: string;
}

function canonicalPair(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

export async function areFriends(a: number, b: number): Promise<boolean> {
  const [x, y] = canonicalPair(a, b);
  const rows = await pgQuery(`SELECT 1 FROM friendships WHERE user_a_id = $1 AND user_b_id = $2`, [x, y]);
  return rows.length > 0;
}

/** Pending request id + direction between two users, if any. */
export async function findPendingRequest(
  a: number,
  b: number,
): Promise<{ id: number; requesterId: number; addresseeId: number } | null> {
  const rows = await pgQuery<{ id: number; requester_id: number; addressee_id: number }>(
    `SELECT id, requester_id, addressee_id FROM friend_requests
     WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
    [a, b],
  );
  const r = rows[0];
  return r ? { id: r.id, requesterId: r.requester_id, addresseeId: r.addressee_id } : null;
}

/**
 * Sends a friend request from `requesterId` to `addresseeId`. If the addressee had
 * already sent a request the other way, that crossed request is accepted directly
 * instead of leaving two pending requests that never meet.
 */
export async function sendFriendRequest(requesterId: number, addresseeId: number): Promise<'pending' | 'accepted'> {
  return withTransaction(async (query) => {
    const [a, b] = canonicalPair(requesterId, addresseeId);
    const already = await query(`SELECT 1 FROM friendships WHERE user_a_id = $1 AND user_b_id = $2`, [a, b]);
    if (already.length > 0) return 'accepted';

    const reverse = await query<{ id: number }>(
      `SELECT id FROM friend_requests WHERE requester_id = $1 AND addressee_id = $2`,
      [addresseeId, requesterId],
    );
    if (reverse.length > 0) {
      await query(`DELETE FROM friend_requests WHERE id = $1`, [reverse[0].id]);
      await query(`INSERT INTO friendships (user_a_id, user_b_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [a, b]);
      return 'accepted';
    }

    await query(
      `INSERT INTO friend_requests (requester_id, addressee_id) VALUES ($1, $2)
       ON CONFLICT (requester_id, addressee_id) DO NOTHING`,
      [requesterId, addresseeId],
    );
    return 'pending';
  });
}

/** Accepts an incoming request — only the addressee may accept. */
export async function acceptFriendRequest(requestId: number, callerId: number): Promise<boolean> {
  return withTransaction(async (query) => {
    const rows = await query<{ requester_id: number; addressee_id: number }>(
      `SELECT requester_id, addressee_id FROM friend_requests WHERE id = $1`,
      [requestId],
    );
    const req = rows[0];
    if (!req || req.addressee_id !== callerId) return false;
    const [a, b] = canonicalPair(req.requester_id, req.addressee_id);
    await query(`DELETE FROM friend_requests WHERE id = $1`, [requestId]);
    await query(`INSERT INTO friendships (user_a_id, user_b_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [a, b]);
    return true;
  });
}

/** Deletes a pending request — allowed for either the requester (cancel) or the
 * addressee (decline); both are the same operation on this table. */
export async function deleteFriendRequest(requestId: number, callerId: number): Promise<boolean> {
  const rows = await pgQuery<{ requester_id: number; addressee_id: number }>(
    `SELECT requester_id, addressee_id FROM friend_requests WHERE id = $1`,
    [requestId],
  );
  const req = rows[0];
  if (!req || (req.requester_id !== callerId && req.addressee_id !== callerId)) return false;
  await pgQuery(`DELETE FROM friend_requests WHERE id = $1`, [requestId]);
  return true;
}

export async function listIncomingRequests(userId: number): Promise<FriendRequestSummary[]> {
  const rows = await pgQuery<{ id: number; requester_id: number; created_at: string }>(
    `SELECT id, requester_id, created_at FROM friend_requests WHERE addressee_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  const out: FriendRequestSummary[] = [];
  for (const r of rows) {
    const user = await findUserById(r.requester_id);
    if (user) out.push({ id: r.id, user: toPublicUser(user), createdAt: r.created_at });
  }
  return out;
}

export async function listOutgoingRequests(userId: number): Promise<FriendRequestSummary[]> {
  const rows = await pgQuery<{ id: number; addressee_id: number; created_at: string }>(
    `SELECT id, addressee_id, created_at FROM friend_requests WHERE requester_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  const out: FriendRequestSummary[] = [];
  for (const r of rows) {
    const user = await findUserById(r.addressee_id);
    if (user) out.push({ id: r.id, user: toPublicUser(user), createdAt: r.created_at });
  }
  return out;
}

export async function listFriends(userId: number): Promise<PublicUser[]> {
  const rows = await pgQuery<{ user_a_id: number; user_b_id: number }>(
    `SELECT user_a_id, user_b_id FROM friendships WHERE user_a_id = $1 OR user_b_id = $1`,
    [userId],
  );
  const out: PublicUser[] = [];
  for (const r of rows) {
    const otherId = r.user_a_id === userId ? r.user_b_id : r.user_a_id;
    const user = await findUserById(otherId);
    if (user) out.push(toPublicUser(user));
  }
  return out;
}

export async function removeFriendship(userId: number, otherId: number): Promise<void> {
  const [a, b] = canonicalPair(userId, otherId);
  await pgQuery(`DELETE FROM friendships WHERE user_a_id = $1 AND user_b_id = $2`, [a, b]);
}
