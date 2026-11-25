import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { PageProps } from '../App';
import { roomHasShape } from '../core/calc';
import { STAGING_STYLES, catalogById, type StagingStyle } from '../core/catalog';
import { doorSwings } from '../core/copilot';
import { bounds, findFit, orientedRect } from '../core/geometry';
import { createConcept, createFurniture, uid } from '../core/model';
import type { FurnitureItem, Property, Room } from '../core/types';
import { addPhoto, toast, updateRoom, useStore } from '../store/store';
import { fmtLen } from '../core/units';
import { FileButton, PhotoThumb, usePhotoUrl } from '../ui/components';
import { Icon } from '../ui/icons';
import { downloadBlob, loadImage, resizeImage, safeFileName } from '../ui/image';
import { go } from '../ui/router';

type StickerKind = 'sofa' | 'armchair' | 'coffee-table' | 'bed' | 'side-table' | 'dining' | 'plant' | 'lamp' | 'rug' | 'art' | 'shelf';

interface Sticker {
  id: string;
  kind: StickerKind;
  x: number; // 0..1 of image width (centre)
  y: number; // 0..1 of image height (bottom)
  s: number; // width as fraction of image width
  flip?: boolean;
}

const STICKERS: { kind: StickerKind; label: string; aspect: number; base: number }[] = [
  { kind: 'sofa', label: 'Sofa', aspect: 0.42, base: 0.42 },
  { kind: 'armchair', label: 'Armchair', aspect: 0.95, base: 0.16 },
  { kind: 'coffee-table', label: 'Coffee table', aspect: 0.32, base: 0.22 },
  { kind: 'bed', label: 'Bed', aspect: 0.45, base: 0.5 },
  { kind: 'side-table', label: 'Side table', aspect: 1.1, base: 0.08 },
  { kind: 'dining', label: 'Dining set', aspect: 0.5, base: 0.4 },
  { kind: 'plant', label: 'Plant', aspect: 2.2, base: 0.09 },
  { kind: 'lamp', label: 'Floor lamp', aspect: 3.4, base: 0.07 },
  { kind: 'rug', label: 'Rug', aspect: 0.22, base: 0.5 },
  { kind: 'art', label: 'Wall art', aspect: 0.7, base: 0.2 },
  { kind: 'shelf', label: 'Shelving', aspect: 1.6, base: 0.18 },
];

