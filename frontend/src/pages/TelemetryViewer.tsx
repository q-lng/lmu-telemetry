import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, TouchEvent as ReactTouchEvent } from 'react';
import { deleteSession, fetchSessions, setFileVisibility, setLapVisibility, uploadSession } from '../api';
import type {
  ChannelDescriptor,
  ChannelSeries,
  ComparedLap,
  CompareSeries,
  Lane,
  LaneCompare,
  LapInfo,
  LapVisibility,
  SessionMetadata,
  SessionSummary,
} from '../types';
import { createServerDataSource, createWasmDataSource, type DataSource } from '../dataSource';
import { ChannelPlot } from '../components/ChannelPlot';
import { TrackMap } from '../components/TrackMap';
import { TelemetryLegend } from '../components/TelemetryLegend';
import { SessionPickerModal } from '../components/SessionPickerModal';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { LaneSizeMenu } from '../components/LaneSizeMenu';
import { channelColor, comparedLapColor, CORNER_STYLE, REFERENCE_UNIFORM_COLOR } from '../palette';
import { resampleContinuous, resampleStep } from '../resample';
import { useAuth } from '../AuthContext';
import { usePreferences } from '../PreferencesContext';
import { t } from '../i18n';

const COMPARED_LAP_COLOR_SLOTS = 9;

// A second session opened just to borrow laps from it for comparison — has its
// own DataSource/laps/metadata, independent of the primary session's. Page-local
// (not in types.ts) since it carries a live DataSource handle, not a wire shape.
interface ExternalSource {
  id: string;
  label: string;
  dataSource: DataSource;
  laps: LapInfo[];
  metadata: SessionMetadata | null;
}

type ColorMode = 'byChannel' | 'byLap';

interface ChannelLayoutItem {
  type: 'channel';
  name: string;
  // Only meaningful for a multi-column (4-wheel corner) channel: true splits it
  // into one separate graph per column instead of the default combined overlay
  // with fixed corner color/dash — splitting is what lets each wheel become a
  // normal single-column lane, gaining full compared-lap + colorMode support
  // that the combined view deliberately doesn't have room for.
  splitCorners?: boolean;
}
interface GroupLayoutItem {
  type: 'group';
  id: string;
  name: string;
  channels: string[];
  // false = each member gets its own separate graph, still enclosed together in
  // a labeled box (see the `lanes` builder's boxId/boxLabel) — absent/true means
  // today's single combined-overlay lane. Only ever toggled via the UI for the
  // built-in Pedals group (see `special`); a user-made group (grouped via the
  // sidebar's "Group" button) is always fully combined, and fully dissolved
  // (not toggled) to go back to loose standalone channels.
  grouped?: boolean;
  // Marks the built-in Pedals group so the sidebar can show its extra
  // clutch/group-display toggles — not set on user-made groups.
  special?: 'pedals';
}
type LayoutItem = ChannelLayoutItem | GroupLayoutItem;

// Conventional colors for well-known channels — applied whenever these appear,
// standalone or inside a user-made group, instead of the generic cycling palette.
const KNOWN_COLORS: Record<string, string> = {
  'Throttle Pos': '#008300',
  'Throttle Pos Unfiltered': '#008300', // conventional throttle green
  'Brake Pos': '#e66767',
  'Brake Pos Unfiltered': '#e66767', // conventional brake red
  'Clutch Pos': '#3987e5',
  'Clutch Pos Unfiltered': '#3987e5',
};

const CLUTCH_CHANNEL = 'Clutch Pos Unfiltered';
// Display order when the Pedals group is split into separate graphs — brake
// above throttle, clutch (if enabled) last.
const PEDALS_SPLIT_ORDER = ['Brake Pos Unfiltered', 'Throttle Pos Unfiltered', CLUTCH_CHANNEL];

// Reserved synthetic channel name — never a real backend channel, special-cased
// throughout (excluded from selectedChannels' real fetch, built entirely
// client-side in the lanes builder from distRef + deltaByLapId).
const DELTA_CHANNEL_NAME = 'Delta Time';

const INITIAL_LAYOUT: LayoutItem[] = [
  { type: 'channel', name: 'Ground Speed' },
  { type: 'channel', name: 'Gear' },
  {
    type: 'group',
    id: 'default-pedals',
    name: t('tv.defaultGroupPedals'),
    channels: ['Throttle Pos Unfiltered', 'Brake Pos Unfiltered'],
    special: 'pedals',
  },
  { type: 'channel', name: 'Steering Pos' },
  { type: 'group', id: 'default-pits', name: 'In Pits / Speed Limiter', channels: ['In Pits', 'Speed Limiter'] },
];

// Relative flex-grow weights, not pixels — the graphs block always fills exactly
// the available height, so "all Tall" still fits the screen, evenly split.
const LANE_SIZE = { small: 1, medium: 1.5, tall: 2.5 };
const LANE_SIZE_OPTIONS = [
  { value: LANE_SIZE.small, label: t('tv.laneSizeSmall'), key: 'S' },
  { value: LANE_SIZE.medium, label: t('tv.laneSizeMedium'), key: 'M' },
  { value: LANE_SIZE.tall, label: t('tv.laneSizeTall'), key: 'L' },
];

const INITIAL_LANE_WEIGHTS: Record<string, number> = {
  'Ground Speed': LANE_SIZE.tall,
  Gear: LANE_SIZE.small,
  'default-pedals': LANE_SIZE.tall,
  'Steering Pos': LANE_SIZE.medium,
  'default-pits': LANE_SIZE.small,
  [DELTA_CHANNEL_NAME]: LANE_SIZE.small,
};

function buildCombinedSeries(names: string[], seriesByName: Record<string, ChannelSeries>, name: string): ChannelSeries {
  const members = names.map((n) => seriesByName[n]);

  // Same-rate continuous channels (e.g. Throttle/Brake) share an identical time
  // grid already (same frequency + start offset — see docs/SCHEMA.md), so no
  // resampling is needed: just zip their value arrays together as-is.
  if (members.every((m) => m.kind === 'continuous')) {
    const values: Record<string, (number | boolean | null)[]> = {};
    names.forEach((n, i) => (values[n] = members[i].values.value));
    return { name, unit: members[0].unit, kind: 'continuous', valueColumns: names, t: members[0].t, values };
  }

  // At least one member is an event channel with its own independent, sparse
  // timestamps (e.g. In Pits + Speed Limiter) — reusing one member's raw t/values
  // as-is for the others is wrong (their arrays don't correspond index-for-index
  // at all), and forcing kind:'continuous' also linearly interpolates what should
  // be a step function (0/1 states drawn as diagonal ramps). Build the union of
  // every member's own change timestamps, then hold-last-value resample each
  // member onto it — same technique used for the distance axis / lap compare.
  const gridSet = new Set<number>();
  members.forEach((m) => m.t.forEach((t) => gridSet.add(t)));
  const grid = Array.from(gridSet).sort((a, b) => a - b);
  const values: Record<string, (number | boolean | null)[]> = {};
  names.forEach((n, i) => {
    values[n] = resampleStep(members[i].t, members[i].values.value, grid);
  });
  return { name, unit: members[0].unit, kind: 'event', valueColumns: names, t: grid, values };
}

/** Combines each member channel's own (single-column) compare data into one
 * CompareSeries keyed by channel name, matching buildCombinedSeries' shape —
 * so a grouped lane's comparison overlay shows every member, not just one. */
function buildCombinedCompare(
  names: string[],
  compareByName: Record<string, CompareSeries>,
  seriesByName: Record<string, ChannelSeries>,
  targetGrid: number[],
): CompareSeries | null {
  if (!names.every((n) => compareByName[n])) return null;

  // Same fast-path as buildCombinedSeries: same-rate continuous members' compare
  // data is already aligned to an identical grid, no resampling needed.
  if (names.every((n) => seriesByName[n]?.kind === 'continuous')) {
    const first = compareByName[names[0]];
    const values: Record<string, (number | null)[]> = {};
    names.forEach((n) => {
      const c = compareByName[n];
      const col = Object.keys(c.values)[0];
      values[n] = c.values[col];
    });
    return { t: first.t, values };
  }

  // Otherwise each member's compare data is aligned to ITS OWN individual grid
  // (not the group's combined union grid) — hold-last-value resample every
  // member onto the primary combined series' final grid instead of zipping
  // mismatched arrays together.
  const values: Record<string, (number | null)[]> = {};
  names.forEach((n) => {
    const c = compareByName[n];
    const col = Object.keys(c.values)[0];
    values[n] = resampleStep(c.t, c.values[col], targetGrid);
  });
  return { t: targetGrid, values };
}

/** Resamples "Lap Dist" onto `t`'s own time grid to get a distance-per-sample x-axis. */
/** Lap time for display: the official value, or — when the game invalidated the
 * lap (lapTime 0/null, e.g. track limits) — the raw elapsed duration instead, so
 * an invalid lap isn't just blank. */
function displayLapTime(l: LapInfo): { seconds: number; official: boolean } {
  return l.lapTime ? { seconds: l.lapTime, official: true } : { seconds: l.elapsedTime, official: false };
}

/** CompareSeries values are number|null only (no booleans) — same conversion
 * resampleStep normally does internally, needed here since event channels skip
 * resampling at this stage (see alignEventCompares). */
function toNumericOrNull(values: (number | boolean | null)[]): (number | null)[] {
  return values.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v));
}

function toDistanceX(t: number[], distRef: ChannelSeries | null): number[] {
  if (!distRef) return t;
  const refValues = distRef.values.value as (number | null)[];
  const firstValid = refValues.find((v) => v != null) ?? 0;
  const lastValid = [...refValues].reverse().find((v) => v != null) ?? firstValid;
  const dist = resampleContinuous(distRef.t, refValues, t);
  return dist.map((d, i) => {
    if (d != null) return d;
    // Outside distRef's own domain (a few edge samples only): clamp to its nearest
    // known boundary instead of falling back to `t[i]` — that's a TIME value, and
    // mixing it into a distance array corrupts monotonicity (a multi-thousand-meter
    // drop right at the edge, since the fallback seconds value is tiny by comparison).
    return t[i] < distRef.t[0] ? firstValid : lastValid;
  });
}

