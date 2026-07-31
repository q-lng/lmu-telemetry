import { pgQuery } from './pg.js';
import { findUserById, toPublicUser, type PublicUser } from './users.js';

export async function follow(followerId: number, followeeId: number): Promise<void> {
  await pgQuery(
    `INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [followerId, followeeId],
  );
}

export async function unfollow(followerId: number, followeeId: number): Promise<void> {
  await pgQuery(`DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2`, [followerId, followeeId]);
}

export async function isFollowing(followerId: number, followeeId: number): Promise<boolean> {
  const rows = await pgQuery(`SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = $2`, [
    followerId,
    followeeId,
  ]);
  return rows.length > 0;
}

export async function listFollowing(userId: number): Promise<PublicUser[]> {
  const rows = await pgQuery<{ followee_id: number }>(`SELECT followee_id FROM follows WHERE follower_id = $1`, [
    userId,
  ]);
  const out: PublicUser[] = [];
  for (const r of rows) {
    const user = await findUserById(r.followee_id);
    if (user) out.push(toPublicUser(user));
  }
  return out;
}

export async function listFollowers(userId: number): Promise<PublicUser[]> {
  const rows = await pgQuery<{ follower_id: number }>(`SELECT follower_id FROM follows WHERE followee_id = $1`, [
    userId,
  ]);
  const out: PublicUser[] = [];
  for (const r of rows) {
    const user = await findUserById(r.follower_id);
    if (user) out.push(toPublicUser(user));
  }
  return out;
}
