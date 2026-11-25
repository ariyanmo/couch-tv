import { useState } from 'react';
import type { PageProps } from '../App';
import { CLOSURE_TOLERANCE_MM, roomFloorArea, roomWallArea } from '../core/calc';
import { ROOM_TYPES } from '../core/catalog';
import { centroid, edgeLength, edgeOutwardNormal, bounds, wallWalk, type WallWalkStep } from '../core/geometry';
import { applyRectangle, applyScan, applyWallWalk, clampOpening, createOpening, setWallLength } from '../core/model';
import type { MeasureMethod, OpeningType, Property, Room, RoomType } from '../core/types';
import { fmtLen, STATUS_LABEL } from '../core/units';
import { addPhoto, toast, updateProperty, updateRoom, useStore } from '../store/store';
import { Confirm, FigureValue, LengthInput, METHODS, MeasureEditor, PhotoThumb, Seg, StatusChip, methodStatus } from '../ui/components';
import { Icon } from '../ui/icons';
import { go, queryParam } from '../ui/router';
import { Camera, roomSlots } from './capture/Camera';
import { PhotoMeasure } from './capture/PhotoMeasure';
import { CameraScan } from './capture/CameraScan';

type Tab = 'shape' | 'openings' | 'photos' | 'notes';

export default function RoomEditor({ property: p, params }: PageProps) {
  const room = p.rooms.find((r) => r.id === params[0]);
  const [tab, setTab] = useState<Tab>('shape');
  if (!room) return <div className="empty">Room not found.</div>;
  const a = roomFloorArea(room);
  const w = roomWallArea(room);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="grid cols-4">
        <div className="card stat"><span className="label">Floor area</span><span className="value" style={{ fontSize: 22 }}><FigureValue f={a} units={p.units} digits={2} /></span></div>
        <div className="card stat"><span className="label">Net wall area</span><span className="value" style={{ fontSize: 22 }}><FigureValue f={w.net} units={p.units} /></span></div>
        <div className="card stat"><span className="label">Ceiling</span><span className="value" style={{ fontSize: 22 }}>{room.ceilingHeight.status === 'unknown' ? '—' : fmtLen(room.ceilingHeight.value, p.units)} <StatusChip status={room.ceilingHeight.status} short /></span></div>
        <div className="card stat"><span className="label">Walls measured</span><span className="value" style={{ fontSize: 22 }}>{room.edges.filter((e) => e.status === 'measured').length}/{room.polygon.length || '—'}</span></div>
      </div>
      {a.reasons.length > 0 && <div className="note">{a.reasons.join(' · ')}</div>}

      <div className="tabs">
        {(['shape', 'openings', 'photos', 'notes'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {{ shape: 'Shape & walls', openings: `Doors & windows (${room.openings.length})`, photos: 'Photos & capture', notes: 'Room details' }[t]}
          </button>
        ))}
      </div>
      {tab === 'shape' && <ShapeTab p={p} room={room} />}
      {tab === 'openings' && <OpeningsTab p={p} room={room} />}
      {tab === 'photos' && <PhotosTab p={p} room={room} />}
      {tab === 'notes' && <DetailsTab p={p} room={room} />}
    </div>
  );
}

