import { useEffect, useRef } from 'react';
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
  /** The track's official map image + its admin-calibrated rotation/position/
   * scale, when known — see TelemetryViewer.tsx/SharedLap.tsx for how it's
   * resolved from the session's TrackName. Omitted/null = trace only, exactly
   * today's behavior. */
  mapImage?: HTMLImageElement | null;
  mapCalibration?: MapCalibration | null;
}

export function TrackMap({ lat, lon, t, cursorT, viewRange, height = 260, mapImage, mapCalibration }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    drawTrackMap(ctx, { width, height, lat, lon, t, cursorT, viewRange, mapImage, mapCalibration });
  }, [lat, lon, t, cursorT, viewRange, height, mapImage, mapCalibration]);

  return (
    <div className="track-map">
      <canvas ref={canvasRef} style={{ width: '100%', height }} />
    </div>
  );
}
