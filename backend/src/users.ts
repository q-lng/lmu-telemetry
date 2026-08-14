import { pgQuery } from './pg.js';

export type Plan = 'free' | 'vip';
export type ProfileVisibility = 'public' | 'private';

export interface User {
  id: number;
  email: string;
  pseudo: string;
  nom: string;
  prenom: string;
  passwordHash: string;
  createdAt: string;
  plan: Plan;
  isAdmin: boolean;
  isActive: boolean;
  profileVisibility: ProfileVisibility;
  lmuPseudo: string | null;
}

export interface PublicUser {
  id: number;
  email: string;
  pseudo: string;
  nom: string;
  prenom: string;
  plan: Plan;
  isAdmin: boolean;
  isActive: boolean;
  profileVisibility: ProfileVisibility;
  lmuPseudo: string | null;
}

interface UserRow {
  id: number;
  email: string;
  pseudo: string;
  nom: string;
  prenom: string;
  password_hash: string;
  created_at: string;
  plan: Plan;
  is_admin: boolean;
  is_active: boolean;
  profile_visibility: ProfileVisibility;
  lmu_pseudo: string | null;
}

function fromRow(r: UserRow): User {
  return {
    id: r.id,
    email: r.email,
    pseudo: r.pseudo,
    nom: r.nom,
    prenom: r.prenom,
    passwordHash: r.password_hash,
    createdAt: r.created_at,
    plan: r.plan,
    isAdmin: r.is_admin,
    isActive: r.is_active,
    profileVisibility: r.profile_visibility,
    lmuPseudo: r.lmu_pseudo,
  };
}

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    email: u.email,
    pseudo: u.pseudo,
    nom: u.nom,
    prenom: u.prenom,
    plan: u.plan,
    isAdmin: u.isAdmin,
    isActive: u.isActive,
    profileVisibility: u.profileVisibility,
    lmuPseudo: u.lmuPseudo,
  };
}

export async function createUser(input: {
  email: string;
  pseudo: string;
  nom: string;
  prenom: string;
  passwordHash: string;
}): Promise<User> {
  const rows = await pgQuery<UserRow>(
    `INSERT INTO users (email, pseudo, nom, prenom, password_hash)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, pseudo, nom, prenom, password_hash, created_at, plan, is_admin, is_active, profile_visibility, lmu_pseudo`,
    [input.email, input.pseudo, input.nom, input.prenom, input.passwordHash],
  );
  return fromRow(rows[0]);
}

export async function updateProfileVisibility(userId: number, visibility: ProfileVisibility): Promise<void> {
  await pgQuery(`UPDATE users SET profile_visibility = $2 WHERE id = $1`, [userId, visibility]);
}

export interface OwnProfilePatch {
  nom?: string;
  prenom?: string;
  lmuPseudo?: string | null;
}

/** Self-service profile edit — deliberately narrower than updateUserByAdmin's
 * AdminUserPatch: no pseudo/email/plan/role here, those have bigger
 * implications (uniqueness, URLs, login credential) and aren't self-service. */
