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
