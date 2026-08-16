import type {
  AdminUserSummary,
  CarCatalogEntry,
  ChannelDescriptor,
  ChannelSeries,
  DlcCatalogEntry,
  FileRecord,
  FriendRequestSummary,
  LapInfo,
  LapShare,
  LiveryMapping,
  LapVisibility,
  LeaderboardClass,
  LeaderboardEntry,
  ManufacturerCatalogEntry,
  Notification,
  Plan,
  ProfileSummary,
  ProfileVisibility,
  PublicUser,
  SearchResults,
  SessionMetadata,
  SessionSummary,
  SharedLapResult,
  SiteSettings,
  StorageUsage,
  TrackCatalogEntry,
  Visibility,
} from './types';
import type { CarCategory } from './carCategories';
import { tError } from './i18n';

// Every helper below translates the backend's error CODE (or a missing/
// unparseable body) into English text right here, once — so every call site
// that does `setError((err as Error).message)` already shows translated text
// with no changes needed there.

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const parsed = await res.json().catch(() => ({}));
    throw new Error(tError((parsed as { error?: string }).error));
  }
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
    throw new Error(tError((parsed as { error?: string }).error));
  }
  // 204 No Content has no body — calling .json() on it throws. Every caller
  // expecting a real payload gets 200/201 with an actual body, so this is safe.
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function putJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const parsed = await res.json().catch(() => ({}));
    throw new Error(tError((parsed as { error?: string }).error));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function patchJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const parsed = await res.json().catch(() => ({}));
    throw new Error(tError((parsed as { error?: string }).error));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** POST/DELETE calls with no request body (accept/decline/follow/unfollow/remove). */
async function apiCall(url: string, method: 'POST' | 'DELETE'): Promise<void> {
  const res = await fetch(url, { method });
  if (!res.ok) {
    const parsed = await res.json().catch(() => ({}));
    throw new Error(tError((parsed as { error?: string }).error));
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
  // 401 here just means "not logged in" — the only caller (AuthContext) treats
  // it as `user: null` and never surfaces an error message, so no translation
  // is needed on that path; any other failure still gets translated below.
  const res = await fetch('/api/auth/me');
  if (res.status === 401) return null;
  if (!res.ok) {
    const parsed = await res.json().catch(() => ({}));
    throw new Error(tError((parsed as { error?: string }).error));
  }
  const body = (await res.json()) as { user: PublicUser };
  return body.user;
}

export function requestPasswordReset(email: string): Promise<void> {
  return postJson('/api/auth/forgot-password', { email });
}

export function resetPassword(token: string, password: string): Promise<void> {
  return postJson('/api/auth/reset-password', { token, password });
}

export function updateProfileVisibility(visibility: ProfileVisibility): Promise<PublicUser> {
  return putJson<{ user: PublicUser }>('/api/auth/profile-visibility', { visibility }).then((r) => r.user);
}

export function updateProfile(patch: { nom?: string; prenom?: string; lmuPseudo?: string }): Promise<PublicUser> {
  return putJson<{ user: PublicUser }>('/api/auth/profile', patch).then((r) => r.user);
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

// Telemetry files can run into the GB range (see the 5GB backend limit), so a
// multi-minute upload with zero feedback reads as a hung/crashed tab — this
// uses XMLHttpRequest instead of fetch specifically because fetch has no
// widely-supported way to observe request-body (upload) progress.
export function uploadSession(file: File, onProgress?: (fraction: number) => void): Promise<{ file: string }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file, file.name);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/sessions/upload');
    // Progress events can fire dozens of times per second at the start of a
    // fast/local transfer (the OS send buffer flushes in a tight loop before
    // real network backpressure kicks in) — each call re-renders a heavy
    // component tree, so without throttling that burst reads as a freeze.
    // Capping to one React update per whole percentage point keeps the bar
    // smooth while bounding re-renders to ~100 over the whole upload.
    let lastPercent = -1;
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const percent = Math.floor((e.loaded / e.total) * 100);
      if (percent === lastPercent) return;
      lastPercent = percent;
      onProgress?.(percent / 100);
    };
    xhr.onload = () => {
      let body: unknown = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // non-JSON body (shouldn't happen on this endpoint) — fall through to the ok/error check below
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as { file: string });
      } else {
        reject(new Error(tError((body as { error?: string }).error)));
      }
    };
    xhr.onerror = () => reject(new Error(tError(undefined)));
    xhr.send(form);
  });
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

export function searchAll(q: string): Promise<SearchResults> {
  return getJson<SearchResults>(`/api/search?q=${encodeURIComponent(q)}`);
}

export function fetchTrackCatalogEntry(slug: string): Promise<TrackCatalogEntry> {
  return getJson<TrackCatalogEntry>(`/api/tracks/${encodeURIComponent(slug)}`);
}

