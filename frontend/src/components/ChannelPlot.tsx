import { useEffect, useMemo, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import uPlot from 'uplot';
import type { Lane } from '../types';
import { CHART_CHROME } from '../palette';
import { nearestValue } from '../nearest';
import { t } from '../i18n';

function formatTime(s: number): string {
  const sign = s < 0 ? '-' : '';
  const abs = Math.abs(s);
  const m = Math.floor(abs / 60);
  const sec = (abs % 60).toFixed(2).padStart(5, '0');
  return `${sign}${m}:${sec}`;
}

function formatDistance(m: number): string {
  return Math.abs(m) >= 1000 ? `${(m / 1000).toFixed(2)}km` : `${Math.round(m)}m`;
}

function formatDelta(v: number): string {
  const sign = v >= 0 ? '+' : '-';
  const abs = Math.abs(v);
  return `${sign}${Number.isInteger(abs) ? String(abs) : abs.toFixed(2)}`;
}

function formatValue(v: number | boolean | null): string {
  if (v === null || v === undefined) return '–';
  if (typeof v === 'boolean') return v ? t('telemetryLegend.on') : t('telemetryLegend.off');
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function numeric(values: (number | boolean | null)[]): (number | null)[] {
  return values.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v));
}

/** The numeric data arrays uPlot needs — shared between construction and the
 * data-only refresh effect below, so a plain new batch of values (same
 * channels/compares, nothing structural changed) goes through the exact same
 * column layout either way. */
function buildPlotData(lane: Lane): (number | null)[][] {
  const { series, compares } = lane;
  const data: (number | null)[][] = [series.t, ...series.valueColumns.map((col) => numeric(series.values[col]))];
  compares.forEach((cmp) => {
    series.valueColumns.forEach((col) => {
      const compareValues = cmp.series.values[col];
      if (!compareValues) return;
      data.push(compareValues);
    });
  });
  return data;
}

// Reference and compared-lap traces are the same thickness — color is what
// tells them apart now, not weight.
const LINE_WIDTH = 2;

/** Fixed Y range computed once from the lane's full data — uPlot's default "auto"
 * y-scale rescales to whatever is currently visible on X, so the vertical scale
 * would otherwise jump around on every zoom/pan instead of staying put. */
function computeFixedYRange(data: (number | null)[][]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 1; i < data.length; i++) {
    for (const v of data[i]) {
      if (v == null) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!isFinite(min) || !isFinite(max)) return [0, 1];
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.05;
  return [min - pad, max + pad];
}

/** Same idea, but symmetric around 0 — [-M, M] instead of a tight fit around
 * the actual data span — for lanes like delta-time where 0 (dead even with
 * the reference lap) needs to sit at the vertical center of the graph rather
 * than wherever the data happens to average out. */
function computeZeroCenteredYRange(data: (number | null)[][]): [number, number] {
  let magnitude = 0;
  for (let i = 1; i < data.length; i++) {
    for (const v of data[i]) {
      if (v == null) continue;
      const abs = Math.abs(v);
      if (abs > magnitude) magnitude = abs;
    }
  }
  if (magnitude === 0) magnitude = 1;
  const padded = magnitude * 1.05;
  return [-padded, padded];
}

const ZOOM_FACTOR = 0.85;
// Below this much horizontal movement, a mousedown+mouseup counts as a click
// (freeze the cursor there) rather than a pan drag.
const CLICK_MOVE_THRESHOLD = 4;

/** Wheel-to-zoom (centered on cursor) + click-drag-to-pan on the x scale, applied
 * to every lane sharing `syncKey` — `cursor.sync.scales` only syncs uPlot's own
 * native cursor/drag interactions, not externally-invoked `setScale()` calls, so
 * the resulting range is pushed by hand to every plot in `uPlot.sync(syncKey)`.
 * Bounds come from the shared `xDomain` (falling back to this plot's own x data
 * only if it's unavailable) — NOT `u.data[0]`, which for a sparse event channel
 * (Gear, ...) can be narrower than the actual full lap/session, capping how far
 * this one lane could ever zoom/pan out regardless of the other lanes' range.
 * `onClickAt` fires instead of a pan when the mouse barely moved between down/up. */
