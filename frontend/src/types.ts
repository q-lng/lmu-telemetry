import type { CarCategory } from './carCategories';

export interface SessionSummary {
  file: string;
  ownerId: number | null;
  ownerPseudo: string | null;
  uploadedAt: string;
  track?: string;
  sessionType?: string;
  driverName?: string;
  carName?: string;
  recordingTime?: string;
  lapCount?: number;
  durationSeconds?: number;
}

export type Plan = 'free' | 'vip';
export type ProfileVisibility = 'public' | 'private';
// Keys map 1:1 to frontend/src/fonts.ts's FONT_CATALOG and backend/src/siteSettings.ts's SITE_FONTS.
export type SiteFont =
  | 'system'
  | 'inter'
  | 'roboto'
  | 'poppins'
  | 'montserrat'
  | 'work-sans'
  | 'space-grotesk'
  | 'manrope'
  | 'oswald'
  | 'orbitron'
  | 'rajdhani'
  | 'bebas-neue'
  | 'playfair-display'
  | 'nunito'
  | 'outfit'
  | 'lexend'
  | 'barlow-condensed'
  | 'merriweather'
  | 'lora'
  | 'roboto-slab'
  | 'caveat';

// Keys map 1:1 to frontend/src/fonts.ts's DATA_FONT_CATALOG and backend/src/siteSettings.ts's DATA_FONTS.
// Monospace only — used for telemetry data displays (tables, numeric
// readouts) so columns/digits stay aligned regardless of which one is picked.
export type DataFont =
  | 'system-mono'
  | 'jetbrains-mono'
  | 'ibm-plex-mono'
  | 'space-mono'
  | 'roboto-mono'
  | 'fira-code'
  | 'source-code-pro'
  | 'dm-mono';

// Which of font/dataFont above the whole telemetry viewer page (sidebar +
// graph) uses, as one choice — see backend/src/siteSettings.ts.
export type TelemetryFontMode = 'site' | 'mono';

export interface SiteSettings {
  siteName: string;
  font: SiteFont;
  dataFont: DataFont;
  telemetryFont: TelemetryFontMode;
  fontSizeScale: number;
  defaultAccentColor: string;
  accentPresets: string[];
  neonGlowEnabled: boolean;
}

export interface StorageUsage {
  usedBytes: number;
  quotaBytes: number;
  plan: Plan;
}

export interface SessionMetadata {
  info: Record<string, string>;
  carSetup: unknown;
  // Present on /api/sessions/:file/metadata and /api/shared-lap/.../metadata
  // — the resolved real car (override, else livery mapping, else the raw
  // info.CarName livery) — see backend/src/carResolution.ts.
  resolvedCar?: string | null;
}

export type ChannelKind = 'continuous' | 'event';

export interface ChannelDescriptor {
  name: string;
  kind: ChannelKind;
  unit: string;
  frequency?: number;
  valueColumns: string[];
}

export interface ChannelSeries {
  name: string;
  kind: ChannelKind;
  unit: string;
  frequency?: number;
  valueColumns: string[];
  t: number[];
  values: Record<string, (number | boolean | null)[]>;
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
  // In-game LMU/RaceControl display name, deliberately separate from `pseudo`
  // (the site account username) — used to match this user against the
  // free-text DriverName recorded in telemetry files (see LeaderboardEntry).
  lmuPseudo: string | null;
}

export interface AdminUserSummary extends PublicUser {
  storage: StorageUsage;
}

export interface ProfileSummary extends PublicUser {
  isFriend: boolean;
  isFollowing: boolean;
  requestState: 'none' | 'sent' | 'received';
  friendRequestId?: number;
}

export interface TrackSearchResult {
  name: string;
  slug: string | null;
  country: string | null;
  photoExt: ImageExt | null;
}

export interface SearchResults {
  users: ProfileSummary[];
  tracks: TrackSearchResult[];
  // Cars search returns full catalog entries (not a slim search-result type)
  // since it's always a real catalog match now — see backend/src/cars.ts's
  // searchCars.
  cars: CarCatalogEntry[];
}

export type ImageExt = 'jpg' | 'png';

export interface TrackCatalogEntry {
  slug: string;
  name: string;
  country: string;
  photoExt: ImageExt | null;
  mapExt: ImageExt | null;
  dlcSlug: string | null;
  dlcName: string | null;
  dlcColor: string | null;
}

