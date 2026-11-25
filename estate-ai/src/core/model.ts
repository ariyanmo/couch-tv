import { defaultFinishes, ROOM_TYPES, catalogById } from './catalog';
import { polygonArea, rectPolygon, setEdgeLength, wallWalk, type WallWalkStep, edgeLength } from './geometry';
import type {
  AreaSettings,
  DesignConcept,
  Floor,
  FurnitureItem,
  Measure,
  MeasureMethod,
  Opening,
  OpeningType,
  Point,
  Property,
  Provenance,
  Room,
  RoomType,
  UnitSystem,
} from './types';

export const uid = (prefix = '') =>
  prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const DEFAULT_AREA_SETTINGS: AreaSettings = {
  excludedTypes: ['garage', 'balcony'],
  flooringWastePct: 10,
  paintCoveragePerLitre: 12, // typical interior acrylic, m² per litre per coat
  paintCoats: 2,
};

export function createFloor(level: number, name?: string): Floor {
  return {
    id: uid('f_'),
    name: name ?? (level === 0 ? 'Ground floor' : level < 0 ? `Basement ${-level}` : `Level ${level}`),
    level,
    elevation: level * 3000,
    defaultCeiling: 2400,
  };
}

export function createProperty(name: string, address = '', units: UnitSystem = 'metric'): Property {
  const now = Date.now();
  return {
    id: uid('p_'),
    name: name || 'Untitled property',
    address,
    createdAt: now,
    updatedAt: now,
    units,
    floors: [createFloor(0)],
    rooms: [],
    connections: [],
    inspection: [],
    collections: [],
    exports: [],
    areaSettings: { ...DEFAULT_AREA_SETTINGS },
    highlights: [],
  };
}

export function createRoom(floorId: string, name: string, type: RoomType): Room {
  const now = Date.now();
  return {
    id: uid('r_'),
    floorId,
    name,
    type,
    countsTowardArea: ROOM_TYPES.find((t) => t.id === type)?.countsByDefault ?? true,
    polygon: [],
    edges: [],
    ceilingHeight: { value: 0, status: 'unknown' },
    wallThickness: 110,
    openings: [],
    furniture: [],
    finishes: defaultFinishes(type),
    concepts: [],
    createdAt: now,
    updatedAt: now,
  };
}

const m = (value: number, status: Provenance, method?: MeasureMethod): Measure => ({ value, status, method, at: Date.now() });

/** Rectangle room from a width and a depth. */
export function applyRectangle(
  room: Room,
  width: number,
  depth: number,
  status: Provenance,
  method: MeasureMethod,
  origin?: Point,
): Room {
  const o = origin ?? (room.polygon[0] ? { x: Math.min(...room.polygon.map((p) => p.x)), y: Math.min(...room.polygon.map((p) => p.y)) } : { x: 0, y: 0 });
  const polygon = rectPolygon(width, depth, o);
  return {
    ...room,
    polygon,
    edges: polygon.map(() => m(0, status, method)).map((e, i) => ({ ...e, value: i % 2 === 0 ? width : depth })),
    openings: room.openings.filter((op) => op.edge < 4),
    closureError: undefined,
    updatedAt: Date.now(),
  };
}

/** Room from a wall-by-wall walk. Closure error is kept and shown, never hidden. */
export function applyWallWalk(room: Room, steps: WallWalkStep[], status: Provenance, method: MeasureMethod, origin: Point = { x: 0, y: 0 }): Room {
  const { polygon, closureError } = wallWalk(steps);
  const poly = polygon.map((p) => ({ x: p.x + origin.x, y: p.y + origin.y }));
  const edges = steps.map((s) => m(s.length, status, method));
  // If the walk does not close, the closing wall drawn on screen is not the
  // length that was entered, so it is marked drawn and the area is not verified.
  const last = poly.length - 1;
  if (closureError > 1 && last >= 0) {
    edges[last] = { value: edgeLength(poly, last), status: 'drawn', method: 'drawn', note: `Entered ${Math.round(steps[last].length)} mm`, at: Date.now() };
  }
  return { ...room, polygon: poly, edges, closureError, openings: room.openings.filter((o) => o.edge < poly.length), updatedAt: Date.now() };
}

