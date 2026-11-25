import type { Point } from './types';

export const EPS = 1e-6;

export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
export const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
export const len = (a: Point) => Math.hypot(a.x, a.y);
export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a: Point): Point => {
  const l = len(a);
  return l < EPS ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};
export const perp = (a: Point): Point => ({ x: -a.y, y: a.x });
export const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Signed area (shoelace). Positive = counter-clockwise in a y-up system. */
export function signedArea(poly: Point[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export const polygonArea = (poly: Point[]) => (poly.length < 3 ? 0 : Math.abs(signedArea(poly)));

export function perimeter(poly: Point[]): number {
  if (poly.length < 2) return 0;
  let p = 0;
  for (let i = 0; i < poly.length; i++) p += dist(poly[i], poly[(i + 1) % poly.length]);
  return p;
}

export function edgeLength(poly: Point[], i: number): number {
  return dist(poly[i], poly[(i + 1) % poly.length]);
}

export function centroid(poly: Point[]): Point {
  const a = signedArea(poly);
  if (Math.abs(a) < EPS) {
    const n = poly.length || 1;
    return { x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function bounds(points: Point[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

/** Even-odd point in polygon. Points on the boundary count as inside. */
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  for (let i = 0; i < poly.length; i++) {
    if (distToSegment(p, poly[i], poly[(i + 1) % poly.length]) < 0.5) return true;
  }
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function projectOnSegment(p: Point, a: Point, b: Point): { t: number; point: Point } {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < EPS) return { t: 0, point: a };
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return { t, point: lerp(a, b, t) };
}

export function distToSegment(p: Point, a: Point, b: Point): number {
  return dist(p, projectOnSegment(p, a, b).point);
}

export function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = cross(sub(p4, p3), sub(p1, p3));
  const d2 = cross(sub(p4, p3), sub(p2, p3));
  const d3 = cross(sub(p2, p1), sub(p3, p1));
  const d4 = cross(sub(p2, p1), sub(p4, p1));
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
}

/** True when no two non-adjacent edges cross. */
export function isSimplePolygon(poly: Point[]): boolean {
  const n = poly.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsIntersect(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return false;
    }
  }
  return true;
}

/** Interior angle at vertex i, in degrees. */
export function interiorAngle(poly: Point[], i: number): number {
  const n = poly.length;
  const prev = poly[(i - 1 + n) % n];
  const cur = poly[i];
  const next = poly[(i + 1) % n];
  const a = norm(sub(prev, cur));
  const b = norm(sub(next, cur));
  let ang = Math.atan2(cross(a, b), dot(a, b)) * (180 / Math.PI);
  // orientation: for ccw polygon, interior angle = 360 - ccw angle from a to b
  const ccw = signedArea(poly) > 0;
  if (ang < 0) ang += 360;
  return ccw ? 360 - ang : ang;
}

export function isRectilinear(poly: Point[], tolDeg = 0.5): boolean {
  if (poly.length < 4) return false;
  for (let i = 0; i < poly.length; i++) {
    const a = interiorAngle(poly, i);
    if (Math.abs(a - 90) > tolDeg && Math.abs(a - 270) > tolDeg) return false;
  }
  return true;
}

export function isRectangle(poly: Point[], tolDeg = 0.5): boolean {
  return poly.length === 4 && isRectilinear(poly, tolDeg) && poly.every((_, i) => Math.abs(interiorAngle(poly, i) - 90) <= tolDeg);
}

/** Make the polygon counter-clockwise (y-up maths; on screen with y-down it reads clockwise). */
export function ensureCCW(poly: Point[]): Point[] {
  return signedArea(poly) < 0 ? [...poly].reverse() : poly;
}

export function rectPolygon(width: number, depth: number, origin: Point = { x: 0, y: 0 }): Point[] {
  // ccw in y-up maths
  return [
    { x: origin.x, y: origin.y },
    { x: origin.x + width, y: origin.y },
    { x: origin.x + width, y: origin.y + depth },
    { x: origin.x, y: origin.y + depth },
  ];
}

export interface WallWalkStep {
  length: number; // mm
  turn: number; // degrees turned at the END of this wall; +90 = turn left (ccw), -90 = right
}

/**
 * Build a polygon by walking around a room: wall length, then turn.
 * Returns the polygon and how far the walk misses its start (closure error).
 * The polygon is NOT silently corrected: the last vertex is placed where the
 * walk ended and the gap is reported so the user can re-measure.
 */
export function wallWalk(steps: WallWalkStep[], startHeadingDeg = 0): { polygon: Point[]; closureError: number; headingError: number } {
  const pts: Point[] = [{ x: 0, y: 0 }];
  let heading = (startHeadingDeg * Math.PI) / 180;
  let cur = { x: 0, y: 0 };
  let totalTurn = 0;
  steps.forEach((s, i) => {
    cur = { x: cur.x + Math.cos(heading) * s.length, y: cur.y + Math.sin(heading) * s.length };
    if (i < steps.length - 1) pts.push(cur);
    heading += (s.turn * Math.PI) / 180;
    totalTurn += s.turn;
  });
  const closureError = dist(cur, pts[0]);
  const headingError = Math.abs(Math.abs(totalTurn) - 360);
  return { polygon: pts.map((p) => ({ x: round3(p.x), y: round3(p.y) })), closureError, headingError };
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Set the length of edge i (vertex i -> i+1) to `newLen`, keeping the
 * edge's direction. To keep the room's shape consistent, the vertices after
 * the edge are shifted along it up to (and including) the start vertex of the
 * next edge running the opposite way; that opposite edge absorbs the change.
 * For a rectangle this moves the far wall, exactly like resizing the room.
 * If no opposite edge exists only vertex i+1 moves.
 */
export function setEdgeLength(poly: Point[], i: number, newLen: number): Point[] {
  const n = poly.length;
  if (n < 2 || newLen <= 0) return poly;
  const a = poly[i];
  const b = poly[(i + 1) % n];
  const dir = norm(sub(b, a));
  const delta = scale(dir, newLen - dist(a, b));
  const out = poly.map((p) => ({ ...p }));
  // find the next anti-parallel edge after i
  let stop = -1;
  for (let k = 1; k < n - 1; k++) {
    const e = (i + k) % n;
    const ed = norm(sub(poly[(e + 1) % n], poly[e]));
    if (dot(ed, dir) < -0.999) {
      stop = e;
      break;
    }
  }
  if (stop === -1) {
    out[(i + 1) % n] = add(b, delta);
    return out;
  }
  for (let k = 1; ; k++) {
    const v = (i + k) % n;
    out[v] = add(poly[v], delta);
    if (v === stop) break;
  }
  return out;
}

/** Move edge i perpendicular to itself by `offset` (positive = outward, grows the room). */
export function moveEdge(poly: Point[], i: number, offset: number): Point[] {
  const n = poly.length;
  const a = poly[i];
  const b = poly[(i + 1) % n];
  const nrm = edgeOutwardNormal(poly, i);
  const out = poly.map((p) => ({ ...p }));
  // Move each endpoint along its adjacent edge so neighbouring walls keep their direction.
  const prev = poly[(i - 1 + n) % n];
  const next = poly[(i + 2) % n];
  out[i] = slideAlong(a, prev, nrm, offset);
  out[(i + 1) % n] = slideAlong(b, next, nrm, offset);
  return out;
}

function slideAlong(p: Point, other: Point, nrm: Point, offset: number): Point {
  const along = norm(sub(p, other));
  const d = dot(along, nrm);
  if (Math.abs(d) < 0.05) return add(p, scale(nrm, offset)); // neighbour parallel: plain move
  return add(p, scale(along, offset / d));
}

export function insertVertex(poly: Point[], edge: number, p: Point): Point[] {
  const out = [...poly];
  out.splice(edge + 1, 0, p);
  return out;
}

export function removeVertex(poly: Point[], i: number): Point[] {
  if (poly.length <= 3) return poly;
  return poly.filter((_, k) => k !== i);
}

export function translate(poly: Point[], d: Point): Point[] {
  return poly.map((p) => add(p, d));
}

export function snapValue(v: number, grid: number) {
  return grid > 0 ? Math.round(v / grid) * grid : v;
}

/**
 * Offset a simple polygon outward by `d` (miter joins, limited).
 * Used for drawing wall thickness outside interior dimensions.
 */
export function offsetPolygon(poly: Point[], d: number): Point[] {
  const n = poly.length;
  if (n < 3) return poly;
  const ccw = signedArea(poly) > 0;
  const s = ccw ? -1 : 1; // outward normal sign: for ccw, outward is to the right
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i - 1 + n) % n];
    const p1 = poly[i];
    const p2 = poly[(i + 1) % n];
    const n1 = scale(perp(norm(sub(p1, p0))), s);
    const n2 = scale(perp(norm(sub(p2, p1))), s);
    const bis = norm(add(n1, n2));
    const cosHalf = dot(bis, n1);
    const k = cosHalf < 0.25 ? d / 0.25 : d / cosHalf; // miter limit 4
    out.push(add(p1, scale(bis, k)));
  }
  return out;
}

/** Outward unit normal of edge i. */
export function edgeOutwardNormal(poly: Point[], i: number): Point {
  const a = poly[i];
  const b = poly[(i + 1) % poly.length];
  const ccw = signedArea(poly) > 0;
  return scale(perp(norm(sub(b, a))), ccw ? -1 : 1);
}

/** Corners of an oriented rectangle centred at (x,y). Rotation in degrees. */
export function orientedRect(x: number, y: number, w: number, d: number, rotDeg: number): Point[] {
  const r = (rotDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const hw = w / 2;
  const hd = d / 2;
  return [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ].map((p) => ({ x: x + p.x * c - p.y * s, y: y + p.x * s + p.y * c }));
}

/** Convex polygon overlap (separating axis theorem). Touching is not overlap. */
export function convexOverlap(a: Point[], b: Point[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const e = sub(poly[(i + 1) % poly.length], poly[i]);
      const axis = norm(perp(e));
      let minA = Infinity,
        maxA = -Infinity,
        minB = Infinity,
        maxB = -Infinity;
      for (const p of a) {
        const v = dot(p, axis);
        minA = Math.min(minA, v);
        maxA = Math.max(maxA, v);
      }
      for (const p of b) {
        const v = dot(p, axis);
        minB = Math.min(minB, v);
        maxB = Math.max(maxB, v);
      }
      if (maxA <= minB + 0.5 || maxB <= minA + 0.5) return false;
    }
  }
  return true;
}

/** True when every corner of `inner` is inside `outer` and no edges cross. */
export function polygonInside(inner: Point[], outer: Point[]): boolean {
  if (!inner.every((p) => pointInPolygon(p, outer))) return false;
  for (let i = 0; i < inner.length; i++) {
    for (let j = 0; j < outer.length; j++) {
      if (segmentsIntersect(inner[i], inner[(i + 1) % inner.length], outer[j], outer[(j + 1) % outer.length])) return false;
    }
  }
  return true;
}

export interface FitResult {
  fits: boolean;
  position?: Point;
  rotation?: number;
  // Largest clearance found around the item (mm), when it fits.
  clearance?: number;
  tried: number;
}

/**
 * Search for a placement of a w×d rectangle (plus `clearance` on all sides)
 * inside a room polygon, at the room's wall angles. Optional obstacles are
 * convex polygons (other furniture, door swings) that the item must not hit.
 */
export function findFit(
  room: Point[],
  w: number,
  d: number,
  opts: { clearance?: number; obstacles?: Point[][]; step?: number } = {},
): FitResult {
  if (room.length < 3) return { fits: false, tried: 0 };
  const clearance = opts.clearance ?? 0;
  const obstacles = opts.obstacles ?? [];
  const b = bounds(room);
  const step = opts.step ?? Math.max(50, Math.min(b.w, b.h) / 40);
  // candidate rotations: aligned with each distinct wall direction, and + 90
  const rots = new Set<number>();
  for (let i = 0; i < room.length; i++) {
    const e = sub(room[(i + 1) % room.length], room[i]);
    const a = Math.round(((Math.atan2(e.y, e.x) * 180) / Math.PI + 360) % 180);
    rots.add(a);
    rots.add((a + 90) % 180);
  }
  let tried = 0;
  let best: FitResult | null = null;
  for (const rot of rots) {
    for (let y = b.minY; y <= b.maxY; y += step) {
      for (let x = b.minX; x <= b.maxX; x += step) {
        tried++;
        const env = orientedRect(x, y, w + 2 * clearance, d + 2 * clearance, rot);
        if (!polygonInside(env, room)) continue;
        const body = orientedRect(x, y, w, d, rot);
        if (obstacles.some((o) => convexOverlap(body, o))) continue;
        const c = minDistanceToEdges(body, room);
        if (!best || (best.clearance ?? 0) < c) best = { fits: true, position: { x, y }, rotation: rot, clearance: c, tried };
      }
    }
  }
  return best ? { ...best, tried } : { fits: false, tried };
}

function minDistanceToEdges(body: Point[], room: Point[]): number {
  let m = Infinity;
  for (const p of body)
    for (let i = 0; i < room.length; i++) m = Math.min(m, distToSegment(p, room[i], room[(i + 1) % room.length]));
  return m;
}

/** Point at distance `t` (mm) along edge i from its start. */
export function pointOnEdge(poly: Point[], i: number, t: number): Point {
  const a = poly[i];
  const b = poly[(i + 1) % poly.length];
  return add(a, scale(norm(sub(b, a)), t));
}

/** Nearest edge to a point. */
export function nearestEdge(poly: Point[], p: Point): { edge: number; distance: number; t: number } {
  let best = { edge: -1, distance: Infinity, t: 0 };
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const pr = projectOnSegment(p, a, b);
    const dd = dist(p, pr.point);
    if (dd < best.distance) best = { edge: i, distance: dd, t: pr.t * dist(a, b) };
  }
  return best;
}
