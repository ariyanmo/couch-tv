import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { PageProps } from '../App';
import { roomHasShape } from '../core/calc';
import { BATHROOM_TILES, BENCHTOPS, CABINET_COLORS, CABINET_STYLES, FLOOR_MATERIALS, FURNITURE, WALL_COLORS } from '../core/catalog';
import { doorSwings } from '../core/copilot';
import { bounds, convexOverlap, findFit, offsetPolygon, orientedRect, polygonInside, snapValue } from '../core/geometry';
import { createConcept, createFurniture, uid } from '../core/model';
import type { FurnitureItem, Point, Property, Room, RoomFinishes } from '../core/types';
import { fmtLen } from '../core/units';
import { toast, updateRoom } from '../store/store';
import { LengthInput, Modal } from '../ui/components';
import { Icon } from '../ui/icons';
import { go } from '../ui/router';
import { PlanCanvas, type PlanCanvasHandle } from './plan/PlanCanvas';
import { PlanContent } from './plan/PlanSVG';
import type { SceneOptions } from './three/build3d';
import { ThreeView, type ThreeViewHandle } from './three/ThreeView';

export default function Studio({ property: p }: PageProps) {
  const shaped = p.rooms.filter(roomHasShape);
  const [roomId, setRoomId] = useState(shaped[0]?.id ?? '');
  const room = p.rooms.find((r) => r.id === roomId);
  const [compare, setCompare] = useState<{ before: string; after: string } | null>(null);
  const view = useRef<ThreeViewHandle>(null);
  const activeConcept = room?.concepts.find((c) => c.id === room.activeConceptId);
  const activeFinishes = activeConcept?.finishes ?? room?.finishes;
  const activeFurniture = activeConcept?.furniture ?? room?.furniture;
  const sceneOptions = useMemo<SceneOptions>(
    () => ({ floorId: room?.floorId ?? 'all', walls: 'cutaway', ceilings: false, furniture: true, explode: false, focusRoomId: room?.id, overrides: room ? { [room.id]: { finishes: activeFinishes, furniture: activeFurniture } } : undefined }),
    [room?.floorId, room?.id, activeFinishes, activeFurniture], // eslint-disable-line
  );

  if (!room || !roomHasShape(room))
    return (
      <div className="empty">
        <h2>No rooms to design yet</h2>
        <p>The studio works on rooms with a recorded shape.</p>
        <button className="btn primary" onClick={() => go(`p/${p.id}/scan`)}>Open scanner</button>
      </div>
    );

  const concept = room.concepts.find((c) => c.id === room.activeConceptId);
  const finishes = concept?.finishes ?? room.finishes;
  const furniture = concept?.furniture ?? room.furniture;

  const setFinishes = (fn: (f: RoomFinishes) => RoomFinishes) =>
    updateRoom(p.id, room.id, (r) => (concept ? { ...r, concepts: r.concepts.map((c) => (c.id === concept.id ? { ...c, finishes: fn(c.finishes) } : c)) } : { ...r, finishes: fn(r.finishes) }));
  const setFurniture = (fn: (f: FurnitureItem[]) => FurnitureItem[], history = true) =>
    updateRoom(p.id, room.id, (r) => (concept ? { ...r, concepts: r.concepts.map((c) => (c.id === concept.id ? { ...c, furniture: fn(c.furniture) } : c)) } : { ...r, furniture: fn(r.furniture) }), { history });

  const doCompare = async () => {
    if (!concept) return toast('Create a concept first, then compare it with the existing room.', 'warn');
    setCompare(null);
    // Render "before" and "after" from the same camera, using hidden overrides.
    const before = await renderWith(view, p, room, undefined);
    const after = await renderWith(view, p, room, concept.id);
    if (before && after) setCompare({ before, after });
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row">
        <select value={room.id} onChange={(e) => setRoomId(e.target.value)} aria-label="Room" style={{ minWidth: 180 }}>
          {shaped.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <div className="seg">
          <button className={!concept ? 'on' : ''} onClick={() => updateRoom(p.id, room.id, (r) => ({ ...r, activeConceptId: undefined }))}>Existing</button>
          {room.concepts.map((c) => (
            <button key={c.id} className={concept?.id === c.id ? 'on' : ''} onClick={() => updateRoom(p.id, room.id, (r) => ({ ...r, activeConceptId: c.id }))}>{c.name}</button>
          ))}
        </div>
        <button className="btn sm" data-testid="new-concept" onClick={() => {
          const c = createConcept(room, `Concept ${room.concepts.length + 1}`);
          updateRoom(p.id, room.id, (r) => ({ ...r, concepts: [...r.concepts, c], activeConceptId: c.id }));
        }}><Icon name="plus" /> Concept</button>
        {concept && (
          <>
            <input value={concept.name} onChange={(e) => updateRoom(p.id, room.id, (r) => ({ ...r, concepts: r.concepts.map((c) => (c.id === concept.id ? { ...c, name: e.target.value } : c)) }), { history: false })} style={{ width: 150 }} aria-label="Concept name" />
            <button className="btn sm ghost" onClick={() => updateRoom(p.id, room.id, (r) => ({ ...r, concepts: r.concepts.filter((c) => c.id !== concept.id), activeConceptId: undefined }))}><Icon name="trash" /></button>
          </>
        )}
        <span className="spacer" />
        <button className="btn sm primary" onClick={doCompare} disabled={!concept}><Icon name="eye" /> Before / after</button>
      </div>
      <div className="note">{concept ? `Editing “${concept.name}”: a design idea. The existing room record is unchanged.` : 'Editing the existing room: what is there now. Create a concept to try changes without losing this.'}</div>

      <div className="grid cols-2">
        <div className="card" style={{ padding: 0, overflow: 'hidden', height: 420, position: 'relative' }}>
          <ThreeView
            ref={view}
            property={p}
            options={sceneOptions}
          />
        </div>
        <div className="card" style={{ padding: 0, overflow: 'hidden', height: 420, position: 'relative' }}>
          <FurniturePlanner property={p} room={room} furniture={furniture} onChange={setFurniture} />
        </div>
      </div>

      {compare && <Compare before={compare.before} after={compare.after} onClose={() => setCompare(null)} />}

      <div className="grid cols-2">
        <FinishesPanel room={room} finishes={finishes} onChange={setFinishes} />
        <FurniturePanel property={p} room={room} furniture={furniture} onChange={setFurniture} />
      </div>
      <div className="note">
        Want to move walls or change the layout? Do it on the <a onClick={() => go(`p/${p.id}/plan`)} style={{ cursor: 'pointer' }}>floor plan</a> (use undo to compare). Moved walls are
        marked as drawn, so the measured record stays honest.
      </div>
    </div>
  );
}

async function renderWith(view: React.RefObject<ThreeViewHandle | null>, _p: Property, _room: Room, _conceptId?: string): Promise<string | null> {
  // The ThreeView shows the active selection; the parent swaps overrides via the active concept.
  // For a fair comparison we temporarily switch the active concept and wait two frames.
  const p = _p;
  const room = _room;
  const prev = room.activeConceptId;
  updateRoom(p.id, room.id, (r) => ({ ...r, activeConceptId: _conceptId }), { history: false });
  await new Promise((r) => setTimeout(r, 120));
  const url = view.current?.snapshot() ?? null;
  updateRoom(p.id, room.id, (r) => ({ ...r, activeConceptId: prev }), { history: false });
  await new Promise((r) => setTimeout(r, 60));
  return url;
}

function Compare({ before, after, onClose }: { before: string; after: string; onClose: () => void }) {
  const [x, setX] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const move = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    setX(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };
  return (
    <Modal title="Before / after" onClose={onClose} wide>
      <div
        className="compare"
        ref={box}
        onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); move(e.clientX); }}
        onPointerMove={(e) => e.buttons && move(e.clientX)}
      >
        <img src={before} alt="Before" />
        <div className="after" style={{ clipPath: `inset(0 0 0 ${x}%)` }}>
          <img src={after} alt="After" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div className="handle" style={{ left: `${x}%` }} />
        <span className="tag" style={{ left: 10 }}>Before</span>
        <span className="tag" style={{ right: 10 }}>After</span>
      </div>
      <p className="faint">Both images are rendered from the same viewpoint. They are design visualisations, not photographs.</p>
    </Modal>
  );
}

