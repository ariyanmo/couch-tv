// Automatic room scan from a camera sweep, without LiDAR or a downloaded model.
//
// 1. Floor finding: each downscaled video frame is segmented by growing a region
//    from the bottom of the picture (the phone points at the floor) using a
//    colour model of the floor learnt during the scan, stopped by strong edges
//    such as skirting boards.
// 2. The top edge of that region in each column is where floor meets wall (or
//    furniture). Every such pixel is turned into a ray using the camera's field
//    of view and the phone's orientation, and intersected with the floor plane
//    at phone-height below the camera.
// 3. Points from the whole 360° turn are reduced to a radial profile around the
//    person and fitted with straight walls (square corners when the room allows).
//
// Scale comes only from the phone height, so results are estimates.

import { dist, isSimplePolygon, pointInPolygon, polygonArea } from './geometry';
import type { Point } from './types';
import type { Orientation } from './scanmath';

export type Vec3 = { x: number; y: number; z: number };
export type Mat3 = number[]; // row-major 3×3

/** Device-to-world rotation (world: x east, y north, z up) from W3C device orientation. */
export function rotationMatrix(o: Orientation): Mat3 {
  const r = Math.PI / 180;
  const sA = Math.sin(o.alpha * r), cA = Math.cos(o.alpha * r);
  const sB = Math.sin(o.beta * r), cB = Math.cos(o.beta * r);
  const sG = Math.sin(o.gamma * r), cG = Math.cos(o.gamma * r);
  return [
    cA * cG - sA * sB * sG, -cB * sA, cG * sA * sB + cA * sG,
    cG * sA + cA * sB * sG, cA * cB, sA * sG - cA * cG * sB,
    -cB * sG, sB, cB * cG,
  ];
}

const mul = (m: Mat3, v: Vec3): Vec3 => ({
  x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
  y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
  z: m[6] * v.x + m[7] * v.y + m[8] * v.z,
});

/** Typical iPhone main camera: about 66° across the long side of the video frame. */
export const DEFAULT_FOV_LONG = 66;

export interface CameraModel {
  width: number; // frame size as processed
  height: number;
  fovLong: number; // degrees across the longer side
  screenAngle: number; // 0, 90, -90/270, 180 (screen.orientation.angle)
}

/** World direction of the ray through pixel (u, v) of the frame. */
export function pixelRay(u: number, v: number, cam: CameraModel, R: Mat3): Vec3 {
  const f = Math.max(cam.width, cam.height) / 2 / Math.tan((cam.fovLong * Math.PI) / 360);
  const ix = (u + 0.5 - cam.width / 2) / f; // image right
  const iy = -(v + 0.5 - cam.height / 2) / f; // image up
  // image axes -> device axes, depending on how the screen is rotated
  const a = ((Math.round(cam.screenAngle / 90) % 4) + 4) % 4;
  const dx = a === 0 ? ix : a === 1 ? -iy : a === 2 ? -ix : iy;
  const dy = a === 0 ? iy : a === 1 ? ix : a === 2 ? -iy : -ix;
  return mul(R, { x: dx, y: dy, z: -1 });
}

/** Plan point (mm, y down like the floor plan) where a world ray meets the floor, or null. */
export function rayToFloor(d: Vec3, phoneHeight: number, maxDist = 12000): Point | null {
  if (d.z >= -1e-6) return null;
  const t = phoneHeight / -d.z;
  const x = d.x * t;
  const y = -d.y * t;
  if (Math.hypot(x, y) > maxDist) return null;
  return { x, y };
}

// ---------------------------------------------------------------- floor finding

export interface FloorModel {
  mean: [number, number, number]; // Y, Cb, Cr
  std: [number, number, number];
  n: number;
}

export interface Frame {
  data: Uint8ClampedArray | number[]; // RGBA
  width: number;
  height: number;
}

function ycc(r: number, g: number, b: number): [number, number, number] {
  return [0.299 * r + 0.587 * g + 0.114 * b, 128 - 0.1687 * r - 0.3313 * g + 0.5 * b, 128 + 0.5 * r - 0.4187 * g - 0.0813 * b];
}

