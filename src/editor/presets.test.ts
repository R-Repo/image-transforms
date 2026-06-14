import { describe, it, expect } from 'vitest';
import { PRESETS, PRESET_NAMES, getPreset } from './presets';

describe('presets', () => {
  it('lists all eight presets in display order', () => {
    expect(PRESET_NAMES).toEqual([
      'free',
      'floor',
      'leftWall',
      'rightWall',
      'isoLeft',
      'isoRight',
      'recedeRight',
      'stack',
    ]);
  });

  it('PRESETS defines a quad for exactly the named presets', () => {
    expect(Object.keys(PRESETS)).toEqual(PRESET_NAMES);
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

  it('recedeRight matches the documented quad', () => {
    expect(getPreset('recedeRight')).toEqual([
      { x: 0.0, y: 0.0 },
      { x: 0.48, y: 0.2 },
      { x: 0.48, y: 0.8 },
      { x: 0.0, y: 1.0 },
    ]);
  });

  it('stack leans back with perspective foreshortening (far edge shorter and pulled in)', () => {
    const c = getPreset('stack');
    const leftHeight = c[3].y - c[0].y; // BL.y - TL.y (near edge)
    const rightHeight = c[2].y - c[1].y; // BR.y - TR.y (far edge)
    expect(rightHeight).toBeLessThan(leftHeight); // far edge foreshortened
    expect(c[1].x).toBeLessThan(1); // far edge pulled inward (perspective, not full-width)
    expect(c[2].x).toBeLessThan(1);
    expect(c).toEqual([
      { x: 0.0, y: 0.15 },
      { x: 0.47, y: 0.12 },
      { x: 0.46, y: 0.82 },
      { x: 0.0, y: 1.0 },
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
