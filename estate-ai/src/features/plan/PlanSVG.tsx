import type { PointerEvent as RPointerEvent, ReactNode } from 'react';
import { roomFloorArea, roomHasShape } from '../../core/calc';
import { roomTypeLabel } from '../../core/catalog';
import { add, bounds, centroid, pointInPolygon, edgeLength, edgeOutwardNormal, norm, offsetPolygon, orientedRect, perp, pointOnEdge, scale, sub } from '../../core/geometry';
import type { Annotation, FurnitureItem, Opening, Point, Property, Provenance, Room } from '../../core/types';
import { fmtArea, fmtLen } from '../../core/units';

export interface PlanTheme {
  bg: string;
  wall: string;
  roomFill: string;
  roomFillSel: string;
  text: string;
  textDim: string;
  dim: Record<Provenance, string>;
  furniture: string;
  furnitureStroke: string;
  accent: string;
  grid: string;
}

export const DARK_THEME: PlanTheme = {
  bg: '#0d0d0e',
  wall: '#d8d4cb',
  roomFill: 'rgba(200,169,106,0.05)',
  roomFillSel: 'rgba(200,169,106,0.16)',
  text: '#ecebe8',
  textDim: '#8d8b85',
  dim: { measured: '#7fb58a', drawn: '#8aa7c8', estimated: '#d7a95b', unknown: '#d9776b' },
  furniture: 'rgba(170,165,155,0.18)',
  furnitureStroke: '#a9a59b',
  accent: '#c8a96a',
  grid: '#1a1a1c',
};

export const PRINT_THEME: PlanTheme = {
  bg: '#ffffff',
  wall: '#1d1d1f',
  roomFill: '#ffffff',
  roomFillSel: '#f4efe4',
  text: '#1d1d1f',
  textDim: '#6b6b6b',
  dim: { measured: '#2f6f3e', drawn: '#355f8f', estimated: '#a36a12', unknown: '#b23b2e' },
  furniture: '#f1efea',
  furnitureStroke: '#8d8a83',
  accent: '#9b7b40',
  grid: '#f2f2f2',
};

export interface PlanHandlers {
  onRoomDown?: (e: RPointerEvent, room: Room) => void;
  onEdgeDown?: (e: RPointerEvent, room: Room, edge: number) => void;
  onVertexDown?: (e: RPointerEvent, room: Room, vertex: number) => void;
  onOpeningDown?: (e: RPointerEvent, room: Room, o: Opening) => void;
  onFurnitureDown?: (e: RPointerEvent, room: Room, f: FurnitureItem) => void;
  onDimClick?: (room: Room, edge: number) => void;
  onAnnotationDown?: (e: RPointerEvent, a: Annotation) => void;
}

export interface PlanOptions {
  floorId: string;
  showDims?: boolean;
  showFurniture?: boolean;
  showLabels?: boolean;
  showStatusColors?: boolean;
  selectedRoomId?: string;
  selectedEdge?: number;
  selectedOpeningId?: string;
  selectedFurnitureId?: string;
  selectedAnnotationId?: string;
  showAnnotations?: boolean;
  editVertices?: boolean;
  theme?: PlanTheme;
  furnitureOverride?: Record<string, FurnitureItem[]>; // room id -> furniture (concepts)
  textScale?: number;
  pins?: { x: number; y: number; dir: number; label?: string; id: string }[];
  onPinDown?: (e: RPointerEvent, id: string) => void;
}

export function floorBounds(p: Property, floorId: string, pad = 1200) {
  const pts = p.rooms.filter((r) => r.floorId === floorId && roomHasShape(r)).flatMap((r) => offsetPolygon(r.polygon, r.wallThickness));
  if (!pts.length) return { minX: -pad, minY: -pad, w: 10000 + 2 * pad, h: 8000 + 2 * pad };
  const b = bounds(pts);
  return { minX: b.minX - pad, minY: b.minY - pad, w: b.w + 2 * pad, h: b.h + 2 * pad };
}

