import { describe, expect, it } from 'vitest';
import { applyH, homography, planeDistance, scaleDistance } from '../../src/core/homography';

describe('photo measurement maths', () => {
  it('homography maps the four corners exactly', () => {
    const src = [{ x: 100, y: 120 }, { x: 420, y: 90 }, { x: 460, y: 400 }, { x: 80, y: 380 }];
    const dst = [{ x: 0, y: 0 }, { x: 297, y: 0 }, { x: 297, y: 210 }, { x: 0, y: 210 }];
    const H = homography(src, dst)!;
    src.forEach((p, i) => {
      const q = applyH(H, p);
      expect(q.x).toBeCloseTo(dst[i].x, 6);
      expect(q.y).toBeCloseTo(dst[i].y, 6);
    });
  });
  it('recovers a distance through a synthetic perspective view', () => {
    // A known projective warp of a wall plane (mm) into an image.
    const P = [0.8, 0.1, 50, -0.05, 0.9, 30, 0.0002, 0.0001, 1];
    const proj = (x: number, y: number) => applyH(P, { x, y });
    const a4 = [proj(1000, 1000), proj(1297, 1000), proj(1297, 1210), proj(1000, 1210)];
    // measure a 2400 mm line elsewhere on the same plane
    const d = planeDistance(a4, 297, 210, proj(200, 1500), proj(2600, 1500))!;
    expect(d).toBeCloseTo(2400, 3);
  });
  it('scale method', () => {
    expect(scaleDistance({ x: 0, y: 0 }, { x: 100, y: 0 }, 297, { x: 0, y: 0 }, { x: 0, y: 200 })).toBeCloseTo(594);
  });
});
