import { useState } from 'react';
import type { PageProps } from '../App';
import { flooringNeed, floorArea, paintNeed, roomCeilingArea, roomFloorArea, roomPerimeter, roomWallArea, sumFigures, totalInteriorArea, type Figure } from '../core/calc';
import { ROOM_TYPES } from '../core/catalog';
import type { Property, RoomType } from '../core/types';
import { STATUS_LABEL, areaNumber, areaUnitLabel, fmtArea, fmtLen, fmtVolumePaint } from '../core/units';
import { updateProperty, updateRoom } from '../store/store';
import { FigureValue, STATUS_EXPLAIN, StatusChip } from '../ui/components';
import { Icon } from '../ui/icons';
import { downloadBlob, safeFileName } from '../ui/image';

export default function AreaCalc({ property: p }: PageProps) {
  const [boxM2, setBoxM2] = useState(2.2);
  const [ceilings, setCeilings] = useState(false);
  const [scope, setScope] = useState<'counted' | 'all'>('counted');
  const s = p.areaSettings;
  const u = p.units;
  const rooms = p.rooms.filter((r) => scope === 'all' || r.countsTowardArea);
  const total = totalInteriorArea(p);
  const everything = sumFigures(p.rooms.map(roomFloorArea));
  const floorNeed = flooringNeed(rooms, s, u === 'metric' ? boxM2 : boxM2 / 10.7639);
  const paint = paintNeed(rooms, s, ceilings);
  const setS = (patch: Partial<typeof s>) => updateProperty(p.id, (x) => ({ ...x, areaSettings: { ...x.areaSettings, ...patch } }), { history: false });

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="grid cols-4">
        <Big label="Total interior area" f={total} p={p} />
        <Big label="All spaces incl. excluded" f={everything} p={p} />
        <Big label={`Flooring to order (+${s.flooringWastePct}%)`} f={{ ...floorNeed.area, value: floorNeed.withWaste }} p={p} sub={floorNeed.boxes ? `${floorNeed.boxes} boxes` : undefined} />
        <div className="card stat">
          <span className="label">Paint</span>
          <span className="value">{fmtVolumePaint(paint.litres, u)}</span>
          <span className="row nowrap" style={{ gap: 6, fontSize: 13 }}>
            <span className="muted">{fmtArea(paint.wallArea.value + (paint.ceilingArea?.value ?? 0), u)}</span>
            <StatusChip status={paint.wallArea.status} short />
          </span>
        </div>
      </div>

      {total.status !== 'measured' && (
        <div className="note warn">
          The totals are not fully verified: {total.reasons.slice(0, 3).join('; ')}. Figures with a blue, amber or red tag should not be quoted as measured
          floor area.
        </div>
      )}

      {p.floors.map((f) => {
        const fr = p.rooms.filter((r) => r.floorId === f.id);
        if (!fr.length) return null;
        return (
          <div key={f.id} className="card">
            <div className="card-title">
              <h3>{f.name}</h3>
              <FigureValue f={floorArea(p, f)} units={u} />
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Counts</th><th>Room</th><th className="num">Floor</th><th className="num">Perimeter</th><th className="num">Ceiling h</th><th className="num">Walls gross</th><th className="num">Doors/windows</th><th className="num">Walls net</th><th className="num">Ceiling</th>
                  </tr>
                </thead>
                <tbody>
                  {fr.map((r) => {
                    const w = roomWallArea(r);
                    return (
                      <tr key={r.id} style={{ opacity: r.countsTowardArea ? 1 : 0.6 }}>
                        <td><input type="checkbox" checked={r.countsTowardArea} onChange={(e) => updateRoom(p.id, r.id, (x) => ({ ...x, countsTowardArea: e.target.checked }))} aria-label={`${r.name} counts toward area`} /></td>
                        <td>{r.name}</td>
                        <td className="num"><Cell f={roomFloorArea(r)} u={u} /></td>
                        <td className="num"><Cell f={roomPerimeter(r)} u={u} len /></td>
                        <td className="num">{r.ceilingHeight.status === 'unknown' ? <span className="chip unknown">Missing</span> : <>{fmtLen(r.ceilingHeight.value, u)} <StatusChip status={r.ceilingHeight.status} short /></>}</td>
                        <td className="num"><Cell f={w.gross} u={u} /></td>
                        <td className="num"><Cell f={w.openings} u={u} /></td>
                        <td className="num"><Cell f={w.net} u={u} /></td>
                        <td className="num"><Cell f={roomCeilingArea(r)} u={u} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <div className="grid cols-2">
        <div className="card stack">
          <h3>Settings</h3>
          <div className="stack" style={{ gap: 6 }}>
            <span className="muted" style={{ fontSize: 13 }}>Room types left out of the interior area for new rooms</span>
            <div className="row" style={{ gap: 6 }}>
              {ROOM_TYPES.map((t) => {
                const on = s.excludedTypes.includes(t.id);
                return (
                  <button key={t.id} className={`btn sm ${on ? 'active' : ''}`} onClick={() => setS({ excludedTypes: on ? s.excludedTypes.filter((x) => x !== t.id) : [...s.excludedTypes, t.id as RoomType] })}>{t.label}</button>
                );
              })}
            </div>
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => updateProperty(p.id, (x) => ({ ...x, rooms: x.rooms.map((r) => ({ ...r, countsTowardArea: !x.areaSettings.excludedTypes.includes(r.type) })) }))}>Apply to existing rooms</button>
          </div>
          <div className="grid cols-2" style={{ gap: 10 }}>
            <label className="field">Flooring waste %<input type="number" min={0} max={40} value={s.flooringWastePct} onChange={(e) => setS({ flooringWastePct: +e.target.value })} /></label>
            <label className="field">Coverage per box ({areaUnitLabel(u)})<input type="number" min={0} step={0.1} value={boxM2} onChange={(e) => setBoxM2(+e.target.value)} /></label>
            <label className="field">Paint coverage (m² per litre per coat)<input type="number" min={1} step={0.5} value={s.paintCoveragePerLitre} onChange={(e) => setS({ paintCoveragePerLitre: +e.target.value })} /></label>
            <label className="field">Coats<input type="number" min={1} max={5} value={s.paintCoats} onChange={(e) => setS({ paintCoats: +e.target.value })} /></label>
          </div>
          <label className="check"><input type="checkbox" checked={ceilings} onChange={(e) => setCeilings(e.target.checked)} /> Include ceilings in paint</label>
          <label className="check"><input type="checkbox" checked={scope === 'all'} onChange={(e) => setScope(e.target.checked ? 'all' : 'counted')} /> Materials for every room, including excluded ones</label>
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => downloadBlob(new Blob([csv(p)], { type: 'text/csv' }), `${safeFileName(p.name)}-areas.csv`)}><Icon name="download" /> Export CSV</button>
        </div>
        <div className="card stack">
          <h3>What the tags mean</h3>
          {(['measured', 'drawn', 'estimated', 'unknown'] as const).map((k) => (
            <div key={k} className="row nowrap" style={{ alignItems: 'flex-start' }}>
              <span style={{ width: 120, flex: 'none' }}><StatusChip status={k} /></span>
              <span className="muted" style={{ fontSize: 13.5 }}>{STATUS_EXPLAIN[k]}</span>
            </div>
          ))}
          <p className="faint" style={{ fontSize: 13 }}>
            A calculated figure carries the weakest tag of anything it uses. Wall area uses wall lengths and ceiling height and subtracts door and window
            sizes. Ceilings are assumed flat. Paint and flooring are planning quantities; check product coverage on the tin or box.
          </p>
        </div>
      </div>
    </div>
  );
}

function Big({ label, f, p, sub }: { label: string; f: Figure; p: Property; sub?: string }) {
  return (
    <div className="card stat">
      <span className="label">{label}</span>
      <span className="value gold">{f.status === 'unknown' ? '—' : fmtArea(f.value, p.units)}</span>
      <span className="row nowrap" style={{ gap: 6 }}>
        <StatusChip status={f.status} short />
        {sub && <span className="muted" style={{ fontSize: 13 }}>{sub}</span>}
      </span>
    </div>
  );
}

function Cell({ f, u, len }: { f: Figure; u: Property['units']; len?: boolean }) {
  if (f.status === 'unknown') return <span className="chip unknown" title={f.reasons.join('\n')}>Missing</span>;
  return (
    <span title={`${STATUS_LABEL[f.status]}${f.reasons.length ? '\n' + f.reasons.join('\n') : ''}`} style={{ color: `var(--${f.status === 'measured' ? 'text' : f.status})` }}>
      {len ? fmtLen(f.value, u) : fmtArea(f.value, u, 2)}
    </span>
  );
}

export function csv(p: Property) {
  const u = p.units;
  const unit = areaUnitLabel(u);
  const rows = [['Floor', 'Room', 'Counts', `Floor area (${unit})`, 'Floor status', `Net wall (${unit})`, 'Wall status', 'Ceiling height (mm)', 'Ceiling status']];
  for (const r of p.rooms) {
    const a = roomFloorArea(r);
    const w = roomWallArea(r).net;
    rows.push([
      p.floors.find((f) => f.id === r.floorId)?.name ?? '',
      r.name,
      r.countsTowardArea ? 'yes' : 'no',
      a.status === 'unknown' ? '' : areaNumber(a.value, u).toFixed(2),
      STATUS_LABEL[a.status],
      w.status === 'unknown' ? '' : areaNumber(w.value, u).toFixed(2),
      STATUS_LABEL[w.status],
      r.ceilingHeight.status === 'unknown' ? '' : String(Math.round(r.ceilingHeight.value)),
      STATUS_LABEL[r.ceilingHeight.status],
    ]);
  }
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}
