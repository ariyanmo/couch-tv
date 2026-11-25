import { useState } from 'react';
import type { PageProps } from '../App';
import { uid } from '../core/model';
import type { Condition, InspectionCategory, InspectionItem, Property } from '../core/types';
import { addPhoto, updateProperty, useStore } from '../store/store';
import { FileButton, Modal, PhotoThumb, Seg } from '../ui/components';
import { Icon } from '../ui/icons';
import { resizeImage } from '../ui/image';

export const CATEGORIES: { id: InspectionCategory; label: string }[] = [
  { id: 'damage', label: 'Visible damage' },
  { id: 'outdated', label: 'Outdated finish' },
  { id: 'flooring', label: 'Flooring condition' },
  { id: 'walls', label: 'Wall condition' },
  { id: 'ceiling', label: 'Ceiling condition' },
  { id: 'windows', label: 'Window condition' },
  { id: 'kitchen', label: 'Kitchen condition' },
  { id: 'bathroom', label: 'Bathroom condition' },
  { id: 'opportunity', label: 'Renovation opportunity' },
  { id: 'other', label: 'Other' },
];
export const CONDITIONS: { id: Condition; label: string; cls: string }[] = [
  { id: 'good', label: 'Good', cls: 'measured' },
  { id: 'fair', label: 'Fair', cls: 'drawn' },
  { id: 'poor', label: 'Poor', cls: 'estimated' },
  { id: 'damaged', label: 'Damaged', cls: 'unknown' },
  { id: 'na', label: 'n/a', cls: 'plain' },
];

