import { describe, expect, it } from 'vitest';
import { boundaryToPoints, coverageDeg, fitRoom, floorBoundary, pixelRay, rayToFloor, rotationMatrix, sampleFloor, type CameraModel, type Frame } from '../../src/core/autoscan';
import { cameraDirection } from '../../src/core/scanmath';
import { pointInPolygon, polygonArea, isRectilinear } from '../../src/core/geometry';
import type { Point } from '../../src/core/types';

const H = 1350;
const cam: CameraModel = { width: 72, height: 96, fovLong: 66, screenAngle: 0 };

/** Render what the phone camera would see: floor colour inside the room, wall elsewhere. */
function render(room: Point[], o: { alpha: number; beta: number; gamma: number }, opts: { furniture?: Point[]; seed?: number } = {}): Frame {
  const R = rotationMatrix(o);
  const data = new Uint8ClampedArray(cam.width * cam.height * 4);
  let s = opts.seed ?? 1;
  const noise = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 14;
  for (let v = 0; v < cam.height; v++)
    for (let u = 0; u < cam.width; u++) {
      const p = rayToFloor(pixelRay(u, v, cam, R), H, 30000);
      let c = [225, 222, 214]; // wall
      if (p && pointInPolygon(p, room)) c = opts.furniture && pointInPolygon(p, opts.furniture) ? [70, 72, 80] : [150, 108, 70]; // furniture / timber floor
      const i = (v * cam.width + u) * 4;
      data[i] = c[0] + noise();
      data[i + 1] = c[1] + noise();
      data[i + 2] = c[2] + noise();
      data[i + 3] = 255;
    }
  return { data, width: cam.width, height: cam.height };
}

function sweep(room: Point[], opts: { furniture?: Point[] } = {}) {
  let model;
  const pts: Point[] = [];
  for (let a = 0; a < 360; a += 6) {
    const o = { alpha: a, beta: 62, gamma: 0 }; // looking ~28° down, turning on the spot
    const f = render(room, o, { ...opts, seed: a + 3 });
    model = sampleFloor(f, model);
    const { boundary } = floorBoundary(f, model);
    pts.push(...boundaryToPoints(boundary, cam, o, H));
  }
  return pts;
}

describe('auto scan', () => {
  it('pixel ray through the image centre equals the camera direction', () => {
    const o = { alpha: 30, beta: 70, gamma: 5 };
    const r = pixelRay(cam.width / 2 - 0.5, cam.height / 2 - 0.5, cam, rotationMatrix(o));
    const d = cameraDirection(o);
    expect(r.x / -r.z).toBeCloseTo(d.x / -d.z, 6);
    expect(r.y / -r.z).toBeCloseTo(d.y / -d.z, 6);
  });

  it('finds the floor edge in a rendered frame', () => {
    const room = [{ x: -2000, y: -1800 }, { x: 2000, y: -1800 }, { x: 2000, y: 1800 }, { x: -2000, y: 1800 }];
    const f = render(room, { alpha: 0, beta: 62, gamma: 0 });
    const { boundary } = floorBoundary(f, sampleFloor(f));
    const found = [...boundary].filter((v) => v > 0).length;
    expect(found).toBeGreaterThan(cam.width * 0.8);
  });

  it('builds a rectangular room from a 360° sweep', () => {
    const room = [{ x: -2100, y: -1600 }, { x: 2400, y: -1600 }, { x: 2400, y: 1900 }, { x: -2100, y: 1900 }];
    const pts = sweep(room);
    expect(coverageDeg(pts)).toBeGreaterThan(330);
    const fit = fitRoom(pts)!;
    expect(fit.method).toBe('square');
    expect(fit.polygon).toHaveLength(4);
    expect(polygonArea(fit.polygon) / 1e6).toBeCloseTo((4.5 * 3.5), 0);
  });

  it('builds an L-shaped room', () => {
    const L = [{ x: -2000, y: -2000 }, { x: 3000, y: -2000 }, { x: 3000, y: 1000 }, { x: 800, y: 1000 }, { x: 800, y: 2500 }, { x: -2000, y: 2500 }];
    const fit = fitRoom(sweep(L))!;
    expect(fit.method).toBe('square');
    expect(fit.polygon).toHaveLength(6);
    expect(isRectilinear(fit.polygon)).toBe(true);
    expect(Math.abs(polygonArea(fit.polygon) - polygonArea(L)) / polygonArea(L)).toBeLessThan(0.08);
  });

  it('ignores a small piece of furniture against a wall', () => {
    const room = [{ x: -2000, y: -2000 }, { x: 2500, y: -2000 }, { x: 2500, y: 2000 }, { x: -2000, y: 2000 }];
    const chair = [{ x: 1900, y: -300 }, { x: 2500, y: -300 }, { x: 2500, y: 100 }, { x: 1900, y: 100 }];
    const fit = fitRoom(sweep(room, { furniture: chair }))!;
    expect(fit.polygon).toHaveLength(4);
    expect(polygonArea(fit.polygon) / 1e6).toBeCloseTo(18, 0);
  });

  it('returns nothing when too little was seen', () => {
    expect(fitRoom([{ x: 1000, y: 0 }, { x: 1000, y: 100 }])).toBeNull();
  });
});
