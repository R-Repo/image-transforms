import type { Corners } from '../engine/types';

export type PresetName =
  | 'free'
  | 'floor'
  | 'leftWall'
  | 'rightWall'
  | 'isoLeft'
  | 'isoRight'
  | 'recedeRight';

export const PRESET_NAMES: PresetName[] = [
  'free',
  'floor',
  'leftWall',
  'rightWall',
  'isoLeft',
  'isoRight',
  'recedeRight',
];

/** Human-readable labels for the preset bar. */
export const PRESET_LABELS: Record<PresetName, string> = {
  free: 'Free',
  floor: 'Floor',
  leftWall: 'Left Wall',
  rightWall: 'Right Wall',
  isoLeft: 'Iso Left',
  isoRight: 'Iso Right',
  recedeRight: 'Recede Right',
};

/**
 * Normalized corner quads, order TL, TR, BR, BL.
 * The first six are from the design spec; `recedeRight` was hand-tuned in the
 * editor — left edge stays full-height (near) while the far edge is pulled
 * inward and foreshortened, giving a strong rightward recede into 3D space.
 */
export const PRESETS: Record<PresetName, Corners> = {
  free: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ],
  floor: [
    { x: 0.28, y: 0.05 },
    { x: 0.72, y: 0.05 },
    { x: 1.0, y: 0.96 },
    { x: 0.0, y: 0.96 },
  ],
  leftWall: [
    { x: 0.04, y: 0.04 },
    { x: 1.0, y: 0.24 },
    { x: 1.0, y: 0.76 },
    { x: 0.04, y: 0.96 },
  ],
  rightWall: [
    { x: 0.0, y: 0.24 },
    { x: 0.96, y: 0.04 },
    { x: 0.96, y: 0.96 },
    { x: 0.0, y: 0.76 },
  ],
  isoLeft: [
    { x: 0.0, y: 0.3 },
    { x: 1.0, y: 0.04 },
    { x: 1.0, y: 0.74 },
    { x: 0.0, y: 1.0 },
  ],
  isoRight: [
    { x: 0.0, y: 0.04 },
    { x: 1.0, y: 0.3 },
    { x: 1.0, y: 1.0 },
    { x: 0.0, y: 0.74 },
  ],
  recedeRight: [
    { x: 0.0, y: 0.0 },
    { x: 0.48, y: 0.2 },
    { x: 0.48, y: 0.8 },
    { x: 0.0, y: 1.0 },
  ],
};

/** Return a deep copy of a preset's corners so callers can mutate freely. */
export function getPreset(name: PresetName): Corners {
  return PRESETS[name].map((p) => ({ x: p.x, y: p.y })) as Corners;
}
