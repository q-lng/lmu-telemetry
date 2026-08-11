import type { BadgeTone } from './components/Badge';

export const CAR_CATEGORIES = ['gte', 'gt3', 'lmp3', 'lmp2-wec', 'lmp2-elms', 'hypercar'] as const;
export type CarCategory = (typeof CAR_CATEGORIES)[number];

export interface CarKanbanGroup {
  label: string;
  categories: CarCategory[];
}

// Kanban columns for the /cars board — roughly top-down by class prestige.
// LMP2 WEC and LMP2 ELMS share one column (same underlying car, different
// power level — genuinely one class visually) but each car keeps its own
// precise category badge (see CarsPage.tsx), since that difference still
// matters per car. Every other category gets its own column 1:1.
export const CAR_KANBAN_GROUPS: CarKanbanGroup[] = [
  { label: 'Hypercar', categories: ['hypercar'] },
  { label: 'LMP2', categories: ['lmp2-wec', 'lmp2-elms'] },
  { label: 'LMP3', categories: ['lmp3'] },
  { label: 'LMGT3', categories: ['gt3'] },
  { label: 'LMGTE', categories: ['gte'] },
];

// Display labels only — the underlying category values ('gt3'/'gte' in the
// DB CHECK constraint and CAR_CATEGORIES above) are unchanged, so no
// migration needed for this rename.
export const CAR_CATEGORY_LABELS: Record<CarCategory, string> = {
  gte: 'LMGTE',
  gt3: 'LMGT3',
  lmp3: 'LMP3',
  'lmp2-wec': 'LMP2 WEC',
  'lmp2-elms': 'LMP2 ELMS',
  hypercar: 'Hypercar',
};

// Colors as specified: LMGTE yellow-orange, LMGT3 dark green, LMP3 purple,
// LMP2 WEC dark blue, LMP2 ELMS orange, Hypercar red (reuses the existing
// --danger-based red tone — every other one is a new tone added to
// Badge.tsx/styles.css specifically for car categories).
export const CAR_CATEGORY_TONES: Record<CarCategory, BadgeTone> = {
  gte: 'yellow',
  gt3: 'green-dark',
  lmp3: 'purple',
  'lmp2-wec': 'blue-dark',
  'lmp2-elms': 'orange',
  hypercar: 'red',
};
