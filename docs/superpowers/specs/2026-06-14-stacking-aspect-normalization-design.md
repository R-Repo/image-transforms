# Stacking Aspect Normalization — Design

**Goal:** Let same-extent layers, warped with the same preset, stack into one co-planar 3D plane by normalizing every layer to a shared "stacking box" defined by the first layer — so all layers come out at the same angle *and* size regardless of their source files' pixel dimensions.

## Problem

The warp **angle** is set by the output aspect ratio; the on-board **size** by the placement width. Presets are normalized (0–1), so each layer's angle is tied to its own source aspect ratio. Miro locks images to their original aspect on resize, so the user can't equalize them on the board. Result: stacked layers show different angles/sizes and don't look co-planar.

## Solution

A **"Match first layer"** mode in the Miro modal. The first warped layer defines a reference box `{ outWidth, outHeight, placeWidth }`, persisted in `localStorage`. Subsequent layers are warped into that box and placed at `placeWidth`.

The engine **needs no change**: it already maps the whole source (UV 0–1) onto the preset quad within the output canvas, i.e. it stretches the source to fill whatever output box it is given. Feeding it the reference box is the entire normalization. For same-extent layers, stretching each to a shared box is geometrically correct (they all cover the same ground rectangle).

Users must apply the **same preset** to each layer (the angle also depends on the preset corners).

## Scope

- **New:** `src/miro/stackBox.ts`
  - Pure `resolveTargetBox(stored, current, locked)` — decides the output box + whether to capture a new reference. Unit-tested.
  - Thin `localStorage` wrapper: `loadStackBox()`, `saveStackBox(box)`, `clearStackBox()` (wrapped in try/catch; storage may be unavailable).
- **New:** `src/miro/stackBox.test.ts` — tests for `resolveTargetBox`.
- **Modify:** `src/modal.ts` — render the control, resolve the box on Apply, capture the reference from the first layer, place at `placeWidth`.
- **Modify:** `app.html` — a `<div id="stack-control">` placeholder before `#root`.
- **No change:** engine, editor, presets, standalone page.

## Types & pure logic

```ts
export interface StackBox {
  outWidth: number;   // warp output width (defines aspect)
  outHeight: number;  // warp output height
  placeWidth: number; // board width to place the warped copy at
}

export interface LayerDims {
  naturalWidth: number;  // source file width
  naturalHeight: number; // source file height
  boardWidth: number;    // current on-board width of the selected item
}

export interface TargetResolution {
  box: StackBox;
  capture: StackBox | null; // non-null => persist this as the new reference
}

export function resolveTargetBox(
  stored: StackBox | null,
  current: LayerDims,
  locked: boolean
): TargetResolution;
```

Rules:
1. **Not locked** → `box = { outWidth: naturalWidth, outHeight: naturalHeight, placeWidth: naturalWidth }`, `capture = null`. (Exactly today's behavior.)
2. **Locked, reference exists** → `box = stored`, `capture = null`. (Match the first layer.)
3. **Locked, no reference yet** → `box = { outWidth: naturalWidth, outHeight: naturalHeight, placeWidth: boardWidth }`, `capture = box`. (This layer becomes the reference; place at its current board size.)

## Modal control & flow

Control row above the editor (built by `modal.ts` into `#stack-control`):

> ☐ **Match first layer** · `<readout>` · [Reset]

- On modal load: `stored = loadStackBox()`. Checkbox checked ⇔ `stored !== null`; `locked` initialised to that. Readout shows `outWidth×outHeight` when a reference exists.
- Toggling the checkbox sets `locked`.
- **Reset** → `clearStackBox()`, uncheck, clear readout.
- On **Apply(corners)**:
  - `current = { naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, boardWidth: item.width }`
  - `{ box, capture } = resolveTargetBox(stored, current, locked)`
  - if `capture` → `saveStackBox(capture)`
  - `warpToDataUrl(img, corners, { outputWidth: box.outWidth, outputHeight: box.outHeight })`
  - `pos = placeToRight({ x: item.x, y: item.y, width: item.width, height: item.height }, box.placeWidth)`
  - `createImage({ url, x: pos.x, y: pos.y, width: box.placeWidth })`

## Out of scope

- Auto-offsetting stacked copies (user drags to stack).
- Letterbox/crop normalization modes (we stretch-to-fill, correct for same-extent layers).
- Applying normalization in the standalone page.
