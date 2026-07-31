import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { createSharedLapDataSource } from '../dataSource';
import type { ChannelSeries, Lane, SessionMetadata } from '../types';
import { ChannelPlot } from '../components/ChannelPlot';
import { TrackMap } from '../components/TrackMap';
import { TelemetryLegend } from '../components/TelemetryLegend';
import { channelColor } from '../palette';
import { t } from '../i18n';

// Fixed default channel set — this is a minimal read-only view for a single shared
// lap, not the full customizable TelemetryViewer (no channel picker/presets/compare).
const DEFAULT_CHANNELS = ['Ground Speed', 'Gear', 'Throttle Pos Unfiltered', 'Brake Pos Unfiltered', 'Steering Pos'];

export function SharedLap() {
  const { file = '', lap = '' } = useParams<{ file: string; lap: string }>();
  const lapNumber = Number(lap);
  const dataSource = useMemo(() => createSharedLapDataSource(file, lapNumber), [file, lapNumber]);

  const [metadata, setMetadata] = useState<SessionMetadata | null>(null);
  const [seriesByName, setSeriesByName] = useState<Record<string, ChannelSeries>>({});
  const [gps, setGps] = useState<{ t: number[]; lat: number[]; lon: number[] } | null>(null);
  const [cursorT, setCursorT] = useState<number | null>(null);
  const [cursorLocked, setCursorLocked] = useState(false);
  const [viewRange, setViewRange] = useState<{ min: number; max: number } | null>(null);

  function handleGraphClick(value: number) {
    setCursorLocked((prevLocked) => {
      if (prevLocked) return false;
      setCursorT(value);
      return true;
    });
  }
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function run() {
      const laps = await dataSource.fetchLaps();
      const lapInfo = laps[0];
      if (!lapInfo) throw new Error(t('sharedLap.notFound'));
      const offset = lapInfo.startTs;

      const [meta, ...rest] = await Promise.all([
        dataSource.fetchMetadata(),
        ...DEFAULT_CHANNELS.map((name) => dataSource.fetchChannelSeries(name).catch(() => null)),
        dataSource.fetchChannelSeries('GPS Latitude').catch(() => null),
        dataSource.fetchChannelSeries('GPS Longitude').catch(() => null),
      ]);
      if (cancelled) return;

      const channelResults = rest.slice(0, DEFAULT_CHANNELS.length) as (ChannelSeries | null)[];
      const [latS, lonS] = rest.slice(DEFAULT_CHANNELS.length) as (ChannelSeries | null)[];

      const next: Record<string, ChannelSeries> = {};
      channelResults.forEach((s, i) => {
        if (s) next[DEFAULT_CHANNELS[i]] = { ...s, t: s.t.map((x) => x - offset) };
      });
      setSeriesByName(next);
      setMetadata(meta);
      if (latS && lonS) {
        setGps({
          t: latS.t.map((x) => x - offset),
          lat: latS.values.value as number[],
          lon: lonS.values.value as number[],
        });
      }
    }

    run()
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dataSource]);

  const lanes: Lane[] = useMemo(() => {
    const result: Lane[] = [];
    const speed = seriesByName['Ground Speed'];
    if (speed) result.push({ key: 'speed', label: 'Ground Speed', series: speed, columnStyles: [{ label: 'Ground Speed', color: channelColor(0) }], compares: [] });

    const gear = seriesByName['Gear'];
    if (gear) result.push({ key: 'gear', label: 'Gear', series: gear, columnStyles: [{ label: 'Gear', color: channelColor(1) }], compares: [] });

    const throttle = seriesByName['Throttle Pos Unfiltered'];
    const brake = seriesByName['Brake Pos Unfiltered'];
    if (throttle && brake) {
      result.push({
        key: 'pedals',
        label: t('tv.defaultGroupPedals'),
        series: {
          ...throttle,
          valueColumns: ['Throttle Pos Unfiltered', 'Brake Pos Unfiltered'],
          values: {
            'Throttle Pos Unfiltered': throttle.values.value,
            'Brake Pos Unfiltered': brake.values.value,
          },
        },
        columnStyles: [
          { label: 'Throttle Pos Unfiltered', color: '#008300' },
          { label: 'Brake Pos Unfiltered', color: '#e66767' },
        ],
        compares: [],
      });
    } else if (throttle) {
      result.push({ key: 'throttle', label: 'Throttle Pos Unfiltered', series: throttle, columnStyles: [{ label: 'Throttle Pos Unfiltered', color: '#008300' }], compares: [] });
    }

    const steering = seriesByName['Steering Pos'];
    if (steering) result.push({ key: 'steering', label: 'Steering Pos', series: steering, columnStyles: [{ label: 'Steering Pos', color: channelColor(2) }], compares: [] });

    return result;
  }, [seriesByName]);

  if (loading) {
    return (
      <div className="page-loading">
        <span className="spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="social-page">
        <div className="social-card">
          <div className="social-empty">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="shared-lap-page">
      <div className="shared-lap-header">
        <h1>
          {metadata?.info.TrackName ?? file} — {t('lap.number', { n: lapNumber })}
        </h1>
        <p>
          {metadata?.info.CarName}
          {metadata?.info.DriverName ? ` · ${metadata.info.DriverName}` : ''}
        </p>
      </div>

      {gps && <TrackMap lat={gps.lat} lon={gps.lon} t={gps.t} cursorT={cursorT} viewRange={viewRange} height={260} />}

      {cursorLocked && (
        <button className="cursor-lock-hint" onClick={() => setCursorLocked(false)}>
          {t('tv.cursorLockedHint')}
        </button>
      )}

      <TelemetryLegend lanes={lanes} cursorT={cursorT} comparedLapColumns={[]} />

      <div className="telemetry-block shared-lap-graphs">
        {lanes.map((lane, i) => (
          <ChannelPlot
            key={lane.key}
            lane={lane}
            syncKey="shared-lap"
            showXAxis={i === lanes.length - 1}
            xAxisMode="time"
            weight={1}
            cursorT={cursorT}
            cursorLocked={cursorLocked}
            onCursorMove={setCursorT}
            onCursorClick={handleGraphClick}
            onViewRangeChange={setViewRange}
          />
        ))}
      </div>
    </div>
  );
}