const ptsAttr = (pts: Point[]) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
const pathOf = (pts: Point[]) => 'M' + pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('L') + 'Z';

export function PlanContent({ property, opts, handlers = {} }: { property: Property; opts: PlanOptions; handlers?: PlanHandlers }) {
  const t = opts.theme ?? DARK_THEME;
  const rooms = property.rooms.filter((r) => r.floorId === opts.floorId && roomHasShape(r));
  const fb = floorBounds(property, opts.floorId, 0);
  const ext = Math.max(fb.w, fb.h, 4000);
  const fs = Math.max(110, ext / 70) * (opts.textScale ?? 1);
  const u = property.units;

  return (
    <g>
      {/* room fills */}
      {rooms.map((r) => (
        <path
          key={'fill' + r.id}
          d={pathOf(r.polygon)}
          fill={r.id === opts.selectedRoomId ? t.roomFillSel : t.roomFill}
          onPointerDown={handlers.onRoomDown ? (e) => handlers.onRoomDown!(e, r) : undefined}
          style={{ cursor: handlers.onRoomDown ? 'move' : undefined }}
          data-room={r.id}
        />
      ))}
      {/* furniture */}
      {opts.showFurniture !== false &&
        rooms.map((r) => (opts.furnitureOverride?.[r.id] ?? r.furniture).map((f) => <FurnitureShape key={f.id} f={f} t={t} selected={f.id === opts.selectedFurnitureId} onDown={handlers.onFurnitureDown ? (e) => handlers.onFurnitureDown!(e, r, f) : undefined} fs={fs} />))}
      {/* walls: ring between interior polygon and outward offset */}
      {rooms.map((r) => (
        <path key={'wall' + r.id} d={pathOf(offsetPolygon(r.polygon, r.wallThickness)) + pathOf([...r.polygon].reverse())} fill={t.wall} fillRule="evenodd" pointerEvents="none" />
      ))}
      {/* openings */}
      {rooms.map((r) => r.openings.map((o) => <OpeningShape key={o.id} room={r} o={o} t={t} selected={o.id === opts.selectedOpeningId} onDown={handlers.onOpeningDown ? (e) => handlers.onOpeningDown!(e, r, o) : undefined} />))}
      {/* edge hit areas */}
      {handlers.onEdgeDown &&
        rooms.map((r) =>
          r.polygon.map((a, i) => {
            const b = r.polygon[(i + 1) % r.polygon.length];
            const n = scale(edgeOutwardNormal(r.polygon, i), r.wallThickness / 2);
            const sel = r.id === opts.selectedRoomId && i === opts.selectedEdge;
            return (
              <line
                key={`e${r.id}${i}`}
                x1={a.x + n.x}
                y1={a.y + n.y}
                x2={b.x + n.x}
                y2={b.y + n.y}
                stroke={sel ? t.accent : 'transparent'}
                strokeWidth={Math.max(r.wallThickness, fs * 1.4)}
                strokeOpacity={sel ? 0.55 : 1}
                style={{ cursor: 'pointer' }}
                onPointerDown={(e) => handlers.onEdgeDown!(e, r, i)}
                data-edge={`${r.id}:${i}`}
              />
            );
          }),
        )}
      {/* dimensions */}
      {opts.showDims !== false && rooms.map((r) => <RoomDims key={'d' + r.id} room={r} others={rooms.filter((o) => o.id !== r.id).map((o) => offsetPolygon(o.polygon, o.wallThickness))} t={t} fs={fs} units={u} statusColors={opts.showStatusColors !== false} onDimClick={handlers.onDimClick} />)}
      {/* tape-measure lines */}
      {opts.showAnnotations !== false &&
        (property.annotations ?? []).filter((a) => a.floorId === opts.floorId).map((a) => (
          <AnnotationShape key={a.id} a={a} t={t} fs={fs} units={u} selected={a.id === opts.selectedAnnotationId} onDown={handlers.onAnnotationDown ? (e) => handlers.onAnnotationDown!(e, a) : undefined} />
        ))}
      {/* labels */}
      {opts.showLabels !== false &&
        rooms.map((r) => {
          const c = centroid(r.polygon);
          const a = roomFloorArea(r);
          return (
            <g key={'l' + r.id} pointerEvents="none" textAnchor="middle" fontFamily="Inter, -apple-system, Segoe UI, sans-serif">
              <text x={c.x} y={c.y - fs * 0.2} fontSize={fs * 1.15} fill={t.text} fontWeight={600}>
                {r.name}
              </text>
              <text x={c.x} y={c.y + fs * 1.05} fontSize={fs * 0.9} fill={t.textDim}>
                {fmtArea(a.value, u, 1)}
                {a.status !== 'measured' ? ' *' : ''}
              </text>
              {!r.countsTowardArea && (
                <text x={c.x} y={c.y + fs * 2.1} fontSize={fs * 0.72} fill={t.textDim}>
                  not counted · {roomTypeLabel(r.type)}
                </text>
              )}
            </g>
          );
        })}
      {/* vertex handles */}
      {opts.editVertices &&
        handlers.onVertexDown &&
        rooms
          .filter((r) => r.id === opts.selectedRoomId)
          .map((r) =>
            r.polygon.map((p, i) => (
              <circle key={`v${r.id}${i}`} cx={p.x} cy={p.y} r={fs * 0.55} fill={t.bg} stroke={t.accent} strokeWidth={fs * 0.18} style={{ cursor: 'grab' }} onPointerDown={(e) => handlers.onVertexDown!(e, r, i)} data-vertex={i} />
            )),
          )}
      {opts.pins?.map((p) => (
        <g key={p.id} transform={`translate(${p.x} ${p.y}) rotate(${p.dir})`} onPointerDown={opts.onPinDown ? (e) => opts.onPinDown!(e, p.id) : undefined} style={{ cursor: 'grab' }}>
          <path d={`M0 0 L${fs * 2.2} ${-fs * 1.2} A ${fs * 2.5} ${fs * 2.5} 0 0 1 ${fs * 2.2} ${fs * 1.2} Z`} fill={t.accent} fillOpacity={0.35} />
          <circle r={fs * 0.6} fill={t.accent} />
          {p.label && (
            <text y={-fs} fontSize={fs * 0.8} fill={t.text} textAnchor="middle" transform={`rotate(${-p.dir})`}>
              {p.label}
            </text>
          )}
        </g>
      ))}
    </g>
  );
}