/** Front-view vector furniture, drawn in a w×h box whose bottom is the floor line. */
function drawSticker(g: CanvasRenderingContext2D, kind: StickerKind, w: number, h: number, st: StagingStyle) {
  const [c1, c2, accent, light] = st.palette;
  const wood = c2;
  const fabric = kind === 'bed' ? light : c1 === '#f2f0eb' || c1 === '#efe8dc' ? '#b9b2a6' : c1;
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.35)';
  g.shadowBlur = h * 0.08;
  g.shadowOffsetY = h * 0.03;
  const rr = (x: number, y: number, ww: number, hh: number, r: number, fill: string) => {
    g.fillStyle = fill;
    g.beginPath();
    g.roundRect(x, y, ww, hh, r);
    g.fill();
  };
  switch (kind) {
    case 'sofa':
      rr(0, h * 0.25, w, h * 0.55, h * 0.12, fabric);
      rr(w * 0.02, h * 0.5, w * 0.96, h * 0.32, h * 0.08, shade(fabric, 0.1));
      rr(0, h * 0.4, w * 0.1, h * 0.45, h * 0.06, shade(fabric, -0.08));
      rr(w * 0.9, h * 0.4, w * 0.1, h * 0.45, h * 0.06, shade(fabric, -0.08));
      rr(w * 0.06, h * 0.85, w * 0.03, h * 0.15, 2, wood);
      rr(w * 0.91, h * 0.85, w * 0.03, h * 0.15, 2, wood);
      rr(w * 0.2, h * 0.32, w * 0.16, h * 0.22, h * 0.05, accent);
      break;
    case 'armchair':
      rr(0, h * 0.15, w, h * 0.65, h * 0.14, fabric);
      rr(w * 0.12, h * 0.5, w * 0.76, h * 0.25, h * 0.06, shade(fabric, 0.1));
      rr(w * 0.12, h * 0.8, w * 0.06, h * 0.2, 2, wood);
      rr(w * 0.82, h * 0.8, w * 0.06, h * 0.2, 2, wood);
      break;
    case 'coffee-table':
      rr(0, 0, w, h * 0.22, h * 0.08, wood);
      rr(w * 0.08, h * 0.2, w * 0.05, h * 0.8, 2, shade(wood, -0.2));
      rr(w * 0.87, h * 0.2, w * 0.05, h * 0.8, 2, shade(wood, -0.2));
      rr(w * 0.35, -h * 0.25, w * 0.12, h * 0.25, 3, accent);
      break;
    case 'bed':
      rr(0, 0, w, h * 0.55, h * 0.06, shade(wood, 0.05));
      rr(w * 0.02, h * 0.5, w * 0.96, h * 0.3, h * 0.06, '#f3f1ec');
      rr(w * 0.1, h * 0.38, w * 0.35, h * 0.18, h * 0.08, '#ffffff');
      rr(w * 0.55, h * 0.38, w * 0.35, h * 0.18, h * 0.08, '#ffffff');
      rr(w * 0.02, h * 0.62, w * 0.96, h * 0.2, h * 0.05, accent);
      rr(0, h * 0.8, w, h * 0.2, h * 0.04, shade(wood, -0.2));
      break;
    case 'side-table':
      rr(0, 0, w, h * 0.12, 3, wood);
      rr(w * 0.1, h * 0.12, w * 0.8, h * 0.45, 3, shade(wood, -0.1));
      rr(w * 0.15, h * 0.57, w * 0.07, h * 0.43, 2, shade(wood, -0.25));
      rr(w * 0.78, h * 0.57, w * 0.07, h * 0.43, 2, shade(wood, -0.25));
      break;
    case 'dining':
      rr(w * 0.1, h * 0.35, w * 0.8, h * 0.06, 3, wood);
      rr(w * 0.15, h * 0.41, w * 0.03, h * 0.59, 2, shade(wood, -0.2));
      rr(w * 0.82, h * 0.41, w * 0.03, h * 0.59, 2, shade(wood, -0.2));
      for (const cx of [0, 0.86]) {
        rr(w * cx, h * 0.05, w * 0.14, h * 0.5, 4, fabric);
        rr(w * cx, h * 0.5, w * 0.14, h * 0.06, 3, shade(fabric, -0.1));
        rr(w * (cx + 0.01), h * 0.56, w * 0.02, h * 0.44, 2, shade(wood, -0.25));
        rr(w * (cx + 0.11), h * 0.56, w * 0.02, h * 0.44, 2, shade(wood, -0.25));
      }
      break;
    case 'plant': {
      rr(w * 0.22, h * 0.7, w * 0.56, h * 0.3, w * 0.08, light === '#e7e4df' ? '#d8d2c8' : light);
      g.fillStyle = '#4f6b4a';
      for (let i = 0; i < 9; i++) {
        g.beginPath();
        const a = -Math.PI / 2 + (i - 4) * 0.28;
        g.ellipse(w / 2 + Math.cos(a) * w * 0.25, h * 0.45 + Math.sin(a) * h * 0.25, w * 0.13, h * 0.2, a + Math.PI / 2, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'lamp':
      rr(w * 0.47, h * 0.2, w * 0.06, h * 0.78, 2, '#222');
      rr(w * 0.2, h * 0.96, w * 0.6, h * 0.04, 2, '#222');
      g.fillStyle = accent;
      g.beginPath();
      g.moveTo(w * 0.15, h * 0.25);
      g.lineTo(w * 0.85, h * 0.25);
      g.lineTo(w * 0.7, 0);
      g.lineTo(w * 0.3, 0);
      g.closePath();
      g.fill();
      break;
    case 'rug':
      g.shadowBlur = 0;
      g.fillStyle = shade(accent, 0.25);
      g.beginPath();
      g.moveTo(w * 0.12, 0);
      g.lineTo(w * 0.88, 0);
      g.lineTo(w, h);
      g.lineTo(0, h);
      g.closePath();
      g.globalAlpha = 0.85;
      g.fill();
      break;
    case 'art':
      rr(0, 0, w, h, 2, shade(wood, -0.3));
      rr(w * 0.06, h * 0.08, w * 0.88, h * 0.84, 1, light);
      g.fillStyle = accent;
      g.beginPath();
      g.arc(w * 0.38, h * 0.45, h * 0.2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = c1;
      g.fillRect(w * 0.5, h * 0.3, w * 0.3, h * 0.45);
      break;
    case 'shelf':
      for (let i = 0; i < 5; i++) rr(0, (h * i) / 4.2, w, h * 0.04, 1, wood);
      rr(0, 0, w * 0.04, h, 1, wood);
      rr(w * 0.96, 0, w * 0.04, h, 1, wood);
      for (let i = 0; i < 4; i++) for (let k = 0; k < 5; k++) rr(w * (0.08 + k * 0.17), h * (i / 4.2) + h * 0.06, w * 0.08, h * 0.16, 1, [c1, accent, light, c2][(i + k) % 4]);
      break;
  }
  g.restore();
}

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + (amt > 0 ? (255 - v) * amt : v * amt))));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export async function renderStaged(src: string, style: StagingStyle, stickers: Sticker[], maxW = 2000): Promise<HTMLCanvasElement> {
  const img = await loadImage(src);
  const k = Math.min(1, maxW / img.naturalWidth);
  const W = Math.round(img.naturalWidth * k);
  const H = Math.round(img.naturalHeight * k);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const f = style.filter;
  g.filter = `brightness(${f.brightness}) contrast(${f.contrast}) saturate(${f.saturate})`;
  g.drawImage(img, 0, 0, W, H);
  g.filter = 'none';
  if (f.warmth) {
    g.globalCompositeOperation = 'soft-light';
    g.fillStyle = `rgba(255,170,90,${f.warmth * 2})`;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
  }
  const order = [...stickers].sort((a, b) => (a.kind === 'rug' ? -1 : b.kind === 'rug' ? 1 : a.y - b.y));
  for (const s of order) {
    const meta = STICKERS.find((m) => m.kind === s.kind)!;
    const w = s.s * W;
    const h = w * meta.aspect;
    g.save();
    g.translate(s.x * W, s.y * H - h);
    if (s.flip) {
      g.translate(w, 0);
      g.scale(-1, 1);
    }
    drawSticker(g, s.kind, w, h, style);
    g.restore();
  }
  // Honest disclosure on every staged image.
  const pad = Math.round(W * 0.012);
  const fs = Math.max(12, Math.round(W * 0.016));
  g.font = `600 ${fs}px Inter, -apple-system, sans-serif`;
  const label = `Virtual staging concept · ${style.name}`;
  const tw = g.measureText(label).width;
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(pad, H - pad - fs * 1.8, tw + fs * 1.2, fs * 1.8);
  g.fillStyle = '#fff';
  g.fillText(label, pad + fs * 0.6, H - pad - fs * 0.55);
  return c;
}

