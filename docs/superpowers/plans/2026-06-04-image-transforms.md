# Image Transforms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Miro Web SDK app that perspective-warps a selected board image (free four-corner drag + one-click presets) and writes the warped result back as a new image, with the same warp engine reused in a standalone web page.

**Architecture:** Four isolated units. (1) A framework-free WebGL **engine** computes a homography from four destination corners and renders the source through its inverse in a fragment shader (perspective-correct, transparent outside the quad). (2) A host-agnostic **editor** mounts a live WebGL preview with four draggable handles and a preset bar. (3) A thin **Miro adapter** registers a context-menu action, loads the selected image, opens a modal with the editor, and on Apply places a warped copy adjacent to the original. (4) A **standalone** page wires the same editor to a file input + PNG download, and doubles as the engine's visual test harness. Pure math (homography, presets, editor state, placement) is extracted into unit-tested modules; WebGL/DOM/SDK shells stay thin.

**Tech Stack:** Vanilla TypeScript + Vite (existing `create-miro-app` scaffold, converted in place), Vitest for unit tests, `gl` (headless-gl) for engine pixel tests, `mirotone` for Miro-native modal styling, Miro Web SDK v2.

---

## Source of truth

The design spec is `docs/superpowers/specs/2026-06-04-image-transforms-design.md`. This plan implements it. Where the spec marks preset corner values "tunable," this plan locks the spec's values and notes they may be dialed in visually during Task 8.

## Operator constraints (from `/Users/razarizvi/code/AGENTS.md`) — apply throughout

1. **Never call PUT/PATCH/POST endpoints without explicit operator confirmation, even with auto-accept on.** The only POST in scope is the REST `/v2/boards/{id}/images` fallback for `createImage`. This plan **does not build it** (see Task 9). Do not add it without asking.
2. **Always plan before building; explicitly ask before building.** This document is that plan; execution begins only after the operator picks an execution mode and confirms.
3. **Be critical of solutions.** Several Miro SDK call signatures are verified-by-search but must be re-confirmed against the installed `@mirohq/websdk-types` (flagged inline in Task 9). Verify, don't trust.
4. **Never change `agent-context/` files without printing changes and getting confirmation.** Not in scope here.

## File structure

Files created or modified, each with one responsibility:

| File | Responsibility |
|------|----------------|
| `tsconfig.json` | TypeScript config (replaces `jsconfig.json`). |
| `vite.config.ts` | Vite multi-page build (`index.html`, `app.html`, `standalone.html`) + Vitest config (replaces `vite.config.js`). |
| `src/types/gl.d.ts` | Module declaration for `gl` (headless-gl has no bundled types). |
| `src/engine/types.ts` | `Point`, `Corners`, `WarpOptions`, `Mat3` types. |
| `src/engine/homography.ts` | PURE: `computeHomography`, `project`, `invert3x3`, `multiply3x3`, `toColumnMajor`, `determinant3x3`. |
| `src/engine/renderer.ts` | WebGL: `buildProgram`, `drawWarp`, `createRenderer` (texture upload, render, readback). |
| `src/engine/index.ts` | Thin public API: `warp`, `warpToDataUrl`. |
| `src/editor/presets.ts` | PURE: preset corner table + `getPreset`. |
| `src/editor/editorState.ts` | PURE: `nearestHandle`, `moveHandle`, `clamp01`. |
| `src/editor/editor.ts` | DOM/WebGL shell: `mountEditor` (preview canvas, handles, preset bar, Apply/Cancel). |
| `src/miro/placement.ts` | PURE: `placeToRight` (adjacent placement geometry). |
| `src/index.ts` | Miro adapter — `index.html` entry: register action, open modal. |
| `src/modal.ts` | Miro adapter — `app.html` entry: selection guard, load image, mount editor, Apply→createImage. |
| `src/standalone/main.ts` | Standalone entry: file input → editor → PNG download. |
| `index.html` | App URL root / panel. Modified: script → `.ts`, minimal hint UI. |
| `app.html` | Modal page. Modified: SDK script + `#root` + script → `src/modal.ts`. |
| `standalone.html` | Standalone page (created). File input + `#root`, **no** SDK script. |
| `package.json` | Modified: add devDeps + `test` scripts. |
| Deleted | `jsconfig.json`, `vite.config.js`, `src/app.js`, `src/index.js` (renamed/replaced). |

## Conventions used by every code module

- **Corner order:** `[TL, TR, BR, BL]` (top-left, top-right, bottom-right, bottom-left).
- **Coordinate spaces:** Output space and source-UV space are both `[0,1]`, origin **top-left**, `(1,1)` bottom-right. Corners are normalized in the output bounding box.
- **`Mat3` representation:** flat `number[9]`, **row-major**: `[a,b,c, d,e,f, g,h,i]` =
  ```
  | a b c |
  | d e f |
  | g h i |
  ```