function attachZoomPan(
  u: uPlot,
  syncKey: string,
  xDomain: [number, number] | null | undefined,
  onClickAt?: (value: number) => void,
): () => void {
  const over = u.over;
  const xs = u.data[0] as number[];
  const fullMin = xDomain ? xDomain[0] : xs[0];
  const fullMax = xDomain ? xDomain[1] : xs[xs.length - 1];
  const fullRange = fullMax - fullMin || 1;

  function clampRange(min: number, max: number): [number, number] {
    const range = Math.min(max - min, fullRange);
    if (min < fullMin) return [fullMin, fullMin + range];
    if (max > fullMax) return [fullMax - range, fullMax];
    return [min, min + range];
  }

  function currentRange(): [number, number] {
    const min = u.scales.x.min;
    const max = u.scales.x.max;
    return min != null && max != null ? [min, max] : [fullMin, fullMax];
  }

  function applyScale(min: number, max: number) {
    for (const plot of uPlot.sync(syncKey).plots) plot.setScale('x', { min, max });
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const rect = over.getBoundingClientRect();
    const xVal = u.posToVal(e.clientX - rect.left, 'x');
    const [curMin, curMax] = currentRange();
    const curRange = curMax - curMin;
    const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    const newRange = Math.min(fullRange, curRange * factor);
    const pct = curRange === 0 ? 0.5 : (xVal - curMin) / curRange;
    const [newMin, newMax] = clampRange(xVal - pct * newRange, xVal - pct * newRange + newRange);
    applyScale(newMin, newMax);
  }

  // Plain drag pans; Ctrl/Cmd-drag draws a selection box and zooms to exactly
  // that range on release (uPlot's own drag-to-zoom, which cursor.drag:false
  // disables, since plain drag is already taken by panning here).
  let dragMode: 'pan' | 'select' | null = null;
  let dragStartX = 0;
  let dragMin0 = 0;
  let dragMax0 = 0;

  function selectPixelRange(clientX: number): [number, number] {
    const rect = over.getBoundingClientRect();
    const x0 = Math.max(0, Math.min(dragStartX, clientX) - rect.left);
    const x1 = Math.min(rect.width, Math.max(dragStartX, clientX) - rect.left);
    return [x0, x1];
  }

  function onDragMove(e: MouseEvent) {
    if (dragMode === 'pan') {
      const rect = over.getBoundingClientRect();
      const dxVal = ((e.clientX - dragStartX) / rect.width) * (dragMax0 - dragMin0);
      const [newMin, newMax] = clampRange(dragMin0 - dxVal, dragMax0 - dxVal);
      applyScale(newMin, newMax);
    } else if (dragMode === 'select') {
      const [x0, x1] = selectPixelRange(e.clientX);
      u.setSelect({ left: x0, top: 0, width: Math.max(1, x1 - x0), height: over.clientHeight }, false);
    }
  }

  function onDragEnd(e: MouseEvent) {
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    if (dragMode === 'select') {
      const [x0, x1] = selectPixelRange(e.clientX);
      u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
      if (x1 - x0 >= 4) {
        const v0 = u.posToVal(x0, 'x');
        const v1 = u.posToVal(x1, 'x');
        applyScale(Math.min(v0, v1), Math.max(v0, v1));
      }
    } else if (dragMode === 'pan' && onClickAt && Math.abs(e.clientX - dragStartX) < CLICK_MOVE_THRESHOLD) {
      const rect = over.getBoundingClientRect();
      onClickAt(u.posToVal(e.clientX - rect.left, 'x'));
    }
    dragMode = null;
  }

  function onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    dragMode = e.ctrlKey || e.metaKey ? 'select' : 'pan';
    dragStartX = e.clientX;
    [dragMin0, dragMax0] = currentRange();
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
  }

  over.addEventListener('wheel', onWheel, { passive: false });
  over.addEventListener('mousedown', onMouseDown);

  return () => {
    over.removeEventListener('wheel', onWheel);
    over.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
  };
}

const Y_AXIS_SIZE = 42;
const MIN_WEIGHT = 0.3;
const MAX_WEIGHT = 8;

