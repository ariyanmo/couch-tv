import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type PointerEvent as RPointerEvent } from 'react';
import type { Point } from '../../core/types';

export interface View {
  x: number;
  y: number;
  w: number; // plan mm visible across the width
}

export interface PlanCanvasHandle {
  toPlan: (clientX: number, clientY: number) => Point;
  fit: (b: { minX: number; minY: number; w: number; h: number }) => void;
  zoom: (k: number) => void;
  mmPerPx: () => number;
}

interface Props {
  children: ReactNode;
  initial: { minX: number; minY: number; w: number; h: number };
  grid?: number;
  gridColor?: string;
  onBackgroundDown?: (e: RPointerEvent, p: Point) => void;
  background?: string;
  testId?: string;
}

/**
 * Pan/zoom SVG surface in plan millimetres. One finger or the mouse on the
 * empty background pans (unless onBackgroundDown handles it), wheel and pinch zoom.
 */
export const PlanCanvas = forwardRef<PlanCanvasHandle, Props>(function PlanCanvas({ children, initial, grid = 0, gridColor = '#1a1a1c', onBackgroundDown, background = '#0d0d0e', testId }, ref) {
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>(() => ({ x: initial.minX, y: initial.minY, w: initial.w }));
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; view: View; mid: Point } | null>(null);
  const pan = useRef<{ sx: number; sy: number; view: View } | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 800, h: el.clientHeight || 600 }));
    ro.observe(el);
    setSize({ w: el.clientWidth || 800, h: el.clientHeight || 600 });
    return () => ro.disconnect();
  }, []);

  const fitTo = useCallback(
    (b: { minX: number; minY: number; w: number; h: number }) => {
      const aspect = size.h / size.w;
      const w = Math.max(b.w, b.h / aspect);
      setView({ x: b.minX - (w - b.w) / 2, y: b.minY - (w * aspect - b.h) / 2, w });
    },
    [size.w, size.h],
  );

  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current && size.w > 0) {
      fitTo(initial);
      fitted.current = true;
    }
  }, [size, fitTo, initial]);

  const h = (view.w * size.h) / size.w;

  const toPlan = useCallback((cx: number, cy: number): Point => {
    const s = svg.current;
    if (!s) return { x: 0, y: 0 };
    const pt = s.createSVGPoint();
    pt.x = cx;
    pt.y = cy;
    const m = s.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const r = pt.matrixTransform(m.inverse());
    return { x: r.x, y: r.y };
  }, []);

  const zoomAt = useCallback(
    (k: number, at?: Point) => {
      setView((v) => {
        const hh = (v.w * size.h) / size.w;
        const c = at ?? { x: v.x + v.w / 2, y: v.y + hh / 2 };
        const w = Math.min(200000, Math.max(800, v.w * k));
        const f = w / v.w;
        return { x: c.x - (c.x - v.x) * f, y: c.y - (c.y - v.y) * f, w };
      });
    },
    [size.w, size.h],
  );

  useImperativeHandle(ref, () => ({ toPlan, fit: fitTo, zoom: (k) => zoomAt(k), mmPerPx: () => view.w / size.w }), [toPlan, fitTo, zoomAt, view.w, size.w]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(Math.exp(e.deltaY * 0.0015), toPlan(e.clientX, e.clientY));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [zoomAt, toPlan]);

  const onDown = (e: RPointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), view, mid: toPlan((a.x + b.x) / 2, (a.y + b.y) / 2) };
      pan.current = null;
      return;
    }
    const isBg = e.target === svg.current || (e.target as Element).getAttribute?.('data-bg') === '1';
    if (!isBg) return;
    if (onBackgroundDown && e.button === 0 && !e.altKey) {
      onBackgroundDown(e, toPlan(e.clientX, e.clientY));
      if (e.defaultPrevented) return;
    }
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pan.current = { sx: e.clientX, sy: e.clientY, view };
  };
  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const k = pinch.current.d / Math.max(1, d);
      const v0 = pinch.current.view;
      const w = Math.min(200000, Math.max(800, v0.w * k));
      const f = w / v0.w;
      const c = pinch.current.mid;
      setView({ x: c.x - (c.x - v0.x) * f, y: c.y - (c.y - v0.y) * f, w });
      return;
    }
    if (pan.current) {
      const k = pan.current.view.w / size.w;
      setView({ ...pan.current.view, x: pan.current.view.x - (e.clientX - pan.current.sx) * k, y: pan.current.view.y - (e.clientY - pan.current.sy) * k });
    }
  };
  const onUp = (e: RPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) pan.current = null;
  };

  const gridLines: ReactNode[] = [];
  if (grid > 0) {
    let g = grid;
    while (view.w / g > 120) g *= 2;
    const major = g * 10;
    for (let x = Math.floor(view.x / g) * g; x < view.x + view.w; x += g)
      gridLines.push(<line key={'x' + x} x1={x} y1={view.y} x2={x} y2={view.y + h} stroke={gridColor} strokeWidth={view.w / size.w * (Math.abs(x % major) < 1 ? 1.4 : 0.6)} />);
    for (let y = Math.floor(view.y / g) * g; y < view.y + h; y += g)
      gridLines.push(<line key={'y' + y} x1={view.x} y1={y} x2={view.x + view.w} y2={y} stroke={gridColor} strokeWidth={view.w / size.w * (Math.abs(y % major) < 1 ? 1.4 : 0.6)} />);
  }

  return (
    <div ref={wrap} style={{ position: 'absolute', inset: 0 }}>
      <svg
        ref={svg}
        data-testid={testId}
        viewBox={`${view.x} ${view.y} ${view.w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{ background }}
      >
        <g pointerEvents="none">{gridLines}</g>
        {children}
      </svg>
    </div>
  );
});
