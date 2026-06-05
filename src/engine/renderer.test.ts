import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { buildProgram, drawWarp } from './renderer';
import { computeHomography, invert3x3 } from './homography';
import type { Corners } from './types';

// headless-gl ('gl') provides a WebGL context in Node, but it needs a native
// build that does not compile on every Node version. Load it defensively: if it
// is unavailable, skip this suite. The homography math is fully covered by
// homography.test.ts, and the rendered output is verified visually via the
// standalone page (Task 8). On a machine where 'gl' builds, this suite runs
// automatically.
const nodeRequire = createRequire(import.meta.url);
type CreateGL = (
  width: number,
  height: number,
  opts?: Record<string, unknown>
) => WebGLRenderingContext;
let createGL: CreateGL | null = null;
try {
  createGL = nodeRequire('gl') as CreateGL;
} catch {
  createGL = null;
}
const glAvailable = createGL !== null;

// 2x2 source, data row 0 = TOP row: [TL=red, TR=green], row 1 = [BL=blue, BR=white].
function makeSourceTexture(gl: WebGLRenderingContext): WebGLTexture {
  const pixels = new Uint8Array([
    255, 0, 0, 255, 0, 255, 0, 255, // top row:    red,  green
    0, 0, 255, 255, 255, 255, 255, 255, // bottom row: blue, white
  ]);
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  // Upload so the FIRST data row is the visual top row.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

const PALETTE = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 255, 255],
];

function nearestPaletteColor(r: number, g: number, b: number): number {
  let best = -1;
  let bestD = Infinity;
  PALETTE.forEach(([pr, pg, pb], i) => {
    const dd = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (dd < bestD) {
      bestD = dd;
      best = i;
    }
  });
  return best;
}

const W = 64;
const H = 64;
const IDENTITY: Corners = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

describe.skipIf(!glAvailable)('drawWarp (headless-gl)', () => {
  it('fills an identity-warped quad entirely from the source palette (no black/empty)', () => {
    const gl = createGL!(W, H, { preserveDrawingBuffer: true });
    const tex = makeSourceTexture(gl);
    const prog = buildProgram(gl);
    const Hinv = invert3x3(computeHomography(IDENTITY));
    drawWarp(gl, prog, tex, Hinv, W, H);

    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);

    // Every fully-opaque pixel must be one of the four source colors.
    let opaque = 0;
    for (let p = 0; p < W * H; p++) {
      const a = px[p * 4 + 3];
      if (a > 200) {
        opaque++;
        const idx = nearestPaletteColor(px[p * 4], px[p * 4 + 1], px[p * 4 + 2]);
        const [pr, pg, pb] = PALETTE[idx];
        expect(Math.abs(px[p * 4] - pr)).toBeLessThan(40);
        expect(Math.abs(px[p * 4 + 1] - pg)).toBeLessThan(40);
        expect(Math.abs(px[p * 4 + 2] - pb)).toBeLessThan(40);
      }
    }
    // The identity quad covers the whole canvas.
    expect(opaque).toBeGreaterThan(W * H * 0.9);
  });

  it('preserves orientation: output top-left quadrant is the source top-left texel (red)', () => {
    // NOTE: if this fails ONLY by a vertical mirror (top-left reads blue),
    // toggle the `1.0 - uv.y` term in the fragment shader in renderer.ts and
    // re-run. That term pins orientation; the test is the source of truth.
    const gl = createGL!(W, H, { preserveDrawingBuffer: true });
    const tex = makeSourceTexture(gl);
    const prog = buildProgram(gl);
    const Hinv = invert3x3(computeHomography(IDENTITY));
    drawWarp(gl, prog, tex, Hinv, W, H);

    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);

    // readPixels origin is bottom-left; output y=0 (top) is the LAST row.
    // Sample output (x=0.25, y=0.25) => col ~16, output-top quadrant.
    const col = Math.floor(0.25 * W);
    const rowFromTop = Math.floor(0.25 * H);
    const rowInBuffer = H - 1 - rowFromTop;
    const o = (rowInBuffer * W + col) * 4;
    expect(nearestPaletteColor(px[o], px[o + 1], px[o + 2])).toBe(0); // 0 = red = TL
  });

  it('renders transparent pixels outside a shrunken quad', () => {
    const gl = createGL!(W, H, { preserveDrawingBuffer: true });
    const tex = makeSourceTexture(gl);
    const prog = buildProgram(gl);
    // Quad inset into the middle 50% — corners away from the canvas edges.
    const inset: Corners = [
      { x: 0.25, y: 0.25 },
      { x: 0.75, y: 0.25 },
      { x: 0.75, y: 0.75 },
      { x: 0.25, y: 0.75 },
    ];
    const Hinv = invert3x3(computeHomography(inset));
    drawWarp(gl, prog, tex, Hinv, W, H);

    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    // A corner pixel (0,0) is outside the inset quad -> transparent.
    expect(px[3]).toBeLessThan(20);
  });
});