/** Set one wall length (measurement) and reshape the polygon consistently. */
export function setWallLength(room: Room, edge: number, length: number, status: Provenance, method: MeasureMethod): Room {
  const polygon = setEdgeLength(room.polygon, edge, length);
  const edges = syncEdges({ ...room, polygon });
  edges[edge] = m(length, status, method);
  return { ...room, polygon, edges, updatedAt: Date.now() };
}

/**
 * After a polygon changes by drawing, keep edge records in step:
 * edges whose length changed by more than 1 mm become 'drawn'.
 */
export function syncEdges(room: Room, prevPolygon?: Point[]): Measure[] {
  const n = room.polygon.length;
  const out: Measure[] = [];
  for (let i = 0; i < n; i++) {
    const L = edgeLength(room.polygon, i);
    const prev = room.edges[i];
    const prevLen = prevPolygon && prevPolygon.length === n ? edgeLength(prevPolygon, i) : prev?.value;
    if (prev && prevLen != null && Math.abs(prevLen - L) <= 1 && prev.status !== 'unknown') out.push({ ...prev, value: L });
    else out.push({ value: L, status: 'drawn', method: 'drawn', at: Date.now() });
  }
  return out;
}

export function setPolygonDrawn(room: Room, polygon: Point[]): Room {
  const prev = room.polygon;
  const next = { ...room, polygon };
  const sameCount = prev.length === polygon.length;
  return {
    ...next,
    edges: sameCount ? syncEdges(next, prev) : polygon.map((_, i) => ({ value: edgeLength(polygon, i), status: 'drawn' as Provenance, method: 'drawn' as MeasureMethod, at: Date.now() })),
    openings: sameCount ? room.openings : room.openings.filter((o) => o.edge < polygon.length),
    updatedAt: Date.now(),
  };
}

export function createOpening(type: OpeningType, edge: number, offset: number, status: Provenance = 'unknown'): Opening {
  const isDoor = type !== 'window';
  const width = type === 'double-door' ? 1620 : type === 'sliding-door' ? 1800 : type === 'window' ? 1200 : type === 'opening' ? 900 : 820;
  const height = type === 'window' ? 1200 : 2040;
  return {
    id: uid('o_'),
    type,
    edge,
    offset,
    // New openings start as typical sizes, explicitly NOT measured.
    width: { value: width, status: status === 'unknown' ? 'estimated' : status, method: 'manual-estimate', note: 'Typical size, not measured' },
    height: { value: height, status: status === 'unknown' ? 'estimated' : status, method: 'manual-estimate', note: 'Typical size, not measured' },
    sill: { value: isDoor ? 0 : 900, status: isDoor ? 'measured' : 'estimated', method: isDoor ? undefined : 'manual-estimate' },
    swing: 'left',
    swingIn: true,
  };
}

export function clampOpening(room: Room, o: Opening): Opening {
  if (!room.polygon.length) return o;
  const L = edgeLength(room.polygon, o.edge);
  const w = Math.min(o.width.value, L);
  const offset = Math.max(0, Math.min(o.offset, L - w));
  return { ...o, offset, width: { ...o.width, value: w } };
}

export function createFurniture(catalogId: string, at: Point): FurnitureItem | null {
  const c = catalogById(catalogId);
  if (!c) return null;
  return { id: uid('fu_'), catalogId, name: c.name, kind: c.kind, x: at.x, y: at.y, rotation: 0, w: c.w, d: c.d, h: c.h, color: c.color };
}

export function createConcept(room: Room, name: string): DesignConcept {
  return {
    id: uid('c_'),
    name,
    createdAt: Date.now(),
    finishes: { ...room.finishes },
    furniture: room.furniture.map((f) => ({ ...f, id: uid('fu_') })),
  };
}

export function roomSummaryLine(room: Room) {
  return `${room.name} (${polygonArea(room.polygon) ? 'shaped' : 'no shape'})`;
}

