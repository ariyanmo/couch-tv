import { describe, expect, it } from 'vitest';
import { aim, calibrate, ceilingHeight, floorPoint, nearlyRectilinear, squareUp } from '../../src/core/scanmath';
import { edgeLength, isRectangle, polygonArea } from '../../src/core/geometry';

const H = 1300;
// Orientation that aims the rear camera at plan point p (phone upright, no roll).
function aimAt(p: { x: number; y: number }, h = H) {
  const nx = p.x;
  const ny = -p.y; // plan y is down the screen; north is up
  const dist = Math.hypot(nx, ny);
  const theta = Math.atan2(h, dist); // below horizon
  return { alpha: (Math.atan2(-nx, ny) * 180) / Math.PI, beta: 90 - (theta * 180) / Math.PI, gamma: 0 };
}

describe('camera scan maths', () => {
  it('upright phone looks at the horizon; tilting down looks at the floor', () => {
    expect(aim({ alpha: 0, beta: 90, gamma: 0 }).pitch).toBeCloseTo(0);
    expect(aim({ alpha: 0, beta: 60, gamma: 0 }).pitch).toBeCloseTo(-30);
    expect(floorPoint({ alpha: 0, beta: 90, gamma: 0 }, H)).toBeNull();
  });
  it('recovers corner positions from sensor angles and phone height', () => {
    const room = [{ x: -2000, y: -1500 }, { x: 2200, y: -1500 }, { x: 2200, y: 1800 }, { x: -2000, y: 1800 }];
    const got = room.map((c) => floorPoint(aimAt(c), H)!);
    got.forEach((g, i) => {
      expect(g.x).toBeCloseTo(room[i].x, 3);
      expect(g.y).toBeCloseTo(room[i].y, 3);
    });
    expect(polygonArea(got)).toBeCloseTo(4200 * 3300, -2);
  });
  it('works when the phone is rolled sideways', () => {
    // same aim, holding the phone with 20° roll should still find a floor point
    const o = { ...aimAt({ x: 1000, y: -2000 }), gamma: 20 };
    expect(floorPoint(o, H)).not.toBeNull();
  });
  it('ceiling height from aiming at the top of a corner', () => {
    const dist = 2500;
    const elev = Math.atan2(2550 - H, dist);
    const o = { alpha: 0, beta: 90 + (elev * 180) / Math.PI, gamma: 0 };
    expect(ceilingHeight(o, H, dist)).toBeCloseTo(2550, 3);
  });
  it('squares up a slightly crooked scan and keeps it closed', () => {
    const noisy = [{ x: 0, y: 0 }, { x: 4020, y: 60 }, { x: 3980, y: 3010 }, { x: -30, y: 2970 }];
    expect(nearlyRectilinear(noisy)).toBe(true);
    const sq = squareUp(noisy);
    expect(isRectangle(sq, 0.5)).toBe(true);
    expect(polygonArea(sq) / 1e6).toBeCloseTo(12, 0);
  });
  it('does not square a room that is genuinely angled', () => {
    expect(nearlyRectilinear([{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 2000, y: 3000 }])).toBe(false);
  });
  it('calibrates the whole outline from one measured wall', () => {
    const sq = [{ x: 0, y: 0 }, { x: 3900, y: 0 }, { x: 3900, y: 2925 }, { x: 0, y: 2925 }];
    const c = calibrate(sq, 0, 4000);
    expect(edgeLength(c, 0)).toBeCloseTo(4000);
    expect(edgeLength(c, 1)).toBeCloseTo(3000);
  });
});