function AnnotationShape({ a, t, fs, units, selected, onDown }: { a: Annotation; t: PlanTheme; fs: number; units: Property['units']; selected: boolean; onDown?: (e: RPointerEvent) => void }) {
  const L = Math.hypot(a.b.x - a.a.x, a.b.y - a.a.y);
  if (L < 1) return null;
  const st: Provenance = a.measured && a.measured.status !== 'unknown' ? a.measured.status : 'drawn';
  const col = selected ? t.accent : t.dim[st];
  const dir = { x: (a.b.x - a.a.x) / L, y: (a.b.y - a.a.y) / L };
  const n = { x: -dir.y * fs * 0.45, y: dir.x * fs * 0.45 };
  const mid = { x: (a.a.x + a.b.x) / 2, y: (a.a.y + a.b.y) / 2 };
  let ang = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
  if (ang > 90) ang -= 180;
  if (ang < -90) ang += 180;
  const value = st === 'drawn' ? `${fmtLen(L, units)} ?` : `${fmtLen(a.measured!.value, units)}${st === 'estimated' ? ' ~' : ''}`;
  const text = a.label ? `${a.label}: ${value}` : value;
  const w = fs * 0.62 * text.length;
  return (
    <g onPointerDown={onDown} style={{ cursor: onDown ? 'pointer' : undefined }} data-annotation={a.id}>
      <line x1={a.a.x} y1={a.a.y} x2={a.b.x} y2={a.b.y} stroke="transparent" strokeWidth={fs * 1.6} />
      <line x1={a.a.x} y1={a.a.y} x2={a.b.x} y2={a.b.y} stroke={col} strokeWidth={fs * (selected ? 0.16 : 0.1)} strokeDasharray={st === 'measured' ? undefined : `${fs * 0.4} ${fs * 0.25}`} />
      <line x1={a.a.x - n.x} y1={a.a.y - n.y} x2={a.a.x + n.x} y2={a.a.y + n.y} stroke={col} strokeWidth={fs * 0.1} />
      <line x1={a.b.x - n.x} y1={a.b.y - n.y} x2={a.b.x + n.x} y2={a.b.y + n.y} stroke={col} strokeWidth={fs * 0.1} />
      <rect x={mid.x - w / 2} y={mid.y - fs * 0.65} width={w} height={fs * 1.3} rx={fs * 0.3} fill={t.bg} stroke={col} strokeWidth={fs * 0.05} transform={`rotate(${ang} ${mid.x} ${mid.y})`} />
      <text x={mid.x} y={mid.y + fs * 0.3} fontSize={fs * 0.85} fill={col} textAnchor="middle" transform={`rotate(${ang} ${mid.x} ${mid.y})`} fontFamily="Inter, -apple-system, Segoe UI, sans-serif">{text}</text>
    </g>
  );
}

