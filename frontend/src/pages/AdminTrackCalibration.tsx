import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchSessions, fetchTrackCatalogEntry, updateAdminTrackMapCalibration } from '../api';
import { createServerDataSource } from '../dataSource';
import { drawTrackMap } from '../trackMapDraw';
import type { TrackCatalogEntry } from '../types';
import { t } from '../i18n';

// Fixed reference size for the calibration canvas (unlike TrackMap.tsx's
// responsive width) — decoupled from the container so `zoom` can scale the
// canvas's own backing store/CSS size without measuring its own already-
// zoomed clientWidth back into the next redraw (a feedback loop).
const BASE_WIDTH = 600;
const BASE_HEIGHT = 420;
// Matches the `pad` constant in trackMapDraw.ts — needed here independently
// to convert a drag's pixel delta into the same normalized-offset fraction
// drawTrackMap expects (a fraction of the trace's own bounding box, not of
// the full canvas).
const BOX_PAD = 16;

/** Admin tool for matching a track's map.png to a real GPS trace — the trace
 * is always centered (see trackMapDraw.ts), and the map's position/rotation/
 * scale relative to that center are adjustable: drag the canvas to
 * reposition, use the sliders for rotation/scale. `zoom` only magnifies the
 * view for precise alignment, it isn't part of the saved calibration. */
