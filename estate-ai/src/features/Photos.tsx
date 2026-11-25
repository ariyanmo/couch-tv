import { useMemo, useState, type MouseEvent } from 'react';
import type { PageProps } from '../App';
import { uid } from '../core/model';
import { suggestRooms } from '../core/organize';
import type { PhotoMeta, Property } from '../core/types';
import { addPhoto, removePhoto, toast, updatePhoto, updateProperty, useStore } from '../store/store';
import { Confirm, FileButton, Modal, PhotoThumb, usePhotoUrl } from '../ui/components';
import { Icon } from '../ui/icons';
import { resizeImage } from '../ui/image';
import { PlanContent, floorBounds } from './plan/PlanSVG';

export default function Photos({ property: p }: PageProps) {
  const all = useStore((s) => s.photos);
  const photos = useMemo(() => all.filter((x) => x.propertyId === p.id).sort((a, b) => b.takenAt - a.takenAt), [all, p.id]);
  const [filter, setFilter] = useState<string>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState<PhotoMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [coll, setColl] = useState<string | null>(null);
  const suggestions = useMemo(() => suggestRooms(photos, p.rooms), [photos, p.rooms]);
  const list = photos.filter((x) =>
    filter === 'all' ? true : filter === 'unsorted' ? !x.roomId : filter.startsWith('c:') ? p.collections.find((c) => c.id === filter.slice(2))?.photoIds.includes(x.id) : x.roomId === filter,
  );
  const roomName = (id?: string) => p.rooms.find((r) => r.id === id)?.name;
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const upload = async (files: File[]) => {
    setBusy(true);
    let n = 0;
    for (const f of files) {
      const blob = await resizeImage(f, 2400, 0.88).catch(() => f);
      await addPhoto(p.id, blob, { name: f.name, takenAt: f.lastModified || Date.now(), roomId: filter !== 'all' && filter !== 'unsorted' && !filter.startsWith('c:') ? filter : undefined, assignedBy: 'user' });
      n++;
    }
    setBusy(false);
    toast(`${n} photo${n === 1 ? '' : 's'} added.`);
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row between">
        <div className="row">
          <select value={filter} onChange={(e) => { setFilter(e.target.value); setSelected([]); }} aria-label="Filter">
            <option value="all">All photos ({photos.length})</option>
            <option value="unsorted">Unsorted ({photos.filter((x) => !x.roomId).length})</option>
            <optgroup label="Rooms">
              {p.rooms.map((r) => <option key={r.id} value={r.id}>{r.name} ({photos.filter((x) => x.roomId === r.id).length})</option>)}
            </optgroup>
            {p.collections.length > 0 && (
              <optgroup label="Collections">
                {p.collections.map((c) => <option key={c.id} value={'c:' + c.id}>{c.name} ({c.photoIds.length})</option>)}
              </optgroup>
            )}
          </select>
        </div>
        <div className="row">
          <FileButton accept="image/*" multiple onFiles={upload} className="btn primary"><Icon name="upload" /> {busy ? 'Adding…' : 'Upload'}</FileButton>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="note gold row between">
          <span>{suggestions.length} unsorted photo{suggestions.length === 1 ? '' : 's'} can be filed by file name or capture time.</span>
          <button className="btn sm primary" onClick={() => {
            suggestions.forEach((s) => updatePhoto(s.photoId, (m) => ({ ...m, roomId: s.roomId, assignedBy: 'suggestion' })));
            toast(`${suggestions.length} photos filed. Check them under each room.`);
          }}>Accept suggestions</button>
        </div>
      )}

      {selected.length > 0 && (
        <div className="card tight row">
          <b>{selected.length} selected</b>
          <select defaultValue="" onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            selected.forEach((id) => updatePhoto(id, (m) => ({ ...m, roomId: v === '_none' ? undefined : v, assignedBy: 'user' })));
            setSelected([]);
            e.target.value = '';
          }} aria-label="Assign to room">
            <option value="">Assign to room…</option>
            <option value="_none">Unsorted</option>
            {p.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button className="btn sm" onClick={() => setColl('new')}><Icon name="plus" /> Collection</button>
          {p.collections.length > 0 && (
            <select defaultValue="" onChange={(e) => {
              const cid = e.target.value;
              if (!cid) return;
              updateProperty(p.id, (x) => ({ ...x, collections: x.collections.map((c) => (c.id === cid ? { ...c, photoIds: Array.from(new Set([...c.photoIds, ...selected])) } : c)) }));
              toast('Added to collection.');
              e.target.value = '';
            }} aria-label="Add to collection">
              <option value="">Add to collection…</option>
              {p.collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <button className="btn sm ghost" onClick={() => setSelected([])}>Clear</button>
          <span className="spacer" />
          <button className="btn sm danger" onClick={async () => { for (const id of selected) await removePhoto(id); setSelected([]); }}><Icon name="trash" /> Delete</button>
        </div>
      )}

      {filter.startsWith('c:') && (
        <CollectionBar property={p} id={filter.slice(2)} onDeleted={() => setFilter('all')} />
      )}

      {list.length === 0 ? (
        <div className="card empty" style={{ padding: 30 }}>
          <p>No photos here. Capture them room by room in the scanner, or upload existing photos.</p>
        </div>
      ) : (
        <div className="thumb-grid">
          {list.map((ph) => {
            const sug = suggestions.find((s) => s.photoId === ph.id);
            return (
              <div key={ph.id} onContextMenu={(e) => { e.preventDefault(); toggle(ph.id); }}>
                <PhotoThumb
                  id={ph.id}
                  selected={selected.length ? selected.includes(ph.id) : undefined}
                  caption={(roomName(ph.roomId) ?? (sug ? `→ ${roomName(sug.roomId)}?` : 'Unsorted')) + (ph.tags.includes('staged') ? ' · staged' : '')}
                  onClick={() => (selected.length ? toggle(ph.id) : setOpen(ph))}
                />
                <button className="btn sm ghost" style={{ width: '100%', marginTop: 4 }} onClick={() => toggle(ph.id)}>{selected.includes(ph.id) ? 'Selected' : 'Select'}</button>
              </div>
            );
          })}
        </div>
      )}

      {open && <PhotoDetail property={p} photo={photos.find((x) => x.id === open.id) ?? open} onClose={() => setOpen(null)} />}
      {coll === 'new' && <NewCollection onClose={() => setColl(null)} onCreate={(name) => {
        const c = { id: uid('col_'), name, photoIds: selected, createdAt: Date.now() };
        updateProperty(p.id, (x) => ({ ...x, collections: [...x.collections, c] }));
        setSelected([]);
        setFilter('c:' + c.id);
      }} />}
    </div>
  );
}

