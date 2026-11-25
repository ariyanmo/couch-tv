import { useState } from 'react';
import { MODULES, type PageProps } from '../App';
import { floorArea, measurementCompleteness, missingMeasurements, totalInteriorArea } from '../core/calc';
import type { UnitSystem } from '../core/types';
import { STATUS_LABEL, fmtArea } from '../core/units';
import { deleteProperty, updateProperty, useStore } from '../store/store';
import { Confirm, FigureValue, Seg } from '../ui/components';
import { Icon } from '../ui/icons';
import { go } from '../ui/router';
import { PlanContent, floorBounds } from './plan/PlanSVG';

export default function Overview({ property: p }: PageProps) {
  const photos = useStore((s) => s.photos.filter((ph) => ph.propertyId === p.id));
  const [del, setDel] = useState(false);
  const total = totalInteriorArea(p);
  const miss = missingMeasurements(p);
  const done = measurementCompleteness(p);
  const f0 = p.floors[0];
  const fb = floorBounds(p, f0.id);
  const upd = (fn: (x: typeof p) => typeof p) => updateProperty(p.id, fn, { history: false });

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid cols-4">
        <div className="card stat">
          <span className="label">Interior area</span>
          <span className="value gold">{total.status === 'unknown' ? '—' : fmtArea(total.value, p.units)}</span>
          <span className={`chip ${total.status}`} style={{ alignSelf: 'flex-start' }} title={total.reasons.join('\n')}>
            {STATUS_LABEL[total.status]}
          </span>
        </div>
        <div className="card stat">
          <span className="label">Rooms</span>
          <span className="value">{p.rooms.length}</span>
          <span className="muted" style={{ fontSize: 13 }}>{p.floors.length} floor{p.floors.length > 1 ? 's' : ''}</span>
        </div>
        <div className="card stat">
          <span className="label">Photos</span>
          <span className="value">{photos.length}</span>
          <span className="muted" style={{ fontSize: 13 }}>{photos.filter((x) => !x.roomId).length} unsorted</span>
        </div>
        <div className="card stat">
          <span className="label">Measured</span>
          <span className="value">{Math.round(done * 100)}%</span>
          <div className="progress"><div style={{ width: `${done * 100}%` }} /></div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card" style={{ padding: 0, overflow: 'hidden', minHeight: 280 }}>
          <div className="row between" style={{ padding: '14px 16px' }}>
            <h3>{f0.name}</h3>
            <button className="btn sm" onClick={() => go(`p/${p.id}/plan`)}>Open editor</button>
          </div>
          {p.rooms.some((r) => r.polygon.length >= 3) ? (
            <svg viewBox={`${fb.minX} ${fb.minY} ${fb.w} ${fb.h}`} style={{ width: '100%', height: 300, background: '#0d0d0e', display: 'block' }} onClick={() => go(`p/${p.id}/plan`)}>
              <PlanContent property={p} opts={{ floorId: f0.id, showDims: false }} />
            </svg>
          ) : (
            <div className="empty" style={{ padding: 40 }}>
              <p>No room shapes yet.</p>
              <button className="btn primary sm" onClick={() => go(`p/${p.id}/scan`)}>Start measuring</button>
            </div>
          )}
        </div>

        <div className="card stack">
          <h3>Property details</h3>
          <label className="field">Name<input value={p.name} onChange={(e) => upd((x) => ({ ...x, name: e.target.value }))} /></label>
          <label className="field">Address<input value={p.address} onChange={(e) => upd((x) => ({ ...x, address: e.target.value }))} placeholder="Street, suburb" /></label>
          <div className="row between">
            <span className="muted">Units</span>
            <Seg<UnitSystem> value={p.units} options={[{ id: 'metric', label: 'Metric' }, { id: 'imperial', label: 'Imperial' }]} onChange={(v) => upd((x) => ({ ...x, units: v }))} />
          </div>
          <div className="row between faint" style={{ fontSize: 13 }}>
            <span>Created {new Date(p.createdAt).toLocaleDateString()}</span>
            <span>Updated {new Date(p.updatedAt).toLocaleString()}</span>
          </div>
          {p.floors.map((f) => (
            <div key={f.id} className="row between" style={{ fontSize: 14 }}>
              <span>{f.name}</span>
              <FigureValue f={floorArea(p, f)} units={p.units} />
            </div>
          ))}
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="card-title">
            <h3>What to measure next</h3>
            <span className="chip plain">{miss.length}</span>
          </div>
          {miss.length === 0 ? (
            <p className="muted">{p.rooms.length ? 'Every recorded wall, ceiling and opening is measured.' : 'Add rooms in the scanner.'}</p>
          ) : (
            <div className="stack" style={{ gap: 6, maxHeight: 260, overflow: 'auto' }}>
              {miss.slice(0, 40).map((m, i) => (
                <div key={i} className="row between" style={{ fontSize: 14, cursor: 'pointer' }} onClick={() => go(`p/${p.id}/scan/${m.roomId}`)}>
                  <span>{m.roomName}</span>
                  <span className="muted">{m.what}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>Tools</h3>
          <div className="grid cols-2" style={{ gap: 8 }}>
            {MODULES.filter((m) => m.id).map((m) => (
              <button key={m.id} className="list-item" onClick={() => go(`p/${p.id}/${m.id}`)}>
                <Icon name={m.icon} size={18} />
                <span className="grow" style={{ textAlign: 'left', fontSize: 14 }}>{m.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn danger" onClick={() => setDel(true)}><Icon name="trash" /> Delete property</button>
      </div>
      {del && (
        <Confirm
          title={`Delete ${p.name}?`}
          text="This removes the property, its rooms, measurements, photos and exports from this device. Make a backup first if you may want it back. This cannot be undone."
          onYes={async () => {
            await deleteProperty(p.id);
            go('');
          }}
          onClose={() => setDel(false)}
        />
      )}
    </div>
  );
}
