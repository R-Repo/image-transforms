# Image Transforms — Design Spec

- **Date:** 2026-06-04
- **Status:** Draft for review
- **Author:** Raza Rizvi (with Claude)
- **Repo:** `image-transforms` (personal GitHub, MIT)

## Summary

A Miro Web SDK app that warps an image on a Miro board. The user selects an
image, runs a context-menu action, drags the image's four corners (or taps a
perspective preset) in a modal editor, and applies the result as a **new**
warped image on the board. The same warp engine also runs in a standalone web
page (upload → warp → download) for development and as a portfolio/CV demo.

All processing is client-side. No backend. The app is a static bundle Miro
loads in an iframe; the standalone page is the same bundle without the Miro
host.

## Goals

- Free four-corner perspective warp of a selected board image.
- One-click perspective presets that position the four corners.
- Non-destructive: the original image is never modified.
- A framework-free warp engine reusable outside Miro (standalone demo).
- Clean enough to open-source and show on a CV.

## Non-goals (v1)

- Mirror / flip (planned later).
- Edge-extend / "reverse crop" (planned later).
- Replace-original mode (planned later; would delete the original and place the
  warped image **in-place, on top of where the original was**). v1 always adds a
  copy, offset to the right.
- Multi-image batch warping.
- Rotation-aware warp (v1 warps upright source pixels; result placed unrotated).

## Current state

The repo is a `create-miro-app` scaffold: Vanilla JS + Vite.

```
index.html        # App URL root (sdkUri); registers the SDK icon/action
app.html          # UI page loaded inside the modal/panel
src/index.js      # SDK init (icon:click / action handlers)
src/app.js        # UI logic (throwaway hello-world)
vite.config.js
jsconfig.json
```

Miro dashboard config (app ID, scopes `boards:read`/`boards:write`,
`App URL=http://localhost:3000`, installed on the "JustMe"/Dev team) lives
server-side and is independent of the code.

**Step 0 of implementation** converts this to TypeScript in place (Vite needs
no build change): add `typescript` + `@mirohq/websdk-types`, replace
`jsconfig.json` with `tsconfig.json`, rename `src/*.js` → `.ts`. The
hello-world code is then replaced by the modules below.

## Architecture

Four isolated units with explicit boundaries:

### 1. Warp engine (`src/engine/`) — framework-free, no Miro deps

The reusable core. Pure transform: image + four destination corners → PNG.

```ts
// Normalized coordinates in the output bounding box, range 0..1.
type Point = { x: number; y: number };
// Order: top-left, top-right, bottom-right, bottom-left.
type Corners = [Point, Point, Point, Point];

interface WarpOptions {
  outputWidth: number;        // px of the output canvas
  outputHeight: number;
  interpolation?: 'bilinear'; // v1 default
}

// Renders the source into the quad via a WebGL textured quad with
// perspective-correct interpolation. Pixels outside the quad are transparent.
function warp(source: TexImageSource, corners: Corners, opts: WarpOptions): Promise<Blob>; // image/png
function warpToDataUrl(source: TexImageSource, corners: Corners, opts: WarpOptions): Promise<string>;
```

Implementation: a single WebGL program. Upload the source as a texture; draw a
quad whose vertex positions are the destination corners and whose texture
coordinates are the source's unit corners. Use perspective-correct sampling
(homography / `uvq` interpolation across the two triangles) so straight lines in
the source stay straight under foreshortening. Clear color alpha = 0 for
transparency. Read back via `canvas.toBlob`/`toDataURL`.

This is where Mirror (flip texture coords) and edge-extend
(`gl.CLAMP_TO_EDGE` wrap) attach later with no rearchitecting.

### 2. Editor UI (`src/editor/`) — host-agnostic

Mounts into a container element. Shows a live WebGL preview (driven by the
engine), four draggable corner handles, the preset bar, and Apply / Cancel.

```ts
interface EditorHandle { destroy(): void; }
interface EditorCallbacks {
  onApply(corners: Corners): void;  // host decides what to do with the result
  onCancel(): void;
}
function mountEditor(container: HTMLElement, source: TexImageSource, cb: EditorCallbacks): EditorHandle;
```

Used unchanged by both the Miro modal and the standalone page; only the host
callbacks differ.

### 3. Miro adapter (`src/miro/`) — thin glue

- Registers a custom context-menu action with a predicate: enabled only when
  exactly one **image** is selected.