export function RoomPreview({ room, units, height = 260, highlight }: { room: Room; units: Property['units']; height?: number; highlight?: number }) {
  if (room.polygon.length < 3) return null;
  const b = bounds(room.polygon);
  const pad = Math.max(b.w, b.h) * 0.22;
  const fs = Math.max(b.w, b.h) / 22;
  return (
    <svg viewBox={`${b.minX - pad} ${b.minY - pad} ${b.w + 2 * pad} ${b.h + 2 * pad}`} style={{ width: '100%', height, background: '#0d0d0e', borderRadius: 12 }}>
      <polygon points={room.polygon.map((q) => `${q.x},${q.y}`).join(' ')} fill="rgba(200,169,106,0.08)" stroke="#d8d4cb" strokeWidth={fs * 0.25} />
      {room.polygon.map((q, i) => {
        const r = room.polygon[(i + 1) % room.polygon.length];
        const n = edgeOutwardNormal(room.polygon, i);
        const mx = (q.x + r.x) / 2 + n.x * fs * 1.4;
        const my = (q.y + r.y) / 2 + n.y * fs * 1.4;
        const st = room.edges[i]?.status ?? 'drawn';
        const col = { measured: '#7fb58a', drawn: '#8aa7c8', estimated: '#d7a95b', unknown: '#d9776b' }[st];
        return (
          <g key={i}>
            {highlight === i && <line x1={q.x} y1={q.y} x2={r.x} y2={r.y} stroke="#c8a96a" strokeWidth={fs * 0.6} />}
            <circle cx={mx} cy={my} r={fs * 0.8} fill={col} />
            <text x={mx} y={my + fs * 0.35} fontSize={fs} textAnchor="middle" fill="#111" fontWeight={700}>{i + 1}</text>
          </g>
        );
      })}
      {room.closureError != null && room.closureError > 1 && (
        <circle cx={room.polygon[0].x} cy={room.polygon[0].y} r={fs * 0.9} fill="none" stroke="#d9776b" strokeWidth={fs * 0.2} strokeDasharray={`${fs * 0.4} ${fs * 0.3}`} />
      )}
      <text x={centroid(room.polygon).x} y={centroid(room.polygon).y} fontSize={fs * 1.1} fill="#a9a7a1" textAnchor="middle">
        {fmtLen(b.w, units)} × {fmtLen(b.h, units)}
      </text>
    </svg>
  );
}