interface Props {
  lane: Lane;
  syncKey: string;
  showXAxis: boolean;
  xAxisMode: 'time' | 'distance';
  /** Relative share of the graphs block's height (a flex-grow ratio) — the block
   * always fills exactly the available vertical space, so lanes are sized purely
   * by their weight relative to each other, never by an absolute pixel height. */
  weight: number;
  /** Shared default X range across every lane (from a dense reference channel) —
   * without this, a sparse event channel (Gear, ...) would auto-range to just its
   * own data span, narrower than dense channels, throwing off cursor.sync until a
   * zoom forces every lane back to the identical [min,max]. */
  xDomain?: [number, number] | null;
  /** Current pan/zoom window, restored on (re)construction via a ref (NOT a
   * dependency of the rebuild effect below) so a lane rebuilding for an unrelated
   * reason (toggling a compared lap, etc.) doesn't lose the user's current zoom —
   * only reading this fresh every time would itself force a rebuild on every zoom. */
  viewRange?: { min: number; max: number } | null;
  /** Cursor position, only used to show a live per-compared-lap delta next to the
   * label — deliberately NOT in the uPlot-rebuild effect's dependency array below,
   * so a mousemove re-renders just this label text, never tears down the chart. */
  cursorT?: number | null;
  /** When true, the cursor is pinned at `cursorT` (click-to-freeze) — the crosshair
   * is forced back there on every mousemove instead of following the mouse. */
  cursorLocked?: boolean;
  onWeightChange?: (key: string, weight: number) => void;
  onCursorMove?: (t: number | null) => void;
  /** Fires on a genuine click (not a pan drag) with the clicked x-value. */
  onCursorClick?: (t: number) => void;
  onViewRangeChange?: (range: { min: number; max: number }) => void;
}

