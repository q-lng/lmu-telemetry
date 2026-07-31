import { useEffect, useMemo, useRef, useState } from 'react';
import type { TouchEvent as ReactTouchEvent } from 'react';
import { fetchSessions, setFileVisibility, setLapVisibility, uploadSession } from '../api';
import type {
  ChannelDescriptor,
  ChannelSeries,
  CompareSeries,
  Lane,
  LapInfo,
  LapVisibility,
  SessionMetadata,
  SessionSummary,
} from '../types';
import { createServerDataSource, createWasmDataSource, type DataSource } from '../dataSource';
import { ChannelPlot } from '../components/ChannelPlot';
import { TrackMap } from '../components/TrackMap';
import { TelemetryLegend } from '../components/TelemetryLegend';
import { channelColor, CORNER_STYLE } from '../palette';
import { resampleContinuous, resampleStep } from '../resample';
import { useAuth } from '../AuthContext';

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
  { type: 'group', id: 'default-pedals', name: 'Pédales', channels: ['Throttle Pos Unfiltered', 'Brake Pos Unfiltered'] },
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
  const [compareLap, setCompareLap] = useState<number | 'none'>('none');
  const [xAxisMode, setXAxisMode] = useState<'time' | 'distance'>('time');
  const [layout, setLayout] = useState<LayoutItem[]>(INITIAL_LAYOUT);
  const [groupSelection, setGroupSelection] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [seriesByName, setSeriesByName] = useState<Record<string, ChannelSeries>>({});
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [compareByName, setCompareByName] = useState<Record<string, CompareSeries>>({});
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

  // Cross-file comparison: the compare lap normally comes from this SAME file
  // (default), but can instead come from a second, independently-loaded file
  // (server session or local guest file) — e.g. comparing two different drivers'
  // laps on the same circuit.
  const [compareSameFile, setCompareSameFile] = useState(true);
  const [compareSelectedFile, setCompareSelectedFile] = useState<string | null>(null);
  const [compareGuestFile, setCompareGuestFile] = useState<File | null>(null);
  const [compareGuestState, setCompareGuestState] = useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  });
  const [compareDataSource, setCompareDataSource] = useState<DataSource | null>(null);
  const [compareLaps, setCompareLaps] = useState<LapInfo[]>([]);
  const [compareMetadata, setCompareMetadata] = useState<SessionMetadata | null>(null);
  const compareGuestFileInputRef = useRef<HTMLInputElement>(null);

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
    setCompareLap('none');
    // A new primary file makes any previously-picked comparison file meaningless.
    setCompareSameFile(true);
    setCompareSelectedFile(null);
    setCompareGuestFile(null);
    Promise.all([dataSource.fetchMetadata(), dataSource.fetchChannels(), dataSource.fetchLaps()]).then(
      ([m, c, l]) => {
        setMetadata(m);
        setChannels(c);
        setLaps(l);
      },
    );
  }, [dataSource]);

  // Build the comparison DataSource: null when comparing within the same file
  // (the primary `dataSource` is reused directly for that case).
  useEffect(() => {
    let cancelled = false;
    if (compareSameFile) {
      setCompareDataSource(null);
      return;
    }
    if (compareGuestFile) {
      setCompareGuestState({ busy: true, error: null });
      createWasmDataSource(compareGuestFile)
        .then((ds) => {
          if (cancelled) return;
          setCompareDataSource(ds);
          setCompareGuestState({ busy: false, error: null });
        })
        .catch((err) => {
          if (cancelled) return;
          setCompareGuestState({ busy: false, error: (err as Error).message });
          setCompareGuestFile(null);
        });
    } else if (compareSelectedFile) {
      setCompareDataSource(createServerDataSource(compareSelectedFile));
    } else {
      setCompareDataSource(null);
    }
    return () => {
      cancelled = true;
    };
  }, [compareSameFile, compareGuestFile, compareSelectedFile]);

  useEffect(() => {
    return () => {
      compareDataSource?.close?.();
    };
  }, [compareDataSource]);

  // Laps (and metadata, for the track-mismatch warning) for whichever source the
  // comparison lap currently comes from.
  useEffect(() => {
    if (compareSameFile) {
      setCompareLaps(laps);
      setCompareMetadata(metadata);
      return;
    }
    setCompareLap('none');
    if (!compareDataSource) {
      setCompareLaps([]);
      setCompareMetadata(null);
      return;
    }
    let cancelled = false;
    Promise.all([compareDataSource.fetchLaps(), compareDataSource.fetchMetadata()]).then(([l, m]) => {
      if (cancelled) return;
      setCompareLaps(l);
      setCompareMetadata(m);
    });
    return () => {
      cancelled = true;
    };
  }, [compareSameFile, compareDataSource, laps, metadata]);

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

  // Comparison lap — resampled onto the primary lap's x-grid, single-value channels only.
  // In time mode that's elapsed-time alignment; in distance mode it MUST be aligned by
  // track position instead (lap B's own Lap Dist), or two laps with different pace
  // just show lap B's value at a mismatched point on the track.
  useEffect(() => {
    const compareDs = compareSameFile ? dataSource : compareDataSource;
    if (!dataSource || !compareDs || selectedLap === 'full' || compareLap === 'none') {
      setCompareByName({});
      return;
    }
    const lapBInfo = compareLaps.find((l) => l.lap === compareLap);
    if (!lapBInfo) return;
    const lapB = lapBInfo;
    const ds = compareDs;
    const targets = selectedChannels.filter((name) => seriesByName[name]?.valueColumns.length === 1);
    const useDistance = xAxisMode === 'distance';
    let cancelled = false;

    async function run() {
      const lapBRange = useDistance
        ? await findDistanceLapRange(ds, lapB.startTs, lapB.endTs)
        : { from: lapB.startTs, to: lapB.endTs };
      const lapBOffset = lapBRange.from;

      const [lapBDistRaw, ...results] = await Promise.all([
        useDistance ? ds.fetchChannelSeries('Lap Dist', lapBRange).catch(() => null) : Promise.resolve(null),
        ...targets.map((name) =>
          ds
            .fetchChannelSeries(name, lapBRange)
            .then((s) => ({ name, s }))
            .catch(() => null),
        ),
      ]);
      if (cancelled) return;
      const lapBDistRef = lapBDistRaw ? { ...lapBDistRaw, t: lapBDistRaw.t.map((x) => x - lapBOffset) } : null;

      const next: Record<string, CompareSeries> = {};
      // A channel missing from the comparison file (different car/track) just
      // resolves to null above and is skipped rather than breaking the whole compare.
      (results.filter(Boolean) as { name: string; s: ChannelSeries }[]).forEach(({ name, s }) => {
        const col = s.valueColumns[0];
        const tRel = s.t.map((x) => x - lapBOffset);
        const primary = seriesByName[name];

        if (useDistance && lapBDistRef) {
          const lapBDist = toDistanceX(tRel, lapBDistRef);
          const primaryDist = toDistanceX(primary.t, distRef);
          const resampled =
            s.kind === 'continuous'
              ? resampleContinuous(lapBDist, s.values[col] as (number | null)[], primaryDist)
              : resampleStep(lapBDist, s.values[col], primaryDist);
          next[name] = { t: primaryDist, values: { [col]: resampled } };
        } else {
          const grid = primary.t;
          const resampled =
            s.kind === 'continuous'
              ? resampleContinuous(tRel, s.values[col] as (number | null)[], grid)
              : resampleStep(tRel, s.values[col], grid);
          next[name] = { t: grid, values: { [col]: resampled } };
        }
      });
      setCompareByName(next);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [
    dataSource,
    compareDataSource,
    compareSameFile,
    selectedChannels,
    selectedLap,
    compareLap,
    compareLaps,
    seriesByName,
    xAxisMode,
    distRef,
  ]);

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
  const fastestLap = laps.filter((l) => l.lapTime).reduce<LapInfo | null>(
    (best, l) => (best === null || l.lapTime! < best.lapTime!) ? l : best,
    null,
  );
  const compareFastestLap = compareLaps.filter((l) => l.lapTime).reduce<LapInfo | null>(
    (best, l) => (best === null || l.lapTime! < best.lapTime!) ? l : best,
    null,
  );
  const trackMismatch =
    !compareSameFile &&
    !!metadata?.info.TrackName &&
    !!compareMetadata?.info.TrackName &&
    metadata.info.TrackName !== compareMetadata.info.TrackName;
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
      return KNOWN_COLORS[name] ?? channelColor(colorIdx++);
    }

    function withXAxis(series: ChannelSeries): ChannelSeries {
      if (effectiveXAxisMode !== 'distance') return series;
      return { ...series, t: toDistanceX(series.t, distRef) };
    }

    for (const item of layout) {
      if (item.type === 'group') {
        const present = item.channels.filter((c) => seriesByName[c]);
        if (present.length === 0) continue;
        if (present.length === 1) {
          const c = present[0];
          result.push({
            key: item.id,
            label: item.name,
            series: withXAxis(seriesByName[c]),
            columnStyles: [{ label: c, color: nextColor(c) }],
            compare: compareByName[c] ?? null,
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
            compare: buildCombinedCompare(present, compareByName, seriesByName, combined.t),
          });
        }
      } else {
        const series = seriesByName[item.name];
        if (!series) continue;
        const isMulti = series.valueColumns.length > 1;
        const columnStyles = isMulti
          ? CORNER_STYLE.slice(0, series.valueColumns.length)
          : [{ label: item.name, color: nextColor(item.name) }];
        result.push({
          key: item.name,
          label: item.name,
          series: withXAxis(series),
          columnStyles,
          compare: isMulti ? null : (compareByName[item.name] ?? null),
        });
      }
    }

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, seriesByName, compareByName, effectiveXAxisMode, distRef]);

  const gpsX = gps ? (effectiveXAxisMode === 'distance' ? toDistanceX(gps.t, distRef) : gps.t) : [];

  return (
    <div className="app" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <aside className={`sidebar${sidebarOpen ? '' : ' collapsed'}`}>
        <div className="sidebar-inner">
        <h1>LMU Telemetry</h1>

        <label className="field">
          Session
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
            {uploadState.busy ? 'Import en cours…' : '+ Importer un fichier .duckdb'}
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
                Mode invité : <strong>{guestFile.name}</strong>
              </div>
              <button className="upload-btn" onClick={() => setGuestFile(null)}>
                Fermer et revenir aux sessions serveur
              </button>
            </>
          ) : (
            <button
              className="upload-btn"
              disabled={guestState.busy}
              onClick={() => guestFileInputRef.current?.click()}
              title="Ouvre le fichier directement dans le navigateur, sans passer par le serveur — plus rapide, rien n'est envoyé nulle part"
            >
              {guestState.busy ? 'Chargement…' : 'Ouvrir en local (invité, rapide)'}
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
            Publier cette session
            <label className="compare-source-toggle">
              <input
                type="checkbox"
                checked={publishScope === 'lap'}
                disabled={selectedLap === 'full'}
                onChange={(e) => setPublishScope(e.target.checked ? 'lap' : 'file')}
              />
              Seulement le tour sélectionné
              {selectedLap === 'full' && ' (sélectionne un tour)'}
            </label>
            <div className="segmented">
              <button
                className={publishVisibility === 'friends' ? 'active' : ''}
                onClick={() => setPublishVisibility('friends')}
              >
                Amis
              </button>
              <button
                className={publishVisibility === 'public' ? 'active' : ''}
                onClick={() => setPublishVisibility('public')}
              >
                Public
              </button>
            </div>
            <button className="upload-btn" disabled={publishState.busy} onClick={handlePublish}>
              {publishState.busy ? 'Publication…' : 'Publier'}
            </button>
            {publishState.error && <div className="upload-error">{publishState.error}</div>}
            {publishState.done && <div className="field-hint">Publié — retrouve-le dans "Mes sessions".</div>}
          </div>
        )}

        <div className="field">
          Preset d'affichage
          <div className="preset-row">
            <select
              value={selectedPreset}
              onChange={(e) => {
                setSelectedPreset(e.target.value);
                if (e.target.value) applyPreset(e.target.value);
              }}
            >
              <option value="">— Charger —</option>
              {Object.keys(presets).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <button disabled={!selectedPreset} onClick={() => deletePreset(selectedPreset)} title="Supprimer ce preset">
              ✕
            </button>
          </div>
          <div className="preset-row">
            <input
              placeholder="Nom du preset"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
            />
            <button disabled={!presetName.trim()} onClick={saveCurrentAsPreset}>
              Enregistrer
            </button>
          </div>
        </div>

        {metadata && (
          <div className="info-panel">
            <div>
              <strong>Pilote:</strong> {metadata.info.DriverName}
            </div>
            <div>
              <strong>Circuit:</strong> {metadata.info.TrackName}
            </div>
            <div>
              <strong>Voiture:</strong> {metadata.info.CarName} ({metadata.info.CarClass})
            </div>
            <div>
              <strong>Météo:</strong> {metadata.info.WeatherConditions}
            </div>
            <div>
              <strong>Session:</strong> {metadata.info.SessionType} @ {metadata.info.SessionTime}
            </div>
          </div>
        )}

        <label className="field">
          Axe horizontal
          <div className="segmented">
            <button className={xAxisMode === 'time' ? 'active' : ''} onClick={() => setXAxisMode('time')}>
              Temps
            </button>
            <button
              className={xAxisMode === 'distance' ? 'active' : ''}
              disabled={selectedLap === 'full'}
              title={selectedLap === 'full' ? 'Sélectionne un tour pour afficher en distance' : undefined}
              onClick={() => setXAxisMode('distance')}
            >
              Distance
            </button>
          </div>
          {selectedLap === 'full' && (
            <span className="field-hint">
              Distance indisponible en session complète (la distance repart à 0 à chaque tour — pas de sens sur
              plusieurs tours à la fois). Sélectionne un tour.
            </span>
          )}
        </label>

        <label className="field">
          Tour
          <select
            value={selectedLap}
            onChange={(e) => {
              const value = e.target.value === 'full' ? 'full' : Number(e.target.value);
              setSelectedLap(value);
              if (value === 'full') setXAxisMode('time');
            }}
          >
            <option value="full">Session complète</option>
            {laps.map((l) => {
              const t = displayLapTime(l);
              return (
                <option key={l.lap} value={l.lap}>
                  Tour {l.lap} — {t.seconds.toFixed(3)}s{t.official ? '' : ' (invalide)'}
                  {l.lap === fastestLap?.lap ? ' (meilleur tour)' : ''}
                </option>
              );
            })}
          </select>
        </label>

        <div className="field">
          Comparer avec

          <label className="compare-source-toggle">
            <input
              type="checkbox"
              checked={!compareSameFile}
              disabled={selectedLap === 'full'}
              onChange={(e) => {
                setCompareSameFile(!e.target.checked);
                setCompareSelectedFile(null);
                setCompareGuestFile(null);
              }}
            />
            Comparer avec un autre fichier
          </label>

          {!compareSameFile && (
            <div className="compare-file-picker">
              <select
                value={compareGuestFile ? '' : compareSelectedFile ?? ''}
                disabled={!!compareGuestFile}
                onChange={(e) => {
                  setCompareGuestFile(null);
                  setCompareSelectedFile(e.target.value || null);
                }}
              >
                <option value="">— Choisir une session —</option>
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
                disabled={compareGuestState.busy}
                onClick={() => compareGuestFileInputRef.current?.click()}
              >
                {compareGuestState.busy
                  ? 'Chargement…'
                  : compareGuestFile
                    ? compareGuestFile.name
                    : 'Ou ouvrir un fichier local…'}
              </button>
              <input
                ref={compareGuestFileInputRef}
                type="file"
                accept=".duckdb"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setCompareSelectedFile(null);
                    setCompareGuestFile(file);
                  }
                  e.target.value = '';
                }}
              />
              {compareGuestState.error && <div className="upload-error">{compareGuestState.error}</div>}
              {trackMismatch && (
                <div className="field-hint compare-warning">
                  Circuits différents ({metadata?.info.TrackName} vs {compareMetadata?.info.TrackName}) — la
                  comparaison peut ne pas être pertinente.
                </div>
              )}
            </div>
          )}

          <select
            value={compareLap}
            disabled={selectedLap === 'full' || (!compareSameFile && !compareDataSource)}
            onChange={(e) => setCompareLap(e.target.value === 'none' ? 'none' : Number(e.target.value))}
          >
            <option value="none">Aucune comparaison</option>
            {compareLaps
              .filter((l) => (compareSameFile ? l.lap !== selectedLap : true))
              .map((l) => {
                const t = displayLapTime(l);
                return (
                  <option key={l.lap} value={l.lap}>
                    Tour {l.lap} — {t.seconds.toFixed(3)}s{t.official ? '' : ' (invalide)'}
                    {l.lap === compareFastestLap?.lap ? ' (meilleur tour)' : ''}
                  </option>
                );
              })}
          </select>
        </div>

        {layout.length > 0 && (
          <div className="field">
            Canaux affichés (ordre des graphes)
            <div className="selected-list">
              {layout.map((item, i) => (
                <div className={`selected-item${item.type === 'group' ? ' is-group' : ''}`} key={item.type === 'group' ? item.id : item.name}>
                  {item.type === 'channel' ? (
                    <>
                      <input
                        type="checkbox"
                        checked={validGroupSelection.has(item.name)}
                        onChange={() => toggleGroupSelection(item.name)}
                        title="Sélectionner pour grouper"
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
                  <button disabled={i === 0} onClick={() => moveItem(i, -1)} title="Monter">
                    ↑
                  </button>
                  <button disabled={i === layout.length - 1} onClick={() => moveItem(i, 1)} title="Descendre">
                    ↓
                  </button>
                  {item.type === 'group' && (
                    <button onClick={() => dissolveGroup(i)} title="Dégrouper">
                      ⊟
                    </button>
                  )}
                  <button
                    onClick={() => (item.type === 'group' ? removeItem(i) : toggleChannel(item.name))}
                    title="Retirer"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            {validGroupSelection.size >= 2 && (
              <button className="group-btn" onClick={groupSelected}>
                Grouper ({validGroupSelection.size}) en un seul graphe
              </button>
            )}
          </div>
        )}

        <label className="field">
          Ajouter un canal
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="ex: tyre, brake..." />
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
        title={sidebarOpen ? 'Réduire le panneau' : 'Afficher le panneau'}
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
                  Chargement des données…
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
