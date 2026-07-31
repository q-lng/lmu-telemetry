import type { Lane } from '../types';
import { nearestValue } from '../nearest';
import { COMPARE_COLOR } from '../palette';
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

export function TelemetryLegend({ lanes, cursorT }: Props) {
  const rows = lanes.flatMap((lane) => {
    const isMulti = lane.series.valueColumns.length > 1;
    const primary = lane.series.valueColumns.map((col, i) => ({
      key: `${lane.key}__${col}`,
      color: lane.columnStyles[i].color,
      dashed: !!lane.columnStyles[i].dash,
      label: lane.columnStyles[i].label,
      unit: lane.series.unit,
      value: nearestValue(lane.series.t, lane.series.values[col], cursorT),
    }));
    // One compare row per column that actually has compare data — a grouped lane
    // (e.g. Pedals) can have a comparison for every member, not just the first.
    if (lane.compare) {
      const compare = lane.compare;
      lane.series.valueColumns.forEach((col, i) => {
        const compareValues = compare.values[col];
        if (!compareValues) return;
        primary.push({
          key: `${lane.key}__${col}__compare`,
          color: isMulti ? lane.columnStyles[i].color : COMPARE_COLOR,
          dashed: true,
          label: `${lane.columnStyles[i].label}${t('telemetryLegend.comparedSuffix')}`,
          unit: lane.series.unit,
          value: nearestValue(compare.t, compareValues, cursorT),
        });
      });
    }
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
          </span>
        </div>
      ))}
    </div>
  );
}