export function ChannelPlot({
  lane,
  syncKey,
  showXAxis,
  xAxisMode,
  weight,
  xDomain,
  viewRange,
  cursorT,
  cursorLocked,
  onWeightChange,
  onCursorMove,
  onCursorClick,
  onViewRangeChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const viewRangeRef = useRef(viewRange);
  useEffect(() => {
    viewRangeRef.current = viewRange;
  }, [viewRange]);
  // Read fresh inside the setCursor/draw hooks below (which are only rebuilt when
  // `lane` changes, not on every cursor tick) — a plain closure over cursorT/
  // cursorLocked would go stale the moment the user moves the mouse after locking.
  const cursorLockRef = useRef<{ locked: boolean; value: number | null }>({ locked: false, value: null });
  // uPlot's own crosshair keeps following the mouse while locked (see the
  // setCursor hook below) — only actual chart redraws repaint the canvas, so
  // locking/unlocking needs to explicitly trigger one to show/hide our own
  // persistent line for the locked position. Tracked separately from the ref
  // update above so a plain hover (cursorT changing while NOT locked) never
  // forces a full redraw — only an actual lock/unlock transition does.
  const wasLockedRef = useRef(false);
  useEffect(() => {
    cursorLockRef.current = { locked: !!cursorLocked, value: cursorT ?? null };
    if (wasLockedRef.current !== !!cursorLocked) {
      wasLockedRef.current = !!cursorLocked;
      plotRef.current?.redraw();
    }
  }, [cursorLocked, cursorT]);

  // Everything that actually determines uPlot's OPTIONS shape (series count/
  // kind/colors/dash, Y-centering) — deliberately excluding the raw t/values
  // arrays. `lanes` (in TelemetryViewer) rebuilds every Lane object (new
  // references) on nearly any state change, so keying the rebuild effect
  // below on `lane` itself meant EVERY currently-shown graph got destroyed
  // and reconstructed on nearly any update — expensive enough (with real
  // telemetry-sized series) to freeze the page, corrupting anything else in
  // flight at that moment (e.g. an in-progress drag-reorder). Keying it on
  // this signature instead means a lane whose own content didn't actually
  // change (just data updates elsewhere, or this lane simply moved position)
  // skips the rebuild entirely — see the data-only refresh effect below for
  // how new values still reach the chart in that case.
  const structuralSignature = useMemo(() => {
    return [
      lane.series.kind,
      lane.series.valueColumns.join(','),
      lane.compares.map((c) => `${c.id}:${c.color}`).join(','),
      lane.centerYOnZero ? '1' : '0',
      lane.columnStyles.map((cs) => `${cs.color}:${cs.dash ? cs.dash.join('-') : ''}:${cs.label}`).join(','),
    ].join('|');
  }, [lane]);

  useEffect(() => {
    if (!containerRef.current) return;
    const { series, columnStyles, compares } = lane;
    const isEvent = series.kind === 'event';
    const stepPaths = isEvent ? uPlot.paths.stepped!({ align: 1 }) : undefined;

    const data = buildPlotData(lane);
    const seriesOpts: uPlot.Series[] = [
      {},
      ...series.valueColumns.map((col, i) => ({
        label: columnStyles[i].label,
        stroke: columnStyles[i].color,
        width: LINE_WIDTH,
        dash: columnStyles[i].dash,
        paths: stepPaths,
        points: { show: false },
      })),
    ];

    // Each compared lap gets its own solid color (no more dashing — the color
    // itself is what tells laps apart now), applied to every value column of
    // this lane for that lap (a grouped lane's members aren't distinguished
    // from one another within a single compared lap's overlay). Same width as
    // the reference trace — color alone is what tells them apart now.
    compares.forEach((cmp) => {
      series.valueColumns.forEach((col, i) => {
        const compareValues = cmp.series.values[col];
        if (!compareValues) return;
        seriesOpts.push({
          label: `${columnStyles[i].label}${t('channelPlot.comparedSuffix')} — ${cmp.label}`,
          stroke: cmp.color,
          width: LINE_WIDTH,
          paths: stepPaths,
          points: { show: false },
        });
      });
    });

    // Suppresses the setScale hook's onViewRangeChange report for the ONE
    // scale-seeding call made right after construction (below) — otherwise a
    // rebuild that happens to fire before xDomain has caught up with a newly
    // selected lap (distRef/xDomain update asynchronously, not in the same
    // tick as selecting the lap) reports that still-stale, wider range back
    // up as if it were a deliberate zoom. That gets "preserved" across the
    // NEXT rebuild (the one where xDomain finally reflects the new lap),
    // permanently locking the view to the wrong domain until a real zoom
    // overwrites it. Only genuine interactive zoom/pan (attachZoomPan's own
    // setScale calls, made after this flag flips back) should ever report.
    let suppressReport = true;

    const opts: uPlot.Options = {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      padding: [4, 8, showXAxis ? 4 : 0, 0],
      cursor: { drag: { x: false, y: false }, sync: { key: syncKey, scales: ['x', null] } },
      legend: { show: false },
      scales: {
        x: { time: false },
        y: { range: lane.centerYOnZero ? computeZeroCenteredYRange(data) : computeFixedYRange(data) },
      },
      axes: [
        {
          show: true,
          stroke: CHART_CHROME.mutedInk,
          grid: { stroke: CHART_CHROME.gridline },
          size: showXAxis ? 26 : 8,
          ticks: { show: showXAxis, stroke: CHART_CHROME.axis },
          values: showXAxis ? (_u, vals) => vals.map(xAxisMode === 'distance' ? formatDistance : formatTime) : () => [],
        },
        {
          stroke: CHART_CHROME.mutedInk,
          grid: { stroke: CHART_CHROME.gridline },
          size: Y_AXIS_SIZE,
        },
      ],
      series: seriesOpts,
      hooks: {
        setCursor: [
          (u) => {
            // While locked, just stop reporting hover-driven positions at all —
            // trying to additionally force uPlot's own native crosshair pixel
            // back to the locked value (via a re-entrant u.setCursor call) turned
            // out to misbehave over sparse/event data (e.g. Gear): hovering
            // exactly over one of its few real points could win the race and
            // drag the "locked" value along with it. This keeps every reported
            // value — and thus the legend/labels/track map — correctly frozen;
            // the native crosshair line may still cosmetically follow the mouse.
            if (cursorLockRef.current.locked) return;
            if (!onCursorMove) return;
            const idx = u.cursor.idx;
            onCursorMove(idx == null ? null : (u.data[0][idx] as number));
          },
        ],
        // Only the bottom lane reports its view range — every lane shares the same
        // x scale (see attachZoomPan), so reporting from all of them would just be
        // redundant repeated updates for the same value.
        setScale: [
          (u, key) => {
            if (suppressReport || !showXAxis || key !== 'x' || !onViewRangeChange) return;
            const { min, max } = u.scales.x;
            if (min != null && max != null) onViewRangeChange({ min, max });
          },
        ],
        // uPlot's native crosshair (a DOM overlay) keeps following the mouse even
        // while locked — this paints our own persistent marker for the locked
        // position directly on the canvas instead, distinct in color/width from
        // the live hover crosshair. `draw` only fires on actual chart redraws
        // (data/scale/size changes, or our own explicit redraw() call above), not
        // on every mousemove, so this never runs at hover frequency.
        draw: [
          (u) => {
            const lock = cursorLockRef.current;
            if (!lock.locked || lock.value == null) return;
            const x = u.valToPos(lock.value, 'x', true);
            if (x < u.bbox.left || x > u.bbox.left + u.bbox.width) return;
            const ctx = u.ctx;
            ctx.save();
            ctx.strokeStyle = CHART_CHROME.lockedCursor;
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(x, u.bbox.top);
            ctx.lineTo(x, u.bbox.top + u.bbox.height);
            ctx.stroke();
            ctx.restore();
          },
        ],
      },
    };

    const plot = new uPlot(opts, data as uPlot.AlignedData, containerRef.current);
    plotRef.current = plot;
    // Set the scale explicitly exactly once at construction — restoring
    // whatever pan/zoom window was active before this instance was rebuilt
    // (e.g. toggling a compared lap), or else the shared xDomain so every lane
    // starts in sync instead of each auto-ranging to its own data span (see
    // xDomain above). A ONE-TIME imperative setScale call, same method
    // attachZoomPan itself uses for actual zoom/pan — NOT a persistent
    // `scales.x.range` config, which fought with attachZoomPan's own setScale
    // calls on every redraw and broke zooming entirely.
    const savedRange = viewRangeRef.current;
    if (savedRange) {
      plot.setScale('x', { min: savedRange.min, max: savedRange.max });
    } else if (xDomain) {
      plot.setScale('x', { min: xDomain[0], max: xDomain[1] });
    }
    suppressReport = false;
    const detachZoomPan = attachZoomPan(plot, syncKey, xDomain, onCursorClick);

    // The lane's pixel size is entirely a function of CSS flex-grow (see the
    // `.lane` weight style below) — this observer is what turns that layout
    // outcome into an actual canvas resize, on width AND height alike.
    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        plot.setSize({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      detachZoomPan();
      plot.destroy();
      plotRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structuralSignature, syncKey, showXAxis, xAxisMode, xDomain]);

  // Cheap path for a lane whose structure didn't change (see
  // structuralSignature above) but whose actual values did — a new fetch
  // resolved, a compared lap's data arrived, etc. setData(..., false)
  // refreshes the chart in place without resetting the user's current zoom;
  // the Y range still needs recomputing by hand since it's otherwise only
  // ever set once, from the data available at construction time.
  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    const data = buildPlotData(lane);
    plot.setData(data as uPlot.AlignedData, false);
    const yRange = lane.centerYOnZero ? computeZeroCenteredYRange(data) : computeFixedYRange(data);
    plot.setScale('y', { min: yRange[0], max: yRange[1] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lane]);

  function handleResizeStart(e: ReactMouseEvent) {
    e.preventDefault();
    const plot = plotRef.current;
    if (!plot) return;
    const startY = e.clientY;
    const startHeightPx = plot.height;
    const startWeight = weight;
    // How many pixels one weight unit is currently worth, so a pixel drag maps
    // onto a proportionate weight change regardless of how many lanes there are.
    const pxPerWeight = startHeightPx / startWeight;

    function clamp(w: number) {
      return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, w));
    }
    function onMove(ev: MouseEvent) {
      const newWeight = clamp(startWeight + (ev.clientY - startY) / pxPerWeight);
      onWeightChange?.(lane.key, newWeight);
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  return (
    <div className="lane" style={{ flexGrow: weight }}>
      <div className="lane-label">
        {lane.label}
        {cursorT != null && (
          <span className="lane-label-values">
            {lane.series.valueColumns.map((col, i) => {
              const referenceValue = nearestValue(lane.series.t, lane.series.values[col], cursorT);
              return (
                <span key={col} className="lane-label-column">
                  {lane.series.valueColumns.length > 1 && (
                    <span className="lane-label-column-name" style={{ color: lane.columnStyles[i].color }}>
                      {lane.columnStyles[i].label}
                    </span>
                  )}
                  <span style={{ color: lane.columnStyles[i].color }}>{formatValue(referenceValue)}</span>
                  {lane.compares.map((cmp) => {
                    const compareValues = cmp.series.values[col];
                    if (!compareValues) return null;
                    const compareValue = nearestValue(cmp.series.t, compareValues, cursorT);
                    const delta =
                      typeof compareValue === 'number' && typeof referenceValue === 'number'
                        ? formatDelta(compareValue - referenceValue)
                        : null;
                    return (
                      <span key={cmp.id} className="lane-label-delta" style={{ color: cmp.color }}>
                        {formatValue(compareValue)}
                        {delta && ` (Δ ${delta})`}
                      </span>
                    );
                  })}
                </span>
              );
            })}
          </span>
        )}
      </div>
      <div ref={containerRef} className="lane-canvas" />
      <div className="lane-resize-handle" onMouseDown={handleResizeStart} title={t('channelPlot.resize')} />
    </div>
  );
}
