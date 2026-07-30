// Dark-mode categorical steps from the validated reference palette (adjacent-pair
// order, CVD-safe). App is dark-theme-only, so we use the dark column directly.
const CATEGORICAL_DARK = [
  '#3987e5', // blue
  '#d95926', // orange
  '#199e70', // aqua
  '#c98500', // yellow
  '#d55181', // magenta
  '#008300', // green
  '#9085e9', // violet
  '#e66767', // red
];

/** Stable color for a channel based on its position in the user's selection order. */
export function channelColor(index: number): string {
  return CATEGORICAL_DARK[index % CATEGORICAL_DARK.length];
}

const DASH_SOLID: number[] | undefined = undefined;
const DASH_DASHED = [6, 4];

/**
 * Fixed color+dash per wheel column (value1..value4 = FL/FR/RL/RR in LMU/rF2
 * telemetry): front axle in blue, rear axle in orange, left solid / right dashed.
 * Keeps identity (axle) on hue and identity (side) on pattern instead of needing
 * 4 mutually CVD-safe hues at once.
 */
export const CORNER_STYLE: { label: string; color: string; dash?: number[] }[] = [
  { label: 'AVG', color: CATEGORICAL_DARK[0], dash: DASH_SOLID },
  { label: 'AVD', color: CATEGORICAL_DARK[0], dash: DASH_DASHED },
  { label: 'ARG', color: CATEGORICAL_DARK[1], dash: DASH_SOLID },
  { label: 'ARD', color: CATEGORICAL_DARK[1], dash: DASH_DASHED },
];

/** Fixed neutral hue for the comparison-lap overlay — distinct from every
 * categorical/known channel color, so it stays visible even where the two
 * traces overlap (a faded version of the same hue disappears into it). */
export const COMPARE_COLOR = '#c3c2b7';

export const CHART_CHROME = {
  surface: '#1a1a19',
  primaryInk: '#ffffff',
  secondaryInk: '#c3c2b7',
  mutedInk: '#898781',
  gridline: '#2c2c2a',
  axis: '#383835',
};
