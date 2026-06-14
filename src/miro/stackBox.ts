// Stacking aspect normalization: keep a remembered "stacking box" (the first
// warped layer's output dimensions + board placement width) so subsequent
// same-extent layers warp to an identical angle and size and stack co-planar.

export interface StackBox {
  outWidth: number; // warp output width (defines the aspect → the angle)
  outHeight: number; // warp output height
  placeWidth: number; // board width to place the warped copy at (defines size)
}

export interface LayerDims {
  naturalWidth: number; // source file width
  naturalHeight: number; // source file height
  boardWidth: number; // current on-board width of the selected item
}

export interface TargetResolution {
  box: StackBox;
  /** Non-null => persist this as the new reference (first layer of a stack). */
  capture: StackBox | null;
}

/**
 * Decide the output box for warping the current layer.
 * - Not locked: use the layer's own dimensions (today's behavior).
 * - Locked + reference exists: match the stored reference.
 * - Locked + no reference: this layer becomes the reference (placed at its
 *   current board width), and is captured for persistence.
 */
export function resolveTargetBox(
  stored: StackBox | null,
  current: LayerDims,
  locked: boolean
): TargetResolution {
  if (!locked) {
    return {
      box: {
        outWidth: current.naturalWidth,
        outHeight: current.naturalHeight,
        placeWidth: current.naturalWidth,
      },
      capture: null,
    };
  }

  if (stored) {
    return { box: stored, capture: null };
  }

  const box: StackBox = {
    outWidth: current.naturalWidth,
    outHeight: current.naturalHeight,
    placeWidth: current.boardWidth,
  };
  return { box, capture: box };
}

const STORAGE_KEY = 'image-transforms.stackBox';

/** Read the remembered stacking box, or null if none / storage unavailable. */
export function loadStackBox(): StackBox | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<StackBox>;
    if (
      typeof p.outWidth === 'number' &&
      typeof p.outHeight === 'number' &&
      typeof p.placeWidth === 'number'
    ) {
      return { outWidth: p.outWidth, outHeight: p.outHeight, placeWidth: p.placeWidth };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveStackBox(box: StackBox): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(box));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export function clearStackBox(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable — non-fatal */
  }
}
