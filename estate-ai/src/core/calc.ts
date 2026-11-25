// Area, wall, flooring and paint calculations. Every number carries the
// provenance of its weakest input, and the reasons, so the UI can say exactly
// why a figure is or is not verified.

import { edgeLength, isRectilinear, perimeter, polygonArea } from './geometry';
import type { AreaSettings, Floor, Opening, Property, Provenance, Room } from './types';
import { MM2_PER_M2, worst } from './units';

export interface Figure {
  value: number; // mm or mm² depending on the figure
  status: Provenance;
  reasons: string[];
}

const fig = (value: number, status: Provenance, reasons: string[] = []): Figure => ({ value, status, reasons });

export const CLOSURE_TOLERANCE_MM = 25;

export function roomHasShape(room: Room) {
  return room.polygon.length >= 3;
}

export function edgeStatus(room: Room, i: number): Provenance {
  return room.edges[i]?.status ?? 'drawn';
}

export function roomFloorArea(room: Room): Figure {
  if (!roomHasShape(room)) return fig(0, 'unknown', ['Room shape not recorded yet']);
  const area = polygonArea(room.polygon);
  const reasons: string[] = [];
  let status: Provenance = worst(...room.polygon.map((_, i) => edgeStatus(room, i)));
  const unmeasured = room.polygon.map((_, i) => i).filter((i) => edgeStatus(room, i) !== 'measured');
  if (unmeasured.length) reasons.push(`${unmeasured.length} of ${room.polygon.length} walls not measured`);
  if (status === 'measured') {
    if (isRectilinear(room.polygon)) {
      reasons.push('Calculated from measured walls, assuming square corners');
    } else {
      // Lengths alone do not fix the angles of a non-rectangular room.
      status = 'drawn';
      reasons.push('Walls measured but corner angles are not, so the shape follows the drawing');
    }
  }
  if (room.closureError != null && room.closureError > CLOSURE_TOLERANCE_MM) {
    status = worst(status, 'estimated');
    reasons.push(`Wall walk did not close by ${Math.round(room.closureError)} mm; re-measure to verify`);
  }
  return fig(area, status, reasons);
}

export function roomPerimeter(room: Room): Figure {
  if (!roomHasShape(room)) return fig(0, 'unknown', ['Room shape not recorded yet']);
  return fig(perimeter(room.polygon), worst(...room.polygon.map((_, i) => edgeStatus(room, i))));
}

export function openingArea(o: Opening): Figure {
  return fig(o.width.value * o.height.value, worst(o.width.status, o.height.status));
}

/** Gross and net wall surface area for one wall (edge). */
export function wallArea(room: Room, i: number): { gross: Figure; net: Figure; openings: Figure } {
  const h = room.ceilingHeight;
  const L = edgeLength(room.polygon, i);
  const gStatus = worst(edgeStatus(room, i), h.status);
  const gross = fig(L * h.value, gStatus, h.status === 'unknown' ? ['Ceiling height missing'] : []);
  const ops = room.openings.filter((o) => o.edge === i);
  const opArea = ops.reduce((s, o) => s + o.width.value * o.height.value, 0);
  const opStatus = ops.length ? worst(...ops.map((o) => worst(o.width.status, o.height.status))) : 'measured';
  const openings = fig(opArea, opStatus);
  const net = fig(Math.max(0, gross.value - opArea), worst(gStatus, opStatus), gross.reasons);
  return { gross, net, openings };
}

export function roomWallArea(room: Room): { gross: Figure; net: Figure; openings: Figure } {
  if (!roomHasShape(room)) {
    const u = fig(0, 'unknown', ['Room shape not recorded yet']);
    return { gross: u, net: u, openings: u };
  }
  const parts = room.polygon.map((_, i) => wallArea(room, i));
  const sum = (k: 'gross' | 'net' | 'openings') =>
    fig(
      parts.reduce((s, p) => s + p[k].value, 0),
      worst(...parts.map((p) => p[k].status)),
      Array.from(new Set(parts.flatMap((p) => p[k].reasons))),
    );
  return { gross: sum('gross'), net: sum('net'), openings: sum('openings') };
}

/** Flat ceiling assumed: ceiling area equals floor area. */
export function roomCeilingArea(room: Room): Figure {
  const f = roomFloorArea(room);
  return fig(f.value, f.status, [...f.reasons, 'Assumes a flat ceiling']);
}