/**
 * The "Lap" event boundary and the point where "Lap Dist" actually resets to 0
 * don't always coincide exactly (confirmed offset of ~0.5s / ~30-50m on some
 * tracks/cars) — fetching [lap.startTs, lap.endTs] can then straddle a reset,
 * mixing the tail of the previous lap with the start of the next one. This finds
 * the actual reset points nearest the nominal boundaries and uses those instead.
 */
async function findDistanceLapRange(
  ds: DataSource,
  nominalStart: number,
  nominalEnd: number,
): Promise<{ from: number; to: number }> {
  const PAD = 5;
  const s = await ds.fetchChannelSeries('Lap Dist', {
    from: Math.max(0, nominalStart - PAD),
    to: nominalEnd + PAD,
  });
  const values = s.values.value as (number | null)[];
  const resets: number[] = [];
  for (let i = 1; i < s.t.length; i++) {
    const v = values[i];
    const prev = values[i - 1];
    if (v != null && prev != null && v < prev - 100) resets.push(s.t[i]);
  }
  function nearest(target: number, exclude?: number): number {
    let best = target;
    let bestDiff = Infinity;
    for (const r of resets) {
      if (r === exclude) continue;
      const diff = Math.abs(r - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = r;
      }
    }
    return best;
  }
  if (resets.length === 0) return { from: nominalStart, to: nominalEnd };
  const trueStart = nearest(nominalStart);
  const trueEnd = nearest(nominalEnd, trueStart);
  // `to` is an inclusive bound server-side — nudge it just under the next lap's
  // reset sample so that first (~0m) sample doesn't tack a false "reset" onto
  // the tail of this lap's window.
  return { from: trueStart, to: trueEnd - 0.01 };
}

/** Inverts a lap's own (time, distance) pairs — which naturally give distance
 * as a function of time — into time as a function of distance, by reusing
 * resampleContinuous with the two roles swapped: distance becomes the "source
 * x domain" (ascending within one isolated lap window, same assumption
 * findDistanceLapRange/toDistanceX already rely on) and time becomes the
 * "source values" resampled onto the query distances. Used by the delta-time
 * channel: "how long did this lap take to reach distance d" for each of the
 * reference lap's own distance samples, for every compared lap. */
function invertTimeAtDistance(
  t: number[],
  distanceValues: (number | null)[],
  queryDistances: (number | null)[],
): (number | null)[] {
  // resampleContinuous walks its source array assuming it's sorted ascending —
  // Lap Dist is *mostly* monotonic within one isolated lap, but any local
  // blip (off-track excursion, GPS noise) breaks that assumption right there,
  // producing one wildly wrong interpolated time at that distance. Since this
  // feeds a "find the largest |delta|" axis-scaling step downstream, a single
  // such point is enough to blow out the whole chart's Y range — drop
  // anything that doesn't strictly increase over the last kept sample instead
  // of feeding it to the resampler.
  const cleanDist: number[] = [];
  const cleanTime: number[] = [];
  for (let i = 0; i < t.length; i++) {
    const d = distanceValues[i];
    if (d == null) continue;
    if (cleanDist.length > 0 && d <= cleanDist[cleanDist.length - 1]) continue;
    cleanDist.push(d);
    cleanTime.push(t[i]);
  }
  const validIdx: number[] = [];
  const validQuery: number[] = [];
  queryDistances.forEach((d, i) => {
    if (d != null) {
      validIdx.push(i);
      validQuery.push(d);
    }
  });
  const resampled = resampleContinuous(cleanDist, cleanTime, validQuery);
  const out: (number | null)[] = new Array(queryDistances.length).fill(null);
  validIdx.forEach((originalIdx, k) => {
    out[originalIdx] = resampled[k];
  });
  return out;
}

interface DisplayPreset {
  layout: LayoutItem[];
  laneWeights: Record<string, number>;
  xAxisMode: 'time' | 'distance';
}

const PRESETS_STORAGE_KEY = 'lmu-telemetry-presets';

// Reserved dropdown value for the built-in default view (INITIAL_LAYOUT/
// INITIAL_LANE_WEIGHTS) — always present regardless of what's in `presets`,
// never stored there, never deletable.
const DEFAULT_PRESET_VALUE = '__default__';

function isValidLayoutItem(item: unknown): item is LayoutItem {
  if (typeof item !== 'object' || item === null) return false;
  const it = item as Record<string, unknown>;
  if (it.type === 'channel') return typeof it.name === 'string';
  if (it.type === 'group') {
    return (
      typeof it.id === 'string' &&
      typeof it.name === 'string' &&
      Array.isArray(it.channels) &&
      it.channels.every((c) => typeof c === 'string')
    );
  }
  return false;
}

/** A preset is arbitrary JSON a user saved into localStorage — the app's own
 * shape for it can (and did) drift across releases, so a stale/corrupt entry
 * must never be blindly handed to setLayout/setLaneWeights, which downstream
 * code assumes is well-formed. Invalid entries are dropped (and the cleaned
 * set re-saved) instead of crashing the whole app the moment they're applied. */
function isValidPreset(value: unknown): value is DisplayPreset {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.layout) &&
    v.layout.every(isValidLayoutItem) &&
    typeof v.laneWeights === 'object' &&
    v.laneWeights !== null &&
    (v.xAxisMode === 'time' || v.xAxisMode === 'distance')
  );
}

function loadPresets(): Record<string, DisplayPreset> {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const valid: Record<string, DisplayPreset> = {};
    let droppedAny = false;
    for (const [name, preset] of Object.entries(parsed as Record<string, unknown>)) {
      if (isValidPreset(preset)) valid[name] = preset;
      else droppedAny = true;
    }
    if (droppedAny) savePresets(valid);
    return valid;
  } catch {
    return {};
  }
}

function savePresets(presets: Record<string, DisplayPreset>) {
  localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
}