export default function Inspection({ property: p }: PageProps) {
  const [tab, setTab] = useState<'observation' | 'professional'>('observation');
  const [room, setRoom] = useState<string>('all');
  const [edit, setEdit] = useState<InspectionItem | null>(null);
  const items = p.inspection.filter((i) => i.source === tab && (room === 'all' || (room === 'whole' ? !i.roomId : i.roomId === room)));
  const roomName = (id?: string) => (id ? p.rooms.find((r) => r.id === id)?.name ?? 'Deleted room' : 'Whole property');
  const counts = CONDITIONS.map((c) => ({ ...c, n: p.inspection.filter((i) => i.source === tab && i.condition === c.id).length }));

  const blank = (): InspectionItem => ({
    id: uid('i_'),
    roomId: room !== 'all' && room !== 'whole' ? room : p.rooms[0]?.id,
    category: 'damage',
    condition: 'fair',
    title: '',
    note: '',
    photoIds: [],
    source: tab,
    createdAt: Date.now(),
  });

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="note warn">
        <b>Your observations are not a building inspection.</b> They are visual notes you make while walking through. Findings from a licensed inspector
        go under “Professional findings”, are entered from their report, and are never mixed with your own notes in summaries or exports.
      </div>
      <div className="row between">
        <Seg value={tab} options={[{ id: 'observation', label: `My observations (${p.inspection.filter((i) => i.source === 'observation').length})` }, { id: 'professional', label: `Professional findings (${p.inspection.filter((i) => i.source === 'professional').length})` }]} onChange={setTab} />
        <div className="row">
          <select value={room} onChange={(e) => setRoom(e.target.value)} aria-label="Room filter">
            <option value="all">All rooms</option>
            <option value="whole">Whole property</option>
            {p.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button className="btn primary" onClick={() => setEdit(blank())} data-testid="add-inspection"><Icon name="plus" /> {tab === 'observation' ? 'Observation' : 'Finding'}</button>
        </div>
      </div>
      <div className="row">
        {counts.filter((c) => c.n).map((c) => <span key={c.id} className={`chip ${c.cls}`}>{c.label}: {c.n}</span>)}
      </div>
      {items.length === 0 ? (
        <div className="card empty" style={{ padding: 30 }}>
          <p>{tab === 'observation' ? 'No observations yet. Walk each room and note damage, dated finishes and opportunities.' : 'No professional findings entered. If you have an inspector’s report, add its findings here with the report reference.'}</p>
        </div>
      ) : (
        <div className="grid auto">
          {items.sort((a, b) => b.createdAt - a.createdAt).map((i) => {
            const c = CONDITIONS.find((x) => x.id === i.condition)!;
            return (
              <div key={i.id} className="card click stack" onClick={() => setEdit(i)}>
                <div className="row between">
                  <span className="faint" style={{ fontSize: 12.5 }}>{roomName(i.roomId)} · {CATEGORIES.find((x) => x.id === i.category)?.label}</span>
                  <span className={`chip ${c.cls}`}>{c.label}</span>
                </div>
                <h3>{i.title || 'Untitled'}</h3>
                {i.note && <p className="muted" style={{ fontSize: 13.5 }}>{i.note}</p>}
                {i.source === 'professional' && <span className="faint" style={{ fontSize: 12.5 }}>{i.inspector || 'Inspector not recorded'}{i.reportRef ? ` · ref ${i.reportRef}` : ''}</span>}
                {i.photoIds.length > 0 && (
                  <div className="thumb-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(70px,1fr))' }}>
                    {i.photoIds.slice(0, 4).map((id) => <PhotoThumb key={id} id={id} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {edit && <EditItem property={p} item={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EditItem({ property: p, item, onClose }: { property: Property; item: InspectionItem; onClose: () => void }) {
  const [it, setIt] = useState(item);
  const photos = useStore((s) => s.photos.filter((x) => x.propertyId === p.id && (!it.roomId || x.roomId === it.roomId)));
  const exists = p.inspection.some((x) => x.id === item.id);
  const save = () => {
    updateProperty(p.id, (x) => ({ ...x, inspection: exists ? x.inspection.map((i) => (i.id === it.id ? it : i)) : [...x.inspection, it] }));
    onClose();
  };
  return (
    <Modal
      title={exists ? 'Edit note' : it.source === 'observation' ? 'New observation' : 'New professional finding'}
      onClose={onClose}
      footer={
        <>
          {exists && <button className="btn danger" onClick={() => { updateProperty(p.id, (x) => ({ ...x, inspection: x.inspection.filter((i) => i.id !== it.id) })); onClose(); }}>Delete</button>}
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save} data-testid="save-inspection">Save</button>
        </>
      }
    >
      <div className="grid cols-2" style={{ gap: 10 }}>
        <label className="field">Room
          <select value={it.roomId ?? ''} onChange={(e) => setIt({ ...it, roomId: e.target.value || undefined })}>
            <option value="">Whole property</option>
            {p.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <label className="field">Category
          <select value={it.category} onChange={(e) => setIt({ ...it, category: e.target.value as InspectionCategory })}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
      </div>
      <div className="row">
        {CONDITIONS.map((c) => <button key={c.id} className={`btn sm ${it.condition === c.id ? 'active' : ''}`} onClick={() => setIt({ ...it, condition: c.id })}>{c.label}</button>)}
      </div>
      <label className="field">Title<input value={it.title} onChange={(e) => setIt({ ...it, title: e.target.value })} placeholder="e.g. Water stain on ceiling near window" autoFocus /></label>
      <label className="field">Notes<textarea value={it.note} onChange={(e) => setIt({ ...it, note: e.target.value })} /></label>
      {it.source === 'professional' && (
        <div className="grid cols-2" style={{ gap: 10 }}>
          <label className="field">Inspector / company<input value={it.inspector ?? ''} onChange={(e) => setIt({ ...it, inspector: e.target.value })} /></label>
          <label className="field">Report reference<input value={it.reportRef ?? ''} onChange={(e) => setIt({ ...it, reportRef: e.target.value })} /></label>
        </div>
      )}
      <div className="stack" style={{ gap: 8 }}>
        <div className="row between">
          <span className="muted" style={{ fontSize: 13 }}>Photos ({it.photoIds.length})</span>
          <FileButton accept="image/*" multiple capture={undefined} onFiles={async (files) => {
            const ids: string[] = [];
            for (const f of files) {
              const b = await resizeImage(f, 2400, 0.88).catch(() => f);
              ids.push((await addPhoto(p.id, b, { name: f.name, roomId: it.roomId, assignedBy: 'user', tags: ['inspection'] })).id);
            }
            setIt((x) => ({ ...x, photoIds: [...x.photoIds, ...ids] }));
          }} className="btn sm"><Icon name="camera" /> Add photo</FileButton>
        </div>
        {photos.length > 0 && (
          <div className="thumb-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(80px,1fr))' }}>
            {photos.map((ph) => (
              <PhotoThumb key={ph.id} id={ph.id} selected={it.photoIds.includes(ph.id)} onClick={() => setIt({ ...it, photoIds: it.photoIds.includes(ph.id) ? it.photoIds.filter((x) => x !== ph.id) : [...it.photoIds, ph.id] })} />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
