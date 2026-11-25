import { describe, expect, it } from 'vitest';
import { flooringNeed, missingMeasurements, paintNeed, roomFloorArea, roomWallArea, totalInteriorArea } from '../../src/core/calc';
import { applyRectangle, applyWallWalk, createOpening, createProperty, createRoom, createSampleProperty, setPolygonDrawn, setWallLength } from '../../src/core/model';
import { moveEdge } from '../../src/core/geometry';

const measuredRoom = () => {
  const p = createProperty('t');
  let r = createRoom(p.floors[0].id, 'Bed', 'bedroom');
  r = applyRectangle(r, 4000, 3000, 'measured', 'tape');
  r.ceilingHeight = { value: 2400, status: 'measured' };
  return { p, r };
};

describe('room figures and provenance', () => {
  it('room without a shape has unknown area, never zero-as-fact', () => {
    const p = createProperty('t');
    const r = createRoom(p.floors[0].id, 'X', 'living');
    const a = roomFloorArea(r);
    expect(a.status).toBe('unknown');
  });
  it('measured rectangle gives a measured area', () => {
    const { r } = measuredRoom();
    const a = roomFloorArea(r);
    expect(a.value).toBe(12_000_000);
    expect(a.status).toBe('measured');
  });
  it('dragging a wall downgrades it to drawn', () => {
    const { r } = measuredRoom();
    const moved = setPolygonDrawn(r, moveEdge(r.polygon, 1, 300));
    expect(moved.edges[1].status).toBe('measured'); // edge 1 moved parallel, its length is unchanged
    expect(moved.edges[0].status).toBe('drawn');
    expect(roomFloorArea(moved).status).toBe('drawn');
  });
  it('typing a wall length marks it measured again', () => {
    const { r } = measuredRoom();
    const moved = setPolygonDrawn(r, moveEdge(r.polygon, 1, 300));
    const fixed = setWallLength(setWallLength(moved, 0, 4500, 'measured', 'tape'), 2, 4500, 'measured', 'tape');
    expect(roomFloorArea(fixed).status).toBe('measured');
    expect(roomFloorArea(fixed).value).toBeCloseTo(4500 * 3000);
  });
  it('wall walk that does not close is not verified', () => {
    const p = createProperty('t');
    const r = applyWallWalk(createRoom(p.floors[0].id, 'X', 'living'), [
      { length: 4000, turn: 90 }, { length: 3000, turn: 90 }, { length: 3900, turn: 90 }, { length: 3000, turn: 90 },
    ], 'measured', 'tape');
    expect(r.closureError).toBeGreaterThan(90);
    expect(roomFloorArea(r).status).not.toBe('measured');
  });
  it('wall area subtracts openings and inherits their provenance', () => {
    const { r } = measuredRoom();
    const withDoor = { ...r, openings: [createOpening('door', 0, 500)] };
    const w = roomWallArea(withDoor);
    expect(w.gross.value).toBe(14000 * 2400);
    expect(w.net.value).toBe(14000 * 2400 - 820 * 2040);
    expect(w.net.status).toBe('estimated'); // door size is a typical size, not measured
  });
  it('missing ceiling height makes wall area unknown', () => {
    const { r } = measuredRoom();
    r.ceilingHeight = { value: 0, status: 'unknown' };
    expect(roomWallArea(r).net.status).toBe('unknown');
  });
});

describe('totals and materials', () => {
  it('excluded rooms do not count toward interior area', () => {
    const p = createSampleProperty();
    const total = totalInteriorArea(p);
    const balcony = p.rooms.find((r) => r.type === 'balcony')!;
    const all = p.rooms.reduce((s, r) => s + roomFloorArea(r).value, 0);
    expect(total.value).toBeCloseTo(all - roomFloorArea(balcony).value);
    expect(total.status).not.toBe('measured'); // the sample has a drawn wall
  });
  it('flooring with waste and boxes', () => {
    const { p, r } = measuredRoom();
    const f = flooringNeed([r], p.areaSettings, 2.2);
    expect(f.withWaste).toBeCloseTo(13_200_000);
    expect(f.boxes).toBe(6);
  });
  it('paint litres from net wall area, coats and coverage', () => {
    const { p, r } = measuredRoom();
    const need = paintNeed([r], p.areaSettings);
    expect(need.litres).toBeCloseTo((33.6 * 2) / 12);
  });
  it('lists what still needs measuring', () => {
    const p = createSampleProperty();
    const miss = missingMeasurements(p);
    expect(miss.some((m) => m.roomName === 'Bedroom 2' && m.what === 'Wall 2 length')).toBe(true);
    expect(miss.some((m) => m.roomName === 'Hall' && m.what === 'Ceiling height')).toBe(true);
  });
});
