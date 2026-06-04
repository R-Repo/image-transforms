/** Normalized coordinate, range 0..1, origin top-left. */
export type Point = { x: number; y: number };

/** Four destination corners, order: top-left, top-right, bottom-right, bottom-left. */
export type Corners = [Point, Point, Point, Point];

/** 3x3 matrix, flat row-major: [a,b,c, d,e,f, g,h,i]. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export interface WarpOptions {
  outputWidth: number;
  outputHeight: number;
  interpolation?: 'bilinear';
}