function ShapeTab({ p, room }: { p: Property; room: Room }) {
  const [reset, setReset] = useState(false);
  const has = room.polygon.length >= 3;
  const upd = (fn: (r: Room) => Room) => updateRoom(p.id, room.id, fn);
  return (
    <div className="grid cols-2">
      <div className="stack">
        {!has ? (
          <ShapeEntry p={p} room={room} />
        ) : (
          <div className="card stack">
            <div className="card-title">
              <h3>Walls</h3>
              <button className="btn sm" onClick={() => go(`p/${p.id}/plan`)}><Icon name="plan" /> Edit on plan</button>
              <button className="btn sm ghost" onClick={() => setReset(true)}>Re-enter shape</button>
            </div>
            {room.closureError != null && room.closureError > CLOSURE_TOLERANCE_MM && (
              <div className="note err">
                Your wall walk ends {fmtLen(room.closureError, p.units)} away from where it started. Usually one wall or one corner angle is off. Re-measure,
                then type the corrected lengths below. The last wall is drawn to close the shape and marked “drawn”.
              </div>
            )}
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>#</th><th>On plan</th><th>Measured length</th><th>Status</th></tr></thead>
                <tbody>
                  {room.polygon.map((_, i) => {
                    const e = room.edges[i] ?? { value: edgeLength(room.polygon, i), status: 'drawn' as const };
                    return (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td className="mono">{fmtLen(edgeLength(room.polygon, i), p.units)}</td>
                        <td style={{ minWidth: 150 }}>
                          <LengthInput
                            value={e.status === 'measured' || e.status === 'estimated' ? e.value : null}
                            units={p.units}
                            placeholder="enter"
                            ariaLabel={`Wall ${i + 1} measured length`}
                            onCommit={(v) => v && upd((r) => setWallLength(r, i, v, methodStatus(e.method && e.method !== 'drawn' ? e.method : 'tape'), e.method && e.method !== 'drawn' ? e.method : 'tape'))}
                          />
                        </td>
                        <td><StatusChip status={e.status} short /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="faint" style={{ fontSize: 12.5 }}>
              Typing a length reshapes the plan: the opposite wall moves so corners stay square. Lengths are interior, wall face to wall face.
            </p>
          </div>
        )}
        <div className="card stack">
          <MeasureEditor m={room.ceilingHeight} units={p.units} label="Ceiling height" onChange={(m) => upd((r) => ({ ...r, ceilingHeight: m }))} />
          <label className="field">Wall thickness for drawing (not part of the room area)
            <LengthInput value={room.wallThickness} units={p.units} onCommit={(v) => v && upd((r) => ({ ...r, wallThickness: Math.min(600, v) }))} />
          </label>
        </div>
      </div>
      <div className="stack">
        {has ? <RoomPreview room={room} units={p.units} height={320} /> : <div className="card empty" style={{ padding: 30 }}><p>The room's shape appears here once you enter walls.</p></div>}
        <div className="note">
          <b>Measuring tips.</b> Measure each wall at about waist height, face to face, skirting excluded. Go clockwise from the door. For an L-shaped room,
          use “wall by wall” and enter the turn at each corner. A laser measure is quicker and more accurate than a tape for long walls.
        </div>
      </div>
      {reset && <Confirm title="Re-enter shape?" text="The walls and their measurements are cleared so you can enter the shape again. Openings are kept where possible." yes="Clear walls" onYes={() => upd((r) => ({ ...r, polygon: [], edges: [], closureError: undefined }))} onClose={() => setReset(false)} />}
    </div>
  );
}

interface StepRow {
  length: number | null;
  turn: 'left' | 'right' | 'custom';
  angle: number;
}

function ShapeEntry({ p, room }: { p: Property; room: Room }) {
  const [mode, setMode] = useState<'rect' | 'walk'>('rect');
  const [scan, setScan] = useState(() => queryParam('scan') === '1');
  const [wv, setWv] = useState<number | null>(null);
  const [dv, setDv] = useState<number | null>(null);
  const [method, setMethod] = useState<MeasureMethod>('tape');
  const [rows, setRows] = useState<StepRow[]>(() => Array.from({ length: 4 }, () => ({ length: null, turn: 'right', angle: 90 })));
  const others = p.rooms.filter((r) => r.floorId === room.floorId && r.id !== room.id && r.polygon.length >= 3);
  const origin = () => {
    // place new rooms to the right of what is already drawn, so nothing overlaps
    if (!others.length) return { x: 0, y: 0 };
    const b = bounds(others.flatMap((r) => r.polygon));
    return { x: b.maxX + 1500, y: b.minY };
  };
  const steps: WallWalkStep[] = rows.map((r) => ({ length: r.length ?? 0, turn: r.turn === 'right' ? -90 : r.turn === 'left' ? 90 : r.angle }));
  // In plan (y down) a "right" turn when walking clockwise is +90 in maths terms; keep user wording simple:
  const stepsPlan: WallWalkStep[] = steps.map((s) => ({ ...s, turn: -s.turn }));
  const preview = rows.every((r) => r.length) ? wallWalk(stepsPlan) : null;

  return (
    <div className="card stack">
      <h3>Get the room shape</h3>
      <button className="btn primary" style={{ minHeight: 54, fontSize: 16 }} onClick={() => setScan(true)} data-testid="scan-room">
        <Icon name="camera" /> Scan the room with the camera
      </button>
      <p className="faint" style={{ fontSize: 13 }}>Stand in the middle, aim at each corner, and the app draws the room. Quick, but an estimate: add one tape measurement for accuracy.</p>
      {scan && (
        <CameraScan
          units={p.units}
          onClose={() => setScan(false)}
          onDone={async (r) => {
            setScan(false);
            updateRoom(p.id, room.id, (rr) => applyScan(rr, r.polygon, { measuredEdge: r.measuredEdge, measuredMethod: r.measuredMethod, ceiling: r.ceiling, origin: origin() }));
            for (let i = 0; i < r.photos.length; i++)
              await addPhoto(p.id, r.photos[i], { name: `${room.name} corner ${i + 1}.jpg`, roomId: room.id, shot: `corner-${i + 1}`, assignedBy: 'capture' });
            toast(r.measuredEdge != null ? 'Room created from the scan and your measurement.' : 'Room created from the scan. Walls are estimates until you measure them.', 'ok');
          }}
        />
      )}
      <div className="row"><span className="faint">or enter measurements</span></div>
      <Seg value={mode} options={[{ id: 'rect', label: 'Rectangle' }, { id: 'walk', label: 'Wall by wall (any shape)' }]} onChange={setMode} />
      <label className="field">How did you measure?
        <select value={method} onChange={(e) => setMethod(e.target.value as MeasureMethod)}>
          {METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}{m.status !== 'measured' ? ' (saved as estimate)' : ''}</option>)}
        </select>
      </label>
      {mode === 'rect' ? (
        <>
          <div className="grid cols-2" style={{ gap: 10 }}>
            <label className="field">Length (wall 1)<LengthInput value={wv} units={p.units} onCommit={setWv} ariaLabel="Room length" /></label>
            <label className="field">Width (wall 2)<LengthInput value={dv} units={p.units} onCommit={setDv} ariaLabel="Room width" /></label>
          </div>
          <button className="btn primary" disabled={!wv || !dv} data-testid="apply-rect" onClick={() => {
            updateRoom(p.id, room.id, (r) => applyRectangle(r, wv!, dv!, methodStatus(method), method, origin()));
            toast('Room shape saved.');
          }}>Create rectangle</button>
          <p className="faint" style={{ fontSize: 12.5 }}>Square corners are assumed for a rectangle. If the room is out of square, use wall by wall.</p>
        </>
      ) : (
        <>
          <p className="muted" style={{ fontSize: 13.5 }}>Start at a corner, walk clockwise along the walls, and enter each wall's length and which way you turn at its end.</p>
          {rows.map((r, i) => (
            <div key={i} className="row nowrap" style={{ gap: 6 }}>
              <span className="faint" style={{ width: 22 }}>{i + 1}</span>
              <LengthInput value={r.length} units={p.units} onCommit={(v) => setRows(rows.map((x, k) => (k === i ? { ...x, length: v } : x)))} ariaLabel={`Wall ${i + 1}`} />
              <select value={r.turn} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, turn: e.target.value as StepRow['turn'] } : x)))} style={{ width: 120 }} aria-label="Turn">
                <option value="right">Turn right</option>
                <option value="left">Turn left</option>
                <option value="custom">Angle…</option>
              </select>
              {r.turn === 'custom' && <input type="number" value={r.angle} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, angle: +e.target.value } : x)))} style={{ width: 70 }} title="Turn in degrees, negative = right" />}
              <button className="btn sm ghost icon" aria-label="Remove wall" disabled={rows.length <= 3} onClick={() => setRows(rows.filter((_, k) => k !== i))}><Icon name="close" /></button>
            </div>
          ))}
          <div className="row">
            <button className="btn sm" onClick={() => setRows([...rows, { length: null, turn: 'right', angle: 90 }])}><Icon name="plus" /> Wall</button>
            <button className="btn sm" onClick={() => setRows([...rows, { length: null, turn: 'left', angle: 90 }, { length: null, turn: 'right', angle: 90 }])}>+ L-corner</button>
          </div>
          {preview && (
            <div className={`note ${preview.closureError > CLOSURE_TOLERANCE_MM ? 'err' : ''}`}>
              {preview.closureError <= CLOSURE_TOLERANCE_MM ? `The walk closes (gap ${preview.closureError.toFixed(0)} mm).` : `The walk misses its start by ${fmtLen(preview.closureError, p.units)}. You can still save it; the gap is recorded and the area is marked unverified.`}
              {preview.headingError > 1 && ` Turns add up to ${(360 - preview.headingError).toFixed(0)}°, not 360°: check the turn directions.`}
            </div>
          )}
          <button className="btn primary" disabled={!rows.every((r) => r.length)} onClick={() => {
            updateRoom(p.id, room.id, (r) => applyWallWalk(r, stepsPlan, methodStatus(method), method, origin()));
            toast('Room shape saved.');
          }}>Create shape</button>
        </>
      )}
      <div className="row"><span className="faint">or</span><button className="btn sm ghost" onClick={() => go(`p/${p.id}/plan`)}>draw it on the plan (marked as drawn)</button></div>
    </div>
  );
}

