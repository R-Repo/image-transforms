import { describe, it, expect } from 'vitest';
import { PRESETS, PRESET_NAMES, getPreset } from './presets';

describe('presets', () => {
  it('lists all six presets in display order', () => {
    expect(PRESET_NAMES).toEqual([
      'free',
      'floor',
      'leftWall',
      'rightWall',
      'isoLeft',
      'isoRight',
    ]);
  });

  it('free is the identity unit square', () => {
    expect(getPreset('free')).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]);
  });

  it('floor matches the documented quad', () => {
    expect(getPreset('floor')).toEqual([
      { x: 0.28, y: 0.05 },
      { x: 0.72, y: 0.05 },
      { x: 1.0, y: 0.96 },
      { x: 0.0, y: 0.96 },
    ]);
  });

  it('returns a fresh copy each call (mutation-safe)', () => {
    const a = getPreset('floor');
    a[0].x = 999;
    const b = getPreset('floor');
    expect(b[0].x).toBe(0.28);
    expect(a).not.toBe(b);
  });
});