export interface CarCatalogEntry {
  slug: string;
  name: string;
  category: CarCategory;
  manufacturerSlug: string;
  manufacturer: string;
  photoExt: ImageExt | null;
  manufacturerBadgeExt: ImageExt | null;
  dlcSlug: string | null;
  dlcName: string | null;
  dlcColor: string | null;
}

export interface DlcCatalogEntry {
  slug: string;
  name: string;
  color: string;
}

export interface ManufacturerCatalogEntry {
  slug: string;
  name: string;
  badgeExt: ImageExt | null;
}

export interface FriendRequestSummary {
  id: number;
  user: PublicUser;
  createdAt: string;
}

export type NotificationType = 'friend_request' | 'follow';

export interface Notification {
  type: NotificationType;
  id: string;
  user: PublicUser;
  createdAt: string;
  read: boolean;
}

export interface LapInfo {
  lap: number;
  startTs: number;
  endTs: number;
  lapTime: number | null;
  elapsedTime: number;
}

export type Visibility = 'private' | 'friends' | 'public';
export type LapVisibility = 'friends' | 'public';

export interface FileRecord {
  filename: string;
  ownerId: number | null;
  visibility: Visibility;
  track: string | null;
  car: string | null;
  // Real car manually assigned by the owner, overriding the admin livery
  // mapping for this specific session — see backend/src/leaderboard.ts.
  carSlug: string | null;
  // Resolved display name (override, else livery mapping, else the raw
  // `car` livery above) — computed server-side, see resolveCarName.
  resolvedCar: string | null;
}

export interface LiveryMapping {
  liveryName: string;
  carSlug: string;
}

export interface LapShare {
  lapNumber: number;
  visibility: LapVisibility;
}

export interface SharedLapResult {
  filename: string;
  lapNumber: number;
  track: string | null;
  car: string | null;
}

// Not the same taxonomy as CarCategory (which distinguishes lmp2-wec/lmp2-elms
// via the cars catalog) — this comes from the DuckDB file's own metadata.CarClass
// value, normalized by a small alias map in backend/src/leaderboard.ts. LMP2 is
// intentionally one flat bucket here since telemetry can't tell WEC from ELMS.
export type LeaderboardClass = 'hypercar' | 'lmp2' | 'lmp3' | 'gte' | 'gt3' | 'unknown';

export interface LeaderboardEntry {
  track: string;
  carClass: LeaderboardClass;
  car: string | null;
  driverName: string | null;
  lapTime: number;
  lapNumber: number;
  filename: string;
  uploadedAt: string;
  // Set when driverName matches a registered user's lmuPseudo — lets the UI
  // link to that account and highlight when it's the current viewer.
  matchedUser: { pseudo: string } | null;
}

export interface ColumnStyle {
  label: string;
  color: string;
  dash?: number[];
}

export interface CompareSeries {
  t: number[]; // same grid as the lane's primary series.t
  values: Record<string, (number | null)[]>;
}

// A lap checked for comparison against the reference lap — `id` is a stable key
// (`${sourceId}:${lapNumber}`), `sourceId` is 'primary' (the open session) or an
// ExternalSource's id. Deliberately has no `color` field — color is derived
// purely from this lap's current position in the comparedLaps list (see
// TelemetryViewer's `comparedLapColorAt`), so toggling the same lap off and
// back on always gives it back the same color instead of drifting forward.
export interface ComparedLap {
  id: string;
  sourceId: string;
  lapNumber: number;
}

export interface LaneCompare {
  id: string; // matches the originating ComparedLap.id
  label: string;
  color: string;
  series: CompareSeries;
}

export interface Lane {
  key: string; // stable identity (React key, height persistence) — may be an opaque group id
  label: string; // human-readable name shown in the chart
  series: ChannelSeries;
  columnStyles: ColumnStyle[]; // same order/length as series.valueColumns
  compares: LaneCompare[]; // one entry per compared lap that has data for this lane, empty when none
  // When set, this lane renders as its own separate graph but stays visually
  // enclosed with every other lane sharing the same boxId (consecutive in the
  // lane list), under a header showing boxLabel — used for "ungrouped but
  // still boxed together" display (e.g. Pedals split into separate graphs).
  boxId?: string;
  boxLabel?: string;
  // Forces the Y-axis range to be symmetric around 0 (e.g. the delta-time
  // channel) instead of the usual tight fit around the actual data span.
  centerYOnZero?: boolean;
}
