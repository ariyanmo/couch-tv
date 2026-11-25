import { useMemo, useRef, useState } from 'react';
import type { PageProps } from '../App';
import { roomHasShape } from '../core/calc';
import { safeFileName, downloadBlob } from '../ui/image';
import { dataUrlToBlob } from '../store/backup';
import { Seg } from '../ui/components';
import { Icon } from '../ui/icons';
import { go } from '../ui/router';
import type { SceneOptions } from './three/build3d';
import { ThreeView, type ThreeViewHandle } from './three/ThreeView';

export default function Viewer3D({ property: p }: PageProps) {
  const view = useRef<ThreeViewHandle>(null);
  const [floorId, setFloorId] = useState<string>('all');
  const [walls, setWalls] = useState<SceneOptions['walls']>('cutaway');
  const [ceilings, setCeilings] = useState(false);
  const [furniture, setFurniture] = useState(true);
  const [explode, setExplode] = useState(false);
  const [focus, setFocus] = useState<string>('');
  const [unknown, setUnknown] = useState<string[]>([]);
  const options = useMemo<SceneOptions>(() => ({ floorId, walls, ceilings, furniture, explode, focusRoomId: focus || undefined }), [floorId, walls, ceilings, furniture, explode, focus]);
  const shaped = p.rooms.filter(roomHasShape);

  if (!shaped.length)
    return (
      <div className="empty">
        <h2>No room shapes to build</h2>
        <p>The 3D model is generated from your floor plan. Enter room walls in the scanner first.</p>
        <button className="btn primary" onClick={() => go(`p/${p.id}/scan`)}>Open scanner</button>
      </div>
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="row" style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', gap: 8 }}>
        <Seg value={walls} options={[{ id: 'full', label: 'Walls' }, { id: 'cutaway', label: 'Dollhouse' }, { id: 'hidden', label: 'No walls' }]} onChange={setWalls} />
        <label className="check"><input type="checkbox" checked={ceilings} onChange={(e) => setCeilings(e.target.checked)} disabled={walls !== 'full'} /> Ceilings</label>
        <label className="check"><input type="checkbox" checked={furniture} onChange={(e) => setFurniture(e.target.checked)} /> Furniture</label>
        {p.floors.length > 1 && (
          <>
            <select value={floorId} onChange={(e) => setFloorId(e.target.value)} aria-label="Floors">
              <option value="all">All floors</option>
              {p.floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <label className="check"><input type="checkbox" checked={explode} onChange={(e) => setExplode(e.target.checked)} /> Separate floors</label>
          </>
        )}
        <select value={focus} onChange={(e) => { setFocus(e.target.value); if (e.target.value) setTimeout(() => view.current?.focusRoom(e.target.value), 50); }} aria-label="Room view">
          <option value="">Whole property</option>
          {shaped.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <span className="spacer" />
        <button className="btn sm" onClick={() => view.current?.topView()}>Top</button>
        <button className="btn sm" onClick={() => view.current?.resetCamera()}><Icon name="fit" /> Reset</button>
        <button className="btn sm" onClick={() => {
          const url = view.current?.snapshot(1920, 1200);
          if (url) downloadBlob(dataUrlToBlob(url), `${safeFileName(p.name)}-3d.png`);
        }}><Icon name="download" /> PNG</button>
      </div>
      <div style={{ flex: 1, position: 'relative', minHeight: 420 }}>
        <ThreeView ref={view} property={p} options={options} onBuilt={(b) => setUnknown((u) => (u.join() === b.unknownCeilingRooms.join() ? u : b.unknownCeilingRooms))} />
        <div className="legend">
          <span className="hint">Drag to rotate · pinch or scroll to zoom · two fingers to pan</span>
          {unknown.length > 0 && <span style={{ color: 'var(--estimated)' }}>Ceiling height missing (shown at the floor's default, translucent): {unknown.join(', ')}</span>}
        </div>
      </div>
    </div>
  );
}