- On action: `getSelection()` → `imageItem.getDataUrl('original')` → load into
  an `<img>` → `miro.board.ui.openModal({ url: 'app.html' })` and mount the
  editor inside.
- On Apply: `engine.warpToDataUrl(...)` → `miro.board.createImage({ url, x, y, width, height })`.
  - Original is left untouched.
  - New image placed adjacent: `x = orig.x + orig.width + 40`, `y = orig.y`,
    sized to the warped output's bounding box (default = original W×H).
- On Cancel: close modal, do nothing.

### 4. Standalone page (`standalone.html` + `src/standalone/`)

File input → load image → mount the same editor → on Apply, trigger a PNG
download. No Miro SDK. Doubles as the dev loop and the public demo.

## Data flow

```
Miro:       board image → getDataUrl('original') → <img> → editor(corners)
            → engine.warp() → PNG dataURL → createImage (new item)

Standalone: file → object URL → <img> → editor(corners)
            → engine.warp() → PNG blob → download
```

## Presets

Each preset sets the four corners (still draggable afterward). Corners are
normalized `[x, y]` in output space, order TL, TR, BR, BL. Values below are
sensible defaults, tunable during implementation; the isometric presets use
parallel edges (true 30°-style), the others converge (real perspective).

| Preset      | TL          | TR          | BR          | BL          | Character    |
|-------------|-------------|-------------|-------------|-------------|--------------|
| Free        | 0,0         | 1,0         | 1,1         | 0,1         | user-dragged |
| Floor       | 0.28,0.05   | 0.72,0.05   | 1.00,0.96   | 0.00,0.96   | perspective  |
| Left Wall   | 0.04,0.04   | 1.00,0.24   | 1.00,0.76   | 0.04,0.96   | perspective  |
| Right Wall  | 0.00,0.24   | 0.96,0.04   | 0.96,0.96   | 0.00,0.76   | perspective  |
| Iso Left    | 0.00,0.30   | 1.00,0.04   | 1.00,0.74   | 0.00,1.00   | isometric    |
| Iso Right   | 0.00,0.04   | 1.00,0.30   | 1.00,1.00   | 0.00,0.74   | isometric    |

## Error handling & edge cases

- **Selection guard:** predicate hides/disables the action unless exactly one
  image is selected. If invoked otherwise, show a Miro toast and abort.
- **`getDataUrl` failure:** toast the error, keep the editor closed; no board
  change.
- **Oversized images:** clamp the WebGL texture / output to
  `gl.MAX_TEXTURE_SIZE`; downscale the preview if larger, warp at full size on
  Apply where possible.
- **`createImage` with a data URL is flagged "experimental" by Miro.** Risk
  noted. Fallback (not built in v1): POST to REST `/v2/boards/{id}/images` with
  base64 — requires confirmation before use (operator rule on write endpoints).
- **Degenerate quad** (corners collinear / self-intersecting): editor prevents
  dragging into invalid configurations; engine guards against a singular
  homography.

## Testing strategy

- **Engine (real unit tests via the standalone harness):**
  - Identity warp (corners = unit rect) returns an image ≈ the source.
  - Warp a checkerboard/grid; assert the four corner pixels land at the
    expected output coordinates and edges stay straight.
- **Editor:** corner drags update the preview; each preset produces its
  documented quad.
- **Adapter:** manual on a Miro board — warp produces a new image, original
  remains, placement is adjacent.

## Tooling

- Vanilla TypeScript + Vite (existing scaffold, converted in place).
- `mirotone` (already a dep) for Miro-native modal styling.
- Dev: `npm start` (Vite on `:3000`), open the app from a board on the
  installed team, or open `standalone.html` directly.

## Distribution plan

1. **Phase 1 — build & test** on personal Miro account (dev team), localhost.
2. **Phase 2 — open source:** push to personal GitHub (MIT), host the static
   bundle (Vercel/Netlify/GH Pages), point the app's `App URL` at the hosted
   HTTPS URL.
3. **Phase 3 — org access:** submit to Miro Marketplace (public, reviewed);
   Overstory installs via Marketplace + admin approval. (Alternative: org
   self-hosts its own instance.)

## Open questions / risks

- Confirm the experimental `createImage` data-URL path works for the image
  sizes in practice; if not, fall back to the REST images endpoint.
- Final preset corner values to be dialed in visually during implementation.
- Hosting choice for Phase 2 (Vercel vs Netlify vs GH Pages) — deferred.
