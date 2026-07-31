import { useEffect, useRef } from 'react';
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

const ZOOM_FACTOR = 0.85;
// Below this much horizontal movement, a mousedown+mouseup counts as a click
// (freeze the cursor there) rather than a pan drag.
const CLICK_MOVE_THRESHOLD = 4;

/** Wheel-to-zoom (centered on cursor) + click-drag-to-pan on the x scale, applied
 * to every lane sharing `syncKey` — `cursor.sync.scales` only syncs uPlot's own
 * native cursor/drag interactions, not externally-invoked `setScale()` calls, so
 * the resulting range is pushed by hand to every plot in `uPlot.sync(syncKey)`.
 * Bounds are taken from the actual x data (not `u.scales.x`, which reflects the
 * current — possibly already zoomed — view and can lag right after construction).
 * `onClickAt` fires instead of a pan when the mouse barely moved between down/up. */
function attachZoomPan(u: uPlot, syncKey: string, onClickAt?: (value: number) => void): () => void {
  const over = u.over;
  const xs = u.data[0] as number[];
  const fullMin = xs[0];
  const fullMax = xs[xs.length - 1];
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
  cursorT,
  cursorLocked,
  onWeightChange,
  onCursorMove,
  onCursorClick,
  onViewRangeChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  // Read fresh inside the setCursor hook below (which is only rebuilt when `lane`
  // changes, not on every cursor tick) — a plain closure over cursorT/cursorLocked
  // would go stale the moment the user moves the mouse after locking.
  const cursorLockRef = useRef<{ locked: boolean; value: number | null }>({ locked: false, value: null });
  useEffect(() => {
    cursorLockRef.current = { locked: !!cursorLocked, value: cursorT ?? null };
  }, [cursorLocked, cursorT]);

  useEffect(() => {
    if (!containerRef.current) return;
    const { series, columnStyles, compares } = lane;
    const isEvent = series.kind === 'event';
    const stepPaths = isEvent ? uPlot.paths.stepped!({ align: 1 }) : undefined;

    const data: (number | null)[][] = [series.t, ...series.valueColumns.map((col) => numeric(series.values[col]))];
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
        data.push(compareValues);
        seriesOpts.push({
          label: `${columnStyles[i].label}${t('channelPlot.comparedSuffix')} — ${cmp.label}`,
          stroke: cmp.color,
          width: LINE_WIDTH,
          paths: stepPaths,
          points: { show: false },
        });
      });
    });

    const opts: uPlot.Options = {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      padding: [4, 8, showXAxis ? 4 : 0, 0],
      cursor: { drag: { x: false, y: false }, sync: { key: syncKey, scales: ['x', null] } },
      legend: { show: false },
      scales: { x: { time: false }, y: { range: computeFixedYRange(data) } },
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
            const lock = cursorLockRef.current;
            if (lock.locked && lock.value != null) {
              // Recomputed from the locked data value every time (not a fixed pixel)
              // so it stays correctly placed across pan/zoom while locked.
              const lockedLeft = u.valToPos(lock.value, 'x');
              if (Math.abs((u.cursor.left ?? -1000) - lockedLeft) > 0.5) {
                u.setCursor({ left: lockedLeft, top: u.cursor.top ?? 0 });
                return; // this setCursor call re-enters the hook with the corrected position
              }
            }
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
            if (!showXAxis || key !== 'x' || !onViewRangeChange) return;
            const { min, max } = u.scales.x;
            if (min != null && max != null) onViewRangeChange({ min, max });
          },
        ],
      },
    };

    const plot = new uPlot(opts, data as uPlot.AlignedData, containerRef.current);
    plotRef.current = plot;
    const detachZoomPan = attachZoomPan(plot, syncKey, onCursorClick);

    if (showXAxis && onViewRangeChange && plot.scales.x.min != null && plot.scales.x.max != null) {
      onViewRangeChange({ min: plot.scales.x.min, max: plot.scales.x.max });
    }

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
  }, [lane, syncKey, showXAxis, xAxisMode]);

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
        {cursorT != null && lane.compares.length > 0 && (
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
