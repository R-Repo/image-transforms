import type { Corners, Point } from '../engine/types';

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function nearestHandle(corners: Corners, p: Point, maxDist: number): number | null {
  let best: number | null = null;
  let bestD = maxDist;
  for (let i = 0; i < corners.length; i++) {
    const dx = corners[i].x - p.x;
    const dy = corners[i].y - p.y;
    const d = Math.hypot(dx, dy);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function moveHandle(corners: Corners, i: number, p: Point): Corners {
  const next = corners.map((c) => ({ x: c.x, y: c.y })) as Corners;
  next[i] = { x: clamp01(p.x), y: clamp01(p.y) };
  return next;
}