export default function TelemetryViewer() {
  const { user } = useAuth();
  const { preferences, setPreference } = usePreferences();
  const preferredReferenceLapColor = preferences.referenceLapColor as string | undefined;
  const preferredComparedLapColors = preferences.comparedLapColors as string[] | undefined;
  // Per-section sidebar collapse state — backend-stored like every other
  // preference (never localStorage), keyed by a short section id.
  const sidebarCollapsed = (preferences.sidebarCollapsed as Record<string, boolean> | undefined) ?? {};
  function toggleSidebarSection(key: string) {
    setPreference('sidebarCollapsed', { ...sidebarCollapsed, [key]: !sidebarCollapsed[key] });
  }
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false);
  // Guest mode: a .duckdb file opened straight in the browser via DuckDB-WASM —
  // no upload, no server round-trip at all. Picking a server session clears it.
  const [guestFile, setGuestFile] = useState<File | null>(null);
  const [guestState, setGuestState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  // "Publier" turns a guest file into a real server upload at the exact moment the
  // user asks for it — guest mode's whole point (no server round-trip) stops there,
  // not before, since "public"/"friends" visibility is meaningless without the
  // server actually having the data to serve to others.
  const [publishVisibility, setPublishVisibility] = useState<LapVisibility>('public');
  const [publishScope, setPublishScope] = useState<'file' | 'lap'>('file');
  const [publishState, setPublishState] = useState<{ busy: boolean; error: string | null; done: boolean }>({
    busy: false,
    error: null,
    done: false,
  });
  const [dataSource, setDataSource] = useState<DataSource | null>(null);
  const [metadata, setMetadata] = useState<SessionMetadata | null>(null);
  const [channels, setChannels] = useState<ChannelDescriptor[]>([]);
  const [laps, setLaps] = useState<LapInfo[]>([]);
  const [selectedLap, setSelectedLap] = useState<number | 'full'>('full');
  const [xAxisMode, setXAxisMode] = useState<'time' | 'distance'>('time');
  const [layout, setLayout] = useState<LayoutItem[]>(INITIAL_LAYOUT);
  // Apply the saved Pedals grouped/clutch preference once, as soon as it's
  // loaded (preferences load async, after INITIAL_LAYOUT's own defaults have
  // already rendered) — guarded so it never clobbers the user's own later
  // toggles once applied (or for guests/fresh accounts, where it just never fires).
  const appliedPedalsPrefsRef = useRef(false);
  useEffect(() => {
    if (appliedPedalsPrefsRef.current) return;
    if (preferences.pedalsGrouped === undefined && preferences.pedalsClutch === undefined) return;
    appliedPedalsPrefsRef.current = true;
    setLayout((prev) =>
      prev.map((item) => {
        if (item.type !== 'group' || item.special !== 'pedals') return item;
        const grouped = typeof preferences.pedalsGrouped === 'boolean' ? preferences.pedalsGrouped : item.grouped;
        const wantsClutch = !!preferences.pedalsClutch;
        const hasClutch = item.channels.includes(CLUTCH_CHANNEL);
        const channels =
          wantsClutch === hasClutch
            ? item.channels
            : wantsClutch
              ? [...item.channels, CLUTCH_CHANNEL]
              : item.channels.filter((c) => c !== CLUTCH_CHANNEL);
        return { ...item, grouped, channels };
      }),
    );
  }, [preferences]);
  // Same pattern for the delta-time channel: whether it's shown, and (once the
  // user drags it somewhere) which position to restore it at — defaults to the
  // top (index 0) the first time it's ever enabled.
  const appliedDeltaPrefsRef = useRef(false);
  useEffect(() => {
    if (appliedDeltaPrefsRef.current) return;
    if (preferences.deltaChannelShown === undefined) return;
    appliedDeltaPrefsRef.current = true;
    if (preferences.deltaChannelShown === true) {
      const idx = typeof preferences.deltaChannelIndex === 'number' ? preferences.deltaChannelIndex : 0;
      setLayout((prev) => {
        if (prev.some((it) => it.type === 'channel' && it.name === DELTA_CHANNEL_NAME)) return prev;
        const next = [...prev];
        next.splice(Math.min(Math.max(idx, 0), next.length), 0, { type: 'channel', name: DELTA_CHANNEL_NAME });
        return next;
      });
    }
  }, [preferences]);
  // Whenever the layout changes, remember the delta channel's current position
  // (if shown) so re-enabling it later restores where the user last dragged it
  // to, instead of always resetting to the top.
  useEffect(() => {
    const idx = layout.findIndex((it) => it.type === 'channel' && it.name === DELTA_CHANNEL_NAME);
    if (idx !== -1) setPreference('deltaChannelIndex', idx);
  }, [layout]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // Live-reorder preview while a drag is in flight — NOT `layout` itself.
  // `layout` feeds selectedChannels/the fetch effects/the whole lanes
  // builder, so committing every single dragover step straight into it (as
  // the previous implementation did) re-triggered a full channel refetch on
  // every pixel of mouse movement during a fast drag — overlapping requests,
  // races, and (once enough piled up) the loading state getting stuck.
  // `dragLayout` is purely cosmetic for the "channels shown" list; the real
  // `layout` only updates once, on drop. Mirrored into a ref so onDragEnd
  // always reads the latest value regardless of React's render timing.
  const [dragLayout, setDragLayout] = useState<LayoutItem[] | null>(null);
  const dragLayoutRef = useRef<LayoutItem[] | null>(null);
  function updateDragLayout(next: LayoutItem[] | null) {
    dragLayoutRef.current = next;
    setDragLayout(next);
  }
  const [groupSelection, setGroupSelection] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [seriesByName, setSeriesByName] = useState<Record<string, ChannelSeries>>({});
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [comparesByLapId, setComparesByLapId] = useState<Record<string, Record<string, CompareSeries>>>({});
  // Delta-time channel: one array per compared lap, sharing distRef's own time
  // grid — see invertTimeAtDistance and the fetch effect below.
  const [deltaByLapId, setDeltaByLapId] = useState<Record<string, (number | null)[]>>({});
  const [distRef, setDistRef] = useState<ChannelSeries | null>(null);
  const [gps, setGps] = useState<{ t: number[]; lat: number[]; lon: number[] } | null>(null);
  const [cursorT, setCursorT] = useState<number | null>(null);
  // Click-to-freeze: a click on any graph pins the cursor there so the legend/
  // in-graph values/track map keep showing that point after the mouse moves
  // away; clicking again anywhere unlocks. Uses the updater form of setState so
  // this stays correct even called from a stale closure captured by ChannelPlot's
  // uPlot-rebuild effect (see cursorLockRef there).
  const [cursorLocked, setCursorLocked] = useState(false);
  function handleGraphClick(value: number) {
    setCursorLocked((prevLocked) => {
      if (prevLocked) return false;
      setCursorT(value);
      return true;
    });
  }
  const [viewRange, setViewRange] = useState<{ min: number; max: number } | null>(null);
  const [uploadState, setUploadState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const [deleteState, setDeleteState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const [laneWeights, setLaneWeights] = useState<Record<string, number>>(INITIAL_LANE_WEIGHTS);
  const [presets, setPresets] = useState<Record<string, DisplayPreset>>(() => loadPresets());
  const [selectedPreset, setSelectedPreset] = useState('');
  const [presetName, setPresetName] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const touchStartX = useRef<number | null>(null);

  function handleTouchStart(e: ReactTouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function handleTouchEnd(e: ReactTouchEvent) {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx > 60 && touchStartX.current < 40) setSidebarOpen(true);
    else if (dx < -60 && sidebarOpen) setSidebarOpen(false);
    touchStartX.current = null;
  }
  // Multi-lap comparison: any number of laps checked against the reference lap,
  // each either from this same (primary) session or from a separately-opened
  // "external source" session (server session or local guest file) — e.g.
  // comparing your own two laps, plus a friend's fastest lap from another file.
  const [comparedLaps, setComparedLaps] = useState<ComparedLap[]>([]);
  const [colorMode, setColorMode] = useState<ColorMode>('byChannel');
  const [colorPrefsOpen, setColorPrefsOpen] = useState(false);
  // Preferences load async — apply the saved color mode once, as soon as it
  // arrives, without clobbering any toggle the user makes before/after that.
  const appliedColorModeRef = useRef(false);
  useEffect(() => {
    if (appliedColorModeRef.current) return;
    if (preferences.colorMode !== 'byChannel' && preferences.colorMode !== 'byLap') return;
    appliedColorModeRef.current = true;
    setColorMode(preferences.colorMode);
  }, [preferences]);
  function setColorModeAndSave(mode: ColorMode) {
    setColorMode(mode);
    setPreference('colorMode', mode);
  }

  const [externalSources, setExternalSources] = useState<ExternalSource[]>([]);
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [addSourceState, setAddSourceState] = useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  });
  const addSourceGuestFileInputRef = useRef<HTMLInputElement>(null);

  // Color is purely a function of a compared lap's CURRENT position in the list
  // (matching the "compared lap 1/2/3..." color preferences) — never stored, so
  // toggling the same lap off and back on always gives it back the same color,
  // and editing a color preference updates every currently-selected lap live.
  function comparedLapColorAt(index: number): string {
    return preferredComparedLapColors?.[index] ?? comparedLapColor(index);
  }

  function isLapCompared(sourceId: string, lapNumber: number): boolean {
    return comparedLaps.some((cl) => cl.sourceId === sourceId && cl.lapNumber === lapNumber);
  }

  function toggleComparedLap(sourceId: string, lapNumber: number) {
    setComparedLaps((prev) => {
      if (prev.some((cl) => cl.sourceId === sourceId && cl.lapNumber === lapNumber)) {
        return prev.filter((cl) => !(cl.sourceId === sourceId && cl.lapNumber === lapNumber));
      }
      const id = `${sourceId}:${lapNumber}`;
      return [...prev, { id, sourceId, lapNumber }];
    });
  }

  async function addExternalSource(file: File | string) {
    setAddSourceState({ busy: true, error: null });
    try {
      const id = crypto.randomUUID();
      const ds = typeof file === 'string' ? createServerDataSource(file) : await createWasmDataSource(file);
      const label =
        typeof file === 'string' ? sessions.find((s) => s.file === file)?.track ?? file : file.name;
      const [sourceLaps, sourceMetadata] = await Promise.all([ds.fetchLaps(), ds.fetchMetadata()]);
      setExternalSources((prev) => [...prev, { id, label, dataSource: ds, laps: sourceLaps, metadata: sourceMetadata }]);
      setAddSourceState({ busy: false, error: null });
      setAddSourceOpen(false);
    } catch (err) {
      setAddSourceState({ busy: false, error: (err as Error).message });
    }
  }

  function removeExternalSource(id: string) {
    const source = externalSources.find((s) => s.id === id);
    source?.dataSource.close?.();
    setExternalSources((prev) => prev.filter((s) => s.id !== id));
    setComparedLaps((prev) => prev.filter((cl) => cl.sourceId !== id));
  }

  function resolveComparedLapSource(cl: ComparedLap): { ds: DataSource; lapInfo: LapInfo } | null {
    if (cl.sourceId === 'primary') {
      if (!dataSource) return null;
      const lapInfo = laps.find((l) => l.lap === cl.lapNumber);
      return lapInfo ? { ds: dataSource, lapInfo } : null;
    }
    const source = externalSources.find((s) => s.id === cl.sourceId);
    if (!source) return null;
    const lapInfo = source.laps.find((l) => l.lap === cl.lapNumber);
    return lapInfo ? { ds: source.dataSource, lapInfo } : null;
  }

  function comparedLapLabel(cl: ComparedLap): string {
    const base = t('lap.number', { n: cl.lapNumber });
    if (cl.sourceId === 'primary') return base;
    const source = externalSources.find((s) => s.id === cl.sourceId);
    return source ? `${base} (${source.label})` : base;
  }

  function applyPreset(name: string) {
    if (name === DEFAULT_PRESET_VALUE) {
      setLayout(INITIAL_LAYOUT);
      setLaneWeights(INITIAL_LANE_WEIGHTS);
      setXAxisMode('time');
      return;
    }
    const preset = presets[name];
    if (!preset) return;
    setLayout(preset.layout);
    setLaneWeights(preset.laneWeights);
    setXAxisMode(preset.xAxisMode);
  }

  function saveCurrentAsPreset() {
    const name = presetName.trim();
    if (!name) return;
    const next = { ...presets, [name]: { layout, laneWeights, xAxisMode } };
    setPresets(next);
    savePresets(next);
    setSelectedPreset(name);
    setPresetName('');
  }

  function deletePreset(name: string) {
    if (name === DEFAULT_PRESET_VALUE) return;
    const next = { ...presets };
    delete next[name];
    setPresets(next);
    savePresets(next);
    if (selectedPreset === name) setSelectedPreset('');
  }

  const selectedChannels = useMemo(
    () =>
      layout
        .flatMap((it) => (it.type === 'channel' ? [it.name] : it.channels))
        .filter((name) => name !== DELTA_CHANNEL_NAME),
    [layout],
  );

  function reloadSessions(selectFile?: string) {
    fetchSessions().then((s) => {
      setSessions(s);
      // Only ever select a session explicitly (a deep link's ?file=, or the
      // file just uploaded) — never auto-pick one just because the list is
      // non-empty; the user chooses from the dropdown themselves otherwise.
      if (selectFile) {
        setGuestFile(null);
        setSelectedFile(selectFile);
      }
    });
  }

  useEffect(() => {
    // Lets a link from the search page (?file=...) open directly on that session.
    const params = new URLSearchParams(window.location.search);
    reloadSessions(params.get('file') ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build the active DataSource: a locally-opened guest file (DuckDB-WASM, no
  // server involved) takes priority over a server-selected session.
  useEffect(() => {
    let cancelled = false;
    if (guestFile) {
      setGuestState({ busy: true, error: null });
      createWasmDataSource(guestFile)
        .then((ds) => {
          if (cancelled) return;
          setDataSource(ds);
          setGuestState({ busy: false, error: null });
        })
        .catch((err) => {
          if (cancelled) return;
          setGuestState({ busy: false, error: (err as Error).message });
          setGuestFile(null);
        });
    } else if (selectedFile) {
      setDataSource(createServerDataSource(selectedFile));
    } else {
      setDataSource(null);
    }
    return () => {
      cancelled = true;
    };
  }, [guestFile, selectedFile]);

  // Release the previous DataSource's resources (closes the WASM connection —
  // no-op for a server source) whenever we switch to a different one.
  useEffect(() => {
    return () => {
      dataSource?.close?.();
    };
  }, [dataSource]);

  useEffect(() => {
    if (!dataSource) return;
    setMetadata(null);
    setChannels([]);
    setLaps([]);
    setSelectedLap('full');
    // A new primary file makes any previously-picked comparison laps/sources meaningless.
    setComparedLaps([]);
    setExternalSources((prev) => {
      prev.forEach((s) => s.dataSource.close?.());
      return [];
    });
    Promise.all([dataSource.fetchMetadata(), dataSource.fetchChannels(), dataSource.fetchLaps()]).then(
      ([m, c, l]) => {
        setMetadata(m);
        setChannels(c);
        setLaps(l);
      },
    );
  }, [dataSource]);

  const range = useMemo(() => {
    if (selectedLap === 'full') return undefined;
    const lap = laps.find((l) => l.lap === selectedLap);
    return lap ? { from: lap.startTs, to: lap.endTs } : undefined;
  }, [selectedLap, laps]);

  // In distance mode, the nominal [lap.startTs, lap.endTs] window can straddle the
  // real "Lap Dist" reset point (see findDistanceLapRange) — recompute the true
  // window whenever that matters, and use it in place of `range` for every fetch.
  const [distanceRange, setDistanceRange] = useState<{ from: number; to: number } | null>(null);
  useEffect(() => {
    if (!dataSource || !range || xAxisMode !== 'distance') {
      setDistanceRange(null);
      return;
    }
    let cancelled = false;
    findDistanceLapRange(dataSource, range.from, range.to).then((r) => {
      if (!cancelled) setDistanceRange(r);
    });
    return () => {
      cancelled = true;
    };
  }, [dataSource, range, xAxisMode]);

  const effectiveRange = xAxisMode === 'distance' && range ? (distanceRange ?? range) : range;

  // Drop any zoom window from a previous lap/session/axis mode — it's meaningless
  // once the underlying data range changes; each ChannelPlot reports a fresh one
  // (the new full range) right after it remounts with the new data.
  useEffect(() => {
    setViewRange(null);
  }, [effectiveRange, xAxisMode]);

  // Primary lap data — time shifted to start at 0 when a specific lap is selected.
  useEffect(() => {
    if (!dataSource) return;
    let cancelled = false;
    setSeriesLoading(true);
    const offset = effectiveRange ? effectiveRange.from : 0;
    Promise.all(selectedChannels.map((name) => dataSource.fetchChannelSeries(name, effectiveRange))).then(
      (results) => {
        if (cancelled) return;
        const next: Record<string, ChannelSeries> = {};
        results.forEach((s) => (next[s.name] = { ...s, t: s.t.map((x) => x - offset) }));
        setSeriesByName(next);
        setSeriesLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [dataSource, selectedChannels, effectiveRange]);

  // Distance reference for the "Distance" x-axis mode: always "Lap Dist" (resets
  // to 0 at every start/finish line crossing), even in full-session view — so the
  // x-axis reads as track position, repeating each lap, rather than an
  // ever-growing cumulative total.
  useEffect(() => {
    if (!dataSource) return;
    let cancelled = false;
    const offset = effectiveRange ? effectiveRange.from : 0;
    dataSource.fetchChannelSeries('Lap Dist', effectiveRange).then((s) => {
      if (cancelled) return;
      setDistRef({ ...s, t: s.t.map((x) => x - offset) });
    });
    return () => {
      cancelled = true;
    };
  }, [dataSource, effectiveRange]);

  useEffect(() => {
    if (!dataSource) return;
    let cancelled = false;
    const offset = effectiveRange ? effectiveRange.from : 0;
    Promise.all([
      dataSource.fetchChannelSeries('GPS Latitude', effectiveRange),
      dataSource.fetchChannelSeries('GPS Longitude', effectiveRange),
    ]).then(([latS, lonS]) => {
      if (cancelled) return;
      setGps({ t: latS.t.map((x) => x - offset), lat: latS.values.value as number[], lon: lonS.values.value as number[] });
    });
    return () => {
      cancelled = true;
    };
  }, [dataSource, effectiveRange]);

  // Compared laps — every value column resampled onto the reference lap's
  // x-grid (multi-column/4-wheel channels included: each column is fetched and
  // resampled the same way, the corner-split display just picks out one at a
  // time — see the lanes builder). In time mode that's elapsed-time alignment;
  // in distance mode it MUST be aligned by track position instead (each
  // compared lap's own Lap Dist), or a lap with different pace just shows its
  // value at a mismatched point on the track.
  useEffect(() => {
    if (!dataSource || selectedLap === 'full' || comparedLaps.length === 0) {
      setComparesByLapId({});
      return;
    }
    const targets = selectedChannels.filter((name) => seriesByName[name]);
    const useDistance = xAxisMode === 'distance';
    let cancelled = false;

    async function runForLap(cl: ComparedLap): Promise<[string, Record<string, CompareSeries>] | null> {
      const resolved = resolveComparedLapSource(cl);
      if (!resolved) return null;
      const { ds, lapInfo } = resolved;

      const lapRange = useDistance
        ? await findDistanceLapRange(ds, lapInfo.startTs, lapInfo.endTs)
        : { from: lapInfo.startTs, to: lapInfo.endTs };
      const lapOffset = lapRange.from;

      const [lapDistRaw, ...results] = await Promise.all([
        useDistance ? ds.fetchChannelSeries('Lap Dist', lapRange).catch(() => null) : Promise.resolve(null),
        ...targets.map((name) =>
          ds
            .fetchChannelSeries(name, lapRange)
            .then((s) => ({ name, s }))
            .catch(() => null),
        ),
      ]);
      const lapDistRef = lapDistRaw ? { ...lapDistRaw, t: lapDistRaw.t.map((x) => x - lapOffset) } : null;

      const perChannel: Record<string, CompareSeries> = {};
      // A channel missing from the comparison source (different car/track) just
      // resolves to null above and is skipped rather than breaking the whole compare.
      // Every value column is resampled the same way — a multi-column (4-wheel)
      // channel just means more than one entry in `values`, all sharing one `t`.
      (results.filter(Boolean) as { name: string; s: ChannelSeries }[]).forEach(({ name, s }) => {
        const tRel = s.t.map((x) => x - lapOffset);
        const primary = seriesByName[name];
        const values: Record<string, (number | null)[]> = {};

        if (useDistance && lapDistRef) {
          const lapDist = toDistanceX(tRel, lapDistRef);
          if (s.kind === 'continuous') {
            const primaryDist = toDistanceX(primary.t, distRef);
            s.valueColumns.forEach((col) => {
              values[col] = resampleContinuous(lapDist, s.values[col] as (number | null)[], primaryDist);
            });
            perChannel[name] = { t: primaryDist, values };
          } else {
            // Event/step channel (Gear, In Pits, ...): only has a sample at each
            // change, on its OWN timing — resampling straight onto the reference
            // lap's own sparse points here would silently discard this lap's real
            // change points, snapping them onto wherever the reference happens to
            // change instead. Keep this lap's own timestamps (just axis-converted)
            // and defer the final hold-last-value resample to the lanes builder's
            // alignEventCompares, once every compared lap's own points are known.
            s.valueColumns.forEach((col) => {
              values[col] = toNumericOrNull(s.values[col]);
            });
            perChannel[name] = { t: lapDist, values };
          }
        } else if (s.kind === 'continuous') {
          const grid = primary.t;
          s.valueColumns.forEach((col) => {
            values[col] = resampleContinuous(tRel, s.values[col] as (number | null)[], grid);
          });
          perChannel[name] = { t: grid, values };
        } else {
          s.valueColumns.forEach((col) => {
            values[col] = toNumericOrNull(s.values[col]);
          });
          perChannel[name] = { t: tRel, values };
        }
      });
      return [cl.id, perChannel];
    }

    Promise.all(comparedLaps.map(runForLap)).then((entries) => {
      if (cancelled) return;
      const next: Record<string, Record<string, CompareSeries>> = {};
      entries.forEach((entry) => {
        if (entry) next[entry[0]] = entry[1];
      });
      setComparesByLapId(next);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSource, externalSources, comparedLaps, selectedChannels, selectedLap, seriesByName, xAxisMode, distRef]);

  // Delta-time channel — independent of xAxisMode (the underlying math always
  // needs distance-based correspondence between laps, regardless of which axis
  // is currently displayed), only computed when the channel is actually toggled
  // on. Each compared lap's own Lap Dist is fetched over ITS OWN
  // distance-corrected range and inverted (see invertTimeAtDistance) to get
  // "time at distance d" for each of the reference's own distance samples, then
  // delta = that compared-lap time minus the reference's own elapsed time there.
  const deltaChannelShown = layout.some((it) => it.type === 'channel' && it.name === DELTA_CHANNEL_NAME);
  useEffect(() => {
    if (!deltaChannelShown || !dataSource || selectedLap === 'full' || comparedLaps.length === 0 || !distRef) {
      setDeltaByLapId({});
      return;
    }
    const refDist = distRef.values.value as (number | null)[];
    let cancelled = false;

    async function computeForLap(cl: ComparedLap): Promise<[string, (number | null)[]] | null> {
      const resolved = resolveComparedLapSource(cl);
      if (!resolved) return null;
      const { ds, lapInfo } = resolved;
      const lapRange = await findDistanceLapRange(ds, lapInfo.startTs, lapInfo.endTs);
      const lapOffset = lapRange.from;
      const s = await ds.fetchChannelSeries('Lap Dist', lapRange).catch(() => null);
      if (!s) return null;
      const tRel = s.t.map((x) => x - lapOffset);
      const timeAtRefDist = invertTimeAtDistance(tRel, s.values.value as (number | null)[], refDist);
      const delta = timeAtRefDist.map((tc, i) => (tc == null || distRef == null ? null : tc - distRef.t[i]));
      return [cl.id, delta];
    }

    Promise.all(comparedLaps.map(computeForLap)).then((entries) => {
      if (cancelled) return;
      const next: Record<string, (number | null)[]> = {};
      entries.forEach((entry) => {
        if (entry) next[entry[0]] = entry[1];
      });
      setDeltaByLapId(next);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deltaChannelShown, dataSource, externalSources, comparedLaps, selectedLap, distRef]);

  function toggleChannel(name: string) {
    // Keep the "shown" preference in sync regardless of which UI affordance
    // removes/adds it (the dedicated checkbox, or the generic "✕" in the
    // "Channels shown" list) — delegate to the same function either way.
    if (name === DELTA_CHANNEL_NAME) {
      toggleDeltaChannel();
      return;
    }
    setLayout((prev) => {
      const standaloneIdx = prev.findIndex((it) => it.type === 'channel' && it.name === name);
      if (standaloneIdx >= 0) return prev.filter((_, i) => i !== standaloneIdx);

      const groupIdx = prev.findIndex((it) => it.type === 'group' && it.channels.includes(name));
      if (groupIdx >= 0) {
        const group = prev[groupIdx] as GroupLayoutItem;
        const remaining = group.channels.filter((c) => c !== name);
        const next = [...prev];
        if (remaining.length >= 2) next[groupIdx] = { ...group, channels: remaining };
        else if (remaining.length === 1) next[groupIdx] = { type: 'channel', name: remaining[0] };
        else next.splice(groupIdx, 1);
        return next;
      }

      return [...prev, { type: 'channel', name }];
    });
  }

  // Pure — used to compute the live drag preview (dragLayout) without
  // touching the committed `layout` state on every dragover step.
  function reorderedList(list: LayoutItem[], from: number, to: number): LayoutItem[] {
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  }

  function removeItem(index: number) {
    setLayout((prev) => prev.filter((_, i) => i !== index));
  }

  function dissolveGroup(index: number) {
    setLayout((prev) => {
      const item = prev[index];
      if (item.type !== 'group') return prev;
      const expanded: LayoutItem[] = item.channels.map((c) => ({ type: 'channel', name: c }));
      const next = [...prev];
      next.splice(index, 1, ...expanded);
      return next;
    });
  }

  function renameGroup(index: number, name: string) {
    setLayout((prev) => {
      const item = prev[index];
      if (item.type !== 'group') return prev;
      const next = [...prev];
      next[index] = { ...item, name };
      return next;
    });
  }

  function togglePedalsClutch(index: number) {
    const item = layout[index];
    if (item.type !== 'group') return;
    const has = item.channels.includes(CLUTCH_CHANNEL);
    setPreference('pedalsClutch', !has);
    setLayout((prev) => {
      const cur = prev[index];
      if (cur.type !== 'group') return prev;
      const channels = has ? cur.channels.filter((c) => c !== CLUTCH_CHANNEL) : [...cur.channels, CLUTCH_CHANNEL];
      const next = [...prev];
      next[index] = { ...cur, channels };
      return next;
    });
  }

  function togglePedalsGrouped(index: number) {
    const item = layout[index];
    if (item.type !== 'group') return;
    const grouped = item.grouped === false ? true : false;
    setPreference('pedalsGrouped', grouped);
    setLayout((prev) => {
      const cur = prev[index];
      if (cur.type !== 'group') return prev;
      const next = [...prev];
      next[index] = { ...cur, grouped };
      return next;
    });
  }

  function toggleCornerSplit(index: number) {
    setLayout((prev) => {
      const cur = prev[index];
      if (cur.type !== 'channel') return prev;
      const next = [...prev];
      next[index] = { ...cur, splitCorners: !cur.splitCorners };
      return next;
    });
  }

  // A layout item can render as more than one lane (a split multi-column
  // channel, an ungrouped-but-boxed group) — mirrors the lanes builder's own
  // key generation so a size choice applies to every lane that item actually
  // produces, not just its first one.
  function laneKeysForItem(item: LayoutItem): string[] {
    if (item.type === 'channel') {
      if (item.name === DELTA_CHANNEL_NAME) return [DELTA_CHANNEL_NAME];
      const series = seriesByName[item.name];
      if (series && series.valueColumns.length > 1 && item.splitCorners) {
        return series.valueColumns.map((col) => `${item.name}__${col}`);
      }
      return [item.name];
    }
    if (item.grouped === false) {
      return item.channels.map((c) => `${item.id}__${c}`);
    }
    return [item.id];
  }

  function sizeOfItem(item: LayoutItem): number {
    return laneWeights[laneKeysForItem(item)[0]] ?? LANE_SIZE.medium;
  }

  function setItemSize(item: LayoutItem, size: number) {
    const keys = laneKeysForItem(item);
    setLaneWeights((prev) => {
      const next = { ...prev };
      keys.forEach((k) => {
        next[k] = size;
      });
      return next;
    });
  }

  function toggleDeltaChannel() {
    const isShown = layout.some((it) => it.type === 'channel' && it.name === DELTA_CHANNEL_NAME);
    setPreference('deltaChannelShown', !isShown);
    if (isShown) {
      setLayout((prev) => prev.filter((it) => !(it.type === 'channel' && it.name === DELTA_CHANNEL_NAME)));
    } else {
      const savedIdx = typeof preferences.deltaChannelIndex === 'number' ? preferences.deltaChannelIndex : 0;
      setLayout((prev) => {
        const next = [...prev];
        next.splice(Math.min(Math.max(savedIdx, 0), next.length), 0, { type: 'channel', name: DELTA_CHANNEL_NAME });
        return next;
      });
    }
  }

  function toggleGroupSelection(name: string) {
    setGroupSelection((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function groupSelected() {
    setLayout((prev) => {
      const names = prev.filter((it) => it.type === 'channel' && groupSelection.has(it.name)).map((it) => (it as ChannelLayoutItem).name);
      if (names.length < 2) return prev;
      const firstIdx = prev.findIndex((it) => it.type === 'channel' && groupSelection.has(it.name));
      const insertAt = prev.slice(0, firstIdx).filter((it) => !(it.type === 'channel' && groupSelection.has(it.name))).length;
      const filtered = prev.filter((it) => !(it.type === 'channel' && groupSelection.has(it.name)));
      const group: GroupLayoutItem = { type: 'group', id: crypto.randomUUID(), name: names.join(' + '), channels: names };
      const next = [...filtered];
      next.splice(insertAt, 0, group);
      return next;
    });
    setGroupSelection(new Set());
  }

  async function handleUpload(file: File) {
    setUploadState({ busy: true, error: null });
    try {
      const { file: savedName } = await uploadSession(file);
      reloadSessions(savedName);
      setUploadState({ busy: false, error: null });
      setSessionPickerOpen(false);
    } catch (err) {
      setUploadState({ busy: false, error: (err as Error).message });
    }
  }

  async function handleDeleteSession(file: string) {
    setDeleteState({ busy: true, error: null });
    try {
      await deleteSession(file);
      if (selectedFile === file) setSelectedFile(null);
      reloadSessions();
      setDeleteState({ busy: false, error: null });
    } catch (err) {
      setDeleteState({ busy: false, error: (err as Error).message });
    }
  }

  async function handlePublish() {
    if (!guestFile) return;
    setPublishState({ busy: true, error: null, done: false });
    try {
      const { file: savedName } = await uploadSession(guestFile);
      if (publishScope === 'lap' && selectedLap !== 'full') {
        await setLapVisibility(savedName, selectedLap, publishVisibility);
      } else {
        await setFileVisibility(savedName, publishVisibility);
      }
      setPublishState({ busy: false, error: null, done: true });
    } catch (err) {
      setPublishState({ busy: false, error: (err as Error).message, done: false });
    }
  }

  function setLaneWeight(key: string, weight: number) {
    setLaneWeights((prev) => ({ ...prev, [key]: weight }));
  }

  const filteredChannels = channels.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()));
  // lapTime can be 0 on an anomalous/incomplete lap (seen on some files) — exclude
  // those from "fastest lap" consideration.
  function fastestLapOf(list: LapInfo[]): LapInfo | null {
    return list.filter((l) => l.lapTime).reduce<LapInfo | null>(
      (best, l) => (best === null || l.lapTime! < best.lapTime!) ? l : best,
      null,
    );
  }
  function trackMismatchFor(sourceMetadata: SessionMetadata | null): boolean {
    return (
      !!metadata?.info.TrackName &&
      !!sourceMetadata?.info.TrackName &&
      metadata.info.TrackName !== sourceMetadata.info.TrackName
    );
  }
  const validGroupSelection = new Set([...groupSelection].filter((n) => layout.some((it) => it.type === 'channel' && it.name === n)));
  // What the "channels shown" list actually renders — a live preview during
  // an active drag (see dragLayout above), the committed order otherwise.
  const displayLayout = dragLayout ?? layout;

  // Distance only ever makes sense for a single lap: "Lap Dist" resets to 0 at
  // every start/finish crossing, so across multiple laps it's a sawtooth — which
  // breaks uPlot's fundamental assumption that x is strictly ascending. Derived
  // (not just gated in the UI) so a loaded preset or stale state can't sneak an
  // invalid combination through.
  const effectiveXAxisMode: 'time' | 'distance' = selectedLap === 'full' ? 'time' : xAxisMode;

  // Shared X-axis domain for every lane, derived from distRef (a dense, always-
  // fetched continuous channel — "Lap Dist") rather than letting each ChannelPlot
  // auto-range from its OWN data. Without this, a sparse event channel (Gear, In
  // Pits...) whose own timestamps don't span the full lap window gets a narrower
  // default scale than dense channels — cursor.sync maps position via each plot's
  // OWN scale, so the same instant lands on a different pixel until a zoom forces
  // uPlot to sync them to the identical [min,max] via attachZoomPan.
  const xDomain = useMemo<[number, number] | null>(() => {
    if (!distRef || distRef.t.length === 0) return null;
    function minMax(values: (number | null)[]): [number, number] | null {
      let min = Infinity;
      let max = -Infinity;
      for (const v of values) {
        if (v == null) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      return isFinite(min) && isFinite(max) ? [min, max] : null;
    }
    if (effectiveXAxisMode === 'distance') return minMax(distRef.values.value as (number | null)[]);
    return minMax(distRef.t);
  }, [distRef, effectiveXAxisMode]);

  // Memoized so a bare cursor move (very high frequency) never rebuilds lane objects —
  // that would otherwise tear down and recreate every uPlot canvas on each mousemove.
  const lanes: Lane[] = useMemo(() => {
    const result: Lane[] = [];
    let colorIdx = 0;
    function nextColor(name: string): string {
      // "By lap" mode: every reference channel shares one neutral color, so the
      // eye follows compared-lap colors instead of per-channel hues — including
      // ignoring the throttle/brake/clutch conventional-color overrides below.
      if (colorMode === 'byLap') return preferredReferenceLapColor ?? REFERENCE_UNIFORM_COLOR;
      return KNOWN_COLORS[name] ?? channelColor(colorIdx++);
    }

    function withXAxis(series: ChannelSeries): ChannelSeries {
      if (effectiveXAxisMode !== 'distance') return series;
      return { ...series, t: toDistanceX(series.t, distRef) };
    }

    function buildLaneCompares(names: string[], targetSeries: ChannelSeries): LaneCompare[] {
      const out: LaneCompare[] = [];
      comparedLaps.forEach((cl, index) => {
        const perChannel = comparesByLapId[cl.id];
        if (!perChannel) return;
        const series = names.length === 1
          ? perChannel[names[0]] ?? null
          : buildCombinedCompare(names, perChannel, seriesByName, targetSeries.t);
        if (!series) return;
        out.push({ id: cl.id, label: comparedLapLabel(cl), color: comparedLapColorAt(index), series });
      });
      return out;
    }

    // Picks a single column out of a multi-column channel's already-fetched
    // compare data (comparesByLapId is keyed by CHANNEL name, e.g. "Brakes
    // Force", with one CompareSeries covering all its wheel columns together)
    // — used when a corner-split lane needs just its own wheel's data, not
    // buildLaneCompares' "names[0] IS the top-level key" assumption.
    function buildCornerCompares(channelName: string, col: string): LaneCompare[] {
      const out: LaneCompare[] = [];
      comparedLaps.forEach((cl, index) => {
        const cmp = comparesByLapId[cl.id]?.[channelName];
        const colValues = cmp?.values[col];
        if (!cmp || !colValues) return;
        out.push({
          id: cl.id,
          label: comparedLapLabel(cl),
          color: comparedLapColorAt(index),
          series: { t: cmp.t, values: { [col]: colValues } },
        });
      });
      return out;
    }

    // Single-column event channels (Gear, In Pits, ...) only have a sample at
    // each change — each compare's own change-point timestamps were preserved
    // as-is (see the compare-fetch effect above), so build the union of the
    // reference's own points and every compared lap's own points, then
    // hold-last-value resample EVERYTHING (reference included) onto that
    // shared grid. Otherwise a compared lap's changes would only ever show up
    // at whichever points the reference happens to change.
    function alignEventCompares(series: ChannelSeries, compares: LaneCompare[]): { series: ChannelSeries; compares: LaneCompare[] } {
      if (series.kind !== 'event' || compares.length === 0) return { series, compares };
      const col = series.valueColumns[0];
      const gridSet = new Set<number>(series.t);
      compares.forEach((cmp) => cmp.series.t.forEach((x) => gridSet.add(x)));
      const grid = Array.from(gridSet).sort((a, b) => a - b);
      const alignedSeries: ChannelSeries = {
        ...series,
        t: grid,
        values: { ...series.values, [col]: resampleStep(series.t, series.values[col], grid) },
      };
      const alignedCompares = compares.map((cmp) => {
        const compareValues = cmp.series.values[col];
        if (!compareValues) return cmp;
        return { ...cmp, series: { t: grid, values: { [col]: resampleStep(cmp.series.t, compareValues, grid) } } };
      });
      return { series: alignedSeries, compares: alignedCompares };
    }

    for (const item of layout) {
      if (item.type === 'group') {
        const present = item.channels.filter((c) => seriesByName[c]);
        if (present.length === 0) continue;
        if (item.grouped === false) {
          // Ungrouped-but-boxed: each member is its own separate lane/graph, but
          // tagged with the same boxId so the render layer keeps them visually
          // enclosed together under the group's name instead of scattering them
          // into the general layout.
          const orderedPresent =
            item.special === 'pedals'
              ? [...present].sort((a, b) => PEDALS_SPLIT_ORDER.indexOf(a) - PEDALS_SPLIT_ORDER.indexOf(b))
              : present;
          orderedPresent.forEach((c) => {
            const rawSeries = withXAxis(seriesByName[c]);
            const { series, compares } = alignEventCompares(rawSeries, buildLaneCompares([c], rawSeries));
            result.push({
              key: `${item.id}__${c}`,
              label: c,
              series,
              columnStyles: [{ label: c, color: nextColor(c) }],
              compares,
              boxId: item.id,
              boxLabel: item.name,
            });
          });
          continue;
        }
        if (present.length === 1) {
          const c = present[0];
          const rawSeries = withXAxis(seriesByName[c]);
          const { series, compares } = alignEventCompares(rawSeries, buildLaneCompares([c], rawSeries));
          result.push({
            key: item.id,
            label: item.name,
            series,
            columnStyles: [{ label: c, color: nextColor(c) }],
            compares,
          });
        } else {
          // withXAxis first: compare data is already aligned to each member's own
          // post-axis-conversion grid (time or distance, whichever is active), so
          // buildCombinedCompare needs the group's grid in that same space to
          // resample onto — not the raw pre-conversion time grid.
          const combined = withXAxis(buildCombinedSeries(present, seriesByName, item.name));
          result.push({
            key: item.id,
            label: item.name,
            series: combined,
            columnStyles: present.map((c) => ({ label: c, color: nextColor(c) })),
            compares: buildLaneCompares(present, combined),
          });
        }
      } else if (item.name === DELTA_CHANNEL_NAME) {
        // Synthetic, entirely client-side: one column per compared lap (no
        // separate "reference" line — a lap's delta-to-itself is trivially 0),
        // sharing distRef's own time grid so it flows through withXAxis exactly
        // like any real channel for both time and distance display modes.
        if (selectedLap === 'full' || comparedLaps.length === 0 || !distRef) continue;
        const values: Record<string, (number | null)[]> = {};
        comparedLaps.forEach((cl) => {
          values[cl.id] = deltaByLapId[cl.id] ?? distRef.t.map(() => null);
        });
        const deltaSeries: ChannelSeries = {
          name: DELTA_CHANNEL_NAME,
          kind: 'continuous',
          unit: 's',
          valueColumns: comparedLaps.map((cl) => cl.id),
          t: distRef.t,
          values,
        };
        result.push({
          key: DELTA_CHANNEL_NAME,
          label: t('tv.deltaChannelLabel'),
          series: withXAxis(deltaSeries),
          columnStyles: comparedLaps.map((cl, index) => ({ label: comparedLapLabel(cl), color: comparedLapColorAt(index) })),
          compares: [],
          centerYOnZero: true,
        });
      } else {
        const series = seriesByName[item.name];
        if (!series) continue;
        const isMulti = series.valueColumns.length > 1;
        const withAxis = withXAxis(series);
        if (isMulti && item.splitCorners) {
          // Split: each wheel becomes a fully normal single-column lane (same
          // path every other channel goes through), so it gets real compared-
          // lap overlays and respects colorMode — the combined view's fixed
          // corner color/dash can't accommodate either without losing the
          // FL/FR/RL/RR identity it exists for.
          series.valueColumns.forEach((col, i) => {
            const colLabel = CORNER_STYLE[i]?.label ?? col;
            const key = `${item.name}__${col}`;
            const singleSeries: ChannelSeries = {
              name: key,
              kind: series.kind,
              unit: series.unit,
              valueColumns: [col],
              t: withAxis.t,
              values: { [col]: withAxis.values[col] },
            };
            const { series: finalSeries, compares } = alignEventCompares(singleSeries, buildCornerCompares(item.name, col));
            result.push({
              key,
              label: colLabel,
              series: finalSeries,
              columnStyles: [{ label: colLabel, color: nextColor(key) }],
              compares,
              boxId: item.name,
              boxLabel: item.name,
            });
          });
          continue;
        }
        const columnStyles = isMulti
          ? CORNER_STYLE.slice(0, series.valueColumns.length)
          : [{ label: item.name, color: nextColor(item.name) }];
        // 4-wheel channels (isMulti), combined view: fixed corner color/dash
        // regardless of compare/colorMode — see the split branch above for
        // the alternative that supports both.
        const { series: finalSeries, compares } = isMulti
          ? { series: withAxis, compares: [] as LaneCompare[] }
          : alignEventCompares(withAxis, buildLaneCompares([item.name], withAxis));
        result.push({
          key: item.name,
          label: item.name,
          series: finalSeries,
          columnStyles,
          compares,
        });
      }
    }

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    layout,
    seriesByName,
    comparesByLapId,
    deltaByLapId,
    comparedLaps,
    selectedLap,
    colorMode,
    preferredReferenceLapColor,
    preferredComparedLapColors,
    externalSources,
    effectiveXAxisMode,
    distRef,
  ]);

  const gpsX = gps ? (effectiveXAxisMode === 'distance' ? toDistanceX(gps.t, distRef) : gps.t) : [];
  // Global column order for the legend table — a lane missing data for one of
  // these (e.g. a channel absent from an external source) just shows a dash,
  // rather than each lane inventing its own column order.
  const comparedLapColumns = comparedLaps.map((cl, index) => ({
    id: cl.id,
    label: comparedLapLabel(cl),
    color: comparedLapColorAt(index),
  }));

  const currentSession = selectedFile ? sessions.find((s) => s.file === selectedFile) : undefined;
  const currentSessionLabel = currentSession
    ? `${currentSession.track ?? currentSession.file} — ${currentSession.sessionType} (${currentSession.recordingTime})`
    : selectedFile;

  function channelPlotFor(lane: Lane, flatIndex: number) {
    return (
      <ChannelPlot
        key={lane.key}
        lane={lane}
        syncKey="telemetry"
        showXAxis={flatIndex === lanes.length - 1}
        xAxisMode={effectiveXAxisMode}
        weight={laneWeights[lane.key] ?? LANE_SIZE.medium}
        allWeights={laneWeights}
        xDomain={xDomain}
        viewRange={viewRange}
        cursorT={cursorT}
        cursorLocked={cursorLocked}
        onWeightChange={setLaneWeight}
        onCursorMove={setCursorT}
        onCursorClick={handleGraphClick}
        onViewRangeChange={setViewRange}
      />
    );
  }

  // Consecutive lanes sharing a boxId (see the `lanes` builder's "ungrouped but
  // boxed" case) render as separate graphs enclosed in one labeled container,
  // instead of scattering into the general flat list.
  const laneElements: ReactNode[] = [];
  {
    let i = 0;
    while (i < lanes.length) {
      const lane = lanes[i];
      if (lane.boxId) {
        const boxId = lane.boxId;
        const boxLabel = lane.boxLabel ?? lane.label;
        const startIndex = i;
        const members: Lane[] = [];
        while (i < lanes.length && lanes[i].boxId === boxId) {
          members.push(lanes[i]);
          i++;
        }
        const boxWeight = members.reduce((sum, l) => sum + (laneWeights[l.key] ?? LANE_SIZE.medium), 0);
        laneElements.push(
          <div key={boxId} className="lane-box" style={{ flexGrow: boxWeight }}>
            <div className="lane-box-label">{boxLabel}</div>
            <div className="lane-box-lanes">{members.map((l, k) => channelPlotFor(l, startIndex + k))}</div>
          </div>,
        );
      } else {
        laneElements.push(channelPlotFor(lane, i));
        i++;
      }
    }
  }

  return (
    <div className="app" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <aside className={`sidebar${sidebarOpen ? '' : ' collapsed'}`}>
        <div className="sidebar-inner">
        <h1>{t('tv.sidebarTitle')}</h1>

        <div className="field">
          {t('tv.session')}
          <button
            className="upload-btn"
            disabled={!!guestFile}
            onClick={() => setSessionPickerOpen(true)}
          >
            {currentSessionLabel ?? t('tv.loadSessionButton')}
          </button>
        </div>

        {sessionPickerOpen && (
          <SessionPickerModal
            sessions={sessions}
            onSelect={(file) => {
              setGuestFile(null);
              setSelectedFile(file);
              setSessionPickerOpen(false);
            }}
            onClose={() => setSessionPickerOpen(false)}
            uploadState={uploadState}
            onUploadFile={handleUpload}
            guestState={guestState}
            onOpenGuestFile={(file) => {
              setGuestFile(file);
              setSessionPickerOpen(false);
            }}
            deleteState={deleteState}
            onDeleteSession={handleDeleteSession}
          />
        )}

        {guestFile && (
          <div className="field">
            <div className="guest-active">
              {t('tv.guestModePrefix')}
              <strong>{guestFile.name}</strong>
            </div>
            <button className="upload-btn" onClick={() => setGuestFile(null)}>
              {t('tv.closeGuestMode')}
            </button>
          </div>
        )}

        {guestFile && user && (
          <div className="field">
            {t('tv.publishSession')}
            <label className="compare-source-toggle">
              <input
                type="checkbox"
                checked={publishScope === 'lap'}
                disabled={selectedLap === 'full'}
                onChange={(e) => setPublishScope(e.target.checked ? 'lap' : 'file')}
              />
              {t('tv.publishSelectedLapOnly')}
              {selectedLap === 'full' && t('tv.publishSelectLapHint')}
            </label>
            <div className="segmented">
              <button
                className={publishVisibility === 'friends' ? 'active' : ''}
                onClick={() => setPublishVisibility('friends')}
              >
                {t('visibility.friends')}
              </button>
              <button
                className={publishVisibility === 'public' ? 'active' : ''}
                onClick={() => setPublishVisibility('public')}
              >
                {t('visibility.public')}
              </button>
            </div>
            <button className="upload-btn" disabled={publishState.busy} onClick={handlePublish}>
              {publishState.busy ? t('tv.publishing') : t('tv.publish')}
            </button>
            {publishState.error && <div className="upload-error">{publishState.error}</div>}
            {publishState.done && <div className="field-hint">{t('tv.publishDone')}</div>}
          </div>
        )}

        {dataSource && (
        <>
        <CollapsibleSection
          title={t('tv.presetLabel')}
          collapsed={!!sidebarCollapsed.presets}
          onToggle={() => toggleSidebarSection('presets')}
        >
          <div className="preset-row">
            <select
              value={selectedPreset}
              onChange={(e) => {
                setSelectedPreset(e.target.value);
                if (e.target.value) applyPreset(e.target.value);
              }}
            >
              <option value="">{t('tv.presetLoadPlaceholder')}</option>
              <option value={DEFAULT_PRESET_VALUE}>{t('tv.presetDefaultName')}</option>
              {Object.keys(presets).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <button
              disabled={!selectedPreset || selectedPreset === DEFAULT_PRESET_VALUE}
              onClick={() => deletePreset(selectedPreset)}
              title={t('tv.presetDelete')}
            >
              ✕
            </button>
          </div>
          <div className="preset-row">
            <input
              placeholder={t('tv.presetNamePlaceholder')}
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
            />
            <button disabled={!presetName.trim()} onClick={saveCurrentAsPreset}>
              {t('tv.presetSave')}
            </button>
          </div>
        </CollapsibleSection>

        {metadata && (
          <CollapsibleSection
            title={t('tv.sessionInfoLabel')}
            collapsed={!!sidebarCollapsed.sessionInfo}
            onToggle={() => toggleSidebarSection('sessionInfo')}
          >
          <div className="info-panel">
            <div>
              <strong>{t('tv.infoDriver')}</strong> {metadata.info.DriverName}
            </div>
            <div>
              <strong>{t('tv.infoTrack')}</strong> {metadata.info.TrackName}
            </div>
            <div>
              <strong>{t('tv.infoCar')}</strong> {metadata.info.CarName} ({metadata.info.CarClass})
            </div>
            <div>
              <strong>{t('tv.infoWeather')}</strong> {metadata.info.WeatherConditions}
            </div>
            <div>
              <strong>{t('tv.infoSession')}</strong> {metadata.info.SessionType} @ {metadata.info.SessionTime}
            </div>
          </div>
          </CollapsibleSection>
        )}

        <CollapsibleSection
          title={t('tv.xAxisLabel')}
          collapsed={!!sidebarCollapsed.xAxis}
          onToggle={() => toggleSidebarSection('xAxis')}
        >
        <label className="field">
          <div className="segmented">
            <button className={xAxisMode === 'time' ? 'active' : ''} onClick={() => setXAxisMode('time')}>
              {t('tv.xAxisTime')}
            </button>
            <button
              className={xAxisMode === 'distance' ? 'active' : ''}
              disabled={selectedLap === 'full'}
              title={selectedLap === 'full' ? t('tv.xAxisDistanceDisabledTooltip') : undefined}
              onClick={() => setXAxisMode('distance')}
            >
              {t('tv.xAxisDistance')}
            </button>
          </div>
          {selectedLap === 'full' && <span className="field-hint">{t('tv.xAxisDistanceHint')}</span>}
        </label>
        </CollapsibleSection>

        <CollapsibleSection
          title={t('tv.lapsTableLabel')}
          collapsed={!!sidebarCollapsed.laps}
          onToggle={() => toggleSidebarSection('laps')}
        >
        <div className="field">
          {selectedLap === 'full' && <span className="field-hint">{t('tv.selectReferenceLapHint')}</span>}
          <table className="lap-select-table">
            <thead>
              <tr>
                <th />
                <th title={t('tv.referenceColumnHeader')}>{t('tv.referenceColumnHeader')}</th>
                <th title={t('tv.comparedColumnHeader')}>{t('tv.comparedColumnHeader')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t('tv.fullSession')}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedLap === 'full'}
                    onChange={() => {
                      setSelectedLap('full');
                      setXAxisMode('time');
                    }}
                  />
                </td>
                <td />
              </tr>
              {laps.map((l) => {
                const lt = displayLapTime(l);
                const isReference = selectedLap === l.lap;
                return (
                  <tr key={l.lap}>
                    <td>
                      {t('lap.number', { n: l.lap })} — {lt.seconds.toFixed(3)}s{lt.official ? '' : t('lap.invalidSuffix')}
                      {l.lap === fastestLapOf(laps)?.lap ? t('lap.fastestSuffix') : ''}
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={isReference}
                        onChange={() => {
                          setSelectedLap(l.lap);
                          // The new reference lap can't also be a compared lap from this same session.
                          setComparedLaps((prev) => prev.filter((cl) => !(cl.sourceId === 'primary' && cl.lapNumber === l.lap)));
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        disabled={selectedLap === 'full' || isReference}
                        checked={isLapCompared('primary', l.lap)}
                        onChange={() => toggleComparedLap('primary', l.lap)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </CollapsibleSection>

        <CollapsibleSection
          title={t('tv.colorModeLabel')}
          collapsed={!!sidebarCollapsed.colorMode}
          onToggle={() => toggleSidebarSection('colorMode')}
        >
        <label className="field">
          <div className="segmented">
            <button className={colorMode === 'byChannel' ? 'active' : ''} onClick={() => setColorModeAndSave('byChannel')}>
              {t('tv.colorModeByChannel')}
            </button>
            <button className={colorMode === 'byLap' ? 'active' : ''} onClick={() => setColorModeAndSave('byLap')}>
              {t('tv.colorModeByLap')}
            </button>
            {/* Compared-lap colors apply in both modes (only the reference-lap
                coloring is byLap-specific), so this isn't gated on colorMode. */}
            <button
              className={colorPrefsOpen ? 'active' : ''}
              onClick={() => setColorPrefsOpen((o) => !o)}
              title={t('tv.colorPrefsToggle')}
            >
              ⚙
            </button>
          </div>
        </label>

        {colorPrefsOpen && (
          <div className="field color-prefs">
            {colorMode === 'byLap' && (
              <label className="color-pref-row">
                <input
                  type="color"
                  value={preferredReferenceLapColor ?? REFERENCE_UNIFORM_COLOR}
                  onChange={(e) => setPreference('referenceLapColor', e.target.value)}
                />
                {t('tv.referenceLapColorLabel')}
              </label>
            )}
            {Array.from({ length: COMPARED_LAP_COLOR_SLOTS }, (_, i) => (
              <label key={i} className="color-pref-row">
                <input
                  type="color"
                  value={preferredComparedLapColors?.[i] ?? comparedLapColor(i)}
                  onChange={(e) => {
                    const next = [...(preferredComparedLapColors ?? [])];
                    next[i] = e.target.value;
                    setPreference('comparedLapColors', next);
                  }}
                />
                {t('tv.comparedLapColorLabel', { n: i + 1 })}
              </label>
            ))}
            {!user && <span className="field-hint">{t('tv.colorPrefsGuestHint')}</span>}
          </div>
        )}
        </CollapsibleSection>

        <CollapsibleSection
          title={t('tv.additionalSessionsLabel')}
          collapsed={!!sidebarCollapsed.compare}
          onToggle={() => toggleSidebarSection('compare')}
        >
        <div className="field">
          {externalSources.map((source) => {
            const sourceFastest = fastestLapOf(source.laps);
            return (
              <div key={source.id} className="compare-external-source">
                <div className="compare-external-source-header">
                  <strong>{source.label}</strong>
                  <button onClick={() => removeExternalSource(source.id)} title={t('tv.removeSource')}>
                    ✕
                  </button>
                </div>
                {trackMismatchFor(source.metadata) && (
                  <div className="field-hint compare-warning">
                    {t('tv.trackMismatch', { track1: metadata?.info.TrackName, track2: source.metadata?.info.TrackName })}
                  </div>
                )}
                <div className="compared-laps-list">
                  {source.laps.map((l) => {
                    const lt = displayLapTime(l);
                    return (
                      <label key={l.lap} className="channel-checkbox">
                        <input
                          type="checkbox"
                          disabled={selectedLap === 'full'}
                          checked={isLapCompared(source.id, l.lap)}
                          onChange={() => toggleComparedLap(source.id, l.lap)}
                        />
                        {t('lap.number', { n: l.lap })} — {lt.seconds.toFixed(3)}s{lt.official ? '' : t('lap.invalidSuffix')}
                        {l.lap === sourceFastest?.lap ? t('lap.fastestSuffix') : ''}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {addSourceOpen ? (
            <div className="compare-file-picker">
              <select
                value=""
                disabled={addSourceState.busy}
                onChange={(e) => {
                  if (e.target.value) addExternalSource(e.target.value);
                }}
              >
                <option value="">{t('tv.chooseSessionPlaceholder')}</option>
                {sessions
                  .filter((s) => s.file !== selectedFile)
                  .map((s) => (
                    <option key={s.file} value={s.file}>
                      {s.track ?? s.file} — {s.sessionType} ({s.recordingTime})
                    </option>
                  ))}
              </select>
              <button
                className="upload-btn"
                disabled={addSourceState.busy}
                onClick={() => addSourceGuestFileInputRef.current?.click()}
              >
                {addSourceState.busy ? t('tv.guestLoading') : t('tv.orOpenLocalFile')}
              </button>
              <input
                ref={addSourceGuestFileInputRef}
                type="file"
                accept=".duckdb"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) addExternalSource(file);
                  e.target.value = '';
                }}
              />
              <button onClick={() => setAddSourceOpen(false)}>{t('common.cancel')}</button>
              {addSourceState.error && <div className="upload-error">{addSourceState.error}</div>}
            </div>
          ) : (
            <button className="upload-btn" onClick={() => setAddSourceOpen(true)}>
              {t('tv.addAnotherSession')}
            </button>
          )}
        </div>
        </CollapsibleSection>

        <CollapsibleSection
          title={t('tv.channelsShown')}
          collapsed={!!sidebarCollapsed.channelsShown}
          onToggle={() => toggleSidebarSection('channelsShown')}
        >
        <label className="channel-checkbox">
          <input
            type="checkbox"
            disabled={selectedLap === 'full' || comparedLaps.length === 0}
            checked={layout.some((it) => it.type === 'channel' && it.name === DELTA_CHANNEL_NAME)}
            onChange={toggleDeltaChannel}
            title={selectedLap === 'full' || comparedLaps.length === 0 ? t('tv.deltaChannelHint') : undefined}
          />
          {t('tv.deltaChannelToggle')}
        </label>

        {layout.length > 0 && (
          <div className="field">
            <div className="selected-list">
              {displayLayout.map((item, i) => (
                <div
                  className={`selected-item${item.type === 'group' ? ' is-group' : ''}${dragIndex === i ? ' dragging' : ''}`}
                  key={item.type === 'group' ? item.id : item.name}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragIndex === null) return;
                    // Insert before/after THIS item based on which half of it the
                    // cursor is over, instead of always snapping to "this exact
                    // index" the instant the (possibly much taller, for a group)
                    // item is entered — that made merely passing over a group
                    // while dragging a channel further down/up feel like the
                    // group got yanked into the move.
                    const rect = e.currentTarget.getBoundingClientRect();
                    const isAfter = e.clientY - rect.top > rect.height / 2;
                    let target = isAfter ? i + 1 : i;
                    if (target > dragIndex) target -= 1;
                    if (target !== dragIndex) {
                      // Reorders the local preview only — NOT the committed
                      // `layout` (see dragLayout above) — so a fast drag across
                      // many rows doesn't re-trigger the channel-data fetch
                      // effect (which depends on layout) on every step.
                      updateDragLayout(reorderedList(dragLayoutRef.current ?? layout, dragIndex, target));
                      setDragIndex(target);
                    }
                  }}
                >
                  <div className="selected-item-row">
                    <span
                      className="drag-handle"
                      draggable
                      onDragStart={() => {
                        setDragIndex(i);
                        updateDragLayout(layout);
                      }}
                      onDragEnd={() => {
                        setDragIndex(null);
                        if (dragLayoutRef.current) setLayout(dragLayoutRef.current);
                        updateDragLayout(null);
                      }}
                      title={t('tv.dragToReorder')}
                    >
                      ⠿
                    </span>
                    {item.type === 'channel' ? (
                      <>
                        <input
                          type="checkbox"
                          checked={validGroupSelection.has(item.name)}
                          onChange={() => toggleGroupSelection(item.name)}
                          title={t('tv.selectToGroupTooltip')}
                        />
                        <span className="selected-name">{item.name}</span>
                      </>
                    ) : (
                      <input
                        className="group-name-input"
                        value={item.name}
                        onChange={(e) => renameGroup(i, e.target.value)}
                      />
                    )}
                    {item.type === 'group' && item.special === 'pedals' && (
                      <>
                        <button
                          className={item.channels.includes(CLUTCH_CHANNEL) ? 'active' : ''}
                          onClick={() => togglePedalsClutch(i)}
                          title={t('tv.pedalsToggleClutch')}
                        >
                          C
                        </button>
                        <button
                          className={item.grouped === false ? 'active' : ''}
                          onClick={() => togglePedalsGrouped(i)}
                          title={t('tv.pedalsToggleGrouped')}
                        >
                          {item.grouped === false ? '▦' : '▣'}
                        </button>
                      </>
                    )}
                    {item.type === 'channel' && (seriesByName[item.name]?.valueColumns.length ?? 0) > 1 && (
                      <button
                        className={item.splitCorners ? 'active' : ''}
                        onClick={() => toggleCornerSplit(i)}
                        title={t('tv.cornerSplitToggle')}
                      >
                        {item.splitCorners ? '▦' : '▣'}
                      </button>
                    )}
                    {item.type === 'group' && (
                      <button onClick={() => dissolveGroup(i)} title={t('tv.ungroup')}>
                        ⊟
                      </button>
                    )}
                    <LaneSizeMenu
                      size={sizeOfItem(item)}
                      sizes={LANE_SIZE_OPTIONS}
                      onSelect={(size) => setItemSize(item, size)}
                    />
                    <button
                      onClick={() => (item.type === 'group' ? removeItem(i) : toggleChannel(item.name))}
                      title={t('tv.remove')}
                    >
                      ✕
                    </button>
                  </div>
                  {item.type === 'group' && <span className="group-members">{item.channels.join(' + ')}</span>}
                </div>
              ))}
            </div>
            {validGroupSelection.size >= 2 && (
              <button className="group-btn" onClick={groupSelected}>
                {t('tv.groupButton', { count: validGroupSelection.size })}
              </button>
            )}
          </div>
        )}
        </CollapsibleSection>

        <CollapsibleSection
          title={t('tv.addChannel')}
          collapsed={!!sidebarCollapsed.addChannel}
          onToggle={() => toggleSidebarSection('addChannel')}
        >
        <label className="field">
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('tv.addChannelPlaceholder')} />
        </label>

        <div className="channel-list">
          {filteredChannels.map((c) => (
            <label key={c.name} className="channel-checkbox">
              <input
                type="checkbox"
                checked={selectedChannels.includes(c.name)}
                onChange={() => toggleChannel(c.name)}
              />
              {c.name} <span className="unit">{c.unit}</span>
            </label>
          ))}
        </div>
        </CollapsibleSection>
        </>
        )}
        </div>
      </aside>
      <button
        className="sidebar-toggle"
        onClick={() => setSidebarOpen((o) => !o)}
        title={sidebarOpen ? t('tv.collapsePanel') : t('tv.showPanel')}
      >
        {sidebarOpen ? '‹' : '›'}
      </button>

      <main className="main">
        <div className="content-row">
          <div className="map-column">
            {gps && <TrackMap lat={gps.lat} lon={gps.lon} t={gpsX} cursorT={cursorT} viewRange={viewRange} height={340} />}
            {cursorLocked && (
              <button className="cursor-lock-hint" onClick={() => setCursorLocked(false)}>
                {t('tv.cursorLockedHint')}
              </button>
            )}
            <TelemetryLegend lanes={lanes} cursorT={cursorT} comparedLapColumns={comparedLapColumns} />
          </div>

          <div className="graphs-column">
            {!dataSource ? (
              <div className="telemetry-block no-session-placeholder">
                <p>{t('tv.noActiveSession')}</p>
                <button className="upload-btn" onClick={() => setSessionPickerOpen(true)}>
                  {t('tv.loadSessionButton')}
                </button>
              </div>
            ) : (
              <div className="telemetry-block" style={seriesLoading && lanes.length === 0 ? { minHeight: 200 } : undefined}>
                {seriesLoading && (
                  <div className="loading-overlay">
                    <span className="spinner" />
                    {t('tv.loadingData')}
                  </div>
                )}
                {laneElements}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
