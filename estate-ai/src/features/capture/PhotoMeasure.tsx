import { useRef, useState, type MouseEvent } from 'react';
import { planeDistance, scaleDistance } from '../../core/homography';
import type { Point, UnitSystem } from '../../core/types';
import { fmtLen } from '../../core/units';
import { LengthInput, Modal, Seg, usePhotoUrl } from '../../ui/components';

const REFS = [
  { id: 'a4', label: 'A4 sheet (297 × 210 mm)', w: 297, h: 210 },
  { id: 'letter', label: 'US Letter (11 × 8.5 in)', w: 279.4, h: 215.9 },
  { id: 'card', label: 'Bank card (85.6 × 54 mm)', w: 85.6, h: 53.98 },
  { id: 'custom', label: 'Something I measured', w: 0, h: 0 },
];

export interface MeasureTarget {
  id: string;
  label: string;
}

/**
 * Estimate lengths from a photo using a reference of known size on the same
 * flat surface. Results are always saved as estimates.
 */
export function PhotoMeasure({ photoId, units, targets, onSave, onClose }: { photoId: string; units: UnitSystem; targets: MeasureTarget[]; onSave: (targetId: string, mm: number) => void; onClose: () => void }) {
  const url = usePhotoUrl(photoId, 'blob');
  const img = useRef<HTMLImageElement>(null);
  const [mode, setMode] = useState<'rect' | 'line'>('rect');
  const [refId, setRefId] = useState('a4');
  const [custom, setCustom] = useState<{ w: number | null; h: number | null }>({ w: null, h: null });
  const [refPts, setRefPts] = useState<Point[]>([]);
  const [pts, setPts] = useState<Point[]>([]);
  const [target, setTarget] = useState(targets[0]?.id ?? '');
  const [size, setSize] = useState({ w: 1000, h: 750 });

  const ref = REFS.find((r) => r.id === refId)!;
  const refW = refId === 'custom' ? custom.w ?? 0 : ref.w;
  const refH = refId === 'custom' ? custom.h ?? 0 : ref.h;
  const needRef = mode === 'rect' ? 4 : 2;
  const refReady = refPts.length === needRef && refW > 0 && (mode === 'line' || refH > 0);

  const click = (e: MouseEvent<SVGSVGElement>) => {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const p = { x: ((e.clientX - r.left) / r.width) * size.w, y: ((e.clientY - r.top) / r.height) * size.h };
    if (refPts.length < needRef) setRefPts([...refPts, p]);
    else setPts(pts.length >= 2 ? [p] : [...pts, p]);
  };

  let result: number | null = null;
  if (refReady && pts.length === 2) {
    result = mode === 'rect' ? planeDistance(refPts, refW, refH, pts[0], pts[1]) : scaleDistance(refPts[0], refPts[1], refW, pts[0], pts[1]);
  }

  const r = Math.max(size.w, size.h) / 120;
  const instructions =
    refPts.length < needRef
      ? mode === 'rect'
        ? `Tap the reference's corners in order: top-left, top-right, bottom-right, bottom-left (${refPts.length}/4).`
        : `Tap both ends of the reference length (${refPts.length}/2).`
      : pts.length < 2
        ? 'Now tap the two ends of what you want to measure, on the same flat surface.'
        : 'Tap again to start a new measurement.';

  return (
    <Modal title="Estimate from photo" onClose={onClose} wide>
      <div className="note warn">
        This is an estimate. It is only meaningful for points on the same flat surface as the reference (for example a sheet of paper taped to the wall).
        Lens distortion and tapping accuracy add error. Confirm anything important with a tape or laser.
      </div>
      <div className="row">
        <Seg value={mode} options={[{ id: 'rect', label: 'Rectangle reference (angled photos)' }, { id: 'line', label: 'Known length (square-on photos)' }]} onChange={(m) => { setMode(m); setRefPts([]); setPts([]); }} />
        <select value={refId} onChange={(e) => setRefId(e.target.value)} aria-label="Reference">
          {REFS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        {refId === 'custom' && (
          <>
            <LengthInput value={custom.w} units={units} onCommit={(v) => setCustom({ ...custom, w: v })} placeholder="width" width={110} />
            {mode === 'rect' && <LengthInput value={custom.h} units={units} onCommit={(v) => setCustom({ ...custom, h: v })} placeholder="height" width={110} />}
          </>
        )}
      </div>
      <p className="muted">{instructions}</p>
      <div style={{ position: 'relative' }}>
        {url && <img ref={img} src={url} alt="" style={{ width: '100%', display: 'block', borderRadius: 10 }} onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />}
        <svg viewBox={`0 0 ${size.w} ${size.h}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'crosshair' }} onClick={click}>
          {refPts.length > 1 && <polyline points={[...refPts, ...(refPts.length === 4 && mode === 'rect' ? [refPts[0]] : [])].map((p) => `${p.x},${p.y}`).join(' ')} fill={refPts.length === 4 ? 'rgba(138,167,200,0.2)' : 'none'} stroke="#8aa7c8" strokeWidth={r / 2} />}
          {refPts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={r} fill="#8aa7c8" />)}
          {pts.length === 2 && <line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y} stroke="#d7a95b" strokeWidth={r / 1.5} />}
          {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={r} fill="#d7a95b" />)}
          {result != null && pts.length === 2 && (
            <text x={(pts[0].x + pts[1].x) / 2} y={(pts[0].y + pts[1].y) / 2 - r * 2} fontSize={r * 4} fill="#fff" stroke="#000" strokeWidth={r / 3} paintOrder="stroke" textAnchor="middle">
              ≈ {fmtLen(result, units)}
            </text>
          )}
        </svg>
      </div>
      <div className="row">
        <button className="btn sm" onClick={() => { setRefPts([]); setPts([]); }}>Reset</button>
        <span className="spacer" />
        {result != null && (
          <>
            <b>≈ {fmtLen(result, units)}</b>
            {targets.length > 0 && (
              <>
                <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Save to">
                  {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                <button className="btn primary sm" onClick={() => onSave(target, result!)}>Save as estimate</button>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
