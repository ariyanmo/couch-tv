import { useState } from 'react';
import { edgeLength } from '../../core/geometry';
import { setWallLength, uid } from '../../core/model';
import type { Measure, Property, Room } from '../../core/types';
import { fmtLen } from '../../core/units';
import { updateRoom } from '../../store/store';
import { MeasureEditor, Modal, StatusChip } from '../../ui/components';
import { Icon } from '../../ui/icons';
import { RoomPreview } from '../RoomEditor';

const OPEN_LABEL: Record<string, string> = { door: 'Door', 'double-door': 'Double door', 'sliding-door': 'Sliding door', opening: 'Opening', window: 'Window' };

/**
 * One place to enter real measurements for a room after a scan: every wall,
 * the ceiling, each door and window, and anything else you choose to measure.
 * Entering a wall length reshapes the plan and marks that wall measured.
 */
export function MeasureSheet({ property: p, room, onClose }: { property: Property; room: Room; onClose: () => void }) {
  const [wall, setWall] = useState<number | undefined>(0);
  const [newLabel, setNewLabel] = useState('');
  const u = p.units;
  const upd = (fn: (r: Room) => Room) => updateRoom(p.id, room.id, fn);
  const custom = room.customMeasures ?? [];
  const measuredCount = room.edges.filter((e) => e.status === 'measured').length + (room.ceilingHeight.status === 'measured' ? 1 : 0);
  const total = room.polygon.length + 1;

  return (
    <Modal title={`Measure: ${room.name}`} onClose={onClose} wide footer={<button className="btn primary" onClick={onClose} data-testid="measure-done">Done</button>}>
      <div className="row between">
        <span className="muted" style={{ fontSize: 13.5 }}>Type what your tape or laser shows. Measured values turn green and replace the scan's estimates.</span>
        <span className="chip plain">{measuredCount}/{total} measured</span>
      </div>
      <div className="grid cols-2">
        <div className="stack">
          {room.polygon.length >= 3 && <RoomPreview room={room} units={u} height={220} highlight={wall} />}
          <div className="note" style={{ fontSize: 13 }}>Tip: measure the longest walls first. For a rectangular room, two walls that meet at a corner are enough to fix its size.</div>
        </div>
        <div className="stack" style={{ gap: 10 }}>
          <h3>Walls (length)</h3>
          {room.polygon.map((_, i) => {
            const e = room.edges[i] ?? { value: edgeLength(room.polygon, i), status: 'drawn' as const };
            return (
              <div key={i} onFocus={() => setWall(i)} onMouseEnter={() => setWall(i)} className="stack" style={{ gap: 4 }}>
                <div className="row between" style={{ fontSize: 13 }}>
                  <span>Wall {i + 1} <span className="faint">· now {fmtLen(edgeLength(room.polygon, i), u)}</span></span>
                  <StatusChip status={e.status} short />
                </div>
                <MeasureEditor
                  m={e.status === 'measured' ? e : { value: 0, status: 'unknown', method: 'tape' }}
                  units={u}
                  onChange={(m) => m.status !== 'unknown' && upd((r) => setWallLength(r, i, m.value, m.status, m.method ?? 'tape'))}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card stack" style={{ gap: 10 }}>
          <h3>Height</h3>
          <MeasureEditor m={room.ceilingHeight.status === 'measured' ? room.ceilingHeight : { ...room.ceilingHeight, method: 'tape' }} units={u} label={`Ceiling height${room.ceilingHeight.status !== 'unknown' && room.ceilingHeight.status !== 'measured' ? ` (scan says ${fmtLen(room.ceilingHeight.value, u)})` : ''}`} onChange={(m) => upd((r) => ({ ...r, ceilingHeight: m }))} />
        </div>
        <div className="card stack" style={{ gap: 10 }}>
          <h3>Doors & windows</h3>
          {room.openings.length === 0 && <span className="faint" style={{ fontSize: 13 }}>None added. Add them on the room's Doors & windows tab or on the plan.</span>}
          {room.openings.map((o) => {
            const set = (k: 'width' | 'height' | 'sill', m: Measure) => m.status !== 'unknown' && upd((r) => ({ ...r, openings: r.openings.map((x) => (x.id === o.id ? { ...x, [k]: m } : x)) }));
            return (
              <div key={o.id} className="stack" style={{ gap: 6 }}>
                <b style={{ fontSize: 13.5 }}>{OPEN_LABEL[o.type]} on wall {o.edge + 1}</b>
                <MeasureEditor m={o.width} units={u} label="Width" onChange={(m) => set('width', m)} />
                <MeasureEditor m={o.height} units={u} label="Height" onChange={(m) => set('height', m)} />
                {o.type === 'window' && <MeasureEditor m={o.sill} units={u} label="Sill height" onChange={(m) => set('sill', m)} />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card stack" style={{ gap: 10 }}>
        <h3>Anything else</h3>
        <span className="muted" style={{ fontSize: 13 }}>Record any other measurement, such as a recess, a radiator, a bench run or the gap for a fridge.</span>
        {custom.map((c) => (
          <div key={c.id} className="stack" style={{ gap: 6, paddingBottom: 10, borderBottom: '1px solid var(--line)' }}>
            <div className="row nowrap">
            <label className="field" style={{ flex: 1, minWidth: 0 }}>
              Name
              <input value={c.label} onChange={(e) => upd((r) => ({ ...r, customMeasures: (r.customMeasures ?? []).map((x) => (x.id === c.id ? { ...x, label: e.target.value } : x)) }))} />
            </label>
            <button className="btn sm ghost icon" style={{ alignSelf: 'flex-end' }} aria-label="Remove" onClick={() => upd((r) => ({ ...r, customMeasures: (r.customMeasures ?? []).filter((x) => x.id !== c.id) }))}><Icon name="trash" /></button>
            </div>
            <MeasureEditor m={c.value} units={u} onChange={(m) => upd((r) => ({ ...r, customMeasures: (r.customMeasures ?? []).map((x) => (x.id === c.id ? { ...x, value: m } : x)) }))} />
          </div>
        ))}
        <form className="row nowrap" onSubmit={(e) => {
          e.preventDefault();
          const label = newLabel.trim() || `Measurement ${custom.length + 1}`;
          upd((r) => ({ ...r, customMeasures: [...(r.customMeasures ?? []), { id: uid('cm_'), label, value: { value: 0, status: 'unknown', method: 'tape' } }] }));
          setNewLabel('');
        }}>
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Fridge gap width" style={{ flex: 1 }} aria-label="New measurement name" data-testid="custom-measure-name" />
          <button className="btn" type="submit" data-testid="custom-measure-add"><Icon name="plus" /> Add</button>
        </form>
      </div>
    </Modal>
  );
}