export function roomVolume(room: Room): Figure {
  const f = roomFloorArea(room);
  return fig(f.value * room.ceilingHeight.value, worst(f.status, room.ceilingHeight.status));
}

export function floorRooms(p: Property, floorId: string) {
  return p.rooms.filter((r) => r.floorId === floorId);
}

export function sumFigures(figs: Figure[]): Figure {
  if (!figs.length) return fig(0, 'unknown', ['No rooms']);
  return fig(
    figs.reduce((s, f) => s + f.value, 0),
    worst(...figs.map((f) => f.status)),
    Array.from(new Set(figs.flatMap((f) => f.reasons))),
  );
}

export function floorArea(p: Property, floor: Floor, onlyCounted = true): Figure {
  const rooms = floorRooms(p, floor.id).filter((r) => !onlyCounted || r.countsTowardArea);
  return sumFigures(rooms.map(roomFloorArea));
}

export function totalInteriorArea(p: Property): Figure {
  return sumFigures(p.rooms.filter((r) => r.countsTowardArea).map(roomFloorArea));
}

export interface FlooringNeed {
  area: Figure; // mm²
  withWaste: number; // mm²
  boxes?: number;
}

export function flooringNeed(rooms: Room[], settings: AreaSettings, boxCoverageM2?: number): FlooringNeed {
  const area = sumFigures(rooms.map(roomFloorArea));
  const withWaste = area.value * (1 + settings.flooringWastePct / 100);
  const boxes = boxCoverageM2 && boxCoverageM2 > 0 ? Math.ceil(withWaste / MM2_PER_M2 / boxCoverageM2) : undefined;
  return { area, withWaste, boxes };
}

export interface PaintNeed {
  wallArea: Figure; // net, mm²
  ceilingArea?: Figure;
  litres: number;
}

export function paintNeed(rooms: Room[], settings: AreaSettings, includeCeilings = false): PaintNeed {
  const wall = sumFigures(rooms.map((r) => roomWallArea(r).net));
  const ceil = includeCeilings ? sumFigures(rooms.map(roomCeilingArea)) : undefined;
  const m2 = (wall.value + (ceil?.value ?? 0)) / MM2_PER_M2;
  const litres = settings.paintCoveragePerLitre > 0 ? (m2 * settings.paintCoats) / settings.paintCoveragePerLitre : NaN;
  return { wallArea: wall, ceilingArea: ceil, litres };
}

/** Rooms or walls with gaps, for a "what to measure next" list. */
export function missingMeasurements(p: Property): { roomId: string; roomName: string; what: string }[] {
  const out: { roomId: string; roomName: string; what: string }[] = [];
  for (const r of p.rooms) {
    if (!roomHasShape(r)) {
      out.push({ roomId: r.id, roomName: r.name, what: 'Room shape and wall lengths' });
      continue;
    }
    r.polygon.forEach((_, i) => {
      if (edgeStatus(r, i) !== 'measured') out.push({ roomId: r.id, roomName: r.name, what: `Wall ${i + 1} length` });
    });
    if (r.ceilingHeight.status !== 'measured') out.push({ roomId: r.id, roomName: r.name, what: 'Ceiling height' });
    for (const o of r.openings) {
      if (o.width.status !== 'measured' || o.height.status !== 'measured')
        out.push({ roomId: r.id, roomName: r.name, what: `${o.type} size on wall ${o.edge + 1}` });
    }
    if (r.closureError != null && r.closureError > CLOSURE_TOLERANCE_MM)
      out.push({ roomId: r.id, roomName: r.name, what: `Re-measure: wall walk off by ${Math.round(r.closureError)} mm` });
  }
  return out;
}

/** Share of measured inputs across the property, 0..1. */
export function measurementCompleteness(p: Property): number {
  let total = 0;
  let ok = 0;
  for (const r of p.rooms) {
    total += Math.max(1, r.polygon.length) + 1;
    ok += r.polygon.reduce((s, _, i) => s + (edgeStatus(r, i) === 'measured' ? 1 : 0), 0);
    ok += r.ceilingHeight.status === 'measured' ? 1 : 0;
  }
  return total ? ok / total : 0;
}
