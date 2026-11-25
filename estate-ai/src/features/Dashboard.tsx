import { useState } from 'react';
import { measurementCompleteness, totalInteriorArea } from '../core/calc';
import { createSampleProperty } from '../core/model';
import { fmtArea } from '../core/units';
import { addProperty, newProperty, useStore } from '../store/store';
import { Empty, Modal, PhotoThumb, StatusChip } from '../ui/components';
import { Icon } from '../ui/icons';
import { go } from '../ui/router';

export default function Dashboard() {
  const properties = useStore((s) => s.properties);
  const photos = useStore((s) => s.photos);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const list = properties.filter((p) => (p.name + ' ' + p.address).toLowerCase().includes(q.toLowerCase()));
  const totalRooms = properties.reduce((s, p) => s + p.rooms.length, 0);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row between">
        <div>
          <h2 style={{ fontSize: 24 }}>Your properties</h2>
          <p className="muted">Everything is stored on this device. Nothing is uploaded.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => go(`p/${addProperty(createSampleProperty()).id}`)}>
            <Icon name="sparkle" /> Load sample
          </button>
          <button className="btn primary" onClick={() => setCreating(true)} data-testid="new-property">
            <Icon name="plus" /> New property
          </button>
        </div>
      </div>

      {properties.length > 0 && (
        <div className="grid cols-4">
          <div className="card stat">
            <span className="label">Properties</span>
            <span className="value gold">{properties.length}</span>
          </div>
          <div className="card stat">
            <span className="label">Rooms recorded</span>
            <span className="value">{totalRooms}</span>
          </div>
          <div className="card stat">
            <span className="label">Photos</span>
            <span className="value">{photos.length}</span>
          </div>
          <div className="card stat">
            <span className="label">Last edited</span>
            <span className="value" style={{ fontSize: 18 }}>
              {new Date(Math.max(...properties.map((p) => p.updatedAt))).toLocaleDateString()}
            </span>
          </div>
        </div>
      )}

      {properties.length > 3 && <input placeholder="Search properties" value={q} onChange={(e) => setQ(e.target.value)} />}

      {properties.length === 0 ? (
        <div className="card">
          <Empty title="No properties yet">
            <p className="muted" style={{ maxWidth: 460 }}>
              Create a property, add floors and rooms, then record measurements with a tape or laser. Photos, plans, 3D and reports follow from
              those measurements.
            </p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button className="btn primary" onClick={() => setCreating(true)}>
                <Icon name="plus" /> New property
              </button>
              <button className="btn" onClick={() => go(`p/${addProperty(createSampleProperty()).id}`)}>
                Explore sample data
              </button>
            </div>
          </Empty>
        </div>
      ) : (
        <div className="grid auto">
          {list.map((p) => {
            const area = totalInteriorArea(p);
            const done = measurementCompleteness(p);
            const cover = p.coverPhotoId ?? photos.find((ph) => ph.propertyId === p.id)?.id;
            return (
              <div key={p.id} className="card click" onClick={() => go(`p/${p.id}`)} data-testid="property-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ height: 130, background: 'linear-gradient(135deg,#1d1b17,#121214)', position: 'relative' }}>
                  {cover ? (
                    <div style={{ position: 'absolute', inset: 0 }}>
                      <PhotoThumb id={cover} />
                    </div>
                  ) : (
                    <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--gold)', opacity: 0.6 }}>
                      <Icon name="building" size={40} />
                    </div>
                  )}
                </div>
                <div style={{ padding: 16 }} className="stack">
                  <div>
                    <h3 style={{ fontSize: 16 }}>{p.name}</h3>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {p.address || 'No address'}
                    </span>
                  </div>
                  <div className="row between" style={{ fontSize: 13 }}>
                    <span className="muted">
                      {p.floors.length} floor{p.floors.length === 1 ? '' : 's'} · {p.rooms.length} room{p.rooms.length === 1 ? '' : 's'}
                    </span>
                    <span className="row nowrap" style={{ gap: 6 }}>
                      {area.status === 'unknown' ? '—' : fmtArea(area.value, p.units)}
                      <StatusChip status={area.status} short />
                    </span>
                  </div>
                  <div>
                    <div className="row between" style={{ fontSize: 12, marginBottom: 5 }}>
                      <span className="faint">Measured</span>
                      <span className="faint">{Math.round(done * 100)}%</span>
                    </div>
                    <div className="progress">
                      <div style={{ width: `${done * 100}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creating && <CreateProperty onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateProperty({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const create = () => {
    const p = newProperty(name.trim(), address.trim());
    onClose();
    go(`p/${p.id}/scan`);
  };
  return (
    <Modal
      title="New property"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={create} data-testid="create-property">
            Create
          </button>
        </>
      }
    >
      <label className="field">
        Property name
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Harbour View Apartment" onKeyDown={(e) => e.key === 'Enter' && create()} />
      </label>
      <label className="field">
        Address (optional)
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, suburb" />
      </label>
      <p className="faint" style={{ fontSize: 13 }}>
        A ground floor is added for you. You can add more floors in the scanner.
      </p>
    </Modal>
  );
}