// 404 just means this session's TrackName has no catalog entry (or the
// catalog is incomplete, see access.ts's searchTrackNames comment) — treated
// as "no map background available", not an error to surface.
export async function fetchTrackByName(name: string): Promise<TrackCatalogEntry | null> {
  const res = await fetch(`/api/tracks/by-name?name=${encodeURIComponent(name)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const parsed = await res.json().catch(() => ({}));
    throw new Error(tError((parsed as { error?: string }).error));
  }
  return res.json() as Promise<TrackCatalogEntry>;
}

export function fetchTracks(): Promise<TrackCatalogEntry[]> {
  return getJson<{ tracks: TrackCatalogEntry[] }>('/api/tracks').then((r) => r.tracks);
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

export function fetchNotifications(): Promise<{ items: Notification[]; unreadCount: number }> {
  return getJson('/api/notifications');
}

export function markNotificationsSeen(): Promise<void> {
  return apiCall('/api/notifications/seen', 'POST');
}

export function fetchMyFiles(): Promise<FileRecord[]> {
  return getJson<{ files: FileRecord[] }>('/api/sessions/mine').then((r) => r.files);
}

export function fetchStorageUsage(): Promise<StorageUsage> {
  return getJson('/api/storage');
}

export function setSessionCar(filename: string, carSlug: string | null): Promise<void> {
  return postJson(`/api/sessions/${encodeURIComponent(filename)}/car`, { carSlug });
}

export function setFileVisibility(filename: string, visibility: Visibility): Promise<void> {
  return postJson(`/api/sessions/${encodeURIComponent(filename)}/visibility`, { visibility });
}

export function deleteSession(filename: string): Promise<void> {
  return apiCall(`/api/sessions/${encodeURIComponent(filename)}`, 'DELETE');
}

export function fetchLapShares(filename: string): Promise<LapShare[]> {
  return getJson<{ shares: LapShare[] }>(`/api/sessions/${encodeURIComponent(filename)}/lap-shares`).then(
    (r) => r.shares,
  );
}

export function setLapVisibility(filename: string, lapNumber: number, visibility: LapVisibility | null): Promise<void> {
  return postJson(`/api/sessions/${encodeURIComponent(filename)}/laps/${lapNumber}/visibility`, { visibility });
}

export function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  return getJson<{ entries: LeaderboardEntry[] }>('/api/leaderboard').then((r) => r.entries);
}

export function fetchTrackLeaderboard(slug: string): Promise<Partial<Record<LeaderboardClass, LeaderboardEntry[]>>> {
  return getJson<{ classes: Partial<Record<LeaderboardClass, LeaderboardEntry[]>> }>(
    `/api/tracks/${encodeURIComponent(slug)}/leaderboard`,
  ).then((r) => r.classes);
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

// Generic per-user preferences store (backend-persisted — never localStorage,
// see CLAUDE.md/project convention). PUT shallow-merges `patch`'s top-level
// keys, so unrelated features can each own their own key.
export function fetchPreferences(): Promise<Record<string, unknown>> {
  return getJson<{ data: Record<string, unknown> }>('/api/preferences').then((r) => r.data);
}

export function updatePreferences(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return putJson<{ data: Record<string, unknown> }>('/api/preferences', { data: patch }).then((r) => r.data);
}

export function fetchAdminUsers(): Promise<AdminUserSummary[]> {
  return getJson<{ users: AdminUserSummary[] }>('/api/admin/users').then((r) => r.users);
}

export function updateAdminUser(
  id: number,
  patch: { pseudo?: string; plan?: Plan; isAdmin?: boolean; isActive?: boolean },
): Promise<PublicUser> {
  return patchJson<{ user: PublicUser }>(`/api/admin/users/${id}`, patch).then((r) => r.user);
}

export function sendAdminPasswordReset(id: number): Promise<void> {
  return apiCall(`/api/admin/users/${id}/send-password-reset`, 'POST');
}

export function deleteAdminUser(id: number): Promise<void> {
  return apiCall(`/api/admin/users/${id}`, 'DELETE');
}

export function fetchSiteSettings(): Promise<SiteSettings> {
  return getJson('/api/site-settings');
}

export function updateSiteSettings(patch: Partial<SiteSettings>): Promise<SiteSettings> {
  return patchJson('/api/admin/site-settings', patch);
}

export function fetchAdminTracks(): Promise<TrackCatalogEntry[]> {
  return getJson<{ tracks: TrackCatalogEntry[] }>('/api/admin/tracks').then((r) => r.tracks);
}

export function createAdminTrack(entry: { slug: string; name: string; country: string }): Promise<TrackCatalogEntry> {
  return postJson<TrackCatalogEntry>('/api/admin/tracks', entry);
}

export function updateAdminTrack(
  slug: string,
  patch: { name?: string; country?: string; dlcSlug?: string },
): Promise<TrackCatalogEntry> {
  return patchJson<TrackCatalogEntry>(`/api/admin/tracks/${encodeURIComponent(slug)}`, patch);
}

export function updateAdminTrackMapCalibration(
  slug: string,
  patch: { rotationDeg?: number; offsetX?: number; offsetY?: number; scale?: number },
): Promise<TrackCatalogEntry> {
  return patchJson<TrackCatalogEntry>(`/api/admin/tracks/${encodeURIComponent(slug)}/map-calibration`, patch);
}

async function uploadImage<T>(url: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file, file.name);
  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(tError((body as { error?: string }).error));
  }
  return res.json();
}

export function uploadTrackPhoto(slug: string, file: File): Promise<TrackCatalogEntry> {
  return uploadImage(`/api/admin/tracks/${encodeURIComponent(slug)}/photo`, file);
}

export function uploadTrackMap(slug: string, file: File): Promise<TrackCatalogEntry> {
  return uploadImage(`/api/admin/tracks/${encodeURIComponent(slug)}/map`, file);
}

// Not an image upload — the file is the track's .mas game content file,
// parsed server-side into an SVG map (see backend/src/masTrack.ts). Reuses
// uploadImage's generic FormData/error-handling plumbing regardless.
export function uploadTrackMapFromMas(slug: string, file: File): Promise<TrackCatalogEntry> {
  return uploadImage(`/api/admin/tracks/${encodeURIComponent(slug)}/map-from-mas`, file);
}

export function fetchCars(): Promise<CarCatalogEntry[]> {
  return getJson<{ cars: CarCatalogEntry[] }>('/api/cars').then((r) => r.cars);
}

export function fetchCarCatalogEntry(slug: string): Promise<CarCatalogEntry> {
  return getJson<CarCatalogEntry>(`/api/cars/${encodeURIComponent(slug)}`);
}

export function fetchAdminCars(): Promise<CarCatalogEntry[]> {
  return getJson<{ cars: CarCatalogEntry[] }>('/api/admin/cars').then((r) => r.cars);
}

export function fetchAdminLiveryMappings(): Promise<{ liveries: string[]; mappings: LiveryMapping[] }> {
  return getJson('/api/admin/livery-mappings');
}

export function setAdminLiveryMapping(liveryName: string, carSlug: string | null): Promise<void> {
  return putJson(`/api/admin/livery-mappings/${encodeURIComponent(liveryName)}`, { carSlug });
}

export function createAdminCar(entry: {
  slug: string;
  name: string;
  manufacturerSlug: string;
  category: CarCategory;
}): Promise<CarCatalogEntry> {
  return postJson<CarCatalogEntry>('/api/admin/cars', entry);
}

export function updateAdminCar(
  slug: string,
  patch: { name?: string; manufacturerSlug?: string; category?: CarCategory; dlcSlug?: string },
): Promise<CarCatalogEntry> {
  return patchJson<CarCatalogEntry>(`/api/admin/cars/${encodeURIComponent(slug)}`, patch);
}

export function uploadCarPhoto(slug: string, file: File): Promise<CarCatalogEntry> {
  return uploadImage(`/api/admin/cars/${encodeURIComponent(slug)}/photo`, file);
}

export function fetchManufacturers(): Promise<ManufacturerCatalogEntry[]> {
  return getJson<{ manufacturers: ManufacturerCatalogEntry[] }>('/api/manufacturers').then((r) => r.manufacturers);
}

export function fetchAdminManufacturers(): Promise<ManufacturerCatalogEntry[]> {
  return getJson<{ manufacturers: ManufacturerCatalogEntry[] }>('/api/admin/manufacturers').then((r) => r.manufacturers);
}

export function createAdminManufacturer(entry: { slug: string; name: string }): Promise<ManufacturerCatalogEntry> {
  return postJson<ManufacturerCatalogEntry>('/api/admin/manufacturers', entry);
}

export function updateAdminManufacturer(slug: string, patch: { name?: string }): Promise<ManufacturerCatalogEntry> {
  return patchJson<ManufacturerCatalogEntry>(`/api/admin/manufacturers/${encodeURIComponent(slug)}`, patch);
}

export function uploadManufacturerBadge(slug: string, file: File): Promise<ManufacturerCatalogEntry> {
  return uploadImage(`/api/admin/manufacturers/${encodeURIComponent(slug)}/badge`, file);
}

export function fetchAdminDlcs(): Promise<DlcCatalogEntry[]> {
  return getJson<{ dlcs: DlcCatalogEntry[] }>('/api/admin/dlcs').then((r) => r.dlcs);
}

export function createAdminDlc(entry: { slug: string; name: string; color: string }): Promise<DlcCatalogEntry> {
  return postJson<DlcCatalogEntry>('/api/admin/dlcs', entry);
}

export function updateAdminDlc(slug: string, patch: { name?: string; color?: string }): Promise<DlcCatalogEntry> {
  return patchJson<DlcCatalogEntry>(`/api/admin/dlcs/${encodeURIComponent(slug)}`, patch);
}