function RoomDims({ room, others, t, fs, units, statusColors, onDimClick }: { room: Room; others: Point[][]; t: PlanTheme; fs: number; units: Property['units']; statusColors: boolean; onDimClick?: (r: Room, i: number) => void }) {
  const out: ReactNode[] = [];
  const poly = room.polygon;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const L = edgeLength(poly, i);
    if (L < fs * 2) continue;
    let n = edgeOutwardNormal(poly, i);
    let off = room.wallThickness + fs * 1.6;
    // Shared wall: the outside belongs to a neighbouring room, so dimension this wall inside its own room.
    const probe = add(scale(add(a, b), 0.5), scale(n, off));
    if (others.some((o) => pointInPolygon(probe, o))) {
      n = scale(n, -1);
      off = fs * 1.4;
    }
    const a2 = add(a, scale(n, off));
    const b2 = add(b, scale(n, off));
    const st = room.edges[i]?.status ?? 'drawn';
    const col = statusColors ? t.dim[st] : t.textDim;
    const mid = scale(add(a2, b2), 0.5);
    let ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    if (ang > 90) ang -= 180;
    if (ang < -90) ang += 180;
    const tick = scale(perp(norm(sub(b, a))), fs * 0.4);
    const textPos = add(mid, scale(n, fs * 0.15));
    out.push(
      <g key={i} onClick={onDimClick ? () => onDimClick(room, i) : undefined} style={{ cursor: onDimClick ? 'pointer' : undefined }} data-dim={`${room.id}:${i}`}>
        <line x1={a2.x} y1={a2.y} x2={b2.x} y2={b2.y} stroke={col} strokeWidth={fs * 0.07} strokeDasharray={st === 'measured' ? undefined : `${fs * 0.4} ${fs * 0.25}`} />
        <line x1={a2.x - tick.x} y1={a2.y - tick.y} x2={a2.x + tick.x} y2={a2.y + tick.y} stroke={col} strokeWidth={fs * 0.07} />
        <line x1={b2.x - tick.x} y1={b2.y - tick.y} x2={b2.x + tick.x} y2={b2.y + tick.y} stroke={col} strokeWidth={fs * 0.07} />
        <rect x={textPos.x - fs * 2.6} y={textPos.y - fs * 0.6} width={fs * 5.2} height={fs * 1.2} fill={t.bg} transform={`rotate(${ang} ${textPos.x} ${textPos.y})`} rx={fs * 0.2} />
        <text x={textPos.x} y={textPos.y + fs * 0.32} fontSize={fs * 0.82} fill={col} textAnchor="middle" transform={`rotate(${ang} ${textPos.x} ${textPos.y})`} fontFamily="Inter, -apple-system, Segoe UI, sans-serif">
          {fmtLen(L, units)}
          {st === 'estimated' ? ' ~' : st === 'drawn' ? ' ?' : ''}
        </text>
      </g>,
    );
  }
  return <g>{out}</g>;
}