function CollectionBar({ property: p, id, onDeleted }: { property: Property; id: string; onDeleted: () => void }) {
  const c = p.collections.find((x) => x.id === id);
  const [busy, setBusy] = useState(false);
  if (!c) return null;
  return (
    <div className="card tight row">
      <Icon name="layers" />
      <input value={c.name} onChange={(e) => updateProperty(p.id, (x) => ({ ...x, collections: x.collections.map((cc) => (cc.id === id ? { ...cc, name: e.target.value } : cc)) }), { history: false })} style={{ flex: 1 }} aria-label="Collection name" />
      <button className="btn sm" disabled={busy || !c.photoIds.length} onClick={async () => {
        setBusy(true);
        const { exportCollectionPdf } = await import('./listing/pdf');
        await exportCollectionPdf(p, c);
        setBusy(false);
      }}><Icon name="download" /> PDF</button>
      <button className="btn sm danger" onClick={() => { updateProperty(p.id, (x) => ({ ...x, collections: x.collections.filter((cc) => cc.id !== id) })); onDeleted(); }}><Icon name="trash" /></button>
    </div>
  );
}

function NewCollection({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <Modal title="New collection" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => { onCreate(name.trim() || 'Collection'); onClose(); }}>Create</button></>}>
      <label className="field">Name<input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Listing photos" /></label>
    </Modal>
  );
}

