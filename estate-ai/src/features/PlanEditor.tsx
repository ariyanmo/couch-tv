import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { PageProps } from '../App';
import { roomFloorArea } from '../core/calc';
import { ROOM_TYPES, FURNITURE } from '../core/catalog';
import { add, bounds, dist, edgeLength, edgeOutwardNormal, insertVertex, isSimplePolygon, moveEdge, nearestEdge, offsetPolygon, pointOnEdge, projectOnSegment, removeVertex, snapValue, sub, translate, dot, rectPolygon, findFit, orientedRect, polygonInside, convexOverlap } from '../core/geometry';
import { clampOpening, createFurniture, createOpening, createRoom, setPolygonDrawn, setWallLength, uid } from '../core/model';
import type { Measure, FurnitureItem, Opening, OpeningType, MeasureMethod, Point, Property, Room, RoomType } from '../core/types';
import { STATUS_LABEL, fmtLen } from '../core/units';
import { canRedo, canUndo, redo, undo, updateProperty, updateRoom, useStore, toast } from '../store/store';
import { Confirm, MeasureEditor, Modal, Seg, StatusChip, LengthInput } from '../ui/components';
import { Icon } from '../ui/icons';
import { go } from '../ui/router';
import { PlanCanvas, type PlanCanvasHandle } from './plan/PlanCanvas';
import { DARK_THEME, PlanContent, floorBounds } from './plan/PlanSVG';
import { doorSwings } from '../core/copilot';

type Tool = 'select' | 'vertex' | 'room' | 'door' | 'window' | 'opening' | 'sliding-door' | 'double-door' | 'furniture';

type Sel =
  | { kind: 'room'; roomId: string }
  | { kind: 'edge'; roomId: string; edge: number }
  | { kind: 'opening'; roomId: string; openingId: string }
  | { kind: 'furniture'; roomId: string; furnitureId: string }
  | null;

interface Drag {
  kind: 'room' | 'vertex' | 'edge' | 'opening' | 'furniture' | 'newroom';
  roomId?: string;
  index?: number;
  id?: string;
  start: Point;
  orig?: Room;
  moved: boolean;
  rect?: { a: Point; b: Point };
}