export async function updateOwnProfile(userId: number, patch: OwnProfilePatch): Promise<User | null> {
  const sets: string[] = [];
  const params: unknown[] = [userId];
  if (patch.nom !== undefined) {
    params.push(patch.nom);
    sets.push(`nom = $${params.length}`);
  }
  if (patch.prenom !== undefined) {
    params.push(patch.prenom);
    sets.push(`prenom = $${params.length}`);
  }
  if (patch.lmuPseudo !== undefined) {
    params.push(patch.lmuPseudo);
    sets.push(`lmu_pseudo = $${params.length}`);
  }
  if (sets.length === 0) return findUserById(userId);
  const rows = await pgQuery<UserRow>(`UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params);
  return rows[0] ? fromRow(rows[0]) : null;
}

/** Maps a trimmed, lowercased lmu_pseudo to the registered site user it
 * belongs to — used only by leaderboard.ts to spot when a telemetry file's
 * free-text DriverName corresponds to a real account. */
export async function listLmuPseudoMatches(): Promise<Map<string, { id: number; pseudo: string }>> {
  const rows = await pgQuery<{ id: number; pseudo: string; lmu_pseudo: string }>(
    `SELECT id, pseudo, lmu_pseudo FROM users WHERE lmu_pseudo IS NOT NULL AND lmu_pseudo <> ''`,
  );
  return new Map(rows.map((r) => [r.lmu_pseudo.trim().toLowerCase(), { id: r.id, pseudo: r.pseudo }]));
}

/** Full user list for the admin panel — small personal-scale app, no paging. */
export async function listAllUsers(): Promise<User[]> {
  const rows = await pgQuery<UserRow>(`SELECT * FROM users ORDER BY id`);
  return rows.map(fromRow);
}

export interface AdminUserPatch {
  pseudo?: string;
  plan?: Plan;
  isAdmin?: boolean;
  isActive?: boolean;
}

/** Builds the SET clause from whichever fields are present — admin.ts only
 * passes fields that actually changed, so a request touching one field never
 * rewrites the others. */
export async function updateUserByAdmin(userId: number, patch: AdminUserPatch): Promise<User | null> {
  const sets: string[] = [];
  const params: unknown[] = [userId];
  if (patch.pseudo !== undefined) {
    params.push(patch.pseudo);
    sets.push(`pseudo = $${params.length}`);
  }
  if (patch.plan !== undefined) {
    params.push(patch.plan);
    sets.push(`plan = $${params.length}`);
  }
  if (patch.isAdmin !== undefined) {
    params.push(patch.isAdmin);
    sets.push(`is_admin = $${params.length}`);
  }
  if (patch.isActive !== undefined) {
    params.push(patch.isActive);
    sets.push(`is_active = $${params.length}`);
  }
  if (sets.length === 0) return findUserById(userId);
  const rows = await pgQuery<UserRow>(`UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params);
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function deleteUser(userId: number): Promise<void> {
  await pgQuery(`DELETE FROM users WHERE id = $1`, [userId]);
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const rows = await pgQuery<UserRow>(`SELECT * FROM users WHERE email = $1`, [email]);
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function findUserByPseudo(pseudo: string): Promise<User | null> {
  const rows = await pgQuery<UserRow>(`SELECT * FROM users WHERE pseudo = $1`, [pseudo]);
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function findUserById(id: number): Promise<User | null> {
  const rows = await pgQuery<UserRow>(`SELECT * FROM users WHERE id = $1`, [id]);
  return rows[0] ? fromRow(rows[0]) : null;
}

/** Batch lookup for the session picker's "uploaded by" column — one query
 * regardless of how many distinct owners appear in the session list. */
export async function findUsersByIds(ids: number[]): Promise<User[]> {
  if (ids.length === 0) return [];
  const rows = await pgQuery<UserRow>(`SELECT * FROM users WHERE id = ANY($1)`, [ids]);
  return rows.map(fromRow);
}

export async function updatePasswordHash(userId: number, passwordHash: string): Promise<void> {
  await pgQuery(`UPDATE users SET password_hash = $2 WHERE id = $1`, [userId, passwordHash]);
}

/** Prefix search on pseudo, case-insensitive, excluding the searching user
 * themselves (when known — anonymous callers pass null) and private profiles,
 * which shouldn't surface in search regardless of who's looking: there's
 * nothing a viewer could do with a private result anyway (friend-request/
 * follow already reject with PROFILE_IS_PRIVATE). */
export async function searchUsersByPseudo(query: string, excludeUserId: number | null, limit = 20): Promise<User[]> {
  const rows = await pgQuery<UserRow>(
    `SELECT * FROM users
     WHERE pseudo ILIKE $1 || '%'
       AND ($2::int IS NULL OR id <> $2)
       AND profile_visibility = 'public'
     ORDER BY pseudo LIMIT $3`,
    [query, excludeUserId, limit],
  );
  return rows.map(fromRow);
}
