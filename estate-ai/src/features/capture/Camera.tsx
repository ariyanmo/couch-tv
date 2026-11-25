import { useEffect, useRef, useState } from 'react';
import { FileButton } from '../../ui/components';
import { Icon } from '../../ui/icons';
import { resizeImage } from '../../ui/image';

export interface Slot {
  id: string;
  label: string;
  hint: string;
}

/** Guided capture slots for one room: corners, each wall, ceiling, floor. */
export function roomSlots(walls: number): Slot[] {
  const n = Math.max(4, walls);
  const s: Slot[] = [];
  s.push({ id: 'overview', label: 'Overview from the doorway', hint: 'Stand in the doorway, hold the phone level, include as much of the room as possible.' });
  for (let i = 1; i <= n; i++) s.push({ id: `corner-${i}`, label: `Corner ${i}`, hint: 'Aim into the corner so both walls, the floor line and the ceiling line show.' });
  for (let i = 1; i <= n; i++) s.push({ id: `wall-${i}`, label: `Wall ${i}`, hint: 'Face the wall squarely from the opposite side, phone upright and level.' });
  s.push({ id: 'ceiling', label: 'Ceiling', hint: 'Point straight up from the middle of the room.' });
  s.push({ id: 'floor', label: 'Floor', hint: 'Capture the floor finish close up and the floor condition.' });
  s.push({ id: 'openings', label: 'Doors & windows', hint: 'One photo per door or window, squarely, with the frame fully visible.' });
  return s;
}

interface Props {
  slots?: Slot[];
  done?: Record<string, boolean>;
  onCapture: (blob: Blob, slotId?: string) => Promise<void> | void;
  onClose: () => void;
}

type CamState = 'starting' | 'live' | 'denied' | 'unsupported' | 'insecure';