export default function Staging({ property: p }: PageProps) {
  const photos = useStore((s) => s.photos.filter((x) => x.propertyId === p.id && !x.tags.includes('staged')));
  const [photoId, setPhotoId] = useState<string | undefined>(photos[0]?.id);
  const [styleId, setStyleId] = useState(STAGING_STYLES[0].id);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const url = usePhotoUrl(photoId, 'blob');
  const style = STAGING_STYLES.find((s) => s.id === styleId)!;
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const photo = photos.find((x) => x.id === photoId);

  useEffect(() => {
    let live = true;
    if (!url) {
      setPreview(null);
      return;
    }
    renderStaged(url, style, stickers, 1400).then((c) => live && setPreview(c.toDataURL('image/jpeg', 0.85)));
    return () => {
      live = false;
    };
  }, [url, style, stickers]);

  const onDown = (e: RPointerEvent, s: Sticker) => {
    e.stopPropagation();
    setSel(s.id);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { id: s.id, sx: e.clientX, sy: e.clientY, ox: s.x, oy: s.y };
  };
  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d || !box.current) return;
    const r = box.current.getBoundingClientRect();
    setStickers((all) => all.map((s) => (s.id === d.id ? { ...s, x: d.ox + (e.clientX - d.sx) / r.width, y: d.oy + (e.clientY - d.sy) / r.height } : s)));
  };
  const selected = stickers.find((s) => s.id === sel);

  const stage3D = (room: Room) => {
    const ids = style.furnitureByRoom[room.type] ?? style.furnitureByRoom.living ?? [];
    const placed: FurnitureItem[] = [];
    const missing: string[] = [];
    for (const id of ids) {
      const c = catalogById(id);
      if (!c) continue;
      const obstacles = [...doorSwings(room), ...placed.filter((f) => f.kind !== 'rug').map((f) => orientedRect(f.x, f.y, f.w, f.d, f.rotation))];
      const fit = findFit(room.polygon, c.w, c.d, { obstacles: c.kind === 'rug' ? doorSwings(room) : obstacles, step: 100 });
      if (!fit.fits) {
        missing.push(c.name);
        continue;
      }
      const item = createFurniture(id, fit.position!)!;
      item.rotation = fit.rotation ?? 0;
      item.color = c.kind === 'sofa' || c.kind === 'chair' ? style.palette[0] : c.kind === 'table' || c.kind === 'desk' ? style.palette[1] : item.color;
      placed.push(item);
    }
    const concept = { ...createConcept(room, `${style.name} staging`), furniture: placed, finishes: { ...room.finishes, wallColor: style.wall, floorMaterial: style.floor } };
    updateRoom(p.id, room.id, (r) => ({ ...r, concepts: [...r.concepts, concept], activeConceptId: concept.id }));
    toast(missing.length ? `Staged ${placed.length} pieces. Did not fit: ${missing.join(', ')}.` : `Staged ${placed.length} pieces in ${room.name}.`, missing.length ? 'warn' : 'ok');
    go(`p/${p.id}/studio`);
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="note gold">
        Staging here is done on your device: colour grading for the style plus furniture you place over the photo, or a fully furnished 3D room. No paid
        AI service is used. Every staged image carries a “Virtual staging concept” label, because many listing rules require staged photos to be disclosed.
      </div>
      <div className="row" style={{ gap: 8 }}>
        {STAGING_STYLES.map((s) => (
          <button key={s.id} className={`btn ${s.id === styleId ? 'active' : ''}`} onClick={() => setStyleId(s.id)} title={s.description}>
            <span style={{ display: 'inline-flex', gap: 2 }}>{s.palette.map((c) => <i key={c} style={{ width: 8, height: 14, background: c, borderRadius: 2, display: 'inline-block' }} />)}</span>
            {s.name}
          </button>
        ))}
      </div>
      <div className="grid main-side">
        <div className="card stack">
          {!url ? (
            <div className="empty" style={{ padding: 30 }}>
              <h2>Choose a room photo</h2>
              <FileButton accept="image/*" onFiles={async (f) => {
                const blob = await resizeImage(f[0], 2400, 0.88).catch(() => f[0]);
                const m = await addPhoto(p.id, blob, { name: f[0].name, assignedBy: 'user' });
                setPhotoId(m.id);
              }} className="btn primary"><Icon name="upload" /> Upload photo</FileButton>
            </div>
          ) : (
            <div ref={box} style={{ position: 'relative', userSelect: 'none', touchAction: 'none' }} onPointerMove={onMove} onPointerUp={() => (drag.current = null)} onPointerDown={() => setSel(null)} data-testid="staging-canvas">
              {preview && <img src={preview} alt="Staged preview" style={{ width: '100%', display: 'block', borderRadius: 10 }} />}
              {stickers.map((s) => {
                const meta = STICKERS.find((m) => m.kind === s.kind)!;
                const r = box.current?.getBoundingClientRect();
                const aspectImg = photo && photo.width ? photo.height / photo.width : 0.75;
                const hFrac = (s.s * meta.aspect) / aspectImg;
                return (
                  <div key={s.id} onPointerDown={(e) => onDown(e, s)} style={{ position: 'absolute', left: `${(s.x) * 100}%`, top: `${(s.y - hFrac) * 100}%`, width: `${s.s * 100}%`, height: `${hFrac * 100}%`, outline: s.id === sel ? '2px dashed #c8a96a' : '1px dashed rgba(255,255,255,0.15)', cursor: 'move', touchAction: 'none' }} data-w={r?.width} />
                );
              })}
            </div>
          )}
          {url && (
            <div className="row">
              {STICKERS.map((m) => (
                <button key={m.kind} className="btn sm" onClick={() => {
                  const s: Sticker = { id: uid('st_'), kind: m.kind, x: 0.5 - m.base / 2, y: m.kind === 'art' ? 0.4 : 0.85, s: m.base };
                  setStickers([...stickers, s]);
                  setSel(s.id);
                }}>{m.label}</button>
              ))}
            </div>
          )}
          {selected && (
            <div className="row">
              <span className="muted">Size</span>
              <input type="range" min={0.03} max={0.9} step={0.005} value={selected.s} onChange={(e) => setStickers(stickers.map((s) => (s.id === selected.id ? { ...s, s: +e.target.value } : s)))} style={{ flex: 1 }} aria-label="Size" />
              <button className="btn sm" onClick={() => setStickers(stickers.map((s) => (s.id === selected.id ? { ...s, flip: !s.flip } : s)))}>Flip</button>
              <button className="btn sm" onClick={() => setStickers([...stickers.filter((s) => s.id !== selected.id), selected])}>Bring forward</button>
              <button className="btn sm danger" onClick={() => { setStickers(stickers.filter((s) => s.id !== selected.id)); setSel(null); }}><Icon name="trash" /></button>
            </div>
          )}
          {url && (
            <div className="row">
              <button className="btn primary" onClick={async () => {
                const c = await renderStaged(url, style, stickers);
                const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.9));
                await addPhoto(p.id, blob, { name: `Staged ${style.name} ${photo?.name ?? ''}`.trim(), roomId: photo?.roomId, tags: ['staged'], assignedBy: 'user' });
                toast('Saved to Photos, labelled as staged.');
              }}><Icon name="check" /> Save to photos</button>
              <button className="btn" onClick={async () => {
                const c = await renderStaged(url, style, stickers);
                c.toBlob((b) => b && downloadBlob(b, `${safeFileName(p.name)}-staged-${style.id}.png`), 'image/png');
              }}><Icon name="download" /> PNG</button>
              <button className="btn ghost" onClick={() => setStickers([])}>Clear furniture</button>
            </div>
          )}
        </div>
        <div className="stack">
          <div className="card stack">
            <h3>Photos</h3>
            <FileButton accept="image/*" multiple onFiles={async (files) => {
              for (const f of files) {
                const blob = await resizeImage(f, 2400, 0.88).catch(() => f);
                const m = await addPhoto(p.id, blob, { name: f.name, assignedBy: 'user' });
                setPhotoId(m.id);
              }
            }} className="btn sm"><Icon name="upload" /> Upload</FileButton>
            <div className="thumb-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(90px,1fr))' }}>
              {photos.map((ph) => <PhotoThumb key={ph.id} id={ph.id} selected={ph.id === photoId} onClick={() => setPhotoId(ph.id)} />)}
            </div>
          </div>
          <Stage3DCard property={p} style={style} onStage={stage3D} />
        </div>
      </div>
    </div>
  );
}

function Stage3DCard({ property, style, onStage }: { property: Property; style: StagingStyle; onStage: (r: Room) => void }) {
  const rooms = property.rooms.filter(roomHasShape);
  const [rid, setRid] = useState(rooms[0]?.id ?? '');
  const room = rooms.find((r) => r.id === rid);
  return (
    <div className="card stack">
      <h3>Stage a room in 3D</h3>
      <p className="muted" style={{ fontSize: 13.5 }}>
        Creates a “{style.name}” concept for a measured room: style colours and floor, and a furniture set placed only where each piece actually fits.
      </p>
      {rooms.length ? (
        <>
          <select value={rid} onChange={(e) => setRid(e.target.value)} aria-label="Room to stage">
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button className="btn" disabled={!room} onClick={() => room && onStage(room)} data-testid="stage-3d"><Icon name="cube" /> Stage in 3D</button>
          {room && <span className="faint" style={{ fontSize: 12.5 }}>Room is {fmtLen(bounds(room.polygon).w, property.units)} × {fmtLen(bounds(room.polygon).h, property.units)} overall.</span>}
        </>
      ) : (
        <p className="faint">Needs a room with a recorded shape.</p>
      )}
    </div>
  );
}
