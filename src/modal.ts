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
