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

/** "By lap" color mode: every reference-lap channel shares this one neutral
 * color, so distinct compared-lap colors are what the eye follows instead of
 * per-channel hues. Distinct from every compared-lap color below. */
export const REFERENCE_UNIFORM_COLOR = '#9aa0a6';

/**
 * Colors assigned to compared laps in the order they're added (not by channel)
 * — stable per lap even if another compared lap is later removed. First is a
 * plain white "ghost" trace (the common case: one reference vs one compared
 * lap), solid rather than dashed so hue/brightness alone carries the identity.
 */
const COMPARED_LAP_COLORS = [
  '#ffffff',
  '#f2b705',
  '#ff5fae',
  '#5ecbf2',
  '#8f6fe0',
  '#7ee08f',
  '#ff8a3d',
  '#3cd9c5',
];

export function comparedLapColor(index: number): string {
  return COMPARED_LAP_COLORS[index % COMPARED_LAP_COLORS.length];
}

export const CHART_CHROME = {
  surface: '#1a1a19',
  primaryInk: '#ffffff',
  secondaryInk: '#c3c2b7',
  mutedInk: '#898781',
  gridline: '#2c2c2a',
  axis: '#383835',
};