function PhotoDetail({ property: p, photo, onClose }: { property: Property; photo: PhotoMeta; onClose: () => void }) {
  const url = usePhotoUrl(photo.id, 'blob');
  const [del, setDel] = useState(false);
  const room = p.rooms.find((r) => r.id === photo.roomId);
  const floorId = room?.floorId ?? p.floors[0].id;
  const fb = floorBounds(p, floorId);
  const upd = (fn: (m: PhotoMeta) => PhotoMeta) => updatePhoto(photo.id, fn);
  const placePin = (e: MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return;
    const q = pt.matrixTransform(m.inverse());
    if (photo.planPin && Math.hypot(q.x - photo.planPin.x, q.y - photo.planPin.y) < fb.w / 25) {
      upd((x) => ({ ...x, planPin: { ...x.planPin!, dir: (x.planPin!.dir + 45) % 360 } }));
    } else upd((x) => ({ ...x, planPin: { x: q.x, y: q.y, dir: x.planPin?.dir ?? 0 } }));
  };
  return (
    <Modal title={photo.name} onClose={onClose} wide footer={
      <>
        <button className="btn danger" onClick={() => setDel(true)}><Icon name="trash" /> Delete</button>
        <button className="btn" onClick={() => updateProperty(p.id, (x) => ({ ...x, coverPhotoId: photo.id }))}>{p.coverPhotoId === photo.id ? 'Cover photo ✓' : 'Use as cover'}</button>
        <span className="spacer" />
        <button className="btn primary" onClick={onClose}>Done</button>
      </>
    }>
      <div className="grid cols-2">
        <div>{url && <img src={url} alt={photo.name} style={{ width: '100%', borderRadius: 10 }} />}</div>
        <div className="stack">
          <label className="field">Name<input value={photo.name} onChange={(e) => upd((x) => ({ ...x, name: e.target.value }))} /></label>
          <label className="field">Room
            <select value={photo.roomId ?? ''} onChange={(e) => upd((x) => ({ ...x, roomId: e.target.value || undefined, assignedBy: 'user' }))}>
              <option value="">Unsorted</option>
              {p.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="field">Note<textarea value={photo.note ?? ''} onChange={(e) => upd((x) => ({ ...x, note: e.target.value }))} /></label>
          <label className="field">Tags (comma separated)<input value={photo.tags.join(', ')} onChange={(e) => upd((x) => ({ ...x, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) }))} /></label>
          <span className="faint" style={{ fontSize: 12.5 }}>{photo.width}×{photo.height} · taken {new Date(photo.takenAt).toLocaleString()}{photo.shot ? ` · guided shot: ${photo.shot}` : ''}</span>
          <div className="stack" style={{ gap: 6 }}>
            <span className="muted" style={{ fontSize: 13 }}>Where on the plan? Tap to place, tap the pin to turn it.</span>
            <svg viewBox={`${fb.minX} ${fb.minY} ${fb.w} ${fb.h}`} style={{ width: '100%', height: 220, background: '#0d0d0e', borderRadius: 10, cursor: 'crosshair' }} onClick={placePin}>
              <PlanContent property={p} opts={{ floorId, showDims: false, showFurniture: false, selectedRoomId: photo.roomId, pins: photo.planPin ? [{ id: photo.id, ...photo.planPin }] : [] }} />
            </svg>
          </div>
        </div>
      </div>
      {del && <Confirm title="Delete photo?" text="It is removed from this device, from collections and from inspection notes." onYes={async () => { await removePhoto(photo.id); onClose(); }} onClose={() => setDel(false)} />}
    </Modal>
  );
}