function OpeningShape({ room, o, t, selected, onDown }: { room: Room; o: Opening; t: PlanTheme; selected: boolean; onDown?: (e: RPointerEvent) => void }) {
  const poly = room.polygon;
  if (o.edge >= poly.length) return null;
  const a = poly[o.edge];
  const b = poly[(o.edge + 1) % poly.length];
  const dir = norm(sub(b, a));
  const n = edgeOutwardNormal(poly, o.edge);
  const th = room.wallThickness;
  const p0 = pointOnEdge(poly, o.edge, o.offset);
  const p1 = pointOnEdge(poly, o.edge, o.offset + o.width.value);
  const out0 = add(p0, scale(n, th));
  const out1 = add(p1, scale(n, th));
  const sw = Math.max(18, th * 0.18);
  const col = selected ? t.accent : t.wall;
  const gap = <polygon points={ptsAttr([add(p0, scale(n, -2)), add(p1, scale(n, -2)), add(out1, scale(n, 2)), add(out0, scale(n, 2))])} fill={t.bg} />;
  let body: ReactNode = null;
  const w = o.width.value;
  if (o.type === 'window') {
    const mid0 = add(p0, scale(n, th / 2));
    const mid1 = add(p1, scale(n, th / 2));
    body = (
      <g stroke={col} strokeWidth={sw} fill="none">
        <polygon points={ptsAttr([p0, p1, out1, out0])} />
        <line x1={mid0.x} y1={mid0.y} x2={mid1.x} y2={mid1.y} />
      </g>
    );
  } else if (o.type === 'door' || o.type === 'double-door') {
    const inward = scale(n, o.swingIn === false ? 1 : -1);
    const base = o.swingIn === false ? th : 0;
    const leaves = o.type === 'double-door' ? [{ hinge: p0, len: w / 2, toward: dir }, { hinge: p1, len: w / 2, toward: scale(dir, -1) }] : [{ hinge: o.swing === 'right' ? p1 : p0, len: w, toward: o.swing === 'right' ? scale(dir, -1) : dir }];
    body = (
      <g stroke={col} fill="none" strokeWidth={sw}>
        {leaves.map((l, k) => {
          const h = add(l.hinge, scale(n, base));
          const tip = add(h, scale(inward, l.len));
          const end = add(h, scale(l.toward, l.len));
          const sweep = cross2(l.toward, inward) > 0 ? 1 : 0;
          return (
            <g key={k}>
              <line x1={h.x} y1={h.y} x2={tip.x} y2={tip.y} />
              <path d={`M${tip.x} ${tip.y} A ${l.len} ${l.len} 0 0 ${sweep ? 0 : 1} ${end.x} ${end.y}`} strokeDasharray={`${sw * 3} ${sw * 2}`} strokeWidth={sw * 0.6} />
            </g>
          );
        })}
      </g>
    );
  } else if (o.type === 'sliding-door') {
    const q0 = add(p0, scale(n, th * 0.35));
    const q1 = add(p0, scale(dir, w * 0.55));
    const r0 = add(p1, scale(n, th * 0.65));
    const r1 = add(p1, scale(dir, -w * 0.55));
    body = (
      <g stroke={col} strokeWidth={sw * 1.4}>
        <line x1={q0.x} y1={q0.y} x2={q1.x + n.x * th * 0.35} y2={q1.y + n.y * th * 0.35} />
        <line x1={r0.x} y1={r0.y} x2={r1.x + n.x * th * 0.65} y2={r1.y + n.y * th * 0.65} />
      </g>
    );
  } else {
    body = (
      <g stroke={col} strokeWidth={sw * 0.7} strokeDasharray={`${sw * 2} ${sw * 2}`}>
        <line x1={p0.x} y1={p0.y} x2={out0.x} y2={out0.y} />
        <line x1={p1.x} y1={p1.y} x2={out1.x} y2={out1.y} />
      </g>
    );
  }
  return (
    <g onPointerDown={onDown} style={{ cursor: onDown ? 'grab' : undefined }} data-opening={o.id}>
      {gap}
      {body}
      {onDown && <polygon points={ptsAttr([add(p0, scale(n, -th)), add(p1, scale(n, -th)), add(out1, scale(n, th)), add(out0, scale(n, th))])} fill="transparent" />}
    </g>
  );
}