/** Learn the floor's colour from a patch at the bottom middle of the frame. */
export function sampleFloor(f: Frame, prev?: FloorModel, rate = 0.15): FloorModel {
  const x0 = Math.floor(f.width * 0.35), x1 = Math.ceil(f.width * 0.65);
  const y0 = Math.floor(f.height * 0.8), y1 = f.height;
  const s = [0, 0, 0], q = [0, 0, 0];
  let n = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = (y * f.width + x) * 4;
      const c = ycc(f.data[i], f.data[i + 1], f.data[i + 2]);
      for (let k = 0; k < 3; k++) {
        s[k] += c[k];
        q[k] += c[k] * c[k];
      }
      n++;
    }
  const mean = s.map((v) => v / n) as [number, number, number];
  const std = q.map((v, k) => Math.sqrt(Math.max(0, v / n - mean[k] * mean[k]))) as [number, number, number];
  if (!prev) return { mean, std, n: 1 };
  const mix = (a: number, b: number) => a * (1 - rate) + b * rate;
  return { mean: [0, 1, 2].map((k) => mix(prev.mean[k], mean[k])) as FloorModel['mean'], std: [0, 1, 2].map((k) => mix(prev.std[k], std[k])) as FloorModel['std'], n: prev.n + 1 };
}

/**
 * Segment the floor: flood fill from the bottom row through pixels whose colour
 * is close to the floor model, not crossing strong edges. Returns, per column,
 * the row of the floor's top edge (where it meets a wall or object), or -1 when
 * that column's floor edge is not usable.
 */
export function floorBoundary(f: Frame, m: FloorModel, opts: { tol?: number; edge?: number } = {}): { boundary: Int16Array; mask: Uint8Array } {
  const { width: W, height: H } = f;
  const tol = opts.tol ?? 3.2;
  const edge = opts.edge ?? 38;
  const sY = Math.max(m.std[0], 6) * 1.6; // brightness varies with light: looser
  const sC = Math.max(Math.max(m.std[1], m.std[2]), 3);
  const lum = new Float32Array(W * H);
  const ok = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) {
    const c = ycc(f.data[p * 4], f.data[p * 4 + 1], f.data[p * 4 + 2]);
    lum[p] = c[0];
    const d = Math.hypot((c[0] - m.mean[0]) / sY, (c[1] - m.mean[1]) / sC, (c[2] - m.mean[2]) / sC);
    ok[p] = d < tol ? 1 : 0;
  }
  const mask = new Uint8Array(W * H);
  const queue = new Int32Array(W * H);
  let qh = 0, qt = 0;
  for (let x = 0; x < W; x++) {
    const p = (H - 1) * W + x;
    if (ok[p]) {
      mask[p] = 1;
      queue[qt++] = p;
    }
  }
  while (qh < qt) {
    const p = queue[qh++];
    const x = p % W, y = (p - x) / W;
    const nb = [y > 0 ? p - W : -1, x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y < H - 1 ? p + W : -1];
    for (const q of nb) {
      if (q < 0 || mask[q] || !ok[q]) continue;
      if (Math.abs(lum[q] - lum[p]) > edge) continue;
      mask[q] = 1;
      queue[qt++] = q;
    }
  }
  const boundary = new Int16Array(W).fill(-1);
  for (let x = 0; x < W; x++) {
    if (!mask[(H - 1) * W + x]) continue; // something in front of the camera
    let y = H - 1, gap = 0, top = H - 1;
    for (; y >= 0; y--) {
      if (mask[y * W + x]) {
        top = y;
        gap = 0;
      } else if (++gap >= 3) break;
    }
    if (top <= 1) continue; // floor runs off the top of the picture: no wall seen
    boundary[x] = top;
  }
  return { boundary, mask };
}