export function AdminTrackCalibration() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [entry, setEntry] = useState<TrackCatalogEntry | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [gps, setGps] = useState<{ lat: number[]; lon: number[]; t: number[] } | null>(null);
  const [noSession, setNoSession] = useState(false);
  const [mapImage, setMapImage] = useState<HTMLImageElement | null>(null);

  const [rotationDeg, setRotationDeg] = useState(0);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [scale, setScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Mirrors offsetX/offsetY/zoom every render so the mount-only drag effect
  // below can read their current values without needing to re-attach its
  // listeners (and without going stale) — same pattern as ChannelPlot.tsx's
  // pan/zoom handling.
  const offsetRef = useRef({ offsetX, offsetY });
  offsetRef.current = { offsetX, offsetY };
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    fetchTrackCatalogEntry(slug)
      .then((e) => {
        setEntry(e);
        setRotationDeg(e.mapRotationDeg);
        setOffsetX(e.mapOffsetX);
        setOffsetY(e.mapOffsetY);
        setScale(e.mapScale);
      })
      .catch(() => setNotFound(true));
  }, [slug]);

  useEffect(() => {
    if (!entry?.mapExt) {
      setMapImage(null);
      return;
    }
    const img = new Image();
    img.onload = () => setMapImage(img);
    img.src = `/api/track-photos/${entry.slug}-map.${entry.mapExt}`;
  }, [entry]);

  // Reference trace: the first session (of any visibility this admin can
  // see) matching the track's catalog name — same free-text match every
  // other track-scoped query in the app already relies on.
  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    setNoSession(false);
    setGps(null);
    fetchSessions({ track: entry.name })
      .then(async (sessions) => {
        const first = sessions[0];
        if (!first) {
          if (!cancelled) setNoSession(true);
          return;
        }
        const ds = createServerDataSource(first.file);
        const [latS, lonS] = await Promise.all([ds.fetchChannelSeries('GPS Latitude'), ds.fetchChannelSeries('GPS Longitude')]);
        if (cancelled) return;
        setGps({ lat: latS.values.value as number[], lon: lonS.values.value as number[], t: latS.t });
      })
      .catch(() => {
        if (!cancelled) setNoSession(true);
      });
    return () => {
      cancelled = true;
    };
  }, [entry]);

  // Redraws on every visual change. `zoom` scales the canvas's own backing
  // store and CSS size, not the logical width/height drawTrackMap works
  // with — the drawing itself is always computed at BASE_WIDTH x
  // BASE_HEIGHT, just rendered bigger/crisper (not blurrily stretched).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gps) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = BASE_WIDTH * zoom * dpr;
    canvas.height = BASE_HEIGHT * zoom * dpr;
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, 0, 0);
    drawTrackMap(ctx, {
      width: BASE_WIDTH,
      height: BASE_HEIGHT,
      lat: gps.lat,
      lon: gps.lon,
      t: gps.t,
      cursorT: null,
      viewRange: null,
      mapImage,
      mapCalibration: { rotationDeg, offsetX, offsetY, scale },
    });
  }, [gps, mapImage, rotationDeg, offsetX, offsetY, scale, zoom]);

  // Drag-to-reposition — a mount-only effect (stable listeners) using
  // closure-local drag state and the refs above for current offset/zoom, so
  // it never needs to re-attach mid-gesture despite calling setState on
  // every mousemove.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dragStart: { x: number; y: number; offsetX0: number; offsetY0: number } | null = null;

    function onMouseMove(e: MouseEvent) {
      if (!dragStart) return;
      const boxWidth = BASE_WIDTH - 2 * BOX_PAD;
      const boxHeight = BASE_HEIGHT - 2 * BOX_PAD;
      const dx = (e.clientX - dragStart.x) / zoomRef.current;
      const dy = (e.clientY - dragStart.y) / zoomRef.current;
      setOffsetX(dragStart.offsetX0 + dx / boxWidth);
      setOffsetY(dragStart.offsetY0 + dy / boxHeight);
    }
    function onMouseUp() {
      dragStart = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
    function onMouseDown(e: MouseEvent) {
      dragStart = { x: e.clientX, y: e.clientY, offsetX0: offsetRef.current.offsetX, offsetY0: offsetRef.current.offsetY };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    }
    canvas.addEventListener('mousedown', onMouseDown);
    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    // The canvas only exists in the DOM once `entry` has loaded (async) and
    // `noSession` has resolved — deps: [] would run this once, immediately on
    // mount, while canvasRef.current is still null (nothing rendered yet),
    // and never attach once the real canvas element shows up.
  }, [entry?.slug, entry?.mapExt, noSession]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateAdminTrackMapCalibration(slug, { rotationDeg, offsetX, offsetY, scale });
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (notFound) {
    return (
      <div className="page-shell">
        <div className="social-empty">{t('track.notFound')}</div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="page-loading">
        <span className="spinner" />
      </div>
    );
  }

  return (
    <div className="page-shell">
      <Link to="/admin/content/tracks" className="admin-back-link">
        {t('admin.backToAdmin')}
      </Link>
      <div className="auth-heading">
        <h1>{t('adminTrackCalibration.title')}</h1>
        <p>{entry.name}</p>
      </div>

      {!entry.mapExt ? (
        <div className="social-empty">{t('adminTrackCalibration.noMap')}</div>
      ) : noSession ? (
        <div className="social-empty">{t('adminTrackCalibration.noSession')}</div>
      ) : (
        <>
          <p className="field-hint">{t('adminTrackCalibration.hint')}</p>
          <div className="track-map-calibration-canvas-wrap" style={{ maxWidth: BASE_WIDTH, maxHeight: BASE_HEIGHT }}>
            <canvas ref={canvasRef} style={{ width: BASE_WIDTH * zoom, height: BASE_HEIGHT * zoom, cursor: gps ? 'move' : 'default' }} />
          </div>

          <div className="field">
            <strong>{t('adminTrackCalibration.zoom')} ({zoom.toFixed(1)}×)</strong>
            <input type="range" min={1} max={5} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
          </div>
          <div className="field">
            <strong>
              {t('adminTrackCalibration.rotation')} ({rotationDeg.toFixed(0)}°)
            </strong>
            <input type="range" min={-180} max={180} step={1} value={rotationDeg} onChange={(e) => setRotationDeg(Number(e.target.value))} />
          </div>
          <div className="field">
            <strong>
              {t('adminTrackCalibration.scale')} ({scale.toFixed(2)}×)
            </strong>
            <input type="range" min={0.2} max={3} step={0.01} value={scale} onChange={(e) => setScale(Number(e.target.value))} />
          </div>

          {error && <div className="auth-error">{error}</div>}
          <button className="auth-submit" disabled={saving} onClick={handleSave}>
            {saving ? t('adminTrackCalibration.saving') : t('adminTrackCalibration.save')}
          </button>
          {saved && !saving && <p className="field-hint">{t('adminTrackCalibration.saved')}</p>}
        </>
      )}
    </div>
  );
}
