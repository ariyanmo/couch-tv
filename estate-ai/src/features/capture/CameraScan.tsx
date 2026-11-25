import { useEffect, useRef, useState } from 'react';
import { edgeLength, polygonArea, bounds } from '../../core/geometry';
import { aim, calibrate, cameraDirection, ceilingHeight, floorPointFromDirs, nearlyRectilinear, squareUp, type Orientation } from '../../core/scanmath';
import type { MeasureMethod, Point, UnitSystem } from '../../core/types';
import { fmtArea, fmtLen } from '../../core/units';
import { LengthInput } from '../../ui/components';
import { DEFAULT_FOV_LONG, boundaryToPoints, coverageDeg, fitRoom, floorBoundary, sampleFloor, type CameraModel, type FloorModel, type Frame, type RoomFit } from '../../core/autoscan';
import { Icon } from '../../ui/icons';

export interface ScanResult {
  polygon: Point[];
  measuredEdge?: number;
  measuredMethod?: MeasureMethod;
  ceiling?: number;
  photos: Blob[];
}

type Stage = 'setup' | 'auto' | 'corners' | 'ceiling' | 'review';

/** Test hook: lets automated tests feed synthetic frames instead of the camera. */
type FrameSource = () => { frame: Frame; orientation: Orientation; screenAngle?: number } | null;
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
  const [mode, setMode] = useState<'auto' | 'tap'>('auto');
  const orientRef = useRef<Orientation | null>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const autoPts = useRef<Point[]>([]);
  const floorModel = useRef<FloorModel | undefined>(undefined);
  const lastStillHeading = useRef<number | null>(null);
  const [auto, setAuto] = useState<{ coverage: number; fit: RoomFit | null; seeing: boolean; learnt: boolean }>({ coverage: 0, fit: null, seeing: false, learnt: false });

  // sensor listener
  useEffect(() => {
    const on = (e: DeviceOrientationEvent) => {
      if (e.alpha == null || e.beta == null || e.gamma == null) return;
      const o = { alpha: e.alpha, beta: e.beta, gamma: e.gamma };
      recent.current.push(cameraDirection(o));
      if (recent.current.length > 8) recent.current.shift();
      orientRef.current = o;
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
    autoPts.current = [];
    floorModel.current = undefined;
    setAuto({ coverage: 0, fit: null, seeing: false, learnt: false });
    setStage(mode === 'auto' ? 'auto' : 'corners');
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

  // ----- automatic scan: read the floor edge from video frames -----
  useEffect(() => {
    if (stage !== 'auto') return;
    let stop = false;
    let last = 0;
    let lastFit = 0;
    const small = document.createElement('canvas');
    const ctx = small.getContext('2d', { willReadFrequently: true })!;
    const tick = (t: number) => {
      if (stop) return;
      requestAnimationFrame(tick);
      if (t - last < 140) return; // about 7 frames a second is plenty
      last = t;
      let frame: Frame | null = null;
      let o = orientRef.current;
      let screenAngle = (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0) as number;
      const src = (window as unknown as { __estateScanSource?: FrameSource }).__estateScanSource;
      if (src) {
        const f = src();
        if (!f) return;
        frame = f.frame;
        o = f.orientation;
        screenAngle = f.screenAngle ?? 0;
      } else {
        const v = video.current;
        if (!v || !v.videoWidth || !o) return;
        const k = 128 / Math.max(v.videoWidth, v.videoHeight);
        small.width = Math.round(v.videoWidth * k);
        small.height = Math.round(v.videoHeight * k);
        ctx.drawImage(v, 0, 0, small.width, small.height);
        const img = ctx.getImageData(0, 0, small.width, small.height);
        frame = { data: img.data, width: img.width, height: img.height };
      }
      if (!o || !frame) return;
      const pitch = aim(o).pitch;
      if (pitch > -8 || pitch < -75) {
        setAuto((a) => (a.seeing ? { ...a, seeing: false } : a));
        drawOverlay(null, frame);
        return;
      }
      // learn the floor colour from what is straight below the middle of the picture
      floorModel.current = sampleFloor(frame, floorModel.current, floorModel.current ? 0.05 : 1);
      const cam: CameraModel = { width: frame.width, height: frame.height, fovLong: DEFAULT_FOV_LONG, screenAngle };
      const { boundary } = floorBoundary(frame, floorModel.current);
      const pts = boundaryToPoints(boundary, cam, o, height);
      if (pts.length) {
        autoPts.current.push(...pts);
        if (autoPts.current.length > 60000) autoPts.current.splice(0, autoPts.current.length - 60000);
      }
      drawOverlay(boundary, frame);
      // a still photo every 60° of turning, for the room's photo record
      const hd = aim(o).heading;
      if (!src && (lastStillHeading.current == null || Math.abs(((hd - lastStillHeading.current + 540) % 360) - 180) > 60)) {
        lastStillHeading.current = hd;
        grab();
      }
      if (t - lastFit > 700) {
        lastFit = t;
        const fit = fitRoom(autoPts.current);
        setAuto({ coverage: coverageDeg(autoPts.current), fit, seeing: pts.length > 3, learnt: true });
      }
    };
    requestAnimationFrame(tick);
    return () => {
      stop = true;
    };
  }, [stage, height]); // eslint-disable-line react-hooks/exhaustive-deps

  function drawOverlay(boundary: Int16Array | null, frame: Frame) {
    const c = overlay.current;
    if (!c) return;
    const W = c.clientWidth, H = c.clientHeight;
    if (c.width !== W) c.width = W;
    if (c.height !== H) c.height = H;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    if (!boundary) return;
    // the video is shown with object-fit: cover; map frame pixels to the screen the same way
    const k = Math.max(W / frame.width, H / frame.height);
    const ox = (W - frame.width * k) / 2, oy = (H - frame.height * k) / 2;
    g.lineWidth = 4;
    g.strokeStyle = '#e2c88f';
    g.shadowColor = 'rgba(0,0,0,0.6)';
    g.shadowBlur = 4;
    g.beginPath();
    let pen = false;
    for (let x = 0; x < boundary.length; x++) {
      const v = boundary[x];
      if (v < 0) {
        pen = false;
        continue;
      }
      const sx = ox + (x + 0.5) * k, sy = oy + (v - 0.5) * k;
      if (pen) g.lineTo(sx, sy);
      else g.moveTo(sx, sy);
      pen = true;
    }
    g.stroke();
  }

  const finishAuto = () => {
    const fit = fitRoom(autoPts.current);
    if (!fit) return;
    setCorners(fit.polygon);
    setSquare(fit.method === 'square');
    setStage('ceiling');
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
            <li><b>Point the camera where the walls meet the floor</b> and turn slowly on the spot, all the way round.</li>
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
          <div className="seg" role="tablist" style={{ alignSelf: 'flex-start' }}>
            <button className={mode === 'auto' ? 'on' : ''} onClick={() => setMode('auto')} data-testid="mode-auto">Automatic</button>
            <button className={mode === 'tap' ? 'on' : ''} onClick={() => setMode('tap')} data-testid="mode-tap">Tap each corner</button>
          </div>
          <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>
            {mode === 'auto'
              ? 'Automatic: point the camera at the floor where it meets the walls and turn slowly on the spot, all the way round. The app finds the floor edge and draws the walls.'
              : 'Tap each corner: aim the dot at every corner where the walls meet the floor and tap Mark. Best when furniture hides the floor edge.'}
          </p>
          {sensorProblem && <div className="note err">{sensorProblem}</div>}
          <button className="btn primary" style={{ minHeight: 50, fontSize: 16 }} onClick={start} data-testid="scan-start">
            <Icon name="camera" /> Start scan
          </button>
        </div>
      </Overlay>
    );

  if (stage === 'auto') {
    const pct = Math.min(100, Math.round((auto.coverage / 360) * 100));
    return (
      <div className="scan-live" data-testid="scan-auto">
        <video ref={video} playsInline muted autoPlay />
        <canvas ref={overlay} className="scan-overlay-canvas" />
        <div className="scan-top">
          <button className="btn sm" onClick={onClose} aria-label="Cancel scan"><Icon name="close" /></button>
          <div className="scan-msg">
            {auto.seeing ? (
              <><b>Keep turning slowly</b>, keeping the gold line on the bottom of the walls</>
            ) : pitch > -8 ? (
              <><b>Tilt the phone down</b> until the floor and the bottom of the walls are in the picture</>
            ) : (
              <><b>Point at the floor</b> just in front of a wall</>
            )}
            <span data-testid="scan-coverage">{pct}% of the room seen{auto.fit ? ` · ${auto.fit.polygon.length} walls found` : ''}</span>
          </div>
        </div>
        {(sensorProblem || camProblem) && <div className="scan-warn">{sensorProblem ?? camProblem}</div>}
        <div className="scan-ring" style={{ background: `conic-gradient(#c8a96a ${pct * 3.6}deg, rgba(255,255,255,0.15) 0)` }}><span>{pct}%</span></div>
        <AutoMap points={autoPts.current} fit={auto.fit} />
        <div className="scan-bottom">
          <button className="btn" onClick={() => { autoPts.current = []; floorModel.current = undefined; setAuto({ coverage: 0, fit: null, seeing: false, learnt: false }); }}>Restart</button>
          <button className="scan-mark" disabled={!auto.fit} onClick={finishAuto} data-testid="scan-auto-finish">{auto.fit ? 'Finish' : 'Scanning…'}</button>
          <button className="btn" onClick={() => setStage('corners')}>Tap corners</button>
        </div>
      </div>
    );
  }

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
          <button className="btn" onClick={() => { setCorners([]); setPhotos([]); setCeiling(undefined); setCalLen(null); autoPts.current = []; floorModel.current = undefined; setAuto({ coverage: 0, fit: null, seeing: false, learnt: false }); setStage(mode === 'auto' ? 'auto' : 'corners'); }}>Scan again</button>
          <span className="spacer" />
          <button className="btn primary" style={{ minHeight: 46 }} data-testid="scan-create" onClick={() => onDone({ polygon: final, measuredEdge: calLen ? calEdge : undefined, measuredMethod: 'tape', ceiling: finalCeiling, photos })}>
            <Icon name="check" /> Create room
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function AutoMap({ points, fit }: { points: Point[]; fit: RoomFit | null }) {
  const step = Math.max(1, Math.floor(points.length / 600));
  const sample = points.filter((_, i) => i % step === 0);
  const all = [...sample, ...(fit?.polygon ?? []), { x: 0, y: 0 }];
  const b = bounds(all);
  const size = Math.max(b.w, b.h, 3000) * 1.25;
  const cx = b.minX + b.w / 2, cy = b.minY + b.h / 2;
  const sw = size / 90;
  return (
    <svg className="scan-map" viewBox={`${cx - size / 2} ${cy - size / 2} ${size} ${size}`}>
      {sample.map((p, i) => <rect key={i} x={p.x - sw / 2} y={p.y - sw / 2} width={sw} height={sw} fill="rgba(226,200,143,0.55)" />)}
      {fit && <polygon points={fit.polygon.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(200,169,106,0.15)" stroke="#fff" strokeWidth={sw} />}
      <circle cx={0} cy={0} r={sw * 2.5} fill="#8aa7c8" />
    </svg>
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
