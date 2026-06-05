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