function FinishesPanel({ room, finishes: f, onChange }: { room: Room; finishes: RoomFinishes; onChange: (fn: (f: RoomFinishes) => RoomFinishes) => void }) {
  const kitchen = room.type === 'kitchen' || room.type === 'laundry';
  const bath = room.type === 'bathroom';
  return (
    <div className="card stack">
      <h3>Finishes</h3>
      <div className="stack" style={{ gap: 6 }}>
        <span className="muted" style={{ fontSize: 13 }}>Flooring · {FLOOR_MATERIALS.find((m) => m.id === f.floorMaterial)?.name}</span>
        <div className="swatches">
          {FLOOR_MATERIALS.map((m) => (
            <button key={m.id} className={`swatch ${f.floorMaterial === m.id ? 'on' : ''}`} title={m.name} aria-label={m.name} style={{ background: `linear-gradient(135deg, ${m.base} 60%, ${m.accent})` }} onClick={() => onChange((x) => ({ ...x, floorMaterial: m.id }))} />
          ))}
        </div>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="muted" style={{ fontSize: 13 }}>Wall colour</span>
        <div className="swatches">
          {WALL_COLORS.map((c) => (
            <button key={c.hex} className={`swatch ${f.wallColor === c.hex ? 'on' : ''}`} title={c.name} aria-label={c.name} style={{ background: c.hex }} onClick={() => onChange((x) => ({ ...x, wallColor: c.hex }))} />
          ))}
          <input type="color" value={f.wallColor} onChange={(e) => onChange((x) => ({ ...x, wallColor: e.target.value }))} aria-label="Custom wall colour" />
        </div>
      </div>
      <div className="row">
        <label className="field">Ceiling colour<input type="color" value={f.ceilingColor} onChange={(e) => onChange((x) => ({ ...x, ceilingColor: e.target.value }))} /></label>
      </div>
      {(kitchen || bath) && (
        <div className="grid cols-2" style={{ gap: 10 }}>
          <label className="field">Cabinet style
            <select value={f.cabinetStyle ?? ''} onChange={(e) => onChange((x) => ({ ...x, cabinetStyle: e.target.value }))}>
              {CABINET_STYLES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="field">Cabinet colour
            <select value={f.cabinetColor ?? ''} onChange={(e) => onChange((x) => ({ ...x, cabinetColor: e.target.value }))}>
              {CABINET_COLORS.map((c) => <option key={c.hex} value={c.hex}>{c.name}</option>)}
            </select>
          </label>
          {kitchen && (
            <label className="field">Benchtop
              <select value={f.benchtop ?? ''} onChange={(e) => onChange((x) => ({ ...x, benchtop: e.target.value }))}>
                {BENCHTOPS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
          )}
          {bath && (
            <label className="field">Wall tile
              <select value={f.bathroomTile ?? ''} onChange={(e) => onChange((x) => ({ ...x, bathroomTile: e.target.value }))}>
                {BATHROOM_TILES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
          )}
          <span className="faint" style={{ fontSize: 12.5, gridColumn: '1 / -1' }}>Cabinet colour is applied to cabinet and vanity pieces in the 3D view.</span>
        </div>
      )}
      <div className="grid cols-2" style={{ gap: 10 }}>
        <label className="field">Light colour · {f.lightTemperature} K
          <input type="range" min={2200} max={6500} step={100} value={f.lightTemperature} onChange={(e) => onChange((x) => ({ ...x, lightTemperature: +e.target.value }))} />
        </label>
        <label className="field">Brightness · {Math.round(f.lightIntensity * 100)}%
          <input type="range" min={0} max={2} step={0.05} value={f.lightIntensity} onChange={(e) => onChange((x) => ({ ...x, lightIntensity: +e.target.value }))} />
        </label>
      </div>
    </div>
  );
}

function fitState(room: Room, f: FurnitureItem, all: FurnitureItem[]) {
  const body = orientedRect(f.x, f.y, f.w, f.d, f.rotation);
  if (!polygonInside(body, room.polygon)) return 'outside';
  if (f.kind !== 'rug' && all.some((x) => x.id !== f.id && x.kind !== 'rug' && convexOverlap(body, orientedRect(x.x, x.y, x.w, x.d, x.rotation)))) return 'overlap';
  if (doorSwings(room).some((s) => convexOverlap(body, s))) return 'door';
  return 'ok';
}

function FurniturePanel({ property, room, furniture, onChange }: { property: Property; room: Room; furniture: FurnitureItem[]; onChange: (fn: (f: FurnitureItem[]) => FurnitureItem[]) => void }) {
  const [cat, setCat] = useState(FURNITURE[0].id);
  const [test, setTest] = useState<{ w: number | null; d: number | null }>({ w: 1930, d: 2030 });
  const [clear, setClear] = useState(600);
  const u = property.units;
  const groups = Array.from(new Set(FURNITURE.map((f) => f.group)));
  const obstacles = () => [...doorSwings(room), ...furniture.filter((f) => f.kind !== 'rug').map((f) => orientedRect(f.x, f.y, f.w, f.d, f.rotation))];
  const testResult = useMemo(() => {
    if (!test.w || !test.d) return null;
    return {
      empty: findFit(room.polygon, test.w, test.d),
      furnished: findFit(room.polygon, test.w, test.d, { obstacles: obstacles() }),
      walkway: findFit(room.polygon, test.w, test.d, { obstacles: obstacles(), clearance: clear }),
    };
  }, [test.w, test.d, clear, room.polygon, furniture]); // eslint-disable-line

  const add = (id: string) => {
    const c = FURNITURE.find((x) => x.id === id)!;
    const fit = findFit(room.polygon, c.w, c.d, { obstacles: obstacles() });
    const b = bounds(room.polygon);
    const item = createFurniture(id, fit.position ?? { x: b.minX + b.w / 2, y: b.minY + b.h / 2 })!;
    item.rotation = fit.rotation ?? 0;
    onChange((f) => [...f, item]);
    toast(fit.fits ? `${c.name} placed where it fits.` : `${c.name} does not fit clear of other pieces; placed in the middle for you to move.`, fit.fits ? 'ok' : 'warn');
  };

  return (
    <div className="card stack">
      <h3>Furniture</h3>
      <div className="row nowrap">
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Catalogue item">
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {FURNITURE.filter((f) => f.group === g).map((f) => <option key={f.id} value={f.id}>{f.name} · {fmtLen(f.w, u)} × {fmtLen(f.d, u)}</option>)}
            </optgroup>
          ))}
        </select>
        <button className="btn primary" onClick={() => add(cat)} data-testid="add-furniture"><Icon name="plus" /> Add</button>
      </div>
      <p className="faint" style={{ fontSize: 12.5 }}>Catalogue sizes are typical retail sizes. Edit any piece to your exact dimensions.</p>
      {furniture.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Piece</th><th>W</th><th>D</th><th>H</th><th>Fit</th><th /></tr></thead>
            <tbody>
              {furniture.map((f) => {
                const st = fitState(room, f, furniture);
                const set = (patch: Partial<FurnitureItem>) => onChange((all) => all.map((x) => (x.id === f.id ? { ...x, ...patch } : x)));
                return (
                  <tr key={f.id}>
                    <td><input value={f.name} onChange={(e) => set({ name: e.target.value })} style={{ width: 130, padding: '5px 8px' }} aria-label="Name" /></td>
                    <td style={{ minWidth: 80 }}><LengthInput value={f.w} units={u} onCommit={(v) => v && set({ w: v })} /></td>
                    <td style={{ minWidth: 80 }}><LengthInput value={f.d} units={u} onCommit={(v) => v && set({ d: v })} /></td>
                    <td style={{ minWidth: 80 }}><LengthInput value={f.h} units={u} onCommit={(v) => v && set({ h: v })} /></td>
                    <td><span className={`chip ${st === 'ok' ? 'measured' : st === 'door' ? 'estimated' : 'unknown'}`}>{{ ok: 'Fits', outside: 'Outside', overlap: 'Overlaps', door: 'Door swing' }[st]}</span></td>
                    <td className="row nowrap" style={{ gap: 2 }}>
                      <button className="btn sm ghost icon" aria-label="Rotate" onClick={() => set({ rotation: (f.rotation + 90) % 360 })}><Icon name="rotate" /></button>
                      <button className="btn sm ghost icon" aria-label="Duplicate" onClick={() => onChange((all) => [...all, { ...f, id: uid('fu_'), x: f.x + 300, y: f.y + 300 }])}><Icon name="copy" /></button>
                      <button className="btn sm ghost icon" aria-label="Remove" onClick={() => onChange((all) => all.filter((x) => x.id !== f.id))}><Icon name="trash" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <hr />
      <h3>Will it fit?</h3>
      <div className="row nowrap">
        <LengthInput value={test.w} units={u} onCommit={(v) => setTest({ ...test, w: v })} placeholder="width" ariaLabel="Test width" />
        <span>×</span>
        <LengthInput value={test.d} units={u} onCommit={(v) => setTest({ ...test, d: v })} placeholder="depth" ariaLabel="Test depth" />
      </div>
      <label className="field">Walkway to keep clear around it
        <LengthInput value={clear} units={u} onCommit={(v) => setClear(v ?? 0)} />
      </label>
      {testResult && (
        <div className="stack" style={{ gap: 4, fontSize: 14 }}>
          <span>{testResult.empty.fits ? '✓' : '✕'} In the empty room</span>
          <span>{testResult.furnished.fits ? '✓' : '✕'} With the current furniture, clear of door swings</span>
          <span>{testResult.walkway.fits ? '✓' : '✕'} …and with {fmtLen(clear, u)} walkway all round</span>
          <span className="faint" style={{ fontSize: 12.5 }}>Checked at every wall-aligned position. Based on the room's {room.edges.every((e) => e.status === 'measured') ? 'measured' : 'partly unmeasured'} walls.</span>
        </div>
      )}
    </div>
  );
}

function FurniturePlanner({ property, room, furniture, onChange }: { property: Property; room: Room; furniture: FurnitureItem[]; onChange: (fn: (f: FurnitureItem[]) => FurnitureItem[], history?: boolean) => void }) {
  const canvas = useRef<PlanCanvasHandle>(null);
  const drag = useRef<{ id: string; start: Point; orig: FurnitureItem; moved: boolean } | null>(null);
  const [sel, setSel] = useState<string | undefined>();
  const b = bounds(offsetPolygon(room.polygon, room.wallThickness));
  const initial = { minX: b.minX - 600, minY: b.minY - 600, w: b.w + 1200, h: b.h + 1200 };
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || !canvas.current) return;
      const p = canvas.current.toPlan(e.clientX, e.clientY);
      const dx = p.x - d.start.x;
      const dy = p.y - d.start.y;
      if (!d.moved) {
        if (Math.hypot(dx, dy) < 20) return;
        d.moved = true;
        onChangeRef.current((f) => f, true);
      }
      onChangeRef.current((all) => all.map((x) => (x.id === d.id ? { ...x, x: snapValue(d.orig.x + dx, 10), y: snapValue(d.orig.y + dy, 10) } : x)), false);
    };
    const up = () => (drag.current = null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, []);

  const view = { ...property, rooms: property.rooms.filter((r) => r.id === room.id) };
  return (
    <>
      <PlanCanvas ref={canvas} initial={initial} grid={100} onBackgroundDown={() => setSel(undefined)} key={room.id}>
        <PlanContent
          property={view}
          opts={{ floorId: room.floorId, showDims: true, selectedFurnitureId: sel, furnitureOverride: { [room.id]: furniture }, textScale: 0.8 }}
          handlers={{
            onFurnitureDown: (e: RPointerEvent, _r, f) => {
              e.stopPropagation();
              setSel(f.id);
              drag.current = { id: f.id, start: canvas.current!.toPlan(e.clientX, e.clientY), orig: f, moved: false };
            },
          }}
        />
      </PlanCanvas>
      <div className="toolbar">
        <div className="group">
          <button className="btn sm" disabled={!sel} onClick={() => sel && onChange((all) => all.map((x) => (x.id === sel ? { ...x, rotation: (x.rotation + 90) % 360 } : x)))}><Icon name="rotate" /> Rotate</button>
          <button className="btn sm" disabled={!sel} onClick={() => { if (sel) { onChange((all) => all.filter((x) => x.id !== sel)); setSel(undefined); } }}><Icon name="trash" /></button>
        </div>
      </div>
      <div className="legend"><span>Drag furniture to arrange it</span></div>
    </>
  );
}