const OPENING_LABEL: Record<OpeningType, string> = { door: 'Door', 'double-door': 'Double door', 'sliding-door': 'Sliding door', opening: 'Opening', window: 'Window' };

function OpeningsTab({ p, room }: { p: Property; room: Room }) {
  const [type, setType] = useState<OpeningType>('door');
  const [edge, setEdge] = useState(0);
  if (room.polygon.length < 3) return <div className="card">Enter the room shape first; doors and windows sit on its walls.</div>;
  const upd = (fn: (r: Room) => Room) => updateRoom(p.id, room.id, fn);
  return (
    <div className="grid cols-2">
      <div className="stack">
        <div className="card stack">
          <h3>Add</h3>
          <div className="row nowrap">
            <select value={type} onChange={(e) => setType(e.target.value as OpeningType)} aria-label="Opening type">
              {Object.entries(OPENING_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={edge} onChange={(e) => setEdge(+e.target.value)} aria-label="Wall">
              {room.polygon.map((_, i) => <option key={i} value={i}>Wall {i + 1}</option>)}
            </select>
            <button className="btn primary" data-testid="add-opening" onClick={() => {
              const o = createOpening(type, edge, 0);
              upd((r) => ({ ...r, openings: [...r.openings, clampOpening(r, { ...o, offset: (edgeLength(r.polygon, edge) - o.width.value) / 2 })] }));
            }}><Icon name="plus" /> Add</button>
          </div>
          <p className="faint" style={{ fontSize: 12.5 }}>New openings start at a typical size marked as an estimate. Enter your measurements below.</p>
        </div>
        {room.openings.map((o) => {
          const updO = (fn: (x: typeof o) => typeof o) => upd((r) => ({ ...r, openings: r.openings.map((x) => (x.id === o.id ? clampOpening(r, fn(x)) : x)) }));
          return (
            <div key={o.id} className="card stack">
              <div className="row between">
                <h3>{OPENING_LABEL[o.type]} · wall {o.edge + 1}</h3>
                <button className="btn sm ghost icon" aria-label="Remove" onClick={() => upd((r) => ({ ...r, openings: r.openings.filter((x) => x.id !== o.id) }))}><Icon name="trash" /></button>
              </div>
              <div className="grid cols-2" style={{ gap: 10 }}>
                <MeasureEditor m={o.width} units={p.units} label="Width" onChange={(m) => m.status !== 'unknown' && updO((x) => ({ ...x, width: m }))} />
                <MeasureEditor m={o.height} units={p.units} label="Height" onChange={(m) => m.status !== 'unknown' && updO((x) => ({ ...x, height: m }))} />
                {o.type === 'window' && <MeasureEditor m={o.sill} units={p.units} label="Sill height" onChange={(m) => m.status !== 'unknown' && updO((x) => ({ ...x, sill: m }))} />}
                <label className="field">From wall start<LengthInput value={o.offset} units={p.units} onCommit={(v) => v != null && updO((x) => ({ ...x, offset: v }))} /></label>
                <label className="field">Wall
                  <select value={o.edge} onChange={(e) => updO((x) => ({ ...x, edge: +e.target.value }))}>
                    {room.polygon.map((_, i) => <option key={i} value={i}>Wall {i + 1}</option>)}
                  </select>
                </label>
              </div>
            </div>
          );
        })}
      </div>
      <div><RoomPreview room={room} units={p.units} height={320} highlight={edge} /></div>
    </div>
  );
}

function PhotosTab({ p, room }: { p: Property; room: Room }) {
  const photos = useStore((s) => s.photos.filter((x) => x.propertyId === p.id && x.roomId === room.id));
  const [cam, setCam] = useState(false);
  const [measure, setMeasure] = useState<string | null>(null);
  const slots = roomSlots(room.polygon.length);
  const done = Object.fromEntries(photos.filter((x) => x.shot).map((x) => [x.shot!, true]));
  const targets = [
    ...room.polygon.map((_, i) => ({ id: `wall:${i}`, label: `Wall ${i + 1} length` })),
    { id: 'ceiling', label: 'Ceiling height' },
    ...room.openings.flatMap((o) => [{ id: `ow:${o.id}`, label: `${OPENING_LABEL[o.type]} w${o.edge + 1} width` }, { id: `oh:${o.id}`, label: `${OPENING_LABEL[o.type]} w${o.edge + 1} height` }]),
  ];
  const saveEstimate = (target: string, mm: number) => {
    const est = { value: mm, status: 'estimated' as const, method: 'camera-reference' as const, at: Date.now(), note: 'From photo' };
    updateRoom(p.id, room.id, (r) => {
      if (target.startsWith('wall:')) {
        const i = +target.slice(5);
        if (r.edges[i]?.status === 'measured') {
          toast('That wall already has a real measurement; the estimate was not saved over it.', 'warn');
          return r;
        }
        return setWallLength(r, i, mm, 'estimated', 'camera-reference');
      }
      if (target === 'ceiling') return r.ceilingHeight.status === 'measured' ? r : { ...r, ceilingHeight: est };
      const id = target.slice(3);
      return { ...r, openings: r.openings.map((o) => (o.id === id ? (target.startsWith('ow:') ? { ...o, width: o.width.status === 'measured' ? o.width : est } : { ...o, height: o.height.status === 'measured' ? o.height : est }) : o)) };
    });
    toast('Saved as an estimate.');
  };
  return (
    <div className="stack">
      <div className="card stack">
        <div className="card-title">
          <h3>Guided capture</h3>
          <span className="faint">{Object.keys(done).length}/{slots.length} shots</span>
          <button className="btn primary" onClick={() => setCam(true)} data-testid="open-camera"><Icon name="camera" /> Open camera</button>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {slots.map((s) => <span key={s.id} className={`chip ${done[s.id] ? 'measured' : 'plain'}`}>{s.label}</span>)}
        </div>
        <p className="faint" style={{ fontSize: 13 }}>Photos are saved to this room on this device. They document the room; they do not measure it unless you use “Estimate from photo”.</p>
      </div>
      {photos.length > 0 ? (
        <div className="thumb-grid">
          {photos.map((ph) => (
            <div key={ph.id} className="stack" style={{ gap: 6 }}>
              <PhotoThumb id={ph.id} caption={slots.find((s) => s.id === ph.shot)?.label ?? ph.name} />
              <button className="btn sm" onClick={() => setMeasure(ph.id)}><Icon name="ruler" /> Estimate from photo</button>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">No photos for this room yet.</p>
      )}
      {cam && (
        <Camera
          slots={slots}
          done={done}
          onClose={() => setCam(false)}
          onCapture={async (blob, slot) => {
            await addPhoto(p.id, blob, { name: `${room.name} ${slots.find((s) => s.id === slot)?.label ?? ''}`.trim() + '.jpg', roomId: room.id, shot: slot, assignedBy: 'capture' });
          }}
        />
      )}
      {measure && <PhotoMeasure photoId={measure} units={p.units} targets={targets} onSave={saveEstimate} onClose={() => setMeasure(null)} />}
    </div>
  );
}

function DetailsTab({ p, room }: { p: Property; room: Room }) {
  const upd = (fn: (r: Room) => Room) => updateRoom(p.id, room.id, fn, { history: false });
  return (
    <div className="grid cols-2">
      <div className="card stack">
        <label className="field">Name<input value={room.name} onChange={(e) => upd((r) => ({ ...r, name: e.target.value }))} /></label>
        <label className="field">Type
          <select value={room.type} onChange={(e) => upd((r) => ({ ...r, type: e.target.value as RoomType }))}>
            {ROOM_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <label className="field">Floor
          <select value={room.floorId} onChange={(e) => upd((r) => ({ ...r, floorId: e.target.value }))}>
            {p.floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={room.countsTowardArea} onChange={(e) => upd((r) => ({ ...r, countsTowardArea: e.target.checked }))} /> Counts toward the reported interior area</label>
        <label className="field">Notes<textarea value={room.notes ?? ''} onChange={(e) => upd((r) => ({ ...r, notes: e.target.value }))} placeholder="Anything worth remembering about this room" /></label>
      </div>
      <div className="card stack">
        <h3>Measurement record</h3>
        <table className="data">
          <tbody>
            {room.edges.map((e, i) => (
              <tr key={i}><td>Wall {i + 1}</td><td className="num">{fmtLen(e.value, p.units)}</td><td>{STATUS_LABEL[e.status]}</td><td className="faint">{e.method ?? ''}</td></tr>
            ))}
            <tr><td>Ceiling</td><td className="num">{room.ceilingHeight.status === 'unknown' ? '—' : fmtLen(room.ceilingHeight.value, p.units)}</td><td>{STATUS_LABEL[room.ceilingHeight.status]}</td><td className="faint">{room.ceilingHeight.method ?? ''}</td></tr>
          </tbody>
        </table>
        <button className="btn sm danger" onClick={() => {
          updateProperty(p.id, (x) => ({ ...x, rooms: x.rooms.filter((r) => r.id !== room.id), connections: x.connections.filter((c) => c.a !== room.id && c.b !== room.id) }));
          go(`p/${p.id}/scan`);
        }}><Icon name="trash" /> Delete room</button>
      </div>
    </div>
  );
}
