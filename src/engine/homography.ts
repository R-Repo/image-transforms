import type { Corners, Mat3, Point } from './types';

// Minimum magnitude for the auxiliary 2x2 determinant / matrix determinant before
// we treat the configuration as degenerate. Coordinates are in [0,1], so this is
// far below any meaningful non-degenerate value.
const EPS = 1e-12;

/**
 * Homography mapping the unit square -> quad, using Heckbert's
 * "square to quad" projective solution. Unit-square corners are
 * (0,0)=TL, (1,0)=TR, (1,1)=BR, (0,1)=BL, matching `Corners` order.
 * Returns a row-major 3x3 with i (H[8]) normalized to 1.
 */
export function computeHomography(corners: Corners): Mat3 {
  const [p0, p1, p2, p3] = corners;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;

  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < EPS) {
    throw new Error('Degenerate quad: singular homography');
  }

  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;

  const a = p1.x - p0.x + g * p1.x;
  const b = p3.x - p0.x + h * p3.x;
  const c = p0.x;
  const d = p1.y - p0.y + g * p1.y;
  const e = p3.y - p0.y + h * p3.y;
  const f = p0.y;

  return [a, b, c, d, e, f, g, h, 1];
}

/**
 * Apply a homography to a point: (X,Y,W) = H*(x,y,1); returns (X/W, Y/W).
 * If W is ~0 the point maps to infinity (valid in projective space); the
 * result will be Infinity/NaN and callers that care must guard for it.
 */
export function project(m: Mat3, p: Point): Point {
  const X = m[0] * p.x + m[1] * p.y + m[2];
  const Y = m[3] * p.x + m[4] * p.y + m[5];
  const W = m[6] * p.x + m[7] * p.y + m[8];
  return { x: X / W, y: Y / W };
}

export function determinant3x3(m: Mat3): number {
  const [a, b, c, d, e, f, g, h, i] = m;
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}

/** Inverse of a row-major 3x3 via adjugate / determinant. Throws if singular. */
export function invert3x3(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H = -(a * f - c * d);
  const I = a * e - b * d;

  const det = a * A + b * B + c * C;
  if (Math.abs(det) < EPS) {
    throw new Error('Singular matrix: cannot invert');
  }
  const s = 1 / det;
  // adjugate = transpose of the cofactor matrix
  return [A * s, D * s, G * s, B * s, E * s, H * s, C * s, F * s, I * s];
}

/** Row-major 3x3 multiply: returns m * n. */
export function multiply3x3(m: Mat3, n: Mat3): Mat3 {
  const r: Mat3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      r[row * 3 + col] =
        m[row * 3 + 0] * n[0 * 3 + col] +
        m[row * 3 + 1] * n[1 * 3 + col] +
        m[row * 3 + 2] * n[2 * 3 + col];
    }
  }
  return r;
}

/**
 * GLSL `mat3` is column-major. Convert a row-major Mat3 to the flat
 * column-major array expected by gl.uniformMatrix3fv(loc, false, ...).
 */
export function toColumnMajor(m: Mat3): Float32Array {
  return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
}