/** Turn a frame's floor edge into plan points. Uses the middle columns, where the lens is most accurate. */
export function boundaryToPoints(boundary: Int16Array, cam: CameraModel, o: Orientation, phoneHeight: number, colFrac = 0.6): Point[] {
  const R = rotationMatrix(o);
  const W = cam.width;
  const x0 = Math.floor((W * (1 - colFrac)) / 2), x1 = Math.ceil((W * (1 + colFrac)) / 2);
  const out: Point[] = [];
  for (let x = x0; x < x1; x++) {
    const v = boundary[x];
    if (v < 0) continue;
    // the floor ends at the top edge of its last pixel
    const p = rayToFloor(pixelRay(x, v - 0.5, cam, R), phoneHeight);
    if (p && Math.hypot(p.x, p.y) > 400) out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------- wall fitting

export const BIN_DEG = 2;

/** Median distance per angular bin around the person (origin). */
export function radialProfile(points: Point[], binDeg = BIN_DEG): (Point | null)[] {
  const bins: number[][] = Array.from({ length: Math.round(360 / binDeg) }, () => []);
  for (const p of points) {
    const a = ((Math.atan2(p.y, p.x) * 180) / Math.PI + 360) % 360;
    bins[Math.floor(a / binDeg) % bins.length].push(Math.hypot(p.x, p.y));
  }
  return bins.map((b, i) => {
    if (b.length < 2) return null;
    b.sort((x, y) => x - y);
    const r = b[Math.floor(b.length / 2)];
    const a = ((i + 0.5) * binDeg * Math.PI) / 180;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
}

export function coverageDeg(points: Point[], binDeg = BIN_DEG) {
  return radialProfile(points, binDeg).filter(Boolean).length * binDeg;
}

const rot = (p: Point, a: number): Point => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Dominant wall direction (radians, modulo 90°) from the ordered profile. */
export function dominantAngle(pts: Point[]): number {
  let sx = 0, sy = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const L = dist(a, b);
    if (L < 1 || L > 800) continue;
    const t = Math.atan2(b.y - a.y, b.x - a.x) * 4;
    sx += Math.cos(t) * L;
    sy += Math.sin(t) * L;
  }
  return Math.atan2(sy, sx) / 4;
}

interface Seg {
  type: 'H' | 'V';
  coord: number;
  pts: Point[];
}

/**
 * Fit a room with square corners to an ordered ring of floor-edge points.
 * Short runs (furniture, noise) are dropped; steps between walls are kept, so
 * L-shaped rooms work. Returns null when the points don't look rectilinear.
 */
export function fitManhattan(ring: Point[], minWall = 450): Point[] | null {
  if (ring.length < 16) return null;
  const phi = dominantAngle(ring);
  const P = ring.map((p) => rot(p, -phi));
  const n = P.length;
  // label each point by the local direction of the outline
  let labels: ('H' | 'V')[] = P.map((_, i) => {
    const a = P[(i - 2 + n) % n], b = P[(i + 2) % n];
    return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'H' : 'V';
  });
  labels = labels.map((_, i) => {
    let h = 0;
    for (let k = -2; k <= 2; k++) if (labels[(i + k + n) % n] === 'H') h++;
    return h >= 3 ? 'H' : 'V';
  });
  // start at a label change so runs don't wrap
  let start = labels.findIndex((l, i) => l !== labels[(i - 1 + n) % n]);
  if (start < 0) return null;
  let segs: Seg[] = [];
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    const last = segs[segs.length - 1];
    if (last && last.type === labels[i]) last.pts.push(P[i]);
    else segs.push({ type: labels[i], coord: 0, pts: [P[i]] });
  }
  const extent = (s: Seg) => (s.type === 'H' ? Math.max(...s.pts.map((p) => p.x)) - Math.min(...s.pts.map((p) => p.x)) : Math.max(...s.pts.map((p) => p.y)) - Math.min(...s.pts.map((p) => p.y)));
  const coordOf = (s: Seg) => median(s.pts.map((p) => (s.type === 'H' ? p.y : p.x)));
  // Clean up: drop specks, merge pieces of one wall, cut out furniture notches,
  // then drop runs too short to be walls. Repeat until nothing changes.
  const mergeSame = () => {
    let changed = false;
    for (let i = 0; i < segs.length && segs.length > 1; i++) {
      const a = segs[i], b = segs[(i + 1) % segs.length];
      if (a !== b && a.type === b.type && Math.abs(coordOf(a) - coordOf(b)) < 300) {
        a.pts.push(...b.pts);
        a.coord = coordOf(a);
        segs.splice((i + 1) % segs.length, 1);
        changed = true;
        i--;
      }
    }
    return changed;
  };
  const removeNotch = () => {
    // A, B, C, D, E with A and E the same wall, C closer to the person and narrow: furniture
    const m = segs.length;
    // A, X, E with A and E the same wall: X is an object standing in front of it
    if (m > 4)
      for (let i = 0; i < m; i++) {
        const [A, X, E] = [0, 1, 2].map((k) => segs[(i + k) % m]);
        if (A.type === E.type && X.type !== A.type && A !== E && Math.abs(A.coord - E.coord) < 300 && extent(X) < 1300) {
          A.pts.push(...E.pts);
          A.coord = coordOf(A);
          segs = segs.filter((s) => s !== X && s !== E);
          return true;
        }
      }
    if (m < 6) return false;
    for (let i = 0; i < m; i++) {
      const [A, B, C, D, E] = [0, 1, 2, 3, 4].map((k) => segs[(i + k) % m]);
      if (A.type !== C.type || C.type !== E.type || B.type === A.type || D.type === A.type) continue;
      if (Math.abs(A.coord - E.coord) > 300) continue;
      const inward = Math.sign(C.coord) === Math.sign(A.coord) && Math.abs(C.coord) < Math.abs(A.coord) - 100;
      if (!inward || extent(B) > 1300 || extent(D) > 1300 || extent(C) > 1300) continue;
      A.pts.push(...E.pts);
      A.coord = coordOf(A);
      const drop = new Set([B, C, D, E]);
      segs = segs.filter((s) => !drop.has(s));
      return true;
    }
    return false;
  };
  for (let guard = 0; guard < 80; guard++) {
    segs.forEach((s) => (s.coord = coordOf(s)));
    let changed = false;
    const speck = segs.findIndex((s) => segs.length > 4 && (s.pts.length < 2 || extent(s) < 150));
    if (speck >= 0) {
      segs.splice(speck, 1);
      changed = true;
    }
    changed = mergeSame() || changed;
    if (!changed) changed = removeNotch();
    if (!changed && segs.length > 4) {
      const shortest = segs.reduce((mI, s2, i) => (extent(s2) < extent(segs[mI]) ? i : mI), 0);
      if (extent(segs[shortest]) < minWall || segs[shortest].pts.length < 3) {
        segs.splice(shortest, 1);
        changed = true;
      }
    }
    if (!changed) break;
  }
  if (segs.length < 2) return null;
  segs.forEach((s) => (s.coord = coordOf(s)));
  // same kind back to back with different positions: a real step, add the connecting wall
  const full: Seg[] = [];
  for (let i = 0; i < segs.length; i++) {
    const a = segs[i], b = segs[(i + 1) % segs.length];
    full.push(a);
    if (a.type === b.type) {
      const ea = a.pts[a.pts.length - 1], sb = b.pts[0];
      full.push({ type: a.type === 'H' ? 'V' : 'H', coord: a.type === 'H' ? (ea.x + sb.x) / 2 : (ea.y + sb.y) / 2, pts: [] });
    }
  }
  if (full.length < 4 || full.length % 2) return null;
  const corners: Point[] = [];
  for (let i = 0; i < full.length; i++) {
    const a = full[i], b = full[(i + 1) % full.length];
    if (a.type === b.type) return null;
    const c = a.type === 'H' ? { x: b.coord, y: a.coord } : { x: a.coord, y: b.coord };
    corners.push(rot(c, phi));
  }
  if (!isSimplePolygon(corners) || !pointInPolygon({ x: 0, y: 0 }, corners) || polygonArea(corners) < 1e6) return null;
  // reject a fit that strays far from the evidence
  const err = median(ring.map((p) => minDistToOutline(p, corners)));
  return err < 250 ? corners : null;
}

function minDistToOutline(p: Point, poly: Point[]) {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const abx = b.x - a.x, aby = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby || 1)));
    m = Math.min(m, Math.hypot(p.x - a.x - abx * t, p.y - a.y - aby * t));
  }
  return m;
}