- **Homography direction:** `computeHomography(corners)` returns `H` mapping the **unit square → destination quad**. The renderer uploads `invert3x3(H)` (output → source UV) to the shader.

---

### Task 0: Convert scaffold to TypeScript + add Vitest

**Files:**
- Create: `tsconfig.json`, `vite.config.ts`, `src/types/gl.d.ts`, `src/sanity.test.ts`
- Modify: `package.json`, `index.html`, `app.html`
- Delete: `jsconfig.json`, `vite.config.js`
- Rename: `src/index.js` → `src/index.ts`, `src/app.js` → `src/modal.ts`

The goal of this task is a green dev server and a green (trivial) test run on TypeScript — no behavior change yet. Later tasks replace the hello-world contents.

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install -D typescript @mirohq/websdk-types vitest gl @types/node
```
Expected: installs without error. `gl` compiles native bindings (needs Xcode command-line tools on macOS). If `gl` fails to build, see the fallback note at the end of Task 2 — you can proceed without it.

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["@mirohq/websdk-types", "vite/client", "node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Delete `jsconfig.json`**

```bash
rm jsconfig.json
```

- [ ] **Step 4: Create `src/types/gl.d.ts`**

```ts
// headless-gl ships no types. It returns a WebGL1 context with a destroy() helper.
declare module 'gl' {
  interface StackGLContext extends WebGLRenderingContext {
    destroy(): void;
  }
  const createContext: (
    width: number,
    height: number,
    options?: WebGLContextAttributes
  ) => StackGLContext;
  export default createContext;
}
```

- [ ] **Step 5: Replace `vite.config.js` with `vite.config.ts`**

```bash
rm vite.config.js
```

Create `vite.config.ts`:
```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: { port: 3000 },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app.html'),
        standalone: resolve(__dirname, 'standalone.html'),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 6: Rename source files**

```bash
git mv src/index.js src/index.ts
git mv src/app.js src/modal.ts
```

- [ ] **Step 6b: Replace the renamed files with clean stubs**

The scaffold's hello-world JS won't pass `strict` type-checking. Overwrite both with minimal valid modules so the project type-checks from the start; later tasks fill them in (Task 9).

`src/index.ts`:
```ts
// Miro adapter entry (App URL root). Implemented in Task 9.
export {};
```

`src/modal.ts`:
```ts
// Modal page entry (app.html). Implemented in Task 9.
export {};
```

- [ ] **Step 7: Point HTML at the `.ts` entries**

In `index.html`, change the app script reference from `src/index.js` to `src/index.ts` (Vite serves TS directly). Leave the rest of the scaffold markup.

In `app.html`, change `src/app.js` to `src/modal.ts`.

- [ ] **Step 8: Add test scripts to `package.json`**

In the `"scripts"` block, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 9: Write a sanity test**

Create `src/sanity.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs TypeScript tests', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 10: Run the test**

Run: `npm test`
Expected: PASS — 1 test passing.

- [ ] **Step 11: Verify the dev server still serves the app**

Run: `npm start` (Ctrl-C after confirming). Open `http://localhost:3000`.
Expected: the scaffold's hello-world panel loads with no console TypeScript errors. (The Miro action doesn't work yet — that's Task 9.)

- [ ] **Step 12: Commit**

```bash
git add tsconfig.json vite.config.ts src/types/gl.d.ts src/sanity.test.ts package.json package-lock.json index.html app.html src/index.ts src/modal.ts
git rm --cached jsconfig.json vite.config.js 2>/dev/null; true
git commit -m "chore: convert scaffold to TypeScript and add Vitest"
```

---

### Task 1: Engine types + homography math (PURE)

**Files:**
- Create: `src/engine/types.ts`
- Create: `src/engine/homography.ts`
- Test: `src/engine/homography.test.ts`

This is the mathematical backbone. `computeHomography` uses Heckbert's unit-square→quad solution; everything is a pure function over `number[9]`.

- [ ] **Step 1: Create the types**

`src/engine/types.ts`:
```ts
/** Normalized coordinate, range 0..1, origin top-left. */
export type Point = { x: number; y: number };

/** Four destination corners, order: top-left, top-right, bottom-right, bottom-left. */
export type Corners = [Point, Point, Point, Point];

/** 3x3 matrix, flat row-major: [a,b,c, d,e,f, g,h,i]. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export interface WarpOptions {
  outputWidth: number;
  outputHeight: number;
  interpolation?: 'bilinear';
}
```

- [ ] **Step 2: Write the failing homography tests**

`src/engine/homography.test.ts`:
```ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/engine/homography.test.ts`
Expected: FAIL — `homography` module / exports not found.

- [ ] **Step 4: Implement the homography module**

