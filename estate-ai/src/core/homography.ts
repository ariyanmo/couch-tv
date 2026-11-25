// Plane-to-plane homography for photo measurement with a rectangular reference
// (for example an A4 sheet taped flat to a wall). Points on the same flat
// surface as the reference can then be measured even when the photo is taken
// at an angle. Points off that surface are NOT measured correctly.

import type { Point } from './types';

export type H = number[]; // 3x3 row-major, h[8] = 1

/** Solve A x = b by Gaussian elimination with partial pivoting. */
export function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** Homography mapping src[i] -> dst[i] (4 point pairs). */
export function homography(src: Point[], dst: Point[]): H | null {
  if (src.length !== 4 || dst.length !== 4) return null;
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve(A, b);
  return h ? [...h, 1] : null;
}

export function applyH(h: H, p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
}

/**
 * Measure the real distance between two image points on the reference plane.
 * `corners` are the reference rectangle's corners in the image, in order
 * top-left, top-right, bottom-right, bottom-left; it is w × h mm.
 */
export function planeDistance(corners: Point[], w: number, h: number, a: Point, b: Point): number | null {
  const H = homography(corners, [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ]);
  if (!H) return null;
  const pa = applyH(H, a);
  const pb = applyH(H, b);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}

/** Simple scale method: a known length lying in the same plane, roughly facing the camera. */
export function scaleDistance(refA: Point, refB: Point, refLen: number, a: Point, b: Point): number | null {
  const px = Math.hypot(refA.x - refB.x, refA.y - refB.y);
  if (px < 1) return null;
  return (Math.hypot(a.x - b.x, a.y - b.y) * refLen) / px;
}
