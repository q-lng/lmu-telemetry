import { useEffect, useRef } from 'react';
import { nearestIndex } from '../nearest';

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
}

export function TrackMap({ lat, lon, t, cursorT, viewRange, height = 260 }: Props) {
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

    const minLat = Math.min(...lat);
    const maxLat = Math.max(...lat);
    const minLon = Math.min(...lon);
    const maxLon = Math.max(...lon);
    const pad = 16;
    const spanLat = maxLat - minLat || 1;
    const spanLon = maxLon - minLon || 1;
    // A degree of longitude is only the same physical distance as a degree of
    // latitude at the equator — it shrinks by cos(latitude) elsewhere. Without
    // this, a track's shape reads flattened/stretched depending on the
    // circuit's real-world latitude (e.g. very noticeable at Spa, ~50°N).
    const lonCorrection = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const spanLonCorrected = spanLon * lonCorrection || 1;
    const scale = Math.min((width - 2 * pad) / spanLonCorrected, (height - 2 * pad) / spanLat);

    const toXY = (la: number, lo_: number): [number, number] => {
      const x = pad + (lo_ - minLon) * lonCorrection * scale;
      const y = height - pad - (la - minLat) * scale;
      return [x, y];
    };

    ctx.clearRect(0, 0, width, height);

    const fullMin = t[0];
    const fullMax = t[t.length - 1];
    const tolerance = (fullMax - fullMin) * 0.005;
    const isZoomed = !!viewRange && (viewRange.min > fullMin + tolerance || viewRange.max < fullMax - tolerance);

    ctx.strokeStyle = isZoomed ? 'rgba(57, 135, 229, 0.25)' : '#3987e5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    lat.forEach((la, i) => {
      const [x, y] = toXY(la, lon[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    if (isZoomed && viewRange) {
      ctx.strokeStyle = '#3987e5';
      ctx.lineWidth = 4;
      ctx.beginPath();
      let penDown = false;
      lat.forEach((la, i) => {
        const inRange = t[i] >= viewRange.min && t[i] <= viewRange.max;
        if (!inRange) {
          penDown = false;
          return;
        }
        const [x, y] = toXY(la, lon[i]);
        if (!penDown) {
          ctx.moveTo(x, y);
          penDown = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    }

    if (cursorT !== null && t.length > 0) {
      const idx = nearestIndex(t, cursorT);
      const [x, y] = toXY(lat[idx], lon[idx]);
      ctx.fillStyle = '#d95926';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [lat, lon, t, cursorT, viewRange, height]);

  return (
    <div className="track-map">
      <canvas ref={canvasRef} style={{ width: '100%', height }} />
    </div>
  );
}
