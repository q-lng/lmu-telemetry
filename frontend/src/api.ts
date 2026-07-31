import type {
  ChannelDescriptor,
  ChannelSeries,
  FileRecord,
  FriendRequestSummary,
  LapInfo,
  LapShare,
  LapVisibility,
  ProfileSummary,
  PublicUser,
  SessionMetadata,
  SessionSummary,
  SharedLapResult,
  Visibility,
} from './types';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const parsed = await res.json().catch(() => ({}));
    throw new Error((parsed as { error?: string }).error ?? `${url} -> HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** POST/DELETE calls with no request body (accept/decline/follow/unfollow/remove). */
async function apiCall(url: string, method: 'POST' | 'DELETE'): Promise<void> {
  const res = await fetch(url, { method });
  if (!res.ok) {
    const parsed = await res.json().catch(() => ({}));
    throw new Error((parsed as { error?: string }).error ?? `${url} -> HTTP ${res.status}`);
  }
}

export function signup(input: { email: string; pseudo: string; nom: string; prenom: string; password: string }): Promise<PublicUser> {
  return postJson<{ user: PublicUser }>('/api/auth/signup', input).then((r) => r.user);
}

export function login(input: { email: string; password: string }): Promise<PublicUser> {
  return postJson<{ user: PublicUser }>('/api/auth/login', input).then((r) => r.user);
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
}

export async function fetchMe(): Promise<PublicUser | null> {
  const res = await fetch('/api/auth/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`/api/auth/me -> HTTP ${res.status}`);
  const body = (await res.json()) as { user: PublicUser };
  return body.user;
}

export function fetchSessions(
  filter: { track?: string; car?: string; excludeMine?: boolean } = {},
): Promise<SessionSummary[]> {
  const params = new URLSearchParams();
  if (filter.track) params.set('track', filter.track);
  if (filter.car) params.set('car', filter.car);
  if (filter.excludeMine) params.set('excludeMine', 'true');
  const q = params.toString();
  return getJson(`/api/sessions${q ? `?${q}` : ''}`);
}

export function fetchMetadata(file: string): Promise<SessionMetadata> {
  return getJson(`/api/sessions/${encodeURIComponent(file)}/metadata`);
}

export function fetchChannels(file: string): Promise<ChannelDescriptor[]> {
  return getJson(`/api/sessions/${encodeURIComponent(file)}/channels`);
}

export function fetchLaps(file: string): Promise<LapInfo[]> {
  return getJson(`/api/sessions/${encodeURIComponent(file)}/laps`);
}

export async function uploadSession(file: File): Promise<{ file: string }> {
  const form = new FormData();
  form.append('file', file, file.name);
  const res = await fetch('/api/sessions/upload', { method: 'POST', body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Upload failed: HTTP ${res.status}`);
  }
  return res.json();
}

export function fetchChannelSeries(
  file: string,
  name: string,
  range?: { from: number; to: number },
): Promise<ChannelSeries> {
  const q = range ? `?from=${range.from}&to=${range.to}` : '';
  return getJson(`/api/sessions/${encodeURIComponent(file)}/channel/${encodeURIComponent(name)}${q}`);
}

export function searchUsers(q: string): Promise<ProfileSummary[]> {
  return getJson<{ users: ProfileSummary[] }>(`/api/users/search?q=${encodeURIComponent(q)}`).then((r) => r.users);
}

export function fetchProfile(pseudo: string): Promise<ProfileSummary> {
  return getJson<{ profile: ProfileSummary }>(`/api/users/${encodeURIComponent(pseudo)}`).then((r) => r.profile);
}

export function sendFriendRequest(pseudo: string): Promise<'pending' | 'accepted'> {
  return postJson<{ status: 'pending' | 'accepted' }>('/api/friends/requests', { pseudo }).then((r) => r.status);
}

export function fetchFriendRequests(): Promise<{ incoming: FriendRequestSummary[]; outgoing: FriendRequestSummary[] }> {
  return getJson('/api/friends/requests');
}

export function acceptFriendRequest(id: number): Promise<void> {
  return apiCall(`/api/friends/requests/${id}/accept`, 'POST');
}

export function declineFriendRequest(id: number): Promise<void> {
  return apiCall(`/api/friends/requests/${id}`, 'DELETE');
}

export function fetchFriends(): Promise<PublicUser[]> {
  return getJson<{ friends: PublicUser[] }>('/api/friends').then((r) => r.friends);
}

export function removeFriend(userId: number): Promise<void> {
  return apiCall(`/api/friends/${userId}`, 'DELETE');
}

export function followUser(pseudo: string): Promise<void> {
  return apiCall(`/api/follows/${encodeURIComponent(pseudo)}`, 'POST');
}

export function unfollowUser(pseudo: string): Promise<void> {
  return apiCall(`/api/follows/${encodeURIComponent(pseudo)}`, 'DELETE');
}

export function fetchFollowing(): Promise<PublicUser[]> {
  return getJson<{ users: PublicUser[] }>('/api/follows/following').then((r) => r.users);
}

export function fetchFollowers(): Promise<PublicUser[]> {
  return getJson<{ users: PublicUser[] }>('/api/follows/followers').then((r) => r.users);
}

export function fetchMyFiles(): Promise<FileRecord[]> {
  return getJson<{ files: FileRecord[] }>('/api/sessions/mine').then((r) => r.files);
}

export function setFileVisibility(filename: string, visibility: Visibility): Promise<void> {
  return postJson(`/api/sessions/${encodeURIComponent(filename)}/visibility`, { visibility });
}

export function fetchLapShares(filename: string): Promise<LapShare[]> {
  return getJson<{ shares: LapShare[] }>(`/api/sessions/${encodeURIComponent(filename)}/lap-shares`).then(
    (r) => r.shares,
  );
}

export function setLapVisibility(filename: string, lapNumber: number, visibility: LapVisibility | null): Promise<void> {
  return postJson(`/api/sessions/${encodeURIComponent(filename)}/laps/${lapNumber}/visibility`, { visibility });
}

export function searchSharedLaps(filter: { track?: string; car?: string } = {}): Promise<SharedLapResult[]> {
  const params = new URLSearchParams();
  if (filter.track) params.set('track', filter.track);
  if (filter.car) params.set('car', filter.car);
  const q = params.toString();
  return getJson<{ laps: SharedLapResult[] }>(`/api/shared-laps/search${q ? `?${q}` : ''}`).then((r) => r.laps);
}

export function fetchSharedLapMetadata(file: string, lap: number): Promise<SessionMetadata> {
  return getJson(`/api/shared-lap/${encodeURIComponent(file)}/${lap}/metadata`);
}

export function fetchSharedLapChannels(file: string, lap: number): Promise<ChannelDescriptor[]> {
  return getJson(`/api/shared-lap/${encodeURIComponent(file)}/${lap}/channels`);
}

export function fetchSharedLapLaps(file: string, lap: number): Promise<LapInfo[]> {
  return getJson(`/api/shared-lap/${encodeURIComponent(file)}/${lap}/laps`);
}

export function fetchSharedLapChannelSeries(file: string, lap: number, name: string): Promise<ChannelSeries> {
  return getJson(`/api/shared-lap/${encodeURIComponent(file)}/${lap}/channel/${encodeURIComponent(name)}`);
}
