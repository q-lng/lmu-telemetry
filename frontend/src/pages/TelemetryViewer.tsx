import { useEffect, useMemo, useRef, useState } from 'react';
import type { TouchEvent as ReactTouchEvent } from 'react';
import { fetchSessions, setFileVisibility, setLapVisibility, uploadSession } from '../api';
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
import { channelColor, comparedLapColor, CORNER_STYLE, REFERENCE_UNIFORM_COLOR } from '../palette';
import { resampleContinuous, resampleStep } from '../resample';
import { useAuth } from '../AuthContext';
import { t } from '../i18n';

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
}
interface GroupLayoutItem {
  type: 'group';
  id: string;
  name: string;
  channels: string[];
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

const INITIAL_LAYOUT: LayoutItem[] = [
  { type: 'channel', name: 'Ground Speed' },
  { type: 'channel', name: 'Gear' },
  { type: 'group', id: 'default-pedals', name: t('tv.defaultGroupPedals'), channels: ['Throttle Pos Unfiltered', 'Brake Pos Unfiltered'] },
  { type: 'channel', name: 'Steering Pos' },
  { type: 'group', id: 'default-pits', name: 'In Pits / Speed Limiter', channels: ['In Pits', 'Speed Limiter'] },
];

// Relative flex-grow weights, not pixels — the graphs block always fills exactly
// the available height, so "all Tall" still fits the screen, evenly split.
const LANE_SIZE = { small: 1, medium: 1.5, tall: 2.5 };

const INITIAL_LANE_WEIGHTS: Record<string, number> = {
  'Ground Speed': LANE_SIZE.tall,
  Gear: LANE_SIZE.small,
  'default-pedals': LANE_SIZE.tall,
  'Steering Pos': LANE_SIZE.medium,
  'default-pits': LANE_SIZE.small,
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

interface DisplayPreset {
  layout: LayoutItem[];
  laneWeights: Record<string, number>;
  xAxisMode: 'time' | 'distance';
}

const PRESETS_STORAGE_KEY = 'lmu-telemetry-presets';

function loadPresets(): Record<string, DisplayPreset> {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePresets(presets: Record<string, DisplayPreset>) {
  localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
}

export default function TelemetryViewer() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
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
  const [groupSelection, setGroupSelection] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [seriesByName, setSeriesByName] = useState<Record<string, ChannelSeries>>({});
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [comparesByLapId, setComparesByLapId] = useState<Record<string, Record<string, CompareSeries>>>({});
  const [distRef, setDistRef] = useState<ChannelSeries | null>(null);
  const [gps, setGps] = useState<{ t: number[]; lat: number[]; lon: number[] } | null>(null);
  const [cursorT, setCursorT] = useState<number | null>(null);
  const [viewRange, setViewRange] = useState<{ min: number; max: number } | null>(null);
  const [uploadState, setUploadState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const guestFileInputRef = useRef<HTMLInputElement>(null);

  // Multi-lap comparison: any number of laps checked against the reference lap,
  // each either from this same (primary) session or from a separately-opened
  // "external source" session (server session or local guest file) — e.g.
  // comparing your own two laps, plus a friend's fastest lap from another file.
  const [comparedLaps, setComparedLaps] = useState<ComparedLap[]>([]);
  const comparedLapColorCounter = useRef(0);
  const [colorMode, setColorMode] = useState<ColorMode>('byChannel');

  const [externalSources, setExternalSources] = useState<ExternalSource[]>([]);
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [addSourceState, setAddSourceState] = useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  });
  const addSourceGuestFileInputRef = useRef<HTMLInputElement>(null);

  function nextComparedLapColor(): string {
    return comparedLapColor(comparedLapColorCounter.current++);
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
      return [...prev, { id, sourceId, lapNumber, color: nextComparedLapColor() }];
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
    const next = { ...presets };
    delete next[name];
    setPresets(next);
    savePresets(next);
    if (selectedPreset === name) setSelectedPreset('');
  }

  const selectedChannels = useMemo(
    () => layout.flatMap((it) => (it.type === 'channel' ? [it.name] : it.channels)),
    [layout],
  );

  function reloadSessions(selectFile?: string) {
    fetchSessions().then((s) => {
      setSessions(s);
      if (selectFile) {
        setGuestFile(null);
        setSelectedFile(selectFile);
      } else if (!selectedFile && !guestFile && s.length > 0) {
        setSelectedFile(s[0].file);
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

  // Compared laps — each resampled onto the reference lap's x-grid, single-value
  // channels only. In time mode that's elapsed-time alignment; in distance mode
  // it MUST be aligned by track position instead (each compared lap's own Lap
  // Dist), or a lap with different pace just shows its value at a mismatched
  // point on the track.
  useEffect(() => {
    if (!dataSource || selectedLap === 'full' || comparedLaps.length === 0) {
      setComparesByLapId({});
      return;
    }
    const targets = selectedChannels.filter((name) => seriesByName[name]?.valueColumns.length === 1);
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
      (results.filter(Boolean) as { name: string; s: ChannelSeries }[]).forEach(({ name, s }) => {
        const col = s.valueColumns[0];
        const tRel = s.t.map((x) => x - lapOffset);
        const primary = seriesByName[name];

        if (useDistance && lapDistRef) {
          const lapDist = toDistanceX(tRel, lapDistRef);
          const primaryDist = toDistanceX(primary.t, distRef);
          const resampled =
            s.kind === 'continuous'
              ? resampleContinuous(lapDist, s.values[col] as (number | null)[], primaryDist)
              : resampleStep(lapDist, s.values[col], primaryDist);
          perChannel[name] = { t: primaryDist, values: { [col]: resampled } };
        } else {
          const grid = primary.t;
          const resampled =
            s.kind === 'continuous'
              ? resampleContinuous(tRel, s.values[col] as (number | null)[], grid)
              : resampleStep(tRel, s.values[col], grid);
          perChannel[name] = { t: grid, values: { [col]: resampled } };
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

  function toggleChannel(name: string) {
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

  function moveItem(index: number, dir: -1 | 1) {
    setLayout((prev) => {
      const swap = index + dir;
      if (swap < 0 || swap >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[swap]] = [next[swap], next[index]];
      return next;
    });
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
    } catch (err) {
      setUploadState({ busy: false, error: (err as Error).message });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
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

  // Distance only ever makes sense for a single lap: "Lap Dist" resets to 0 at
  // every start/finish crossing, so across multiple laps it's a sawtooth — which
  // breaks uPlot's fundamental assumption that x is strictly ascending. Derived
  // (not just gated in the UI) so a loaded preset or stale state can't sneak an
  // invalid combination through.
  const effectiveXAxisMode: 'time' | 'distance' = selectedLap === 'full' ? 'time' : xAxisMode;

  // Memoized so a bare cursor move (very high frequency) never rebuilds lane objects —
  // that would otherwise tear down and recreate every uPlot canvas on each mousemove.
  const lanes: Lane[] = useMemo(() => {
    const result: Lane[] = [];
    let colorIdx = 0;
    function nextColor(name: string): string {
      // "By lap" mode: every reference channel shares one neutral color, so the
      // eye follows compared-lap colors instead of per-channel hues — including
      // ignoring the throttle/brake/clutch conventional-color overrides below.
      if (colorMode === 'byLap') return REFERENCE_UNIFORM_COLOR;
      return KNOWN_COLORS[name] ?? channelColor(colorIdx++);
    }

    function withXAxis(series: ChannelSeries): ChannelSeries {
      if (effectiveXAxisMode !== 'distance') return series;
      return { ...series, t: toDistanceX(series.t, distRef) };
    }

    function buildLaneCompares(names: string[], targetSeries: ChannelSeries): LaneCompare[] {
      const out: LaneCompare[] = [];
      for (const cl of comparedLaps) {
        const perChannel = comparesByLapId[cl.id];
        if (!perChannel) continue;
        const series = names.length === 1
          ? perChannel[names[0]] ?? null
          : buildCombinedCompare(names, perChannel, seriesByName, targetSeries.t);
        if (!series) continue;
        out.push({ id: cl.id, label: comparedLapLabel(cl), color: cl.color, series });
      }
      return out;
    }

    for (const item of layout) {
      if (item.type === 'group') {
        const present = item.channels.filter((c) => seriesByName[c]);
        if (present.length === 0) continue;
        if (present.length === 1) {
          const c = present[0];
          const series = withXAxis(seriesByName[c]);
          result.push({
            key: item.id,
            label: item.name,
            series,
            columnStyles: [{ label: c, color: nextColor(c) }],
            compares: buildLaneCompares([c], series),
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
      } else {
        const series = seriesByName[item.name];
        if (!series) continue;
        const isMulti = series.valueColumns.length > 1;
        const columnStyles = isMulti
          ? CORNER_STYLE.slice(0, series.valueColumns.length)
          : [{ label: item.name, color: nextColor(item.name) }];
        const withAxis = withXAxis(series);
        result.push({
          key: item.name,
          label: item.name,
          series: withAxis,
          columnStyles,
          // 4-wheel channels (isMulti) keep their fixed corner color+dash styling
          // regardless of compare — overlaying per-lap colors on top of that would
          // lose the FL/FR/RL/RR identity without gaining a clear lap identity.
          compares: isMulti ? [] : buildLaneCompares([item.name], withAxis),
        });
      }
    }

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, seriesByName, comparesByLapId, comparedLaps, colorMode, effectiveXAxisMode, distRef]);

  const gpsX = gps ? (effectiveXAxisMode === 'distance' ? toDistanceX(gps.t, distRef) : gps.t) : [];

  return (
    <div className="app" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <aside className={`sidebar${sidebarOpen ? '' : ' collapsed'}`}>
        <div className="sidebar-inner">
        <h1>{t('tv.sidebarTitle')}</h1>

        <label className="field">
          {t('tv.session')}
          <select
            value={guestFile ? '' : selectedFile ?? ''}
            disabled={!!guestFile}
            onChange={(e) => {
              setGuestFile(null);
              setSelectedFile(e.target.value);
            }}
          >
            {sessions.map((s) => (
              <option key={s.file} value={s.file}>
                {s.track ?? s.file} — {s.sessionType} ({s.recordingTime})
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <button className="upload-btn" disabled={uploadState.busy} onClick={() => fileInputRef.current?.click()}>
            {uploadState.busy ? t('tv.importing') : t('tv.importFile')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".duckdb"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
            }}
          />
          {uploadState.error && <div className="upload-error">{uploadState.error}</div>}
        </div>

        <div className="field">
          {guestFile ? (
            <>
              <div className="guest-active">
                {t('tv.guestModePrefix')}
                <strong>{guestFile.name}</strong>
              </div>
              <button className="upload-btn" onClick={() => setGuestFile(null)}>
                {t('tv.closeGuestMode')}
              </button>
            </>
          ) : (
            <button
              className="upload-btn"
              disabled={guestState.busy}
              onClick={() => guestFileInputRef.current?.click()}
              title={t('tv.openGuestTooltip')}
            >
              {guestState.busy ? t('tv.guestLoading') : t('tv.openGuestFile')}
            </button>
          )}
          <input
            ref={guestFileInputRef}
            type="file"
            accept=".duckdb"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setGuestFile(file);
              e.target.value = '';
            }}
          />
          {guestState.error && <div className="upload-error">{guestState.error}</div>}
        </div>

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

        <div className="field">
          {t('tv.presetLabel')}
          <div className="preset-row">
            <select
              value={selectedPreset}
              onChange={(e) => {
                setSelectedPreset(e.target.value);
                if (e.target.value) applyPreset(e.target.value);
              }}
            >
              <option value="">{t('tv.presetLoadPlaceholder')}</option>
              {Object.keys(presets).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <button disabled={!selectedPreset} onClick={() => deletePreset(selectedPreset)} title={t('tv.presetDelete')}>
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
        </div>

        {metadata && (
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
        )}

        <label className="field">
          {t('tv.xAxisLabel')}
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

        <label className="field">
          {t('tv.lapLabel')}
          <select
            value={selectedLap}
            onChange={(e) => {
              const value = e.target.value === 'full' ? 'full' : Number(e.target.value);
              setSelectedLap(value);
              if (value === 'full') setXAxisMode('time');
              // The new reference lap can't also be a compared lap from this same session.
              setComparedLaps((prev) => prev.filter((cl) => !(cl.sourceId === 'primary' && cl.lapNumber === value)));
            }}
          >
            <option value="full">{t('tv.fullSession')}</option>
            {laps.map((l) => {
              const lt = displayLapTime(l);
              return (
                <option key={l.lap} value={l.lap}>
                  {t('lap.number', { n: l.lap })} — {lt.seconds.toFixed(3)}s{lt.official ? '' : t('lap.invalidSuffix')}
                  {l.lap === fastestLapOf(laps)?.lap ? t('lap.fastestSuffix') : ''}
                </option>
              );
            })}
          </select>
        </label>

        <label className="field">
          {t('tv.colorModeLabel')}
          <div className="segmented">
            <button className={colorMode === 'byChannel' ? 'active' : ''} onClick={() => setColorMode('byChannel')}>
              {t('tv.colorModeByChannel')}
            </button>
            <button className={colorMode === 'byLap' ? 'active' : ''} onClick={() => setColorMode('byLap')}>
              {t('tv.colorModeByLap')}
            </button>
          </div>
        </label>

        <div className="field">
          {t('tv.comparedLapsLabel')}
          {selectedLap === 'full' && <span className="field-hint">{t('tv.selectReferenceLapHint')}</span>}

          <div className="compared-laps-list">
            {laps
              .filter((l) => l.lap !== selectedLap)
              .map((l) => {
                const lt = displayLapTime(l);
                return (
                  <label key={l.lap} className="channel-checkbox">
                    <input
                      type="checkbox"
                      disabled={selectedLap === 'full'}
                      checked={isLapCompared('primary', l.lap)}
                      onChange={() => toggleComparedLap('primary', l.lap)}
                    />
                    {t('lap.number', { n: l.lap })} — {lt.seconds.toFixed(3)}s{lt.official ? '' : t('lap.invalidSuffix')}
                    {l.lap === fastestLapOf(laps)?.lap ? t('lap.fastestSuffix') : ''}
                  </label>
                );
              })}
          </div>

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

        {layout.length > 0 && (
          <div className="field">
            {t('tv.channelsShown')}
            <div className="selected-list">
              {layout.map((item, i) => (
                <div className={`selected-item${item.type === 'group' ? ' is-group' : ''}`} key={item.type === 'group' ? item.id : item.name}>
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
                    <>
                      <input
                        className="group-name-input"
                        value={item.name}
                        onChange={(e) => renameGroup(i, e.target.value)}
                      />
                      <span className="group-members">{item.channels.join(' + ')}</span>
                    </>
                  )}
                  <button disabled={i === 0} onClick={() => moveItem(i, -1)} title={t('tv.moveUp')}>
                    ↑
                  </button>
                  <button disabled={i === layout.length - 1} onClick={() => moveItem(i, 1)} title={t('tv.moveDown')}>
                    ↓
                  </button>
                  {item.type === 'group' && (
                    <button onClick={() => dissolveGroup(i)} title={t('tv.ungroup')}>
                      ⊟
                    </button>
                  )}
                  <button
                    onClick={() => (item.type === 'group' ? removeItem(i) : toggleChannel(item.name))}
                    title={t('tv.remove')}
                  >
                    ✕
                  </button>
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

        <label className="field">
          {t('tv.addChannel')}
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
            <TelemetryLegend lanes={lanes} cursorT={cursorT} />
          </div>

          <div className="graphs-column">
            <div className="telemetry-block" style={seriesLoading && lanes.length === 0 ? { minHeight: 200 } : undefined}>
              {seriesLoading && (
                <div className="loading-overlay">
                  <span className="spinner" />
                  {t('tv.loadingData')}
                </div>
              )}
              {lanes.map((lane, i) => (
                <ChannelPlot
                  key={lane.key}
                  lane={lane}
                  syncKey="telemetry"
                  showXAxis={i === lanes.length - 1}
                  xAxisMode={effectiveXAxisMode}
                  weight={laneWeights[lane.key] ?? LANE_SIZE.medium}
                  onWeightChange={setLaneWeight}
                  onCursorMove={setCursorT}
                  onViewRangeChange={setViewRange}
                />
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
