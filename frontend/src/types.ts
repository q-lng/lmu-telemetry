export interface SessionSummary {
  file: string;
  track?: string;
  sessionType?: string;
  driverName?: string;
  carName?: string;
  recordingTime?: string;
  lapCount?: number;
  durationSeconds?: number;
}

export interface SessionMetadata {
  info: Record<string, string>;
  carSetup: unknown;
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
}

export interface ProfileSummary extends PublicUser {
  isFriend: boolean;
  isFollowing: boolean;
  requestState: 'none' | 'sent' | 'received';
  friendRequestId?: number;
}

export interface FriendRequestSummary {
  id: number;
  user: PublicUser;
  createdAt: string;
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
