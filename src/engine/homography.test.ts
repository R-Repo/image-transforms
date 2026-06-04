import { describe, it, expect } from 'vitest';
import {
  computeHomography,
  project,
  invert3x3,
  multiply3x3,
  determinant3x3,
} from './homography';
import type { Corners } from './types';

const UNIT: Corners = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

const QUAD: Corners = [
  { x: 0.1, y: 0.2 },
  { x: 0.9, y: 0.1 },
  { x: 0.95, y: 0.85 },
  { x: 0.05, y: 0.9 },
];

describe('computeHomography', () => {
  it('maps the unit square to itself as the identity', () => {
    const H = computeHomography(UNIT);
    expect(H[0]).toBeCloseTo(1);
    expect(H[4]).toBeCloseTo(1);
    expect(H[8]).toBeCloseTo(1);
    expect(H[1]).toBeCloseTo(0);
    expect(H[3]).toBeCloseTo(0);
    expect(H[6]).toBeCloseTo(0);
    expect(H[7]).toBeCloseTo(0);
  });

  it('maps each unit-square corner onto the matching destination corner', () => {
    const H = computeHomography(QUAD);
    const src: Corners = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    for (let i = 0; i < 4; i++) {
      const p = project(H, src[i]);
      expect(p.x).toBeCloseTo(QUAD[i].x, 5);
      expect(p.y).toBeCloseTo(QUAD[i].y, 5);
    }
  });

  it('throws on a degenerate (collinear) quad', () => {
    const collinear: Corners = [
      { x: 0, y: 0 },
      { x: 0.33, y: 0 },
      { x: 0.66, y: 0 },
      { x: 1, y: 0 },
    ];
    expect(() => computeHomography(collinear)).toThrow();
  });
});

describe('invert3x3', () => {
  it('produces an inverse whose product with the original is identity', () => {
    const H = computeHomography(QUAD);
    const I = multiply3x3(H, invert3x3(H));
    const expected = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    for (let i = 0; i < 9; i++) expect(I[i]).toBeCloseTo(expected[i], 5);
  });

  it('throws on a singular matrix', () => {
    const singular = [1, 2, 3, 2, 4, 6, 1, 1, 1] as const;
    expect(() => invert3x3([...singular] as any)).toThrow();
  });
});

describe('project (round-trip through inverse)', () => {
  it('recovers the source point after H then H^-1', () => {
    const H = computeHomography(QUAD);
    const Hi = invert3x3(H);
    const srcPt = { x: 0.3, y: 0.7 };
    const out = project(H, srcPt);
    const back = project(Hi, out);
    expect(back.x).toBeCloseTo(srcPt.x, 5);
    expect(back.y).toBeCloseTo(srcPt.y, 5);
  });
});

describe('determinant3x3', () => {
  it('is 1 for the identity', () => {
    expect(determinant3x3([1, 0, 0, 0, 1, 0, 0, 0, 1])).toBeCloseTo(1);
  });
});