/** Douglas–Peucker simplification of a closed ring (fallback for angled rooms). */
export function simplifyRing(ring: Point[], eps = 180): Point[] {
  if (ring.length < 4) return ring;
  // split at the two farthest-apart points
  let i0 = 0, i1 = 0, best = -1;
  for (let i = 0; i < ring.length; i++) {
    const d = Math.hypot(ring[i].x, ring[i].y);
    if (d > best) {
      best = d;
      i0 = i;
    }
  }
  best = -1;
  for (let i = 0; i < ring.length; i++) {
    const d = dist(ring[i], ring[i0]);
    if (d > best) {
      best = d;
      i1 = i;
    }
  }
  const [a, b] = i0 < i1 ? [i0, i1] : [i1, i0];
  const dp = (pts: Point[]): Point[] => {
    if (pts.length < 3) return pts;
    const s = pts[0], e = pts[pts.length - 1];
    let mi = 0, md = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = minDistToOutline(pts[i], [s, e]);
      if (d > md) {
        md = d;
        mi = i;
      }
    }
    if (md < eps) return [s, e];
    const l = dp(pts.slice(0, mi + 1));
    return [...l.slice(0, -1), ...dp(pts.slice(mi))];
  };
  const first = dp(ring.slice(a, b + 1));
  const second = dp([...ring.slice(b), ...ring.slice(0, a + 1)]);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

export interface RoomFit {
  polygon: Point[];
  method: 'square' | 'angled';
  coverage: number; // degrees seen
  points: number;
}

/** Build the room outline from all floor-edge points gathered during the sweep. */
export function fitRoom(points: Point[]): RoomFit | null {
  const prof = radialProfile(points);
  const ring = prof.filter((p): p is Point => !!p);
  const coverage = ring.length * BIN_DEG;
  if (ring.length < 12) return null;
  const sq = fitManhattan(ring);
  if (sq) return { polygon: sq, method: 'square', coverage, points: points.length };
  const s = simplifyRing(ring);
  if (s.length >= 3 && isSimplePolygon(s) && polygonArea(s) > 1e6) return { polygon: s, method: 'angled', coverage, points: points.length };
  return null;
}
