# Image Transforms

Perspective-warp images on a [Miro](https://miro.com) board — or right in your browser. Drag the four corners freely, or apply one-click 3D-plane presets (floor, walls, isometric, recede, stack). Non-destructive, framework-free, and fully client-side: a WebGL homography warp with zero backend.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **▶ Live demo:** **<https://image-transforms.vercel.app/standalone.html>** — the standalone warp tool, right in your browser (no Miro account needed).

<!-- Add a screenshot/GIF here, e.g. ![Image Transforms](docs/screenshot.png) -->

## Features

- **Free four-corner perspective warp** — drag any corner; the image follows a true projective transform.
- **One-click plane presets** — Free, Floor, Left/Right Wall, Iso Left/Right, Recede Right, and Stack.
- **Non-destructive** — warps add a copy beside the original; the source image is never modified.
- **Layer stacking** — a "Match first layer" toggle normalizes same-extent layers to one shared box, so they stack into a single co-planar 3D plane.
- **Two front-ends, one engine** — the same warp engine powers a Miro context-menu app *and* a standalone upload → warp → download web page.
- **No framework, no server** — Vanilla TypeScript and a hand-written WebGL shader. Everything runs in the browser.

## How it works

Each warp is a **homography** (projective transform) mapping the image's unit square onto the chosen quad, solved with Heckbert's unit-square→quad method. The renderer uploads the *inverse* homography to a fragment shader, which for every output pixel maps back to a source texel and discards anything outside the source — giving crisp edges and transparent margins. Because it's a single textured quad on the GPU, warps are instant even at full image resolution.

## Use it

### Standalone (browser)
The quickest way to try it — no Miro needed: open the [live demo](https://image-transforms.vercel.app/standalone.html) (or run locally), pick an image, drag the corners or tap a preset, and **Apply** to download the warped PNG.

### Miro app
Select an image, then click the **Image Transforms** toolbar icon → the editor opens in a modal. Warp it and **Apply**, and a warped copy is placed beside the original. Pick the **Stack** preset and tick **Match first layer** to lay multiple same-extent layers onto one shared 3D plane.

## Run locally

```bash
npm install
npm start          # dev server on http://localhost:3000
```

- Standalone page: <http://localhost:3000/standalone.html>
- Miro app entry: <http://localhost:3000> (set this as your Miro app's *App URL*)

Use a Chromium-based browser for local HTTP — Safari forces HTTPS on `localhost`.

```bash
npm run build      # static output in dist/
npm test           # unit tests (Vitest)
npx tsc --noEmit   # type-check
```

## Tech stack

Vanilla **TypeScript**, **Vite**, hand-written **WebGL**, the **Miro Web SDK v2**, and **Vitest**. No UI framework, no backend.

## Project layout

```
src/
  engine/      WebGL warp engine — homography math + renderer (framework-free)
  editor/      host-agnostic editor UI — preview, draggable handles, presets
  miro/        Miro glue — adjacent placement + layer-stacking normalization
  index.ts     Miro app entry (registers the context-menu action)
  modal.ts     Miro modal (selection → editor → place warped copy)
  standalone/  standalone browser page
docs/          design specs and the implementation plan
```

## Design docs

Built spec-first — see [`docs/superpowers/`](docs/superpowers) for the design spec, implementation plan, and the stacking-normalization design.

## Roadmap

- Text labels warped onto the same plane as the image.
- Seamless *perspective* tiling for stacked layers (today, stacking trades perspective depth for seam alignment — they can't both come from one repeated preset).

## License

[MIT](LICENSE) © Raza Rizvi
