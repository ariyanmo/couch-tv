import { useEffect, useRef, useState } from 'react';
import { edgeLength, polygonArea, bounds } from '../../core/geometry';
import { aim, calibrate, cameraDirection, ceilingHeight, floorPointFromDirs, nearlyRectilinear, squareUp, type Orientation } from '../../core/scanmath';
import type { MeasureMethod, Point, UnitSystem } from '../../core/types';
import { fmtArea, fmtLen } from '../../core/units';
import { LengthInput } from '../../ui/components';
import { Icon } from '../../ui/icons';

export interface ScanResult {
  polygon: Point[];
  measuredEdge?: number;
  measuredMethod?: MeasureMethod;
  ceiling?: number;
  photos: Blob[];
}

type Stage = 'setup' | 'corners' | 'ceiling' | 'review';
type Dir = { x: number; y: number; z: number };

const HEIGHT_KEY = 'estate-ai:phone-height';

/**
 * Stand in the room, aim the camera at each corner where it meets the floor,
 * tap Mark. The phone's motion sensors and its height above the floor place
 * each corner on the plan.
 */
export function CameraScan({ units, onDone, onClose }: { units: UnitSystem; onDone: (r: ScanResult) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recent = useRef<Dir[]>([]);
  const [stage, setStage] = useState<Stage>('setup');
  const [height, setHeight] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(HEIGHT_KEY)) || 1350;
    } catch {
      return 1350;
    }
  });
  const [orient, setOrient] = useState<Orientation | null>(null);
  const [sensorProblem, setSensorProblem] = useState<string | null>(null);
  const [camProblem, setCamProblem] = useState<string | null>(null);
  const [corners, setCorners] = useState<Point[]>([]);
  const [photos, setPhotos] = useState<Blob[]>([]);
  const [ceiling, setCeiling] = useState<number | undefined>();
  const [square, setSquare] = useState(true);
  const [calEdge, setCalEdge] = useState(0);
  const [calLen, setCalLen] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);

  // sensor listener
  useEffect(() => {
    const on = (e: DeviceOrientationEvent) => {
      if (e.alpha == null || e.beta == null || e.gamma == null) return;
      const o = { alpha: e.alpha, beta: e.beta, gamma: e.gamma };
      recent.current.push(cameraDirection(o));
      if (recent.current.length > 8) recent.current.shift();
      setOrient(o);
    };
    window.addEventListener('deviceorientation', on);
    return () => window.removeEventListener('deviceorientation', on);
  }, []);

  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);
  // attach the camera once the live view has mounted
  useEffect(() => {
    if (stream.current && video.current && video.current.srcObject !== stream.current) {
      video.current.srcObject = stream.current;
      video.current.play().catch(() => {});
    }
  });

  const start = async () => {
    try {
      localStorage.setItem(HEIGHT_KEY, String(height));
    } catch {
      /* private mode */
    }
    setSensorProblem(null);
    // iPhone: motion access must be requested from a tap
    const D = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
    if (D && typeof D.requestPermission === 'function') {
      try {
        const res = await D.requestPermission();
        if (res !== 'granted') setSensorProblem('Motion access was refused. On iPhone: close Safari completely, open the app again, and tap Allow when asked about Motion & Orientation.');
      } catch {
        setSensorProblem('Motion access could not be requested. Open the app from its https link (for example the GitHub Pages link).');
      }
    }
    setStage('corners');
    if (window.isSecureContext && navigator.mediaDevices?.getUserMedia) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => {});
        }
      } catch {
        setCamProblem('Camera not available, so there is no live picture. You can still aim with the phone and mark corners.');
      }
    } else setCamProblem('The live camera needs https. Open the app from its https link.');
    setTimeout(() => {
      if (recent.current.length) setSensorProblem(null);
      else setSensorProblem((m) => m ?? 'This device is not reporting motion sensors. Camera scan needs a phone; on a computer, enter the walls by hand.');
    }, 1500);
  };

  const live = orient ? floorPointFromDirs(recent.current, height) : null;
  const pitch = orient ? aim(orient).pitch : 0;

  const grab = async () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    const k = Math.min(1, 1600 / v.videoWidth);
    c.width = Math.round(v.videoWidth * k);
    c.height = Math.round(v.videoHeight * k);
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
    const b = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.85));
    if (b) setPhotos((ps) => [...ps, b]);
  };

  const mark = () => {
    if (!live) return;
    setCorners((cs) => [...cs, live]);
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
    navigator.vibrate?.(30);
    grab();
  };

  const markCeiling = () => {
    if (!orient || !corners.length) return;
    // use the marked corner nearest to where the camera points
    const h = aim(orient).heading;
    let best = corners[0];
    let bd = Infinity;
    for (const c of corners) {
      const ch = (Math.atan2(c.x, -c.y) * 180) / Math.PI;
      const d = Math.abs(((h - ch + 540) % 360) - 180);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    const v = ceilingHeight(orient, height, Math.hypot(best.x, best.y));
    if (v && v > height && v < 6000) {
      setCeiling(v);
      setStage('review');
    }
  };

  const canSquare = nearlyRectilinear(corners);
  const shaped = canSquare && square ? squareUp(corners) : corners;
  const final = calLen && shaped.length >= 3 ? calibrate(shaped, calEdge, calLen) : shaped;
  const finalCeiling = ceiling && calLen && shaped.length >= 3 ? ceiling * (calLen / edgeLength(shaped, calEdge)) : ceiling;

  // ---------- views ----------
  if (stage === 'setup')
    return (
      <Overlay onClose={onClose} title="Scan room with camera">
        <div className="stack" style={{ gap: 14, maxWidth: 520, margin: '0 auto', width: '100%' }}>
          <ol className="scan-steps">
            <li><b>Stand near the middle of the room.</b> Stay on the same spot for the whole scan.</li>
            <li><b>Hold the phone at chest height</b> and keep it at that height.</li>
            <li><b>Aim the dot at a corner, right where the walls meet the floor</b>, then tap <b>Mark corner</b>. Turn on the spot and do every corner in order, all the way round.</li>
            <li>Optionally aim at the top of one corner for the ceiling height.</li>
          </ol>
          <label className="field">
            How high is the phone above the floor when you hold it?
            <LengthInput value={height} units={units} onCommit={(v) => v && setHeight(Math.min(2200, Math.max(500, v)))} ariaLabel="Phone height" />
          </label>
          <p className="faint" style={{ fontSize: 13 }}>
            The whole scan is scaled from this number, so measure it once with a tape if you can (floor to phone at chest height, usually 1.2–1.5 m).
            Results are estimates; measuring one wall at the end makes them much more accurate.
          </p>
          {sensorProblem && <div className="note err">{sensorProblem}</div>}
          <button className="btn primary" style={{ minHeight: 50, fontSize: 16 }} onClick={start} data-testid="scan-start">
            <Icon name="camera" /> Start scan
          </button>
        </div>
      </Overlay>
    );

  if (stage === 'corners' || stage === 'ceiling')
    return (
      <div className="scan-live" data-testid="scan-live">
        <video ref={video} playsInline muted autoPlay />
        <div className="scan-cross" style={{ borderColor: stage === 'ceiling' ? '#8aa7c8' : live ? '#c8a96a' : '#d9776b' }} />
        {flash && <div className="scan-flash" />}
        <div className="scan-top">
          <button className="btn sm" onClick={onClose} aria-label="Cancel scan"><Icon name="close" /></button>
          <div className="scan-msg">
            {stage === 'corners' ? (
              <>
                <b>Corner {corners.length + 1}</b>: aim the dot where the walls meet the floor
                <span>{live ? `${fmtLen(Math.hypot(live.x, live.y), units)} away` : pitch > -6 ? 'Tilt the phone down towards the floor' : '…'}</span>
              </>
            ) : (
              <>
                <b>Ceiling</b>: aim at the top of a corner you marked, where it meets the ceiling
                <span>{pitch > 3 ? `Looking ${pitch.toFixed(0)}° up` : 'Tilt the phone up'}</span>
              </>
            )}
          </div>
        </div>
        {(sensorProblem || camProblem) && <div className="scan-warn">{sensorProblem ?? camProblem}</div>}
        <MiniMap corners={corners} live={stage === 'corners' ? live : null} />
        <div className="scan-bottom">
          {stage === 'corners' ? (
            <>
              <button className="btn" disabled={!corners.length} onClick={() => { setCorners((c) => c.slice(0, -1)); setPhotos((p) => p.slice(0, -1)); }}>Undo</button>
              <button className="scan-mark" disabled={!live} onClick={mark} data-testid="scan-mark">Mark corner</button>
              <button className="btn primary" disabled={corners.length < 3} onClick={() => setStage('ceiling')} data-testid="scan-done">Done ({corners.length})</button>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => setStage('review')}>Skip</button>
              <button className="scan-mark" disabled={pitch < 3} onClick={markCeiling} data-testid="scan-ceiling">Mark ceiling</button>
              <span style={{ width: 70 }} />
            </>
          )}
        </div>
      </div>
    );

  // review
  const b = bounds(final);
  const pad = Math.max(b.w, b.h) * 0.2 || 1000;
  return (
    <Overlay onClose={onClose} title="Check the scan">
      <div className="stack" style={{ gap: 14, maxWidth: 560, margin: '0 auto', width: '100%' }}>
        <svg viewBox={`${b.minX - pad} ${b.minY - pad} ${b.w + 2 * pad} ${b.h + 2 * pad}`} style={{ width: '100%', height: 260, background: 'var(--bg-2)', borderRadius: 12 }}>
          <polygon points={final.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(200,169,106,0.12)" stroke="#d8d4cb" strokeWidth={Math.max(b.w, b.h) / 120} />
          {final.map((p, i) => {
            const q = final[(i + 1) % final.length];
            const fs = Math.max(b.w, b.h) / 18;
            return (
              <text key={i} x={(p.x + q.x) / 2} y={(p.y + q.y) / 2} fontSize={fs} fill={i === calEdge && calLen ? '#7fb58a' : '#d7a95b'} textAnchor="middle" stroke="#111" strokeWidth={fs / 8} paintOrder="stroke">
                {i + 1}: {fmtLen(edgeLength(final, i), units)}
              </text>
            );
          })}
        </svg>
        <div className="row between">
          <span>Floor area <b>{fmtArea(polygonArea(final), units, 1)}</b> <span className="chip estimated">Estimate</span></span>
          {finalCeiling && <span>Ceiling ≈ <b>{fmtLen(finalCeiling, units)}</b></span>}
        </div>
        {canSquare && (
          <label className="check"><input type="checkbox" checked={square} onChange={(e) => setSquare(e.target.checked)} /> Square up the corners (the room looks rectangular or L-shaped)</label>
        )}
        <div className="card stack" style={{ gap: 8 }}>
          <b>Make it accurate (recommended)</b>
          <span className="muted" style={{ fontSize: 13.5 }}>Measure one long wall with a tape and enter it. The whole room is rescaled to match, and that wall is saved as measured.</span>
          <div className="row nowrap">
            <select value={calEdge} onChange={(e) => setCalEdge(+e.target.value)} aria-label="Wall to measure" style={{ width: 110 }}>
              {final.map((_, i) => <option key={i} value={i}>Wall {i + 1}</option>)}
            </select>
            <LengthInput value={calLen} units={units} onCommit={setCalLen} placeholder="measured length" ariaLabel="Measured wall length" />
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => { setCorners([]); setPhotos([]); setCeiling(undefined); setCalLen(null); setStage('corners'); }}>Scan again</button>
          <span className="spacer" />
          <button className="btn primary" style={{ minHeight: 46 }} data-testid="scan-create" onClick={() => onDone({ polygon: final, measuredEdge: calLen ? calEdge : undefined, measuredMethod: 'tape', ceiling: finalCeiling, photos })}>
            <Icon name="check" /> Create room
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function MiniMap({ corners, live }: { corners: Point[]; live: Point | null }) {
  const pts = [...corners, ...(live ? [live] : []), { x: 0, y: 0 }];
  const b = bounds(pts);
  const size = Math.max(b.w, b.h, 3000) * 1.3;
  const cx = b.minX + b.w / 2;
  const cy = b.minY + b.h / 2;
  const sw = size / 90;
  return (
    <svg className="scan-map" viewBox={`${cx - size / 2} ${cy - size / 2} ${size} ${size}`}>
      {corners.length > 1 && <polyline points={corners.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#c8a96a" strokeWidth={sw} />}
      {live && corners.length > 0 && <line x1={corners[corners.length - 1].x} y1={corners[corners.length - 1].y} x2={live.x} y2={live.y} stroke="#c8a96a" strokeWidth={sw / 2} strokeDasharray={`${sw * 2} ${sw * 2}`} />}
      {corners.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={sw * 2.2} fill="#c8a96a" />)}
      {live && <circle cx={live.x} cy={live.y} r={sw * 2} fill="none" stroke="#fff" strokeWidth={sw / 2} />}
      <circle cx={0} cy={0} r={sw * 2.5} fill="#8aa7c8" />
    </svg>
  );
}

function Overlay({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="scan-overlay">
      <div className="row between" style={{ marginBottom: 14 }}>
        <h2>{title}</h2>
        <button className="btn ghost icon" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
      </div>
      {children}
    </div>
  );
}