export default function PlanEditor({ property }: PageProps) {
  const settings = useStore((s) => s.settings);
  const [floorId, setFloorId] = useState(property.floors[0].id);
  const [tool, setTool] = useState<Tool>('select');
  const [sel, setSel] = useState<Sel>(null);
  const [showDims, setShowDims] = useState(true);
  const [showFurniture, setShowFurniture] = useState(true);
  const [snap, setSnap] = useState(settings.snap);
  const [dimEdit, setDimEdit] = useState<{ roomId: string; edge: number } | null>(null);
  const [newRect, setNewRect] = useState<{ a: Point; b: Point } | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const canvas = useRef<PlanCanvasHandle>(null);
  const drag = useRef<Drag | null>(null);
  const propRef = useRef(property);
  propRef.current = property;

  const floor = property.floors.find((f) => f.id === floorId) ?? property.floors[0];
  const rooms = property.rooms.filter((r) => r.floorId === floor.id);
  const selRoom = sel ? property.rooms.find((r) => r.id === sel.roomId) : undefined;
  const initial = useMemo(() => floorBounds(property, floor.id), [floor.id]); // eslint-disable-line
  const grid = settings.gridMm || 50;
  const unshaped = rooms.filter((r) => r.polygon.length < 3);

  const snapPt = (p: Point): Point => (snap ? { x: snapValue(p.x, grid), y: snapValue(p.y, grid) } : p);
  const tol = () => (canvas.current?.mmPerPx() ?? 10) * 12;

  // --------- drag handling (window listeners so fast moves are not lost) ---------
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || !canvas.current) return;
      const p = canvas.current.toPlan(e.clientX, e.clientY);
      const delta = sub(p, d.start);
      if (!d.moved && Math.hypot(delta.x, delta.y) < tol() * 0.25) return;
      if (!d.moved) {
        d.moved = true;
        updateProperty(propRef.current.id, (x) => x); // one undo step for the whole drag
      }
      const pid = propRef.current.id;
      if (d.kind === 'newroom') {
        const a = snapPt(d.start);
        const b = snapPt(p);
        d.rect = { a, b };
        setNewRect({ a, b });
        return;
      }
      const orig = d.orig!;
      if (d.kind === 'room') {
        let dd = snap ? { x: snapValue(delta.x, grid), y: snapValue(delta.y, grid) } : delta;
        dd = snapRoomToNeighbours(propRef.current, orig, dd, tol());
        updateRoom(pid, orig.id, (r) => ({ ...r, polygon: translate(orig.polygon, dd), furniture: orig.furniture.map((f) => ({ ...f, x: f.x + dd.x, y: f.y + dd.y })) }), { history: false });
      } else if (d.kind === 'vertex') {
        const i = d.index!;
        let np = snapPt(add(orig.polygon[i], delta));
        // align with neighbours (keeps walls square)
        const n = orig.polygon.length;
        for (const j of [(i - 1 + n) % n, (i + 1) % n]) {
          const q = orig.polygon[j];
          if (Math.abs(np.x - q.x) < tol()) np = { ...np, x: q.x };
          if (Math.abs(np.y - q.y) < tol()) np = { ...np, y: q.y };
        }
        const poly = orig.polygon.map((v, k) => (k === i ? np : v));
        if (isSimplePolygon(poly)) updateRoom(pid, orig.id, () => setPolygonDrawn(orig, poly), { history: false });
      } else if (d.kind === 'edge') {
        const i = d.index!;
        const off = dot(delta, edgeOutwardNormal(orig.polygon, i));
        const o = snap ? snapValue(off, grid) : off;
        const poly = moveEdge(orig.polygon, i, o);
        if (isSimplePolygon(poly)) updateRoom(pid, orig.id, () => setPolygonDrawn(orig, poly), { history: false });
      } else if (d.kind === 'opening') {
        const o0 = orig.openings.find((o) => o.id === d.id)!;
        const ne = nearestEdge(orig.polygon, p);
        const edge = ne.distance < tol() * 4 ? ne.edge : o0.edge;
        const a = orig.polygon[edge];
        const b = orig.polygon[(edge + 1) % orig.polygon.length];
        const t = projectOnSegment(p, a, b).t * dist(a, b);
        let offset = t - o0.width.value / 2;
        if (snap) offset = snapValue(offset, grid / 2);
        updateRoom(pid, orig.id, (r) => ({ ...r, openings: r.openings.map((o) => (o.id === d.id ? clampOpening(r, { ...o, edge, offset }) : o)) }), { history: false });
      } else if (d.kind === 'furniture') {
        const f0 = orig.furniture.find((f) => f.id === d.id)!;
        const np = snapPt({ x: f0.x + delta.x, y: f0.y + delta.y });
        updateRoom(pid, orig.id, (r) => ({ ...r, furniture: r.furniture.map((f) => (f.id === d.id ? { ...f, x: np.x, y: np.y } : f)) }), { history: false });
      }
    };
    const up = () => {
      const d = drag.current;
      drag.current = null;
      if (d?.kind === 'newroom') {
        const r = d.rect;
        setNewRect(null);
        if (r && Math.abs(r.b.x - r.a.x) > 300 && Math.abs(r.b.y - r.a.y) > 300) {
          const n = rooms.length + 1;
          let room = createRoom(floor.id, `Room ${n}`, 'other');
          const poly = rectPolygon(Math.abs(r.b.x - r.a.x), Math.abs(r.b.y - r.a.y), { x: Math.min(r.a.x, r.b.x), y: Math.min(r.a.y, r.b.y) });
          room = setPolygonDrawn(room, poly);
          updateProperty(propRef.current.id, (p) => ({ ...p, rooms: [...p.rooms, room] }));
          setSel({ kind: 'room', roomId: room.id });
          setTool('select');
          toast('Room drawn. Its walls are marked "drawn" until you enter measurements.', 'warn');
        }
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }); // re-bind each render so closures see current settings

  // keyboard shortcuts
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(property.id);
        else undo(property.id);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelection();
      } else if (e.key.toLowerCase() === 'r' && sel?.kind === 'furniture') {
        rotateFurniture(90);
      } else if (e.key === 'Escape') {
        setSel(null);
        setTool('select');
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const startDrag = (e: RPointerEvent, d: Omit<Drag, 'start' | 'moved'>) => {
    e.stopPropagation();
    e.preventDefault();
    drag.current = { ...d, start: canvas.current!.toPlan(e.clientX, e.clientY), moved: false };
  };

  const placeOpening = (room: Room, edge: number, p: Point, type: OpeningType) => {
    const a = room.polygon[edge];
    const b = room.polygon[(edge + 1) % room.polygon.length];
    const t = projectOnSegment(p, a, b).t * dist(a, b);
    const o = createOpening(type, edge, 0);
    const placed = clampOpening(room, { ...o, offset: t - o.width.value / 2 });
    updateRoom(property.id, room.id, (r) => ({ ...r, openings: [...r.openings, placed] }));
    setSel({ kind: 'opening', roomId: room.id, openingId: placed.id });
    toast(`${labelOf(type)} added at a typical size (estimate). Enter its measured size in the panel.`, 'warn');
  };

  const handlers = {
    onRoomDown: (e: RPointerEvent, r: Room) => {
      if (tool === 'room') {
        // draw a new room even when starting over an existing one
        e.stopPropagation();
        e.preventDefault();
        drag.current = { kind: 'newroom', start: canvas.current!.toPlan(e.clientX, e.clientY), moved: false };
        return;
      }
      setSel({ kind: 'room', roomId: r.id });
      if (tool === 'select') startDrag(e, { kind: 'room', roomId: r.id, orig: r });
    },
    onEdgeDown: (e: RPointerEvent, r: Room, i: number) => {
      const p = canvas.current!.toPlan(e.clientX, e.clientY);
      if (tool === 'room') {
        e.stopPropagation();
        drag.current = { kind: 'newroom', start: p, moved: false };
        return;
      }
      if (['door', 'window', 'opening', 'sliding-door', 'double-door'].includes(tool)) {
        e.stopPropagation();
        placeOpening(r, i, p, tool as OpeningType);
        return;
      }
      if (tool === 'vertex') {
        e.stopPropagation();
        const proj = projectOnSegment(p, r.polygon[i], r.polygon[(i + 1) % r.polygon.length]).point;
        updateRoom(property.id, r.id, (rr) => setPolygonDrawn(rr, insertVertex(rr.polygon, i, snapPt(proj))));
        return;
      }
      setSel({ kind: 'edge', roomId: r.id, edge: i });
      startDrag(e, { kind: 'edge', roomId: r.id, index: i, orig: r });
    },
    onVertexDown: (e: RPointerEvent, r: Room, i: number) => {
      startDrag(e, { kind: 'vertex', roomId: r.id, index: i, orig: r });
    },
    onOpeningDown: (e: RPointerEvent, r: Room, o: { id: string }) => {
      setSel({ kind: 'opening', roomId: r.id, openingId: o.id });
      startDrag(e, { kind: 'opening', roomId: r.id, id: o.id, orig: r });
    },
    onFurnitureDown: (e: RPointerEvent, r: Room, f: FurnitureItem) => {
      setSel({ kind: 'furniture', roomId: r.id, furnitureId: f.id });
      startDrag(e, { kind: 'furniture', roomId: r.id, id: f.id, orig: r });
    },
    onDimClick: (r: Room, i: number) => setDimEdit({ roomId: r.id, edge: i }),
  };

  const onBackgroundDown = (e: RPointerEvent, p: Point) => {
    if (tool === 'room') {
      e.preventDefault();
      drag.current = { kind: 'newroom', start: p, moved: false };
      return;
    }
    setSel(null);
  };

  function deleteSelection() {
    if (!sel) return;
    if (sel.kind === 'opening') updateRoom(property.id, sel.roomId, (r) => ({ ...r, openings: r.openings.filter((o) => o.id !== sel.openingId) }));
    else if (sel.kind === 'furniture') updateRoom(property.id, sel.roomId, (r) => ({ ...r, furniture: r.furniture.filter((f) => f.id !== sel.furnitureId) }));
    else if (sel.kind === 'room') {
      setConfirmDel(true);
      return;
    }
    setSel(null);
  }

  function rotateFurniture(deg: number) {
    if (sel?.kind !== 'furniture') return;
    updateRoom(property.id, sel.roomId, (r) => ({ ...r, furniture: r.furniture.map((f) => (f.id === sel.furnitureId ? { ...f, rotation: (f.rotation + deg + 360) % 360 } : f)) }));
  }

  const tools: { id: Tool; icon: string; label: string }[] = [
    { id: 'select', icon: 'cursor', label: 'Select & move' },
    { id: 'vertex', icon: 'vertex', label: 'Edit corners (click a wall to add a corner)' },
    { id: 'room', icon: 'plus', label: 'Draw a room (drag)' },
    { id: 'door', icon: 'door', label: 'Add door (click a wall)' },
    { id: 'window', icon: 'window', label: 'Add window (click a wall)' },
  ];

  return (
    <div className="editor" data-testid="plan-editor">
      <div className="editor-canvas">
        <PlanCanvas ref={canvas} initial={initial} grid={grid} onBackgroundDown={onBackgroundDown} testId="plan-svg" key={floor.id}>
          <PlanContent
            property={property}
            handlers={handlers}
            opts={{
              floorId: floor.id,
              showDims,
              showFurniture,
              selectedRoomId: sel?.roomId,
              selectedEdge: sel?.kind === 'edge' ? sel.edge : undefined,
              selectedOpeningId: sel?.kind === 'opening' ? sel.openingId : undefined,
              selectedFurnitureId: sel?.kind === 'furniture' ? sel.furnitureId : undefined,
              editVertices: tool === 'vertex' || sel?.kind === 'room',
              theme: DARK_THEME,
            }}
          />
          {newRect && (
            <rect
              x={Math.min(newRect.a.x, newRect.b.x)}
              y={Math.min(newRect.a.y, newRect.b.y)}
              width={Math.abs(newRect.b.x - newRect.a.x)}
              height={Math.abs(newRect.b.y - newRect.a.y)}
              fill="rgba(200,169,106,0.12)"
              stroke="#c8a96a"
              strokeWidth={20}
              strokeDasharray="80 50"
              pointerEvents="none"
            />
          )}
        </PlanCanvas>

        <div className="toolbar">
          <div className="group">
            {tools.map((t) => (
              <button key={t.id} className={`btn sm icon ${tool === t.id ? 'active' : ''}`} title={t.label} aria-label={t.label} onClick={() => setTool(t.id)} data-tool={t.id}>
                <Icon name={t.icon} />
              </button>
            ))}
            <select
              aria-label="More openings"
              value={['opening', 'sliding-door', 'double-door'].includes(tool) ? tool : ''}
              onChange={(e) => e.target.value && setTool(e.target.value as Tool)}
              style={{ padding: '4px 6px', fontSize: 12.5, background: 'transparent', border: 0, width: 92 }}
            >
              <option value="">More…</option>
              <option value="opening">Opening</option>
              <option value="sliding-door">Sliding door</option>
              <option value="double-door">Double door</option>
            </select>
          </div>
          <div className="group">
            <button className="btn sm icon" title="Undo" aria-label="Undo" disabled={!canUndo(property.id)} onClick={() => undo(property.id)}>
              <Icon name="undo" />
            </button>
            <button className="btn sm icon" title="Redo" aria-label="Redo" disabled={!canRedo(property.id)} onClick={() => redo(property.id)}>
              <Icon name="redo" />
            </button>
          </div>
          <div className="group zoom">
            <button className="btn sm icon" title="Zoom in" aria-label="Zoom in" onClick={() => canvas.current?.zoom(0.8)}>
              <Icon name="zoomin" />
            </button>
            <button className="btn sm icon" title="Zoom out" aria-label="Zoom out" onClick={() => canvas.current?.zoom(1.25)}>
              <Icon name="zoomout" />
            </button>
            <button className="btn sm icon" title="Fit" aria-label="Fit to screen" onClick={() => canvas.current?.fit(floorBounds(property, floor.id))}>
              <Icon name="fit" />
            </button>
          </div>
          <div className="spacer" />
          {property.floors.length > 1 && (
            <div className="group">
              <select value={floor.id} onChange={(e) => { setFloorId(e.target.value); setSel(null); }} style={{ background: 'transparent', border: 0, fontSize: 13 }} aria-label="Floor">
                {property.floors.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="legend">
          <span><i style={{ background: 'var(--measured)' }} /> Measured</span>
          <span><i style={{ background: 'var(--drawn)' }} /> Drawn ?</span>
          <span><i style={{ background: 'var(--estimated)' }} /> Estimate ~</span>
          <span className="faint hint">Tap a dimension to enter a measurement</span>
        </div>
        {rooms.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
            <div className="card" style={{ pointerEvents: 'auto', maxWidth: 380, textAlign: 'center' }}>
              <h3>No rooms on this floor</h3>
              <p className="muted">Add rooms with measurements in the scanner, or pick the draw tool and drag a rectangle.</p>
              <div className="row" style={{ justifyContent: 'center' }}>
                <button className="btn primary sm" onClick={() => go(`p/${property.id}/scan`)}>Open scanner</button>
                <button className="btn sm" onClick={() => setTool('room')}>Draw a room</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <aside className="editor-side">
        <div className="row between">
          <label className="check"><input type="checkbox" checked={showDims} onChange={(e) => setShowDims(e.target.checked)} /> Dimensions</label>
          <label className="check"><input type="checkbox" checked={showFurniture} onChange={(e) => setShowFurniture(e.target.checked)} /> Furniture</label>
          <label className="check"><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Snap</label>
        </div>
        {sel ? (
          <SelectionPanel property={property} sel={sel} setSel={setSel} onDeleteRoom={() => setConfirmDel(true)} rotate={rotateFurniture} />
        ) : (
          <div className="stack">
            <h3>Rooms on {floor.name}</h3>
            {rooms.map((r) => {
              const a = roomFloorArea(r);
              return (
                <div key={r.id} className="list-item" onClick={() => setSel({ kind: 'room', roomId: r.id })}>
                  <div className="grow">
                    <b>{r.name}</b>
                    <span className="faint" style={{ fontSize: 12 }}>{r.polygon.length ? `${r.polygon.length} walls` : 'No shape yet'}</span>
                  </div>
                  <StatusChip status={a.status} short />
                </div>
              );
            })}
            {unshaped.length > 0 && <div className="note warn">{unshaped.length} room(s) have no shape yet and are not drawn. Enter their walls in the scanner.</div>}
            <AddFurnitureHint />
            <div className="note">
              Drag a room to move it (it snaps against neighbouring walls). Drag a wall to resize. Tap a dimension to type the measured length: the plan
              reshapes to match and the wall turns green.
            </div>
          </div>
        )}
      </aside>

      {dimEdit && <DimDialog property={property} roomId={dimEdit.roomId} edge={dimEdit.edge} onClose={() => setDimEdit(null)} />}
      {confirmDel && selRoom && (
        <Confirm
          title={`Delete ${selRoom.name}?`}
          text="The room, its measurements, openings and furniture are removed. Photos stay in the library, unassigned. You can undo this."
          onYes={() => {
            updateProperty(property.id, (p) => ({ ...p, rooms: p.rooms.filter((r) => r.id !== selRoom.id), connections: p.connections.filter((c) => c.a !== selRoom.id && c.b !== selRoom.id) }));
            setSel(null);
          }}
          onClose={() => setConfirmDel(false)}
        />
      )}
    </div>
  );
}

function AddFurnitureHint() {
  return <p className="faint" style={{ fontSize: 13 }}>Furniture is added and fit-tested in the Renovation studio; here you can move and rotate it.</p>;
}

const labelOf = (t: OpeningType) => ({ door: 'Door', window: 'Window', opening: 'Opening', 'sliding-door': 'Sliding door', 'double-door': 'Double door' })[t];

/** Snap a room translation so its corners sit against neighbouring rooms' outer wall faces. */
function snapRoomToNeighbours(p: Property, room: Room, d: Point, tol: number): Point {
  const others = p.rooms.filter((r) => r.floorId === room.floorId && r.id !== room.id && r.polygon.length >= 3);
  if (!others.length) return d;
  const moving = translate(room.polygon, d);
  const movingOuter = offsetPolygon(moving, room.wallThickness);
  let best: { dx: number; dy: number } = { dx: Infinity, dy: Infinity };
  for (const o of others) {
    const targets = offsetPolygon(o.polygon, o.wallThickness);
    // our interior corners against their outer corners (shared wall of their thickness)
    for (const t of targets)
      for (const m of moving) {
        if (Math.abs(t.x - m.x) < tol && Math.abs(t.x - m.x) < Math.abs(best.dx)) best = { ...best, dx: t.x - m.x };
        if (Math.abs(t.y - m.y) < tol && Math.abs(t.y - m.y) < Math.abs(best.dy)) best = { ...best, dy: t.y - m.y };
      }
    // also align interior faces with interior faces (rooms in a row)
    for (const t of o.polygon)
      for (const m of moving) {
        if (Math.abs(t.y - m.y) < tol && Math.abs(t.y - m.y) < Math.abs(best.dy)) best = { ...best, dy: t.y - m.y };
        if (Math.abs(t.x - m.x) < tol && Math.abs(t.x - m.x) < Math.abs(best.dx)) best = { ...best, dx: t.x - m.x };
      }
    void movingOuter;
  }
  return { x: d.x + (Number.isFinite(best.dx) ? best.dx : 0), y: d.y + (Number.isFinite(best.dy) ? best.dy : 0) };
}

function DimDialog({ property, roomId, edge, onClose }: { property: Property; roomId: string; edge: number; onClose: () => void }) {
  const room = property.rooms.find((r) => r.id === roomId)!;
  const cur = room.edges[edge] ?? { value: edgeLength(room.polygon, edge), status: 'drawn' as const };
  const [m, setM] = useState<Measure>({ ...cur, method: cur.method && cur.method !== 'drawn' ? cur.method : ('tape' as MeasureMethod) });
  const apply = () => {
    if (m.status === 'unknown' || !m.value) return onClose();
    updateRoom(property.id, roomId, (r) => setWallLength(r, edge, m.value, m.status === 'drawn' ? 'measured' : m.status, m.method ?? 'tape'));
    onClose();
  };
  return (
    <Modal
      title={`${room.name}: wall ${edge + 1}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={apply} data-testid="apply-dim">Apply</button>
        </>
      }
    >
      <p className="muted">
        On screen now: {fmtLen(edgeLength(room.polygon, edge), property.units)} ({STATUS_LABEL[cur.status].toLowerCase()}). Enter what you measured; the opposite wall moves so the
        room keeps its shape.
      </p>
      <MeasureEditor m={{ ...m, status: m.status === 'drawn' ? 'unknown' : m.status }} units={property.units} onChange={(x) => setM({ ...x, method: x.method ?? 'tape' })} label="Measured length" />
    </Modal>
  );
}

function SelectionPanel({ property, sel, setSel, onDeleteRoom, rotate }: { property: Property; sel: NonNullable<Sel>; setSel: (s: Sel) => void; onDeleteRoom: () => void; rotate: (d: number) => void }) {
  const room = property.rooms.find((r) => r.id === sel.roomId);
  if (!room) return null;
  const u = property.units;
  const pid = property.id;
  const upd = (fn: (r: Room) => Room) => updateRoom(pid, room.id, fn);

  if (sel.kind === 'edge') {
    const i = sel.edge;
    const e = room.edges[i] ?? { value: edgeLength(room.polygon, i), status: 'drawn' as const };
    return (
      <div className="stack">
        <div className="row between">
          <h3>{room.name} · wall {i + 1}</h3>
          <button className="btn sm ghost" onClick={() => setSel({ kind: 'room', roomId: room.id })}>Room</button>
        </div>
        <div className="row between"><span className="muted">On screen</span><span>{fmtLen(edgeLength(room.polygon, i), u)} <StatusChip status={e.status} short /></span></div>
        <MeasureEditor
          m={e.status === 'drawn' ? { value: 0, status: 'unknown', method: 'tape' } : e}
          units={u}
          label="Measured length"
          onChange={(m) => m.status !== 'unknown' && upd((r) => setWallLength(r, i, m.value, m.status, m.method ?? 'tape'))}
        />
        <div className="row">
          <button className="btn sm" onClick={() => upd((r) => setPolygonDrawn(r, insertVertex(r.polygon, i, pointOnEdge(r.polygon, i, edgeLength(r.polygon, i) / 2))))}>Split wall</button>
          <button className="btn sm" onClick={() => go(`p/${pid}/elevations?room=${room.id}&wall=${i}`)}>Elevation</button>
        </div>
        <p className="faint" style={{ fontSize: 12.5 }}>Drag the wall on the plan to move it; moved walls become “drawn” until re-measured.</p>
      </div>
    );
  }

  if (sel.kind === 'opening') {
    const found = room.openings.find((x) => x.id === sel.openingId);
    if (!found) return null;
    const o: Opening = found;
    const updO = (fn: (x: Opening) => Opening) => upd((r) => ({ ...r, openings: r.openings.map((x) => (x.id === o.id ? clampOpening(r, fn(x)) : x)) }));
    const others = property.rooms.filter((r) => r.id !== room.id && r.floorId === room.floorId);
    return (
      <div className="stack">
        <div className="row between">
          <h3>{labelOf(o.type)} on wall {o.edge + 1}</h3>
          <button className="btn sm danger" onClick={() => { upd((r) => ({ ...r, openings: r.openings.filter((x) => x.id !== o.id) })); setSel(null); }}><Icon name="trash" /></button>
        </div>
        <label className="field">Type
          <select value={o.type} onChange={(e) => updO((x) => ({ ...x, type: e.target.value as OpeningType }))}>
            {(['door', 'double-door', 'sliding-door', 'opening', 'window'] as OpeningType[]).map((t) => <option key={t} value={t}>{labelOf(t)}</option>)}
          </select>
        </label>
        <MeasureEditor m={o.width} units={u} label="Width" onChange={(m) => updO((x) => ({ ...x, width: m.status === 'unknown' ? x.width : m }))} />
        <MeasureEditor m={o.height} units={u} label="Height" onChange={(m) => updO((x) => ({ ...x, height: m.status === 'unknown' ? x.height : m }))} />
        {o.type === 'window' && <MeasureEditor m={o.sill} units={u} label="Sill height" onChange={(m) => updO((x) => ({ ...x, sill: m.status === 'unknown' ? x.sill : m }))} />}
        <label className="field">Distance from wall start
          <LengthInput value={o.offset} units={u} onCommit={(v) => v != null && updO((x) => ({ ...x, offset: v }))} />
        </label>
        {(o.type === 'door' || o.type === 'double-door') && (
          <div className="row">
            <Seg value={o.swing ?? 'left'} options={[{ id: 'left', label: 'Hinge left' }, { id: 'right', label: 'Hinge right' }]} onChange={(v) => updO((x) => ({ ...x, swing: v }))} />
            <Seg value={o.swingIn === false ? 'out' : 'in'} options={[{ id: 'in', label: 'Opens in' }, { id: 'out', label: 'Opens out' }]} onChange={(v) => updO((x) => ({ ...x, swingIn: v === 'in' }))} />
          </div>
        )}
        {o.type !== 'window' && (
          <label className="field">Leads to
            <select
              value={o.connectsTo ?? ''}
              onChange={(e) => {
                const to = e.target.value || undefined;
                updateProperty(pid, (p) => ({
                  ...p,
                  rooms: p.rooms.map((r) => (r.id === room.id ? { ...r, openings: r.openings.map((x) => (x.id === o.id ? { ...x, connectsTo: to } : x)) } : r)),
                  connections: [
                    ...p.connections.filter((c) => c.openingId !== o.id),
                    ...(to ? [{ id: uid('cn_'), a: room.id, b: to, openingId: o.id, kind: o.type === 'opening' ? ('opening' as const) : ('door' as const) }] : []),
                  ],
                }));
              }}
            >
              <option value="">Not set</option>
              {others.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
        )}
      </div>
    );
  }

  if (sel.kind === 'furniture') {
    const f = room.furniture.find((x) => x.id === sel.furnitureId);
    if (!f) return null;
    const body = orientedRect(f.x, f.y, f.w, f.d, f.rotation);
    const inside = polygonInside(body, room.polygon);
    const hits = room.furniture.filter((x) => x.id !== f.id && x.kind !== 'rug' && f.kind !== 'rug' && convexOverlap(body, orientedRect(x.x, x.y, x.w, x.d, x.rotation)));
    const blocksDoor = doorSwings(room).some((s) => convexOverlap(body, s));
    const updF = (fn: (x: FurnitureItem) => FurnitureItem) => upd((r) => ({ ...r, furniture: r.furniture.map((x) => (x.id === f.id ? fn(x) : x)) }));
    return (
      <div className="stack">
        <div className="row between">
          <h3>{f.name}</h3>
          <button className="btn sm danger" onClick={() => { upd((r) => ({ ...r, furniture: r.furniture.filter((x) => x.id !== f.id) })); setSel(null); }}><Icon name="trash" /></button>
        </div>
        <div className={`note ${inside && !hits.length && !blocksDoor ? '' : 'warn'}`}>
          {!inside ? 'Outside the room walls.' : hits.length ? `Overlaps ${hits.map((h) => h.name).join(', ')}.` : blocksDoor ? 'Inside the room but in a door swing.' : 'Fits: inside the walls, clear of other pieces and door swings.'}
        </div>
        <div className="grid cols-3" style={{ gap: 8 }}>
          <label className="field">Width<LengthInput value={f.w} units={u} onCommit={(v) => v && updF((x) => ({ ...x, w: v }))} /></label>
          <label className="field">Depth<LengthInput value={f.d} units={u} onCommit={(v) => v && updF((x) => ({ ...x, d: v }))} /></label>
          <label className="field">Height<LengthInput value={f.h} units={u} onCommit={(v) => v && updF((x) => ({ ...x, h: v }))} /></label>
        </div>
        <div className="row">
          <button className="btn sm" onClick={() => rotate(-90)}><Icon name="rotate" /> -90°</button>
          <button className="btn sm" onClick={() => rotate(90)}><Icon name="rotate" /> +90°</button>
          <input type="number" value={Math.round(f.rotation)} onChange={(e) => updF((x) => ({ ...x, rotation: +e.target.value || 0 }))} style={{ width: 80 }} aria-label="Rotation degrees" />
        </div>
      </div>
    );
  }

  // room
  const a = roomFloorArea(room);
  return (
    <div className="stack">
      <div className="row between">
        <h3>{room.name}</h3>
        <div className="row nowrap">
          <button className="btn sm" onClick={() => go(`p/${pid}/scan/${room.id}`)}>Measurements</button>
          <button className="btn sm danger icon" onClick={onDeleteRoom} aria-label="Delete room"><Icon name="trash" /></button>
        </div>
      </div>
      <div className="row between"><span className="muted">Area</span><span>{a.status === 'unknown' ? '—' : `${(a.value / 1e6).toFixed(2)} m²`} <StatusChip status={a.status} short /></span></div>
      {a.reasons.map((r) => <span key={r} className="faint" style={{ fontSize: 12.5 }}>{r}</span>)}
      <label className="field">Name<input value={room.name} onChange={(e) => upd((r) => ({ ...r, name: e.target.value }))} /></label>
      <label className="field">Type
        <select value={room.type} onChange={(e) => upd((r) => ({ ...r, type: e.target.value as RoomType }))}>
          {ROOM_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </label>
      <label className="check"><input type="checkbox" checked={room.countsTowardArea} onChange={(e) => upd((r) => ({ ...r, countsTowardArea: e.target.checked }))} /> Counts toward interior area</label>
      <label className="field">Wall thickness (drawn outside the room)
        <LengthInput value={room.wallThickness} units={u} onCommit={(v) => v && upd((r) => ({ ...r, wallThickness: Math.min(600, v) }))} />
      </label>
      <MeasureEditor m={room.ceilingHeight} units={u} label="Ceiling height" onChange={(m) => upd((r) => ({ ...r, ceilingHeight: m }))} />
      <div className="row">
        <button className="btn sm" onClick={() => {
          const b = bounds(room.polygon);
          updateProperty(pid, (p) => ({ ...p, rooms: [...p.rooms, { ...room, id: uid('r_'), name: room.name + ' copy', polygon: translate(room.polygon, { x: b.w + 600, y: 0 }), furniture: [], openings: room.openings.map((o) => ({ ...o, id: uid('o_'), connectsTo: undefined })), concepts: [], createdAt: Date.now() }] }));
        }}><Icon name="copy" /> Duplicate</button>
      </div>
      {room.polygon.length > 3 && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
          <span className="faint" style={{ fontSize: 12 }}>Remove corner:</span>
          {room.polygon.map((_, i) => (
            <button key={i} className="btn sm ghost" onClick={() => upd((r) => setPolygonDrawn(r, removeVertex(r.polygon, i)))} title={`Remove corner ${i + 1}`}>{i + 1}</button>
          ))}
        </div>
      )}
      <FurnitureQuickAdd property={property} room={room} />
    </div>
  );
}

function FurnitureQuickAdd({ property, room }: { property: Property; room: Room }) {
  const [id, setId] = useState('');
  if (room.polygon.length < 3) return null;
  return (
    <div className="row nowrap">
      <select value={id} onChange={(e) => setId(e.target.value)} aria-label="Furniture">
        <option value="">Add furniture…</option>
        {FURNITURE.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
      <button
        className="btn sm"
        disabled={!id}
        onClick={() => {
          const c = FURNITURE.find((f) => f.id === id)!;
          const fit = findFit(room.polygon, c.w, c.d, { obstacles: [...doorSwings(room), ...room.furniture.filter((f) => f.kind !== 'rug').map((f) => orientedRect(f.x, f.y, f.w, f.d, f.rotation))] });
          const b = bounds(room.polygon);
          const item = createFurniture(id, fit.position ?? { x: b.minX + b.w / 2, y: b.minY + b.h / 2 })!;
          item.rotation = fit.rotation ?? 0;
          updateRoom(property.id, room.id, (r) => ({ ...r, furniture: [...r.furniture, item] }));
          toast(fit.fits ? `${c.name} placed where it fits.` : `${c.name} does not fit anywhere clear; placed in the middle.`, fit.fits ? 'ok' : 'warn');
          setId('');
        }}
      >Add</button>
    </div>
  );
}
