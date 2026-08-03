import { pgQuery } from './pg.js';
import { findUserById, toPublicUser, type PublicUser } from './users.js';

export type NotificationType = 'friend_request' | 'follow';

export interface Notification {
  type: NotificationType;
  id: string;
  user: PublicUser;
  createdAt: string;
  read: boolean;
}

/**
 * Notifications are derived from friend_requests/follows rather than stored in
 * their own table — "unread" just means created after the user's last visit to
 * the bell (users.notifications_seen_at). This mirrors the existing Friends-tab
 * badge (incoming.length > 0) but is a general read/unread feed instead of a
 * pending-action flag: a request still pending shows as read once seen once.
 */
export async function listNotifications(userId: number): Promise<{ items: Notification[]; unreadCount: number }> {
  const [seenRows, requests, follows] = await Promise.all([
    pgQuery<{ notifications_seen_at: string }>(`SELECT notifications_seen_at FROM users WHERE id = $1`, [userId]),
    pgQuery<{ id: number; requester_id: number; created_at: string }>(
      `SELECT id, requester_id, created_at FROM friend_requests WHERE addressee_id = $1 ORDER BY created_at DESC`,
      [userId],
    ),
    pgQuery<{ follower_id: number; created_at: string }>(
      `SELECT follower_id, created_at FROM follows WHERE followee_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [userId],
    ),
  ]);
  const seenAt = seenRows[0].notifications_seen_at;

  const items: Notification[] = [];
  for (const r of requests) {
    const user = await findUserById(r.requester_id);
    if (user) {
      items.push({
        type: 'friend_request',
        id: `friend_request:${r.id}`,
        user: toPublicUser(user),
        createdAt: r.created_at,
        read: r.created_at <= seenAt,
      });
    }
  }
  for (const f of follows) {
    const user = await findUserById(f.follower_id);
    if (user) {
      items.push({
        type: 'follow',
        id: `follow:${f.follower_id}`,
        user: toPublicUser(user),
        createdAt: f.created_at,
        read: f.created_at <= seenAt,
      });
    }
  }
  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

  return { items, unreadCount: items.filter((i) => !i.read).length };
}

export async function markNotificationsSeen(userId: number): Promise<void> {
  await pgQuery(`UPDATE users SET notifications_seen_at = now() WHERE id = $1`, [userId]);
}
