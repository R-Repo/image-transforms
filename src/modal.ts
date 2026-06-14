import { mountEditor } from './editor/editor';
import { warpToDataUrl } from './engine';
import { placeToRight } from './miro/placement';
import type { Corners } from './engine/types';
import {
  resolveTargetBox,
  loadStackBox,
  saveStackBox,
  clearStackBox,
  type StackBox,
} from './miro/stackBox';

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}

function describeBox(box: StackBox): string {
  return `${box.outWidth}×${box.outHeight}`;
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

  // --- Stacking normalization control -----------------------------------
  // "Match first layer": the first warped layer defines a reference box that
  // later same-extent layers are normalized to, so they stack co-planar.
  let stored = loadStackBox();
  let locked = stored !== null;

  const control = document.getElementById('stack-control');
  if (control) {
    control.style.display = 'flex';
    control.style.alignItems = 'center';
    control.style.justifyContent = 'center';
    control.style.gap = '8px';
    control.style.margin = '0 0 12px';
    control.style.fontSize = '13px';

    const label = document.createElement('label');
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.gap = '6px';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = locked;
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode('Match first layer (stack)'));

    const readout = document.createElement('span');
    readout.style.color = '#6b7280';

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'button button-secondary button-small';
    resetBtn.textContent = 'Reset';

    const refresh = () => {
      if (stored) readout.textContent = `ref ${describeBox(stored)}`;
      else if (locked) readout.textContent = '(captures this layer on Apply)';
      else readout.textContent = '';
      resetBtn.style.visibility = stored ? 'visible' : 'hidden';
    };

    checkbox.addEventListener('change', () => {
      locked = checkbox.checked;
      refresh();
    });
    resetBtn.addEventListener('click', () => {
      clearStackBox();
      stored = null;
      locked = false;
      checkbox.checked = false;
      refresh();
    });

    control.appendChild(label);
    control.appendChild(readout);
    control.appendChild(resetBtn);
    refresh();
  }

  mountEditor(root, img, {
    async onApply(corners: Corners) {
      try {
        const { box, capture } = resolveTargetBox(
          stored,
          {
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            boardWidth: item.width,
          },
          locked
        );
        if (capture) saveStackBox(capture);
        const url = await warpToDataUrl(img, corners, {
          outputWidth: box.outWidth,
          outputHeight: box.outHeight,
        });
        const pos = placeToRight(
          { x: item.x, y: item.y, width: item.width, height: item.height },
          box.placeWidth
        );
        // createImage with a data URL is flagged experimental by Miro.
        // If this fails for production-size images, the documented fallback is
        // the REST POST /v2/boards/{id}/images endpoint — DO NOT build that
        // without explicit operator confirmation (AGENTS.md rule 1).
        await miro.board.createImage({
          url,
          x: pos.x,
          y: pos.y,
          width: box.placeWidth,
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
