import { describe, it, expect } from 'vitest';
import type { Corners } from '../engine/types';
import { clamp01, nearestHandle, moveHandle } from './editorState';

const UNIT: Corners = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

describe('clamp01', () => {
  it('clamps below 0 up to 0', () => {
    expect(clamp01(-0.5)).toBe(0);
  });
  it('clamps above 1 down to 1', () => {
    expect(clamp01(1.5)).toBe(1);
  });
  it('passes through values in range', () => {
    expect(clamp01(0.4)).toBe(0.4);
  });
});

describe('nearestHandle', () => {
  it('returns the index of a corner within maxDist', () => {
    expect(nearestHandle(UNIT, { x: 0.02, y: 0.02 }, 0.1)).toBe(0);
    expect(nearestHandle(UNIT, { x: 0.98, y: 0.02 }, 0.1)).toBe(1);
    expect(nearestHandle(UNIT, { x: 0.98, y: 0.98 }, 0.1)).toBe(2);
    expect(nearestHandle(UNIT, { x: 0.02, y: 0.98 }, 0.1)).toBe(3);
  });
  it('returns null when no corner is within maxDist', () => {
    expect(nearestHandle(UNIT, { x: 0.5, y: 0.5 }, 0.1)).toBeNull();
  });
});

describe('moveHandle', () => {
  it('moves only the targeted corner', () => {
    const next = moveHandle(UNIT, 2, { x: 0.7, y: 0.8 });
    expect(next[2]).toEqual({ x: 0.7, y: 0.8 });
    expect(next[0]).toEqual({ x: 0, y: 0 });
    expect(next[1]).toEqual({ x: 1, y: 0 });
    expect(next[3]).toEqual({ x: 0, y: 1 });
  });
  it('clamps the moved corner into [0,1]', () => {
    const next = moveHandle(UNIT, 0, { x: -0.5, y: 1.5 });
    expect(next[0]).toEqual({ x: 0, y: 1 });
  });
  it('does not mutate the input corners', () => {
    const input: Corners = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    moveHandle(input, 0, { x: 0.5, y: 0.5 });
    expect(input[0]).toEqual({ x: 0, y: 0 });
  });
});
