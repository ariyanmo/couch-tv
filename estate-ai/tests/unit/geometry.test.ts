import { describe, expect, it } from 'vitest';
import {
  findFit, interiorAngle, isRectangle, isRectilinear, isSimplePolygon, moveEdge, offsetPolygon, orientedRect,
  perimeter, pointInPolygon, polygonArea, rectPolygon, setEdgeLength, wallWalk, convexOverlap, edgeLength, centroid,
} from '../../src/core/geometry';

const L = [
  { x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 3000 }, { x: 3000, y: 3000 }, { x: 3000, y: 5000 }, { x: 0, y: 5000 },
];

describe('area and perimeter', () => {
  it('rectangle area is width × depth', () => {
    expect(polygonArea(rectPolygon(4000, 3000))).toBe(12_000_000);
    expect(perimeter(rectPolygon(4000, 3000))).toBe(14000);
  });
  it('L-shape area via shoelace, orientation independent', () => {
    expect(polygonArea(L)).toBe(6000 * 3000 + 3000 * 2000);
    expect(polygonArea([...L].reverse())).toBe(24_000_000);
  });
  it('centroid of rectangle is its middle', () => {
    expect(centroid(rectPolygon(4000, 2000))).toEqual({ x: 2000, y: 1000 });
  });
});

describe('angles and shape tests', () => {
  it('rectangle corners are 90°, both orientations', () => {
    const r = rectPolygon(3000, 2000);
    for (let i = 0; i < 4; i++) expect(interiorAngle(r, i)).toBeCloseTo(90);
    const rr = [...r].reverse();
    for (let i = 0; i < 4; i++) expect(interiorAngle(rr, i)).toBeCloseTo(90);
    expect(isRectangle(r)).toBe(true);
  });
  it('L-shape has one reflex corner and is rectilinear', () => {
    const angles = L.map((_, i) => Math.round(interiorAngle(L, i)));
    expect(angles.filter((a) => a === 270)).toHaveLength(1);
    expect(isRectilinear(L)).toBe(true);
    expect(isRectangle(L)).toBe(false);
  });
  it('detects self-intersection', () => {
    expect(isSimplePolygon([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }])).toBe(false);
    expect(isSimplePolygon(L)).toBe(true);
  });
});

describe('wall walk', () => {
  it('closes a measured rectangle exactly', () => {
    const w = wallWalk([{ length: 4000, turn: 90 }, { length: 3000, turn: 90 }, { length: 4000, turn: 90 }, { length: 3000, turn: 90 }]);
    expect(w.closureError).toBeCloseTo(0, 6);
    expect(polygonArea(w.polygon)).toBeCloseTo(12_000_000, 0);
  });
  it('reports closure error instead of hiding it', () => {
    const w = wallWalk([{ length: 4000, turn: 90 }, { length: 3000, turn: 90 }, { length: 3950, turn: 90 }, { length: 3000, turn: 90 }]);
    expect(w.closureError).toBeCloseTo(50, 3);
  });
});

describe('editing', () => {
  it('setEdgeLength on a rectangle moves the opposite wall', () => {
    const r = setEdgeLength(rectPolygon(4000, 3000), 0, 5000);
    expect(edgeLength(r, 0)).toBeCloseTo(5000);
    expect(edgeLength(r, 2)).toBeCloseTo(5000);
    expect(edgeLength(r, 1)).toBeCloseTo(3000);
    expect(isRectangle(r)).toBe(true);
  });
  it('setEdgeLength on an L-shape keeps it rectilinear', () => {
    const r = setEdgeLength(L, 0, 7000);
    expect(isRectilinear(r)).toBe(true);
    expect(edgeLength(r, 0)).toBeCloseTo(7000);
    expect(polygonArea(r)).toBeCloseTo(24_000_000 + 1000 * 3000);
  });
  it('moveEdge keeps neighbouring wall directions', () => {
    const r = moveEdge(rectPolygon(4000, 3000), 1, -500); // shrink width
    expect(isRectangle(r)).toBe(true);
    expect(polygonArea(r)).toBeCloseTo(3500 * 3000);
  });
  it('offset polygon grows a rectangle outward by the thickness', () => {
    const o = offsetPolygon(rectPolygon(4000, 3000), 100);
    expect(polygonArea(o)).toBeCloseTo(4200 * 3200);
    const o2 = offsetPolygon([...rectPolygon(4000, 3000)].reverse(), 100);
    expect(polygonArea(o2)).toBeCloseTo(4200 * 3200);
  });
});

describe('containment and fitting', () => {
  it('point in polygon including boundary', () => {
    expect(pointInPolygon({ x: 1000, y: 4000 }, L)).toBe(true);
    expect(pointInPolygon({ x: 5000, y: 4000 }, L)).toBe(false);
    expect(pointInPolygon({ x: 0, y: 2000 }, L)).toBe(true);
  });
  it('SAT overlap', () => {
    expect(convexOverlap(orientedRect(0, 0, 100, 100, 0), orientedRect(50, 50, 100, 100, 45))).toBe(true);
    expect(convexOverlap(orientedRect(0, 0, 100, 100, 0), orientedRect(300, 0, 100, 100, 0))).toBe(false);
  });
  it('a king bed fits a 4 × 3.6 m room, not a 2.5 × 2.5 m room', () => {
    expect(findFit(rectPolygon(4000, 3600), 1930, 2030).fits).toBe(true);
    expect(findFit(rectPolygon(2500, 2500), 1930, 2030, { clearance: 600 }).fits).toBe(false);
  });
  it('fit honours obstacles', () => {
    const room = rectPolygon(2100, 2100);
    expect(findFit(room, 2000, 2000).fits).toBe(true);
    expect(findFit(room, 2000, 2000, { obstacles: [orientedRect(1050, 1050, 300, 300, 0)] }).fits).toBe(false);
  });
});