/** Make a demo property using clearly labelled sample numbers. */
export function createSampleProperty(): Property {
  const p = createProperty('Sample: 2-bed apartment', '12 Example Street (sample data)', 'metric');
  p.description = 'Sample data for exploring the app. These figures are invented examples, not a real property.';
  const f = p.floors[0];
  const mk = (name: string, type: RoomType, w: number, d: number, x: number, y: number, ceiling = 2550) => {
    let r = createRoom(f.id, name, type);
    r = applyRectangle(r, w, d, 'measured', 'tape', { x, y });
    r.ceilingHeight = { value: ceiling, status: 'measured', method: 'laser' };
    return r;
  };
  const t = 110;
  const living = mk('Living', 'living', 5200, 4100, 0, 0);
  const kitchen = mk('Kitchen', 'kitchen', 3000, 4100, 5200 + t, 0);
  const bed1 = mk('Main bedroom', 'bedroom', 3800, 3600, 0, 4100 + t);
  const bath = mk('Bathroom', 'bathroom', 2200, 2400, 3800 + t, 4100 + t);
  const bed2 = mk('Bedroom 2', 'bedroom', 3100, 3600, 3800 + t + 2200 + t, 4100 + t);
  bed2.edges[1] = { ...bed2.edges[1], status: 'drawn', method: 'drawn' };
  const hall = mk('Hall', 'hall', 2200, 1100, 3800 + t, 4100 + t + 2400 + t);
  hall.ceilingHeight = { value: 2550, status: 'estimated', method: 'manual-estimate' };
  const balcony = mk('Balcony', 'balcony', 3000, 1500, 5200 + t, -1500 - t);
  balcony.countsTowardArea = false;
  living.openings.push({ ...createOpening('window', 2, 1200, 'measured'), width: m(2400, 'measured', 'tape'), height: m(1500, 'measured', 'tape') });
  living.openings.push({ ...createOpening('door', 1, 2900, 'measured'), width: m(820, 'measured', 'tape'), height: m(2040, 'measured', 'tape') });
  kitchen.openings.push({ ...createOpening('sliding-door', 0, 600), width: m(1800, 'measured', 'tape'), height: m(2100, 'measured', 'tape') });
  bed1.openings.push({ ...createOpening('window', 3, 1000, 'measured'), width: m(1500, 'measured', 'tape'), height: m(1200, 'measured', 'tape') });
  bed1.openings.push(createOpening('door', 1, 2600));
  bath.openings.push(createOpening('door', 2, 700));
  bed2.openings.push(createOpening('door', 3, 2500));
  bed2.openings.push(createOpening('window', 1, 1000));
  living.furniture.push(createFurniture('sofa-3', { x: 2600, y: 3500 })!);
  living.furniture.push(createFurniture('table-coffee', { x: 2600, y: 2400 })!);
  bed1.furniture.push({ ...createFurniture('bed-queen-au', { x: 1900, y: 4100 + t + 1200 })!, rotation: 180 });
  kitchen.furniture.push({ ...createFurniture('island', { x: 5200 + t + 1500, y: 2200 })!, w: 2000 });
  p.rooms = [living, kitchen, bed1, bath, bed2, hall, balcony];
  p.connections = [
    { id: uid('cn_'), a: living.id, b: kitchen.id, kind: 'opening' },
    { id: uid('cn_'), a: living.id, b: balcony.id, kind: 'door' },
    { id: uid('cn_'), a: hall.id, b: bed1.id, kind: 'door' },
    { id: uid('cn_'), a: hall.id, b: bath.id, kind: 'door' },
    { id: uid('cn_'), a: hall.id, b: bed2.id, kind: 'door' },
  ];
  p.inspection = [
    {
      id: uid('i_'),
      roomId: kitchen.id,
      category: 'outdated',
      condition: 'fair',
      title: 'Laminate benchtops worn at the sink',
      note: 'Sample observation.',
      photoIds: [],
      source: 'observation',
      createdAt: Date.now(),
    },
    {
      id: uid('i_'),
      roomId: bath.id,
      category: 'opportunity',
      condition: 'fair',
      title: 'Bath could become a walk-in shower',
      note: 'Sample observation.',
      photoIds: [],
      source: 'observation',
      createdAt: Date.now(),
    },
  ];
  p.highlights = ['North-facing living (sample)', 'Separate laundry (sample)'];
  return p;
}
