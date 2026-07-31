import type { Lane } from '../types';
import { nearestValue } from '../nearest';
import { t } from '../i18n';

interface Props {
  lanes: Lane[];
  cursorT: number | null;
}

function formatValue(v: number | boolean | null): string {
  if (v === null || v === undefined) return '–';
  if (typeof v === 'boolean') return v ? t('telemetryLegend.on') : t('telemetryLegend.off');
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function formatDelta(v: number): string {
  const sign = v >= 0 ? '+' : '-';
  const abs = Math.abs(v);
  return `${sign}${Number.isInteger(abs) ? String(abs) : abs.toFixed(2)}`;
}

export function TelemetryLegend({ lanes, cursorT }: Props) {
  const rows = lanes.flatMap((lane) => {
    const primary = lane.series.valueColumns.map((col, i) => ({
      key: `${lane.key}__${col}`,
      color: lane.columnStyles[i].color,
      dashed: !!lane.columnStyles[i].dash,
      label: lane.columnStyles[i].label,
      unit: lane.series.unit,
      value: nearestValue(lane.series.t, lane.series.values[col], cursorT),
      delta: null as string | null,
    }));
    // One row per compared lap per column that actually has compare data — a
    // grouped lane (e.g. Pedals) can have a comparison for every member, not
    // just the first. Each row shows that lap's value plus its delta against
    // the reference lap shown just above (skipped for non-numeric/boolean columns).
    lane.compares.forEach((cmp) => {
      lane.series.valueColumns.forEach((col, i) => {
        const compareValues = cmp.series.values[col];
        if (!compareValues) return;
        const compareValue = nearestValue(cmp.series.t, compareValues, cursorT);
        const referenceValue = nearestValue(lane.series.t, lane.series.values[col], cursorT);
        const delta =
          typeof compareValue === 'number' && typeof referenceValue === 'number'
            ? formatDelta(compareValue - referenceValue)
            : null;
        primary.push({
          key: `${lane.key}__${col}__${cmp.id}`,
          color: cmp.color,
          dashed: false,
          label: `${lane.columnStyles[i].label}${t('telemetryLegend.comparedSuffix')} — ${cmp.label}`,
          unit: lane.series.unit,
          value: compareValue,
          delta,
        });
      });
    });
    return primary;
  });

  return (
    <div className="telemetry-legend">
      {rows.length === 0 && <div className="legend-empty">{t('telemetryLegend.selectChannelsHint')}</div>}
      {rows.map((r) => (
        <div className="legend-row" key={r.key}>
          <span className={`legend-swatch${r.dashed ? ' dashed' : ''}`} style={{ borderColor: r.color }} />
          <span className="legend-label">{r.label}</span>
          <span className="legend-value">
            {formatValue(r.value)} <span className="legend-unit">{r.unit}</span>
            {r.delta && <span className="legend-delta">Δ {r.delta}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
