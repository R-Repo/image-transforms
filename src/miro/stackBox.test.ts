import { describe, it, expect } from 'vitest';
import { resolveTargetBox } from './stackBox';
import type { StackBox, LayerDims } from './stackBox';

const layer: LayerDims = { naturalWidth: 2000, naturalHeight: 1000, boardWidth: 600 };

describe('resolveTargetBox', () => {
  it('not locked: uses the layer’s own dimensions, no capture', () => {
    const r = resolveTargetBox(null, layer, false);
    expect(r.box).toEqual({ outWidth: 2000, outHeight: 1000, placeWidth: 2000 });
    expect(r.capture).toBeNull();
  });

  it('not locked: ignores any stored reference', () => {
    const stored: StackBox = { outWidth: 1200, outHeight: 800, placeWidth: 600 };
    const r = resolveTargetBox(stored, layer, false);
    expect(r.box).toEqual({ outWidth: 2000, outHeight: 1000, placeWidth: 2000 });
    expect(r.capture).toBeNull();
  });

  it('locked with a stored reference: matches the stored box, no capture', () => {
    const stored: StackBox = { outWidth: 1200, outHeight: 800, placeWidth: 600 };
    const r = resolveTargetBox(stored, layer, true);
    expect(r.box).toEqual(stored);
    expect(r.capture).toBeNull();
  });

  it('locked with no reference: captures this layer (output = natural dims, place = boardWidth)', () => {
    const r = resolveTargetBox(null, layer, true);
    const expected = { outWidth: 2000, outHeight: 1000, placeWidth: 600 };
    expect(r.box).toEqual(expected);
    expect(r.capture).toEqual(expected);
  });
});