const cross2 = (a: Point, b: Point) => a.x * b.y - a.y * b.x;

function FurnitureShape({ f, t, selected, onDown, fs }: { f: FurnitureItem; t: PlanTheme; selected: boolean; onDown?: (e: RPointerEvent) => void; fs: number }) {
  const pts = orientedRect(f.x, f.y, f.w, f.d, f.rotation);
  const inner: ReactNode[] = [];
  // a few plan symbols so pieces read at a glance
  const local = (x: number, y: number) => {
    const r = (f.rotation * Math.PI) / 180;
    return { x: f.x + x * Math.cos(r) - y * Math.sin(r), y: f.y + x * Math.sin(r) + y * Math.cos(r) };
  };
  if (f.kind === 'bed') {
    const pl = [local(-f.w / 2 + 80, -f.d / 2 + 80), local(-80, -f.d / 2 + 80), local(-80, -f.d / 2 + 450), local(-f.w / 2 + 80, -f.d / 2 + 450)];
    const pr = [local(80, -f.d / 2 + 80), local(f.w / 2 - 80, -f.d / 2 + 80), local(f.w / 2 - 80, -f.d / 2 + 450), local(80, -f.d / 2 + 450)];
    inner.push(<polygon key="p1" points={ptsAttr(pl)} fill="none" stroke={t.furnitureStroke} strokeWidth={14} />);
    inner.push(<polygon key="p2" points={ptsAttr(pr)} fill="none" stroke={t.furnitureStroke} strokeWidth={14} />);
  } else if (f.kind === 'sofa') {
    const back = [local(-f.w / 2, f.d / 2 - 200), local(f.w / 2, f.d / 2 - 200)];
    inner.push(<line key="b" x1={back[0].x} y1={back[0].y} x2={back[1].x} y2={back[1].y} stroke={t.furnitureStroke} strokeWidth={14} />);
  } else if (f.kind === 'table' || f.kind === 'desk') {
    const pts2 = orientedRect(f.x, f.y, f.w - 120, f.d - 120, f.rotation);
    inner.push(<polygon key="t" points={ptsAttr(pts2)} fill="none" stroke={t.furnitureStroke} strokeWidth={10} />);
  }
  const c = { x: f.x, y: f.y };
  return (
    <g onPointerDown={onDown} style={{ cursor: onDown ? 'grab' : undefined }} data-furniture={f.id}>
      <polygon points={ptsAttr(pts)} fill={f.kind === 'rug' ? 'rgba(160,150,130,0.12)' : t.furniture} stroke={selected ? t.accent : t.furnitureStroke} strokeWidth={selected ? 30 : 14} />
      {inner}
      {f.w > fs * 4 && f.d > fs * 1.5 && (
        <text x={c.x} y={c.y + fs * 0.25} fontSize={fs * 0.65} fill={t.textDim} textAnchor="middle" pointerEvents="none" fontFamily="Inter, sans-serif">
          {f.name}
        </text>
      )}
    </g>
  );
}
