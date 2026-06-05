import { describe, it, expect } from 'vitest';
import { placeToRight } from './placement';

describe('placeToRight', () => {
  it('centers the new image to the right of the original with the default gap', () => {
    // original center (0,0), 100 wide; new image 100 wide.
    // new center x = 0 + 50 + 40 + 50 = 140; y unchanged.
    expect(placeToRight({ x: 0, y: 0, width: 100, height: 50 }, 100)).toEqual({
      x: 140,
      y: 0,
    });
  });

  it('accounts for a different new width', () => {
    // new center x = 0 + 50 + 40 + 30 = 120.
    expect(placeToRight({ x: 0, y: 0, width: 100, height: 50 }, 60)).toEqual({
      x: 120,
      y: 0,
    });
  });

  it('honors a custom gap and preserves y', () => {
    expect(placeToRight({ x: 10, y: 25, width: 100, height: 50 }, 100, 0)).toEqual({
      x: 110,
      y: 25,
    });
  });
});
