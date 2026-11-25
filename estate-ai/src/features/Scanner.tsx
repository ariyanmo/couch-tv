import { useState } from 'react';
import type { PageProps } from '../App';
import { roomFloorArea, roomHasShape } from '../core/calc';
import { ROOM_TYPES, roomTypeLabel } from '../core/catalog';
import { createFloor, createRoom, uid } from '../core/model';
import type { Property, RoomConnection, RoomType } from '../core/types';
import { fmtArea } from '../core/units';
import { updateProperty, useStore } from '../store/store';
import { Confirm, Modal, StatusChip } from '../ui/components';
import { Icon } from '../ui/icons';
import { go } from '../ui/router';

const STEPS = [
  'Create the property',
  'Add floors',
  'Add rooms',
  'Open the camera',
  'Capture room photos',
  'Record measurements',
  'Mark doors and windows',
  'Record ceiling heights',
  'Record wall lengths',
  'Connect rooms',
  'Review the plan',
];

export default function Scanner({ property: p }: PageProps) {
  const photos = useStore((s) => s.photos.filter((x) => x.propertyId === p.id));
  const [addRoomFloor, setAddRoomFloor] = useState<string | null>(null);
  const [connect, setConnect] = useState(false);
  const [delFloor, setDelFloor] = useState<string | null>(null);

  const stepDone = [
    true,
    p.floors.length > 0,
    p.rooms.length > 0,
    photos.length > 0,
    photos.some((x) => x.roomId),
    p.rooms.some((r) => r.edges.some((e) => e.status === 'measured')),
    p.rooms.some((r) => r.openings.length > 0),
    p.rooms.some((r) => r.ceilingHeight.status === 'measured'),
    p.rooms.length > 0 && p.rooms.every((r) => roomHasShape(r) && r.edges.every((e) => e.status === 'measured')),
    p.connections.length > 0,
    false,
  ];

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="note gold">
        <b>How scanning works here.</b> A phone camera without LiDAR cannot measure a room accurately on its own, so ESTATE AI does not pretend to. You record
        wall lengths with a tape or laser, take guided photos of each room, and the app builds the plan from your numbers. Camera-based estimates are
        available but always marked as estimates.
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 10 }}>Workflow</h3>
        <div className="row" style={{ gap: 6 }}>
          {STEPS.map((s, i) => (
            <span key={s} className={`chip ${stepDone[i] ? 'measured' : 'plain'}`} style={{ fontSize: 12 }}>
              {i + 1}. {s}
            </span>
          ))}
        </div>
      </div>

      {[...p.floors].sort((a, b) => a.level - b.level).map((f) => {
        const rooms = p.rooms.filter((r) => r.floorId === f.id);
        return (
          <div key={f.id} className="card">
            <div className="card-title">
              <input
                value={f.name}
                onChange={(e) => updateProperty(p.id, (x) => ({ ...x, floors: x.floors.map((ff) => (ff.id === f.id ? { ...ff, name: e.target.value } : ff)) }), { history: false })}
                style={{ fontWeight: 600, fontSize: 16, background: 'transparent', border: '1px solid transparent', flex: 1, padding: '4px 6px' }}
                aria-label="Floor name"
              />
              <span className="faint" style={{ fontSize: 13 }}>Level {f.level}</span>
              {p.floors.length > 1 && (
                <button className="btn sm ghost icon" aria-label="Delete floor" onClick={() => setDelFloor(f.id)}>
                  <Icon name="trash" />
                </button>
              )}
              <button className="btn sm primary" onClick={() => setAddRoomFloor(f.id)} data-testid="add-room">
                <Icon name="plus" /> Room
              </button>
            </div>
            {rooms.length === 0 ? (
              <p className="muted">No rooms yet on this floor.</p>
            ) : (
              <div className="grid auto" style={{ gap: 10 }}>
                {rooms.map((r) => {
                  const a = roomFloorArea(r);
                  const n = photos.filter((x) => x.roomId === r.id).length;
                  const measured = r.edges.filter((e) => e.status === 'measured').length;
                  return (
                    <div key={r.id} className="list-item" onClick={() => go(`p/${p.id}/scan/${r.id}`)} data-testid="room-item">
                      <div className="grow">
                        <b>{r.name}</b>
                        <span className="faint" style={{ fontSize: 12.5 }}>
                          {roomTypeLabel(r.type)} · {r.polygon.length ? `${measured}/${r.polygon.length} walls measured` : 'no shape'} · {n} photo{n === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 14 }}>{a.status === 'unknown' ? '—' : fmtArea(a.value, p.units)}</div>
                        <StatusChip status={a.status} short />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div className="row">
        <button
          className="btn"
          onClick={() => {
            const level = Math.max(...p.floors.map((f) => f.level)) + 1;
            updateProperty(p.id, (x) => ({ ...x, floors: [...x.floors, createFloor(level)] }));
          }}
        >
          <Icon name="layers" /> Add floor above
        </button>
        <button
          className="btn"
          onClick={() => {
            const level = Math.min(...p.floors.map((f) => f.level)) - 1;
            updateProperty(p.id, (x) => ({ ...x, floors: [...x.floors, createFloor(level)] }));
          }}
        >
          Add basement
        </button>
        <button className="btn" onClick={() => setConnect(true)} disabled={p.rooms.length < 2}>
          <Icon name="link" /> Connect rooms
        </button>
        <button className="btn" onClick={() => go(`p/${p.id}/plan`)}>
          <Icon name="plan" /> Review plan
        </button>
      </div>

      {p.connections.length > 0 && (
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Connections</h3>
          <div className="stack" style={{ gap: 6 }}>
            {p.connections.map((c) => (
              <div key={c.id} className="row between" style={{ fontSize: 14 }}>
                <span>
                  {p.rooms.find((r) => r.id === c.a)?.name ?? '?'} ↔ {p.rooms.find((r) => r.id === c.b)?.name ?? '?'} <span className="faint">({c.kind})</span>
                </span>
                <button className="btn sm ghost icon" aria-label="Remove connection" onClick={() => updateProperty(p.id, (x) => ({ ...x, connections: x.connections.filter((cc) => cc.id !== c.id) }))}>
                  <Icon name="close" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {addRoomFloor && <AddRoom property={p} floorId={addRoomFloor} onClose={() => setAddRoomFloor(null)} />}
      {connect && <ConnectRooms property={p} onClose={() => setConnect(false)} />}
      {delFloor && (
        <Confirm
          title="Delete floor?"
          text={`This floor and its ${p.rooms.filter((r) => r.floorId === delFloor).length} room(s) are removed. You can undo in the plan editor.`}
          onYes={() =>
            updateProperty(p.id, (x) => ({
              ...x,
              floors: x.floors.filter((f) => f.id !== delFloor),
              rooms: x.rooms.filter((r) => r.floorId !== delFloor),
            }))
          }
          onClose={() => setDelFloor(null)}
        />
      )}
    </div>
  );
}

function AddRoom({ property, floorId, onClose }: { property: Property; floorId: string; onClose: () => void }) {
  const [type, setType] = useState<RoomType>('bedroom');
  const [name, setName] = useState('');
  const create = (scan = false) => {
    const count = property.rooms.filter((r) => r.type === type).length;
    const label = ROOM_TYPES.find((t) => t.id === type)!.label;
    const room = createRoom(floorId, name.trim() || (count ? `${label} ${count + 1}` : label), type);
    updateProperty(property.id, (x) => ({ ...x, rooms: [...x.rooms, room] }));
    onClose();
    go(`p/${property.id}/scan/${room.id}${scan ? '?scan=1' : ''}`);
  };
  return (
    <Modal
      title="Add room"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={() => create(false)} data-testid="create-room">Add room</button>
          <button className="btn primary" onClick={() => create(true)} data-testid="create-room-scan">Add & scan with camera</button>
        </>
      }
    >
      <div className="grid cols-3" style={{ gap: 8 }}>
        {ROOM_TYPES.map((t) => (
          <button key={t.id} className={`btn sm ${type === t.id ? 'active' : ''}`} onClick={() => setType(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <label className="field">
        Name (optional)
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={ROOM_TYPES.find((t) => t.id === type)!.label} onKeyDown={(e) => e.key === 'Enter' && create(false)} />
      </label>
      {!ROOM_TYPES.find((t) => t.id === type)!.countsByDefault && <p className="faint">This room type is left out of the interior area by default. You can change that per room.</p>}
    </Modal>
  );
}

function ConnectRooms({ property, onClose }: { property: Property; onClose: () => void }) {
  const [a, setA] = useState(property.rooms[0]?.id ?? '');
  const [b, setB] = useState(property.rooms[1]?.id ?? '');
  const [kind, setKind] = useState<RoomConnection['kind']>('door');
  return (
    <Modal
      title="Connect rooms"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn primary"
            disabled={!a || !b || a === b}
            onClick={() => {
              updateProperty(property.id, (x) => ({ ...x, connections: [...x.connections, { id: uid('cn_'), a, b, kind }] }));
              onClose();
            }}
          >
            Connect
          </button>
        </>
      }
    >
      <label className="field">From<select value={a} onChange={(e) => setA(e.target.value)}>{property.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <label className="field">To<select value={b} onChange={(e) => setB(e.target.value)}>{property.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <label className="field">
        Through
        <select value={kind} onChange={(e) => setKind(e.target.value as RoomConnection['kind'])}>
          <option value="door">Door</option>
          <option value="opening">Open doorway</option>
          <option value="stairs">Stairs</option>
          <option value="adjacent">Shared wall only</option>
        </select>
      </label>
      <p className="faint">To place rooms side by side on the plan, drag a room in the plan editor: it snaps against its neighbour's wall.</p>
    </Modal>
  );
}