export function Camera({ slots, done = {}, onCapture, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CamState>('starting');
  const [slotIdx, setSlotIdx] = useState(() => Math.max(0, slots?.findIndex((s) => !done[s.id]) ?? 0));
  const [tilt, setTilt] = useState<{ roll: number; pitch: number } | null>(null);
  const [motionAsk, setMotionAsk] = useState(false);
  const [flash, setFlash] = useState(false);
  const [count, setCount] = useState(0);
  const slot = slots?.[slotIdx];

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!window.isSecureContext) {
        setState('insecure');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setState('unsupported');
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => {});
        }
        setState('live');
      } catch (e) {
        setState((e as Error).name === 'NotAllowedError' ? 'denied' : 'unsupported');
      }
    }
    start();
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Level indicator from device orientation (iOS needs a tap to allow it).
  useEffect(() => {
    const D = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
    if (!D) return;
    if (typeof D.requestPermission === 'function') setMotionAsk(true);
    const on = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      // phone upright in portrait: beta ≈ 90 when vertical; gamma = roll
      setTilt({ roll: e.gamma, pitch: e.beta - 90 });
    };
    window.addEventListener('deviceorientation', on);
    return () => window.removeEventListener('deviceorientation', on);
  }, []);

  const askMotion = async () => {
    const D = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    try {
      await D.requestPermission?.();
    } catch {
      /* user said no */
    }
    setMotionAsk(false);
  };

  const shoot = async () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    setFlash(true);
    setTimeout(() => setFlash(false), 120);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.9));
    if (!blob) return;
    await onCapture(blob, slot?.id);
    setCount((n) => n + 1);
    if (slots && slotIdx < slots.length - 1) setSlotIdx(slotIdx + 1);
  };

  const fromFiles = async (files: File[]) => {
    for (const f of files) {
      const b = await resizeImage(f, 2400, 0.88).catch(() => f);
      await onCapture(b, slot?.id);
      setCount((n) => n + 1);
    }
    if (slots && slotIdx < slots.length - 1) setSlotIdx(slotIdx + 1);
  };

  const level = tilt ? Math.abs(tilt.roll) < 2 && Math.abs(tilt.pitch) < 3 : false;

  return (
    <div className="modal-back" style={{ placeItems: 'center', padding: 0 }}>
      <div className="modal wide" style={{ width: 'min(720px,100%)', maxHeight: '100vh', borderRadius: 0 }}>
        <div className="modal-head">
          <h2>{slot ? slot.label : 'Camera'}</h2>
          <span className="faint" style={{ fontSize: 13 }}>{count} taken</span>
          <button className="btn ghost icon" onClick={onClose} aria-label="Close camera"><Icon name="close" /></button>
        </div>
        <div className="modal-body">
          {state === 'live' || state === 'starting' ? (
            <div className="camera-wrap">
              <video ref={video} playsInline muted autoPlay />
              <svg className="camera-overlay" viewBox="0 0 300 400" preserveAspectRatio="none">
                <g stroke="rgba(255,255,255,0.28)" strokeWidth="0.6">
                  <line x1="100" y1="0" x2="100" y2="400" />
                  <line x1="200" y1="0" x2="200" y2="400" />
                  <line x1="0" y1="133" x2="300" y2="133" />
                  <line x1="0" y1="266" x2="300" y2="266" />
                </g>
                {tilt && (
                  <line x1="40" y1="200" x2="260" y2="200" stroke={level ? '#7fb58a' : '#d7a95b'} strokeWidth="2" transform={`rotate(${-tilt.roll} 150 200) translate(0 ${tilt.pitch * 3})`} />
                )}
              </svg>
              {tilt && <div className="level" style={{ color: level ? '#9fd4a9' : '#f0c27a' }}>{level ? 'Level' : `Tilt ${tilt.roll.toFixed(0)}° · pitch ${tilt.pitch.toFixed(0)}°`}</div>}
              {flash && <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: 0.6 }} />}
            </div>
          ) : (
            <div className="note warn">
              {state === 'insecure' && (
                <>
                  The live camera needs a secure page (https or localhost). On your phone over Wi-Fi, run <span className="mono">npm run dev:https</span> on
                  the computer and open the https address, or use <b>Take photo</b> below, which opens the iPhone camera directly and works everywhere.
                </>
              )}
              {state === 'denied' && <>Camera access was refused. Allow it in the browser settings (iPhone: Settings, Safari, Camera), or use Take photo below.</>}
              {state === 'unsupported' && <>This browser cannot show a live camera here. Use Take photo below.</>}
            </div>
          )}
          {slot && <p className="muted" style={{ textAlign: 'center' }}>{slot.hint}</p>}
          {motionAsk && (
            <button className="btn sm" onClick={askMotion}><Icon name="level" /> Show level guide</button>
          )}
          <div className="row" style={{ justifyContent: 'center', gap: 18 }}>
            {slots && <button className="btn sm" disabled={slotIdx === 0} onClick={() => setSlotIdx(slotIdx - 1)}>Previous</button>}
            {state === 'live' && <button className="shutter" onClick={shoot} aria-label="Take photo" data-testid="shutter" />}
            {slots && <button className="btn sm" disabled={slotIdx >= slots.length - 1} onClick={() => setSlotIdx(slotIdx + 1)}>Skip</button>}
          </div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <FileButton accept="image/*" capture="environment" onFiles={fromFiles} className="btn"><Icon name="camera" /> Take photo</FileButton>
            <FileButton accept="image/*" multiple onFiles={fromFiles} className="btn"><Icon name="upload" /> Choose from library</FileButton>
          </div>
          {slots && (
            <div className="row" style={{ gap: 4 }}>
              {slots.map((s, i) => (
                <button key={s.id} className={`chip ${done[s.id] ? 'measured' : 'plain'}`} style={{ cursor: 'pointer', background: i === slotIdx ? 'var(--gold-dim)' : 'transparent' }} onClick={() => setSlotIdx(i)}>
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