`src/engine/homography.ts`:
```ts
import type { Corners, Mat3, Point } from './types';

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

/** Apply a homography to a point: (X,Y,W) = H*(x,y,1); returns (X/W, Y/W). */
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
  const r = new Array(9) as Mat3;
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/engine/homography.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 6: Commit**

```bash
git add src/engine/types.ts src/engine/homography.ts src/engine/homography.test.ts
git commit -m "feat: add engine types and homography math"
```

---

### Task 2: WebGL renderer

**Files:**
- Create: `src/engine/renderer.ts`
- Test: `src/engine/renderer.test.ts`

The renderer draws a full-screen quad and runs the inverse homography per fragment. `buildProgram` and `drawWarp` take a `WebGLRenderingContext` so they can be tested with headless-gl against a raw-pixel texture. `createRenderer` is the browser wrapper (offscreen canvas + `TexImageSource`).

- [ ] **Step 1: Write the failing renderer tests**

`src/engine/renderer.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import createGL from 'gl';
import { buildProgram, drawWarp } from './renderer';
import { computeHomography, invert3x3 } from './homography';
import type { Corners } from './types';

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

describe('drawWarp (headless-gl)', () => {
  it('fills an identity-warped quad entirely from the source palette (no black/empty)', () => {
    const gl = createGL(W, H, { preserveDrawingBuffer: true });
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
    const gl = createGL(W, H, { preserveDrawingBuffer: true });
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
    const gl = createGL(W, H, { preserveDrawingBuffer: true });
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/engine/renderer.test.ts`
Expected: FAIL — `renderer` exports not found.

- [ ] **Step 3: Implement the renderer**

`src/engine/renderer.ts`:
```ts
import type { Corners, Mat3, WarpOptions } from './types';
import { computeHomography, invert3x3, toColumnMajor } from './homography';

const VERT_SRC = `
attribute vec2 a_pos;       // full-screen quad in clip space [-1,1]
varying vec2 v_out;         // output space [0,1], origin top-left
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
  v_out = vec2((a_pos.x + 1.0) * 0.5, (1.0 - a_pos.y) * 0.5);
}
`;

const FRAG_SRC = `
precision highp float;
uniform mat3 u_Hinv;        // output space -> source UV
uniform sampler2D u_tex;
varying vec2 v_out;
void main() {
  vec3 p = u_Hinv * vec3(v_out, 1.0);
  vec2 uv = p.xy / p.z;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  // Source UV origin is top-left; GL texture origin is bottom-left -> flip v.
  gl_FragColor = texture2D(u_tex, vec2(uv.x, 1.0 - uv.y));
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('Shader compile failed: ' + log);
  }
  return sh;
}

export interface WarpProgram {
  program: WebGLProgram;
  a_pos: number;
  u_Hinv: WebGLUniformLocation;
  u_tex: WebGLUniformLocation;
  quadBuffer: WebGLBuffer;
}

export function buildProgram(gl: WebGLRenderingContext): WarpProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error('Program link failed: ' + gl.getProgramInfoLog(program));
  }
  const quadBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  // Two triangles covering clip space.
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );
  return {
    program,
    a_pos: gl.getAttribLocation(program, 'a_pos'),
    u_Hinv: gl.getUniformLocation(program, 'u_Hinv')!,
    u_tex: gl.getUniformLocation(program, 'u_tex')!,
    quadBuffer,
  };
}

/** Draw the warp for a given inverse homography into the current framebuffer. */
export function drawWarp(
  gl: WebGLRenderingContext,
  prog: WarpProgram,
  texture: WebGLTexture,
  Hinv: Mat3,
  width: number,
  height: number
): void {
  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(prog.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, prog.quadBuffer);
  gl.enableVertexAttribArray(prog.a_pos);
  gl.vertexAttribPointer(prog.a_pos, 2, gl.FLOAT, false, 0, 0);

  gl.uniformMatrix3fv(prog.u_Hinv, false, toColumnMajor(Hinv));

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(prog.u_tex, 0);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

export interface Renderer {
  readonly canvas: HTMLCanvasElement;
  render(corners: Corners): void;
  toBlob(): Promise<Blob>;
  toDataUrl(): string;
  destroy(): void;
}

/**
 * Browser renderer: uploads a TexImageSource and renders warps into an
 * offscreen canvas at outputWidth x outputHeight (clamped to MAX_TEXTURE_SIZE).
 */
export function createRenderer(source: TexImageSource, opts: WarpOptions): Renderer {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', {
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) throw new Error('WebGL not supported');

  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  const scale = Math.min(1, maxTex / Math.max(opts.outputWidth, opts.outputHeight));
  const width = Math.max(1, Math.round(opts.outputWidth * scale));
  const height = Math.max(1, Math.round(opts.outputHeight * scale));
  canvas.width = width;
  canvas.height = height;

  const prog = buildProgram(gl);

  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return {
    canvas,
    render(corners: Corners) {
      const Hinv = invert3x3(computeHomography(corners));
      drawWarp(gl, prog, texture, Hinv, width, height);
    },
    toBlob() {
      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
          'image/png'
        );
      });
    },
    toDataUrl() {
      return canvas.toDataURL('image/png');
    },
    destroy() {
      gl.deleteTexture(texture);
      gl.deleteBuffer(prog.quadBuffer);
      gl.deleteProgram(prog.program);
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/engine/renderer.test.ts`
Expected: PASS. If the orientation test fails by a vertical mirror only, toggle `1.0 - uv.y` → `uv.y` in `FRAG_SRC` and re-run (see the note in that test).

- [ ] **Step 5: Commit**

```bash
git add src/engine/renderer.ts src/engine/renderer.test.ts
git commit -m "feat: add WebGL perspective-warp renderer"
```

> **Fallback if `gl` (headless-gl) will not build on this machine:** run `npm uninstall gl`, change the first line of `src/engine/renderer.test.ts` from `import createGL from 'gl';` to skip the suite (`describe.skip(...)`), commit that, and rely on Task 8's standalone visual checks (identity + checkerboard + presets) to verify the engine. The pure homography tests (Task 1) still fully cover the math.

---

### Task 3: Engine public API

**Files:**
- Create: `src/engine/index.ts`
- Test: covered by Task 2 (renderer) + Task 8 (standalone visual). No new unit test — this module is a 4-line composition over the tested renderer, and `toBlob`/`toDataUrl` are browser-only.

- [ ] **Step 1: Implement the public API**

`src/engine/index.ts`:
```ts
import type { Corners, WarpOptions } from './types';
import { createRenderer } from './renderer';

export type { Point, Corners, WarpOptions, Mat3 } from './types';

/** Warp `source` through `corners` and return an image/png Blob. */
export async function warp(
  source: TexImageSource,
  corners: Corners,
  opts: WarpOptions
): Promise<Blob> {
  const r = createRenderer(source, opts);
  try {
    r.render(corners);
    return await r.toBlob();
  } finally {
    r.destroy();
  }
}

/** Warp `source` through `corners` and return a PNG data URL. */
export async function warpToDataUrl(
  source: TexImageSource,
  corners: Corners,
  opts: WarpOptions
): Promise<string> {
  const r = createRenderer(source, opts);
  try {
    r.render(corners);
    return r.toDataUrl();
  } finally {
    r.destroy();
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/engine/index.ts
git commit -m "feat: add engine warp/warpToDataUrl public API"
```

---

### Task 4: Presets (PURE)

**Files:**
- Create: `src/editor/presets.ts`
- Test: `src/editor/presets.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/editor/presets.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/editor/presets.test.ts`
Expected: FAIL — `presets` exports not found.

- [ ] **Step 3: Implement presets**

`src/editor/presets.ts`:
```ts
import type { Corners } from '../engine/types';

export type PresetName =
  | 'free'
  | 'floor'
  | 'leftWall'
  | 'rightWall'
  | 'isoLeft'
  | 'isoRight';

export const PRESET_NAMES: PresetName[] = [
  'free',
  'floor',
  'leftWall',
  'rightWall',
  'isoLeft',
  'isoRight',
];

/** Human-readable labels for the preset bar. */
export const PRESET_LABELS: Record<PresetName, string> = {
  free: 'Free',
  floor: 'Floor',
  leftWall: 'Left Wall',
  rightWall: 'Right Wall',
  isoLeft: 'Iso Left',
  isoRight: 'Iso Right',
};

/** Normalized corner quads, order TL, TR, BR, BL. Values from the design spec. */
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
};

/** Return a deep copy of a preset's corners so callers can mutate freely. */
export function getPreset(name: PresetName): Corners {
  return PRESETS[name].map((p) => ({ x: p.x, y: p.y })) as Corners;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/editor/presets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editor/presets.ts src/editor/presets.test.ts
git commit -m "feat: add perspective presets"
```

---

### Task 5: Editor state (PURE)

**Files:**
- Create: `src/editor/editorState.ts`
- Test: `src/editor/editorState.test.ts`

Pure helpers for hit-testing and moving handles. Self-intersection / convexity enforcement is deferred (v1 clamps to `[0,1]`; the engine guards singular quads).

- [ ] **Step 1: Write the failing tests**

`src/editor/editorState.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { clamp01, nearestHandle, moveHandle } from './editorState';
import type { Corners } from '../engine/types';

const UNIT: Corners = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

describe('clamp01', () => {
  it('clamps below 0 and above 1', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(0.4)).toBe(0.4);
  });
});

describe('nearestHandle', () => {
  it('returns the index of the closest corner within range', () => {
    expect(nearestHandle(UNIT, { x: 0.02, y: 0.02 }, 0.1)).toBe(0);
    expect(nearestHandle(UNIT, { x: 0.98, y: 0.02 }, 0.1)).toBe(1);
    expect(nearestHandle(UNIT, { x: 0.98, y: 0.98 }, 0.1)).toBe(2);
    expect(nearestHandle(UNIT, { x: 0.02, y: 0.98 }, 0.1)).toBe(3);
  });

  it('returns null when no corner is within range', () => {
    expect(nearestHandle(UNIT, { x: 0.5, y: 0.5 }, 0.1)).toBeNull();
  });
});

describe('moveHandle', () => {
  it('moves only the targeted corner and clamps to [0,1]', () => {
    const next = moveHandle(UNIT, 2, { x: 1.4, y: -0.3 });
    expect(next[2]).toEqual({ x: 1, y: 0 });
    expect(next[0]).toEqual({ x: 0, y: 0 });
    expect(next[1]).toEqual({ x: 1, y: 0 });
    expect(next[3]).toEqual({ x: 0, y: 1 });
  });

  it('does not mutate the input corners', () => {
    moveHandle(UNIT, 0, { x: 0.5, y: 0.5 });
    expect(UNIT[0]).toEqual({ x: 0, y: 0 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/editor/editorState.test.ts`
Expected: FAIL — `editorState` exports not found.

- [ ] **Step 3: Implement editor state**

`src/editor/editorState.ts`:
```ts
import type { Corners, Point } from '../engine/types';

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Index (0..3) of the corner nearest `p` within `maxDist` (in normalized
 * units), or null if none is close enough.
 */
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

/** Return new corners with handle `i` moved to `p`, clamped to [0,1]. */
export function moveHandle(corners: Corners, i: number, p: Point): Corners {
  const next = corners.map((c) => ({ x: c.x, y: c.y })) as Corners;
  next[i] = { x: clamp01(p.x), y: clamp01(p.y) };
  return next;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/editor/editorState.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editor/editorState.ts src/editor/editorState.test.ts
git commit -m "feat: add pure editor-state helpers"
```

---

### Task 6: Editor DOM shell

**Files:**
- Create: `src/editor/editor.ts`
- Verification: manual (exercised by the standalone page in Task 8).

`mountEditor` builds the preview canvas, four handle elements, the preset bar, and Apply/Cancel. It uses the tested `createRenderer`, `presets`, and `editorState`. No unit test (DOM + WebGL shell); it is verified through the standalone harness.

- [ ] **Step 1: Implement the editor**

`src/editor/editor.ts`:
```ts
import type { Corners, Point } from '../engine/types';
import { createRenderer, type Renderer } from '../engine/renderer';
import { getPreset, PRESET_NAMES, PRESET_LABELS, type PresetName } from './presets';
import { nearestHandle, moveHandle } from './editorState';

export interface EditorHandle {
  destroy(): void;
}

export interface EditorCallbacks {
  /** Host decides what to do with the chosen corners (warp + place/download). */
  onApply(corners: Corners): void;
  onCancel(): void;
}

const PREVIEW_MAX = 520; // px on the longest side
const HANDLE_HIT = 0.06; // normalized hit radius

export function mountEditor(
  container: HTMLElement,
  source: TexImageSource,
  cb: EditorCallbacks
): EditorHandle {
  const srcW = (source as HTMLImageElement).naturalWidth || (source as HTMLCanvasElement).width;
  const srcH = (source as HTMLImageElement).naturalHeight || (source as HTMLCanvasElement).height;
  const aspect = srcW / srcH;
  const previewW = aspect >= 1 ? PREVIEW_MAX : Math.round(PREVIEW_MAX * aspect);
  const previewH = aspect >= 1 ? Math.round(PREVIEW_MAX / aspect) : PREVIEW_MAX;

  let corners: Corners = getPreset('free');

  // --- DOM scaffold -------------------------------------------------------
  const root = document.createElement('div');
  root.className = 'it-editor';

  const stage = document.createElement('div');
  stage.className = 'it-stage';
  stage.style.position = 'relative';
  stage.style.width = previewW + 'px';
  stage.style.height = previewH + 'px';
  stage.style.margin = '0 auto';
  stage.style.touchAction = 'none';

  const renderer: Renderer = createRenderer(source, {
    outputWidth: previewW,
    outputHeight: previewH,
  });
  renderer.canvas.style.position = 'absolute';
  renderer.canvas.style.inset = '0';
  renderer.canvas.style.width = previewW + 'px';
  renderer.canvas.style.height = previewH + 'px';
  // Checkerboard so transparency is visible.
  stage.style.background =
    'repeating-conic-gradient(#e9ecf2 0% 25%, #ffffff 0% 50%) 50% / 20px 20px';
  stage.appendChild(renderer.canvas);

  const handleEls: HTMLDivElement[] = [];
  for (let i = 0; i < 4; i++) {
    const h = document.createElement('div');
    h.className = 'it-handle';
    h.style.position = 'absolute';
    h.style.width = '14px';
    h.style.height = '14px';
    h.style.marginLeft = '-7px';
    h.style.marginTop = '-7px';
    h.style.borderRadius = '50%';
    h.style.background = '#2563eb';
    h.style.border = '2px solid #fff';
    h.style.boxShadow = '0 1px 4px rgba(0,0,0,.3)';
    h.style.cursor = 'grab';
    stage.appendChild(h);
    handleEls.push(h);
  }

  const presetBar = document.createElement('div');
  presetBar.className = 'it-presets';
  presetBar.style.display = 'flex';
  presetBar.style.flexWrap = 'wrap';
  presetBar.style.gap = '6px';
  presetBar.style.justifyContent = 'center';
  presetBar.style.margin = '16px 0';
  for (const name of PRESET_NAMES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'button button-secondary button-small';
    btn.textContent = PRESET_LABELS[name as PresetName];
    btn.addEventListener('click', () => {
      corners = getPreset(name);
      redraw();
    });
    presetBar.appendChild(btn);
  }

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.justifyContent = 'flex-end';
  actions.style.gap = '8px';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'button button-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => cb.onCancel());
  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'button button-primary';
  applyBtn.textContent = 'Apply';
  applyBtn.addEventListener('click', () => cb.onApply(corners));
  actions.appendChild(cancelBtn);
  actions.appendChild(applyBtn);

  root.appendChild(stage);
  root.appendChild(presetBar);
  root.appendChild(actions);
  container.appendChild(root);

  // --- Interaction --------------------------------------------------------
  let dragging: number | null = null;

  function toNormalized(ev: PointerEvent): Point {
    const rect = stage.getBoundingClientRect();
    return {
      x: (ev.clientX - rect.left) / rect.width,
      y: (ev.clientY - rect.top) / rect.height,
    };
  }

  function onPointerDown(ev: PointerEvent) {
    const p = toNormalized(ev);
    const idx = nearestHandle(corners, p, HANDLE_HIT);
    if (idx !== null) {
      dragging = idx;
      stage.setPointerCapture(ev.pointerId);
      handleEls[idx].style.cursor = 'grabbing';
    }
  }

  function onPointerMove(ev: PointerEvent) {
    if (dragging === null) return;
    corners = moveHandle(corners, dragging, toNormalized(ev));
    redraw();
  }

  function onPointerUp(ev: PointerEvent) {
    if (dragging !== null) {
      handleEls[dragging].style.cursor = 'grab';
      dragging = null;
      try {
        stage.releasePointerCapture(ev.pointerId);
      } catch {
        /* capture may already be released */
      }
    }
  }

  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', onPointerUp);

  function redraw() {
    try {
      renderer.render(corners);
    } catch {
      // Singular/degenerate quad (e.g. three corners collinear mid-drag):
      // keep the last valid frame and let the user drag back out.
    }
    for (let i = 0; i < 4; i++) {
      handleEls[i].style.left = corners[i].x * previewW + 'px';
      handleEls[i].style.top = corners[i].y * previewH + 'px';
    }
  }

  redraw();

  return {
    destroy() {
      stage.removeEventListener('pointerdown', onPointerDown);
      stage.removeEventListener('pointermove', onPointerMove);
      stage.removeEventListener('pointerup', onPointerUp);
      stage.removeEventListener('pointercancel', onPointerUp);
      renderer.destroy();
      container.removeChild(root);
    },
  };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (Visual verification happens in Task 8.)

- [ ] **Step 3: Commit**

```bash
git add src/editor/editor.ts
git commit -m "feat: add host-agnostic warp editor (preview + handles + presets)"
```

---

### Task 7: Adjacent placement (PURE)

**Files:**
- Create: `src/miro/placement.ts`
- Test: `src/miro/placement.test.ts`

Miro item `x`/`y` are the item's **center**; `width`/`height` are full dimensions. Placing a copy to the right with a gap is pure geometry.

- [ ] **Step 1: Write the failing tests**

`src/miro/placement.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/miro/placement.test.ts`
Expected: FAIL — `placement` exports not found.

- [ ] **Step 3: Implement placement**

`src/miro/placement.ts`:
```ts
export interface BoxItem {
  x: number; // center x
  y: number; // center y
  width: number;
  height: number;
}

export interface Placement {
  x: number; // center x for the new item
  y: number; // center y for the new item
}

/**
 * Center position for a new image of `newWidth`, placed immediately to the
 * right of `orig` with `gap` px of space between their edges. y is unchanged.
 */
export function placeToRight(orig: BoxItem, newWidth: number, gap = 40): Placement {
  return {
    x: orig.x + orig.width / 2 + gap + newWidth / 2,
    y: orig.y,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/miro/placement.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/miro/placement.ts src/miro/placement.test.ts
git commit -m "feat: add adjacent-placement geometry"
```

---

### Task 8: Standalone page (engine + editor visual harness)

**Files:**
- Create: `standalone.html`
- Create: `src/standalone/main.ts`
- Verification: manual in the browser. This is also the engine's visual test harness per the spec.

- [ ] **Step 1: Create `standalone.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Image Transforms — Standalone</title>
    <link rel="stylesheet" href="https://unpkg.com/mirotone/dist/styles.css" />
    <style>
      body { font-family: system-ui, sans-serif; margin: 24px; }
      .it-toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; }
    </style>
  </head>
  <body>
    <h1>Image Transforms</h1>
    <div class="it-toolbar">
      <input id="file" type="file" accept="image/*" />
      <span class="it-hint">Pick an image, drag the corners or tap a preset, then Apply to download a PNG.</span>
    </div>
    <div id="root"></div>
    <script type="module" src="/src/standalone/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Implement the standalone entry**

`src/standalone/main.ts`:
```ts
import { mountEditor, type EditorHandle } from '../editor/editor';
import { warp } from '../engine';
import type { Corners } from '../engine/types';

const fileInput = document.getElementById('file') as HTMLInputElement;
const root = document.getElementById('root') as HTMLElement;

let editor: EditorHandle | null = null;
let currentImage: HTMLImageElement | null = null;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const img = await loadImage(URL.createObjectURL(file));
  currentImage = img;
  editor?.destroy();
  editor = mountEditor(root, img, {
    async onApply(corners: Corners) {
      if (!currentImage) return;
      try {
        const blob = await warp(currentImage, corners, {
          outputWidth: currentImage.naturalWidth,
          outputHeight: currentImage.naturalHeight,
        });
        download(blob, 'warped.png');
      } catch (err) {
        // e.g. a degenerate quad — surface it without crashing the harness.
        alert('Could not warp the image: ' + (err as Error).message);
      }
    },
    onCancel() {
      editor?.destroy();
      editor = null;
    },
  });
});
```

- [ ] **Step 3: Manual verification — engine + editor**

Run: `npm start`, open `http://localhost:3000/standalone.html`.

Verify each (these stand in for engine pixel tests per the spec):
1. **Identity:** load a photo; with the **Free** preset untouched, Apply → downloaded PNG matches the source (same orientation, not mirrored, not upside down). If mirrored vertically, the shader flip from Task 2 is wrong — fix there.
2. **Checkerboard corners:** load a clear grid/checkerboard image; drag the four handles to obviously different positions and confirm the preview's straight lines stay straight (no diagonal kink across the middle — that would mean affine, not perspective).
3. **Transparency:** drag corners inward; the area outside the quad shows the editor's checkerboard background (transparent), and the downloaded PNG has transparent margins.
4. **Each preset:** click Floor, Left Wall, Right Wall, Iso Left, Iso Right; confirm the preview shape matches the design-spec diagrams. Note any values to dial in (spec marks them tunable) and adjust `PRESETS` in `src/editor/presets.ts` if needed — update `presets.test.ts` to match if you change them.

- [ ] **Step 4: Commit**

```bash
git add standalone.html src/standalone/main.ts
git commit -m "feat: add standalone page (warp + download, engine visual harness)"
```

---

### Task 9: Miro adapter

**Files:**
- Replace contents: `src/index.ts` (registers action + opens modal)
- Replace contents: `src/modal.ts` (selection guard, load image, mount editor, Apply)
- Modify: `index.html` (minimal hint UI), `app.html` (SDK script + `#root` + `src/modal.ts`)
- Verification: manual on a Miro board (dev team).

> **Miro SDK signatures to confirm against the installed `@mirohq/websdk-types` before/while writing this task** (operator rule 3 — verify, don't trust). Open `node_modules/@mirohq/websdk-types` and check:
> 1. **`ImageItem.getDataUrl`** — the spec assumes `getDataUrl('original')`. Confirm whether the method takes a format arg (`'original' | 'preview'`) or is a no-arg `getDataUrl()`. Use the full-size variant. The code below uses `getDataUrl('original')`; if the type shows no parameter, drop the argument.
> 2. **`board.experimental.action.register` / `board.ui.on('custom:...')`** — confirm the `register` option shape (`event`, `ui.label`, `ui.icon`, `ui.description`, `scope`, `predicate`, `contexts`) and that the matching event is `custom:<event>`. Confirm `ui.icon` accepts the value used below; if it errors, pick a valid name from the `IconName` type.
> 3. **`board.notifications.showError`**, **`board.ui.openModal` / `closeModal`**, **`board.createImage`**, **`board.getSelection`** — confirm names/shapes.

- [ ] **Step 1: Replace `src/index.ts` (App URL root)**

```ts
// Runs on index.html (the app's App URL root). Registers the context-menu
// action and opens the editor modal when it fires.
async function init() {
  await miro.board.ui.on('custom:warp-image', async () => {
    await miro.board.ui.openModal({
      url: 'app.html',
      fullscreen: true,
    });
  });

  await miro.board.experimental.action.register({
    event: 'warp-image',
    ui: {
      label: 'Warp image…',
      icon: 'crop', // confirm against IconName; pick another if invalid
      description: 'Perspective-warp this image',
    },
    scope: 'local',
    predicate: { type: 'image' },
    contexts: { item: {} },
  });
}

init();
```

- [ ] **Step 2: Replace `src/modal.ts` (modal page)**

```ts
import { mountEditor } from './editor/editor';
import { warpToDataUrl } from './engine';
import { placeToRight } from './miro/placement';
import type { Corners } from './engine/types';

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}

async function start() {
  const root = document.getElementById('root');
  if (!root) return;

  const selection = await miro.board.getSelection();
  const images = selection.filter((i) => i.type === 'image') as any[];

  if (images.length !== 1) {
    await miro.board.notifications.showError('Select exactly one image to warp.');
    await miro.board.ui.closeModal();
    return;
  }

  const item = images[0];

  let dataUrl: string;
  try {
    // Confirm getDataUrl signature against websdk-types (see task note).
    dataUrl = await item.getDataUrl('original');
  } catch {
    await miro.board.notifications.showError('Could not load the image data.');
    await miro.board.ui.closeModal();
    return;
  }

  const img = await loadImage(dataUrl);

  mountEditor(root, img, {
    async onApply(corners: Corners) {
      try {
        const url = await warpToDataUrl(img, corners, {
          outputWidth: img.naturalWidth,
          outputHeight: img.naturalHeight,
        });
        const pos = placeToRight(
          { x: item.x, y: item.y, width: item.width, height: item.height },
          img.naturalWidth
        );
        // createImage with a data URL is flagged experimental by Miro.
        // If this fails for production-size images, the documented fallback is
        // the REST POST /v2/boards/{id}/images endpoint — DO NOT build that
        // without explicit operator confirmation (AGENTS.md rule 1).
        await miro.board.createImage({
          url,
          x: pos.x,
          y: pos.y,
          width: img.naturalWidth,
        });
      } catch {
        await miro.board.notifications.showError('Could not place the warped image.');
      } finally {
        await miro.board.ui.closeModal();
      }
    },
    async onCancel() {
      await miro.board.ui.closeModal();
    },
  });
}

start();
```

- [ ] **Step 3: Update `index.html` to a minimal hint panel**

Replace the scaffold's hello-world body content with a short instruction (keep the `<head>`, the mirotone stylesheet, and the `<script type="module" src="/src/index.ts">` tag):
```html
<div class="grid" style="padding:16px">
  <div class="cs1 ce12">
    <h1 class="h1">Image Transforms</h1>
    <p class="p-medium">Right-click an image on the board and choose
      <strong>“Warp image…”</strong> to open the perspective editor.</p>
  </div>
</div>
```

- [ ] **Step 4: Update `app.html` (modal page)**

Ensure `app.html` includes the Miro Web SDK script, a `#root` container, and loads `src/modal.ts`:
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Warp Image</title>
    <link rel="stylesheet" href="https://unpkg.com/mirotone/dist/styles.css" />
    <script src="https://miro.com/app/static/sdk/v2/miro.js"></script>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; }
      h2 { text-align: center; }
    </style>
  </head>
  <body>
    <h2>Warp Image</h2>
    <div id="root"></div>
    <script type="module" src="/src/modal.ts"></script>
  </body>
</html>
```
(Keep whatever SDK script URL the original scaffold used if it differs.)

- [ ] **Step 5: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification on a Miro board**

Run: `npm start`. Open a board on the installed dev team ("JustMe"/Dev). Then:
1. Select **one image** → right-click → confirm **“Warp image…”** appears (predicate enabled for images).
2. Right-click a non-image (e.g., a sticky) → confirm the action does **not** appear.
3. Run the action → the fullscreen modal opens with the editor showing the selected image.
4. Drag corners / tap presets → Apply → confirm a **new** warped image appears to the **right** of the original, the **original is untouched**, and the warp matches the preview.
5. Cancel → modal closes, board unchanged.
6. Select two images (if the action shows) or zero → confirm the modal shows the "Select exactly one image" error and closes.

If `createImage` rejects the data URL for large production images, stop and report — the REST fallback is a POST and needs operator confirmation before building (AGENTS.md rule 1).

- [ ] **Step 7: Commit**

```bash
git add src/index.ts src/modal.ts index.html app.html
git commit -m "feat: add Miro adapter (warp action, modal editor, adjacent placement)"
```

---

## Definition of done (v1)

- `npm test` is green (homography, renderer*, presets, editorState, placement). *renderer test may be skipped if `gl` won't build — see Task 2 fallback.
- `npx tsc --noEmit` is clean.
- Standalone page: identity warp round-trips, lines stay straight under drag, transparency works, all six presets look right.
- On a Miro board: action appears only for a single image, modal editor warps, Apply adds an adjacent copy, original untouched, Cancel is a no-op.
- No PUT/PATCH/POST endpoints were added (the REST `createImage` fallback remains unbuilt pending operator confirmation).

## Out of scope (deferred, per spec non-goals)

- Mirror / flip, edge-extend ("reverse crop"), replace-original (in-place) mode, multi-image batch, rotation-aware warp.
- REST `/v2/boards/{id}/images` POST fallback (operator confirmation required).
- Hosting / Marketplace submission (distribution Phases 2–3).
