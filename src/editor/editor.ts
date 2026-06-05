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
