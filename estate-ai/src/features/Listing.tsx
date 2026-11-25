import { useMemo, useRef, useState } from 'react';
import type { PageProps } from '../App';
import { roomHasShape, totalInteriorArea } from '../core/calc';
import { buildDescription } from '../core/copilot';
import { areaDisclaimer, roomDescription } from '../core/listing';
import { STATUS_LABEL, fmtArea } from '../core/units';
import { getExportBlob } from '../store/db';
import { toast, updateProperty, updateRoom, useStore } from '../store/store';
import { PhotoThumb, StatusChip } from '../ui/components';
import { Icon } from '../ui/icons';
import { downloadBlob, safeFileName, svgToPngBlob } from '../ui/image';
import { renderPlanSvg } from './plan/export';
import type { SceneOptions } from './three/build3d';
import { ThreeView, type ThreeViewHandle } from './three/ThreeView';

export default function Listing({ property: p }: PageProps) {
  const photos = useStore((s) => s.photos.filter((x) => x.propertyId === p.id));
  const [inc, setInc] = useState({ plans: true, rooms: true, photos: true, render: true });
  const [busy, setBusy] = useState<string | null>(null);
  const [hl, setHl] = useState('');
  const view = useRef<ThreeViewHandle>(null);
  const chosen = p.listingPhotoIds ?? photos.filter((x) => x.roomId).slice(0, 12).map((x) => x.id);
  const total = totalInteriorArea(p);
  const shaped = p.rooms.some(roomHasShape);
  const opts3d = useMemo<SceneOptions>(() => ({ floorId: 'all', walls: 'cutaway', ceilings: false, furniture: true, explode: false }), []);
  const upd = (fn: (x: typeof p) => typeof p) => updateProperty(p.id, fn, { history: false });

  const pdf = async () => {
    setBusy('pdf');
    try {
      const { buildListingPdf, recordExport } = await import('./listing/pdf');
      const render3d = inc.render && shaped ? view.current?.snapshot(1600, 1000) ?? null : null;
      const blob = await buildListingPdf(p, { plans: inc.plans, rooms: inc.rooms, photos: inc.photos, description: p.description || buildDescription(p), highlights: p.highlights ?? [], photoIds: chosen, render3d, coverId: p.coverPhotoId });
      const name = `${safeFileName(p.name)}-presentation.pdf`;
      downloadBlob(blob, name);
      await recordExport(p, blob, name, 'pdf');
      toast('Presentation PDF created.');
    } catch (e) {
      console.error(e);
      toast('Could not create the PDF: ' + (e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const pngPlans = async () => {
    setBusy('png');
    try {
      const { recordExport } = await import('./listing/pdf');
      for (const f of p.floors) {
        if (!p.rooms.some((r) => r.floorId === f.id && roomHasShape(r))) continue;
        const { svg, width, height } = renderPlanSvg(p, f.id, { pxWidth: 2400, showFurniture: false });
        const blob = await svgToPngBlob(svg, width, height);
        const name = `${safeFileName(p.name)}-${safeFileName(f.name)}-plan.png`;
        downloadBlob(blob, name);
        await recordExport(p, blob, name, 'png');
      }
      toast('Floor plan PNGs created.');
    } finally {
      setBusy(null);
    }
  };

  const svgPlans = async () => {
    const { recordExport } = await import('./listing/pdf');
    for (const f of p.floors) {
      if (!p.rooms.some((r) => r.floorId === f.id && roomHasShape(r))) continue;
      const { svg } = renderPlanSvg(p, f.id);
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const name = `${safeFileName(p.name)}-${safeFileName(f.name)}-plan.svg`;
      downloadBlob(blob, name);
      await recordExport(p, blob, name, 'svg');
    }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="grid main-side">
        <div className="stack">
          <div className="card stack">
            <div className="card-title">
              <h3>Description</h3>
              <button className="btn sm" onClick={() => upd((x) => ({ ...x, description: buildDescription(x) }))}><Icon name="sparkle" /> Write from data</button>
            </div>
            <textarea rows={6} value={p.description ?? ''} onChange={(e) => upd((x) => ({ ...x, description: e.target.value }))} placeholder="Click “Write from data” for a factual draft built from your rooms and measurements, then edit it." />
            <p className="faint" style={{ fontSize: 12.5 }}>The draft only states what is recorded. Anything you add by hand is your responsibility to check.</p>
          </div>
          <div className="card stack">
            <h3>Highlights</h3>
            {(p.highlights ?? []).map((h, i) => (
              <div key={i} className="row nowrap">
                <input value={h} onChange={(e) => upd((x) => ({ ...x, highlights: (x.highlights ?? []).map((y, k) => (k === i ? e.target.value : y)) }))} style={{ flex: 1 }} />
                <button className="btn sm ghost icon" aria-label="Remove" onClick={() => upd((x) => ({ ...x, highlights: (x.highlights ?? []).filter((_, k) => k !== i) }))}><Icon name="close" /></button>
              </div>
            ))}
            <form className="row nowrap" onSubmit={(e) => { e.preventDefault(); if (hl.trim()) { upd((x) => ({ ...x, highlights: [...(x.highlights ?? []), hl.trim()] })); setHl(''); } }}>
              <input value={hl} onChange={(e) => setHl(e.target.value)} placeholder="e.g. Renovated kitchen 2023" style={{ flex: 1 }} />
              <button className="btn sm" type="submit"><Icon name="plus" /> Add</button>
            </form>
          </div>
          <div className="card stack">
            <h3>Room descriptions</h3>
            {p.rooms.map((r) => (
              <label key={r.id} className="field">
                {r.name}
                <input value={r.listingText ?? ''} placeholder={roomDescription(p, { ...r, listingText: undefined })} onChange={(e) => updateRoom(p.id, r.id, (x) => ({ ...x, listingText: e.target.value }), { history: false })} />
              </label>
            ))}
            <p className="faint" style={{ fontSize: 12.5 }}>Leave blank to use the automatic description shown in grey.</p>
          </div>
          <div className="card stack">
            <div className="card-title">
              <h3>Photos in the presentation ({chosen.length})</h3>
              <button className="btn sm ghost" onClick={() => upd((x) => ({ ...x, listingPhotoIds: undefined }))}>Reset</button>
            </div>
            {photos.length ? (
              <div className="thumb-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(100px,1fr))' }}>
                {photos.map((ph) => (
                  <PhotoThumb key={ph.id} id={ph.id} selected={chosen.includes(ph.id)} caption={p.coverPhotoId === ph.id ? 'Cover' : undefined} onClick={() => upd((x) => ({ ...x, listingPhotoIds: chosen.includes(ph.id) ? chosen.filter((i) => i !== ph.id) : [...chosen, ph.id] }))} />
                ))}
              </div>
            ) : (
              <p className="muted">No photos yet.</p>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card stack">
            <h3>Export</h3>
            <div className="row between"><span className="muted">Total interior</span><span>{total.status === 'unknown' ? '—' : fmtArea(total.value, p.units)} <StatusChip status={total.status} short /></span></div>
            {total.status !== 'measured' && <div className="note warn" style={{ fontSize: 12.5 }}>Not every dimension is measured. Exports mark unverified areas with * and include a disclaimer.</div>}
            <label className="check"><input type="checkbox" checked={inc.plans} onChange={(e) => setInc({ ...inc, plans: e.target.checked })} /> Floor plans</label>
            <label className="check"><input type="checkbox" checked={inc.rooms} onChange={(e) => setInc({ ...inc, rooms: e.target.checked })} /> Room schedule</label>
            <label className="check"><input type="checkbox" checked={inc.photos} onChange={(e) => setInc({ ...inc, photos: e.target.checked })} /> Photographs</label>
            <label className="check"><input type="checkbox" checked={inc.render} onChange={(e) => setInc({ ...inc, render: e.target.checked })} disabled={!shaped} /> 3D view</label>
            <button className="btn primary" onClick={pdf} disabled={!!busy} data-testid="export-pdf"><Icon name="doc" /> {busy === 'pdf' ? 'Building PDF…' : 'Presentation PDF'}</button>
            <div className="row">
              <button className="btn" onClick={pngPlans} disabled={!!busy || !shaped} data-testid="export-png"><Icon name="image" /> Plans PNG</button>
              <button className="btn" onClick={svgPlans} disabled={!shaped}><Icon name="plan" /> Plans SVG</button>
            </div>
            <button className="btn ghost" onClick={() => window.print()}>Print this page</button>
            <p className="faint" style={{ fontSize: 12 }}>{areaDisclaimer(p)}</p>
          </div>
          {shaped && inc.render && (
            <div className="card" style={{ padding: 0, overflow: 'hidden', height: 240, position: 'relative' }}>
              <ThreeView ref={view} property={p} options={opts3d} />
              <div className="legend"><span>Position the 3D view for the PDF</span></div>
            </div>
          )}
          <div className="card stack">
            <h3>Exported documents ({p.exports.length})</h3>
            {p.exports.length === 0 && <p className="muted">Nothing exported yet.</p>}
            {p.exports.slice(0, 20).map((ex) => (
              <div key={ex.id} className="row between" style={{ fontSize: 13.5 }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{ex.name}</span>
                <span className="faint">{new Date(ex.createdAt).toLocaleDateString()} · {(ex.size / 1024).toFixed(0)} KB</span>
                <button className="btn sm ghost icon" aria-label="Download again" onClick={async () => {
                  const b = await getExportBlob(ex.id);
                  if (b) downloadBlob(b, ex.name);
                  else toast('That file is no longer stored.', 'warn');
                }}><Icon name="download" /></button>
              </div>
            ))}
            <span className="faint" style={{ fontSize: 12 }}>Status: {STATUS_LABEL[total.status]}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
