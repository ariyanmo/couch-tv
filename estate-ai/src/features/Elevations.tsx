import { useState, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PageProps } from '../App';
import { roomHasShape, wallArea } from '../core/calc';
import { edgeLength } from '../core/geometry';
import type { Property, Provenance, Room } from '../core/types';
import { STATUS_LABEL, fmtArea, fmtLen } from '../core/units';
import { StatusChip } from '../ui/components';
import { Icon } from '../ui/icons';
import { downloadBlob, safeFileName, svgToPngBlob } from '../ui/image';
import { go, queryParam } from '../ui/router';
import { RoomPreview } from './RoomEditor';

const COL: Record<Provenance, string> = { measured: '#2f6f3e', drawn: '#355f8f', estimated: '#a36a12', unknown: '#b23b2e' };
const COL_DARK: Record<Provenance, string> = { measured: '#7fb58a', drawn: '#8aa7c8', estimated: '#d7a95b', unknown: '#d9776b' };

/** Elevation drawing of one wall, seen from inside the room. */
export function ElevationSVG({ property, room, wall, print = false, width }: { property: Property; room: Room; wall: number; print?: boolean; width?: number }) {
  const u = property.units;
  const L = edgeLength(room.polygon, wall);
  const knownH = room.ceilingHeight.status !== 'unknown' && room.ceilingHeight.value > 0;
  const floor = property.floors.find((f) => f.id === room.floorId);
  const H = knownH ? room.ceilingHeight.value : floor?.defaultCeiling ?? 2400;
  const hStatus: Provenance = knownH ? room.ceilingHeight.status : 'unknown';
  const lStatus: Provenance = room.edges[wall]?.status ?? 'drawn';
  const fs = Math.max(L, H) / 34;
  const pad = fs * 7;
  const vbW = L + pad * 2;
  const vbH = H + pad * 2.6;
  const ink = print ? '#1d1d1f' : '#d8d4cb';
  const dim = print ? '#6b6b6b' : '#8d8b85';
  const C = print ? COL : COL_DARK;
  const bg = print ? '#ffffff' : '#0d0d0e';
  const ops = room.openings.filter((o) => o.edge === wall).sort((a, b) => a.offset - b.offset);
  const y = (h: number) => pad + H - h; // elevation height -> svg y
  const out: ReactNode[] = [];

  const hDim = (x1: number, x2: number, yy: number, label: string, st: Provenance, key: string) => (
    <g key={key}>
      <line x1={x1} y1={yy} x2={x2} y2={yy} stroke={C[st]} strokeWidth={fs * 0.06} strokeDasharray={st === 'measured' ? undefined : `${fs * 0.3} ${fs * 0.2}`} />
      <line x1={x1} y1={yy - fs * 0.35} x2={x1} y2={yy + fs * 0.35} stroke={C[st]} strokeWidth={fs * 0.06} />
      <line x1={x2} y1={yy - fs * 0.35} x2={x2} y2={yy + fs * 0.35} stroke={C[st]} strokeWidth={fs * 0.06} />
      <text x={(x1 + x2) / 2} y={yy - fs * 0.35} fontSize={fs * 0.75} textAnchor="middle" fill={C[st]}>{label}</text>
    </g>
  );
  const vDim = (y1: number, y2: number, xx: number, label: string, st: Provenance, key: string) => (
    <g key={key}>
      <line x1={xx} y1={y1} x2={xx} y2={y2} stroke={C[st]} strokeWidth={fs * 0.06} strokeDasharray={st === 'measured' ? undefined : `${fs * 0.3} ${fs * 0.2}`} />
      <line x1={xx - fs * 0.35} y1={y1} x2={xx + fs * 0.35} y2={y1} stroke={C[st]} strokeWidth={fs * 0.06} />
      <line x1={xx - fs * 0.35} y1={y2} x2={xx + fs * 0.35} y2={y2} stroke={C[st]} strokeWidth={fs * 0.06} />
      <text x={xx - fs * 0.4} y={(y1 + y2) / 2} fontSize={fs * 0.75} textAnchor="middle" fill={C[st]} transform={`rotate(-90 ${xx - fs * 0.4} ${(y1 + y2) / 2})`}>{label}</text>
    </g>
  );
  const sfx = (s: Provenance) => (s === 'estimated' ? ' ~' : s === 'drawn' ? ' ?' : s === 'unknown' ? ' (missing)' : '');

  // wall
  out.push(<rect key="wall" x={pad} y={y(H)} width={L} height={H} fill={print ? '#f7f5f0' : 'rgba(200,169,106,0.05)'} stroke={ink} strokeWidth={fs * 0.12} />);
  out.push(<line key="floorline" x1={pad - fs} y1={y(0)} x2={pad + L + fs} y2={y(0)} stroke={ink} strokeWidth={fs * 0.2} />);
  // openings (seen from inside: x measured from the wall's start vertex, left to right)
  let cursor = 0;
  const chain: ReactNode[] = [];
  ops.forEach((o, k) => {
    const sill = o.type === 'window' ? o.sill.value : 0;
    const x0 = pad + o.offset;
    const w = o.width.value;
    const h = o.height.value;
    const st: Provenance = o.width.status === 'measured' && o.height.status === 'measured' ? 'measured' : o.width.status === 'unknown' || o.height.status === 'unknown' ? 'unknown' : 'estimated';
    out.push(<rect key={'o' + k} x={x0} y={y(sill + h)} width={w} height={h} fill={bg} stroke={ink} strokeWidth={fs * 0.1} />);
    if (o.type === 'window') {
      out.push(<line key={'om' + k} x1={x0 + w / 2} y1={y(sill + h)} x2={x0 + w / 2} y2={y(sill)} stroke={dim} strokeWidth={fs * 0.05} />);
      out.push(vDim(y(sill), y(0), x0 + w + fs * 0.9, `${fmtLen(sill, u)}${sfx(o.sill.status)}`, o.sill.status, 'sill' + k));
    } else if (o.type === 'door' || o.type === 'double-door') {
      out.push(<circle key={'kn' + k} cx={o.swing === 'right' ? x0 + w * 0.12 : x0 + w * 0.88} cy={y(1000)} r={fs * 0.2} fill={dim} />);
    }
    out.push(vDim(y(sill + h), y(sill), x0 + fs * 0.9, `${fmtLen(h, u)}${sfx(o.height.status)}`, o.height.status, 'oh' + k));
    if (o.offset - cursor > fs) chain.push(hDim(pad + cursor, x0, y(0) + fs * 2, fmtLen(o.offset - cursor, u), lStatus, 'gap' + k));
    chain.push(hDim(x0, x0 + w, y(0) + fs * 2, `${fmtLen(w, u)}${sfx(o.width.status)}`, o.width.status, 'ow' + k));
    out.push(<text key={'ol' + k} x={x0 + w / 2} y={y(sill + h) - fs * 0.3} fontSize={fs * 0.7} textAnchor="middle" fill={dim}>{o.type.replace('-', ' ')}</text>);
    cursor = o.offset + w;
    void st;
  });
  if (ops.length && L - cursor > fs) chain.push(hDim(pad + cursor, pad + L, y(0) + fs * 2, fmtLen(L - cursor, u), lStatus, 'gapend'));
  out.push(...chain);
  out.push(hDim(pad, pad + L, y(0) + fs * (ops.length ? 4 : 2), `${fmtLen(L, u)}${sfx(lStatus)}`, lStatus, 'overall'));
  out.push(vDim(y(H), y(0), pad - fs * 1.2, `${fmtLen(H, u)}${sfx(hStatus)}`, hStatus, 'height'));
  const wa = wallArea(room, wall);
  out.push(
    <text key="title" x={pad} y={pad * 0.45} fontSize={fs * 1.1} fill={ink} fontWeight={600}>
      {room.name} · wall {wall + 1}
    </text>,
    <text key="sub" x={pad} y={pad * 0.45 + fs * 1.3} fontSize={fs * 0.75} fill={dim}>
      Net paintable area {fmtArea(wa.net.value, u, 2)} ({STATUS_LABEL[wa.net.status].toLowerCase()}){!knownH ? ' · ceiling height not recorded, drawn at the floor default' : ''}
    </text>,
  );
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${vbW} ${vbH}`} width={width} style={print ? undefined : { width: '100%', background: bg, borderRadius: 12 }} fontFamily="Inter, -apple-system, Segoe UI, sans-serif">
      {print && <rect width={vbW} height={vbH} fill="#fff" />}
      {out}
    </svg>
  );
}

export function elevationMarkup(property: Property, room: Room, wall: number, pxWidth = 1800) {
  const svg = renderToStaticMarkup(<ElevationSVG property={property} room={room} wall={wall} print width={pxWidth} />);
  const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const ratio = m ? +m[2] / +m[1] : 0.6;
  return { svg, width: pxWidth, height: Math.round(pxWidth * ratio) };
}

export default function Elevations({ property: p }: PageProps) {
  const rooms = p.rooms.filter(roomHasShape);
  const [roomId, setRoomId] = useState(queryParam('room') ?? rooms[0]?.id ?? '');
  const [wall, setWall] = useState(+(queryParam('wall') ?? 0));
  const room = rooms.find((r) => r.id === roomId);
  if (!room)
    return (
      <div className="empty">
        <h2>No walls to draw yet</h2>
        <button className="btn primary" onClick={() => go(`p/${p.id}/scan`)}>Open scanner</button>
      </div>
    );
  const w = Math.min(wall, room.polygon.length - 1);
  const exportOne = async (kind: 'svg' | 'png') => {
    const { svg, width, height } = elevationMarkup(p, room, w);
    const name = `${safeFileName(p.name)}-${safeFileName(room.name)}-wall-${w + 1}`;
    if (kind === 'svg') downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), name + '.svg');
    else downloadBlob(await svgToPngBlob(svg, width, height), name + '.png');
  };
  return (
    <div className="grid side">
      <div className="stack">
        <div className="row">
          <select value={room.id} onChange={(e) => { setRoomId(e.target.value); setWall(0); }} aria-label="Room">
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <div className="seg">
            {room.polygon.map((_, i) => <button key={i} className={i === w ? 'on' : ''} onClick={() => setWall(i)}>Wall {i + 1}</button>)}
          </div>
          <span className="spacer" />
          <button className="btn sm" onClick={() => exportOne('svg')}><Icon name="download" /> SVG</button>
          <button className="btn sm" onClick={() => exportOne('png')} data-testid="export-elevation"><Icon name="download" /> PNG</button>
        </div>
        <ElevationSVG property={p} room={room} wall={w} />
        <div className="row" style={{ fontSize: 13 }}>
          <StatusChip status="measured" /> <StatusChip status="drawn" /> <StatusChip status="estimated" /> <StatusChip status="unknown" />
          <span className="faint">Viewed from inside the room; left is the wall's start corner.</span>
        </div>
      </div>
      <div className="stack">
        <RoomPreview room={room} units={p.units} height={240} highlight={w} />
        <div className="card stack" style={{ fontSize: 14 }}>
          <div className="row between"><span className="muted">Width</span><span>{fmtLen(edgeLength(room.polygon, w), p.units)} <StatusChip status={room.edges[w]?.status ?? 'drawn'} short /></span></div>
          <div className="row between"><span className="muted">Height</span><span>{room.ceilingHeight.status === 'unknown' ? '—' : fmtLen(room.ceilingHeight.value, p.units)} <StatusChip status={room.ceilingHeight.status} short /></span></div>
          <div className="row between"><span className="muted">Openings</span><span>{room.openings.filter((o) => o.edge === w).length}</span></div>
          <button className="btn sm" onClick={() => go(`p/${p.id}/scan/${room.id}`)}>Edit measurements</button>
        </div>
      </div>
    </div>
  );
}
