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
