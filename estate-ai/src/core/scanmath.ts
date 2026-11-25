// Camera room scan maths. The phone stands at a known height in the room; the
// motion sensors give the camera's direction; aiming at the point where a
// corner meets the floor gives that corner's position on the plan:
//   horizontal distance = phone height / tan(angle below horizontal).
// One known height sets the scale, so everything found this way is an
// estimate (a few percent at best) until checked against a tape measurement.

import { add, edgeLength, polygonArea, scale, sub } from './geometry';
import type { Point } from './types';

export interface Orientation {
  alpha: number; // degrees
  beta: number;
  gamma: number;
}

/** World direction (x east, y north, z up) the rear camera points, from W3C device orientation. */
export function cameraDirection(o: Orientation): { x: number; y: number; z: number } {
  const r = Math.PI / 180;
  const sA = Math.sin(o.alpha * r);
  const cA = Math.cos(o.alpha * r);
  const sB = Math.sin(o.beta * r);
  const cB = Math.cos(o.beta * r);
  const sG = Math.sin(o.gamma * r);
  const cG = Math.cos(o.gamma * r);
  // Rotation R = Rz(alpha) Rx(beta) Ry(gamma); the rear camera looks along device -Z.
  return { x: -(cG * sA * sB + cA * sG), y: -(sA * sG - cA * cG * sB), z: -cB * cG };
}

/** Degrees above (+) or below (-) the horizon, and heading (degrees, arbitrary zero). */
export function aim(o: Orientation) {
  const d = cameraDirection(o);
  return {
    pitch: (Math.atan2(d.z, Math.hypot(d.x, d.y)) * 180) / Math.PI,
    heading: (Math.atan2(d.x, d.y) * 180) / Math.PI,
    dir: d,
  };
}

/** Minimum downward angle accepted: flatter than this the distance error explodes. */
export const MIN_DOWN_DEG = 6;

/**
 * Plan position (mm, y pointing down the screen like the floor plan) of the floor
 * point under the crosshair, or null when the camera is not aimed at the floor.
 */
export function floorPoint(o: Orientation, phoneHeight: number): Point | null {
  const d = cameraDirection(o);
  const down = Math.atan2(-d.z, Math.hypot(d.x, d.y));
  if (down < (MIN_DOWN_DEG * Math.PI) / 180) return null;
  const t = phoneHeight / -d.z;
  return { x: d.x * t, y: -d.y * t };
}

/** Average several camera directions (smooths sensor jitter) and intersect with the floor. */
export function floorPointFromDirs(dirs: { x: number; y: number; z: number }[], phoneHeight: number): Point | null {
  if (!dirs.length) return null;
  const d = dirs.reduce((s, v) => ({ x: s.x + v.x, y: s.y + v.y, z: s.z + v.z }), { x: 0, y: 0, z: 0 });
  const down = Math.atan2(-d.z, Math.hypot(d.x, d.y));
  if (down < (MIN_DOWN_DEG * Math.PI) / 180) return null;
  const t = phoneHeight / -d.z;
  return { x: d.x * t, y: -d.y * t };
}

/** Ceiling height from aiming at the top of a corner whose floor point is `floorDist` away. */
export function ceilingHeight(o: Orientation, phoneHeight: number, floorDist: number): number | null {
  const a = aim(o);
  if (a.pitch < 3) return null;
  return phoneHeight + floorDist * Math.tan((a.pitch * Math.PI) / 180);
}

/** Interior angle check: is every corner within `tol` degrees of 90 or 270? */
export function nearlyRectilinear(poly: Point[], tol = 15): boolean {
  if (poly.length < 4 || poly.length % 2) return false;
  const dirs = poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length];
    return Math.atan2(q.y - p.y, q.x - p.x);
  });
  for (let i = 0; i < dirs.length; i++) {
    let turn = ((dirs[(i + 1) % dirs.length] - dirs[i]) * 180) / Math.PI;
    turn = ((turn + 540) % 360) - 180;
    if (Math.abs(Math.abs(turn) - 90) > tol) return false;
  }
  return true;
}

/**
 * Square up a nearly rectilinear room: walls snap to two perpendicular
 * directions (aligned with the longest wall), lengths are kept, and the small
 * gap this leaves is shared out so the outline closes.
 */
export function squareUp(poly: Point[]): Point[] {
  const n = poly.length;
  let longest = 0;
  for (let i = 1; i < n; i++) if (edgeLength(poly, i) > edgeLength(poly, longest)) longest = i;
  const a = poly[longest];
  const b = poly[(longest + 1) % n];
  const base = Math.atan2(b.y - a.y, b.x - a.x);
  // edge vectors in the rotated frame, snapped to the nearest axis
  const vecs = poly.map((p, i) => {
    const q = poly[(i + 1) % n];
    const ang = Math.atan2(q.y - p.y, q.x - p.x) - base;
    const L = edgeLength(poly, i);
    const k = Math.round(ang / (Math.PI / 2));
    const s = ((k % 4) + 4) % 4;
    return s === 0 ? { x: L, y: 0 } : s === 1 ? { x: 0, y: L } : s === 2 ? { x: -L, y: 0 } : { x: 0, y: -L };
  });
  // close: distribute the gap over edges along each axis, in proportion to length
  const gap = vecs.reduce((s, v) => add(s, v), { x: 0, y: 0 });
  const sumX = vecs.reduce((s, v) => s + Math.abs(v.x), 0) || 1;
  const sumY = vecs.reduce((s, v) => s + Math.abs(v.y), 0) || 1;
  const fixed = vecs.map((v) => ({ x: v.x - (gap.x * Math.abs(v.x)) / sumX, y: v.y - (gap.y * Math.abs(v.y)) / sumY }));
  // rebuild and rotate back
  const cos = Math.cos(base);
  const sin = Math.sin(base);
  const out: Point[] = [];
  let cur = { x: 0, y: 0 };
  for (let i = 0; i < n; i++) {
    out.push({ x: a.x + cur.x * cos - cur.y * sin, y: a.y + cur.x * sin + cur.y * cos });
    cur = add(cur, fixed[(i + longest) % n]);
  }
  // `out` starts at vertex `longest`; rotate back to the original vertex order
  return poly.map((_, i) => out[(i - longest + n) % n]).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
}

/** Scale an outline about its first corner so wall `edge` becomes `length`. */
export function calibrate(poly: Point[], edge: number, length: number): Point[] {
  const k = length / edgeLength(poly, edge);
  const o = poly[0];
  return poly.map((p) => add(o, scale(sub(p, o), k)));
}

export function scanSummary(poly: Point[]) {
  return { area: polygonArea(poly), walls: poly.map((_, i) => edgeLength(poly, i)) };
}
