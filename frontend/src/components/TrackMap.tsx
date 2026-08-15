import { useEffect, useRef, useState } from 'react';
import { drawTrackMap, type MapCalibration } from '../trackMapDraw';

interface Props {
  lat: number[];
  lon: number[];
  t: number[];
  cursorT: number | null;
  /** Current zoomed-in x-window (same unit as `t`) — the matching stretch of the
   * path is highlighted so you can see which part of the circuit the graphs are
   * currently focused on. Null / spanning the full range = no highlight. */
  viewRange: { min: number; max: number } | null;
  height?: number;
  /** The track's official map image (pre-recolored, see mapImageProcessing.ts)
   * + its admin-calibrated rotation/position/scale, when known — see
   * TelemetryViewer.tsx/SharedLap.tsx for how it's resolved from the
   * session's TrackName. Omitted/null = trace only, exactly today's
   * behavior. */
  mapImage?: HTMLCanvasElement | null;
  mapCalibration?: MapCalibration | null;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

export function TrackMap({ lat, lon, t, cursorT, viewRange, height = 260, mapImage, mapCalibration }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  // Mirrors zoom/pan every render so the mount-only wheel/drag effect below
  // can read their current values without needing to re-attach its
  // listeners (and without going stale) — same pattern as
  // AdminTrackCalibration.tsx's drag handling.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panRef = useRef(pan);
  panRef.current = pan;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || lat.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Interactive zoom/pan is just a transform wrapped around the same
    // drawing call used everywhere else — drawTrackMap itself always draws
    // at the canvas's logical width/height, unaware this exists.
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    drawTrackMap(ctx, { width, height, lat, lon, t, cursorT, viewRange, mapImage, mapCalibration });
  }, [lat, lon, t, cursorT, viewRange, height, mapImage, mapCalibration, zoom, pan]);

  // Wheel-to-zoom (centered on the cursor) + drag-to-pan once zoomed in — a
  // mount-once effect (stable listeners) using refs for the current
  // zoom/pan so it never needs to re-attach mid-gesture despite calling
  // setState on every wheel tick / mousemove.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // `const ... = (...) => {}` rather than `function` declarations — TS's
    // narrowing of `canvas` (from the `if (!canvas) return;` above) doesn't
    // propagate into hoisted function declarations, only into closures
    // defined after the check.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomRef.current * factor));
      if (nextZoom === zoomRef.current) return;
      // Keep the point under the cursor fixed on screen while zooming, like
      // any interactive map.
      const worldX = (mx - panRef.current.x) / zoomRef.current;
      const worldY = (my - panRef.current.y) / zoomRef.current;
      const nextPan =
        nextZoom <= MIN_ZOOM + 0.0001 ? { x: 0, y: 0 } : { x: mx - worldX * nextZoom, y: my - worldY * nextZoom };
      setZoom(nextZoom);
      setPan(nextPan);
    };

    let dragStart: { x: number; y: number; panX0: number; panY0: number } | null = null;
    const onMouseMove = (e: MouseEvent) => {
      if (!dragStart) return;
      setPan({ x: dragStart.panX0 + (e.clientX - dragStart.x), y: dragStart.panY0 + (e.clientY - dragStart.y) });
    };
    const onMouseUp = () => {
      dragStart = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (zoomRef.current <= MIN_ZOOM + 0.0001) return;
      dragStart = { x: e.clientX, y: e.clientY, panX0: panRef.current.x, panY0: panRef.current.y };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onMouseDown);
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return (
    <div className="track-map">
      <canvas ref={canvasRef} style={{ width: '100%', height, cursor: zoom > MIN_ZOOM + 0.0001 ? 'grab' : 'default' }} />
    </div>
  );
}
