import { renderToStaticMarkup } from 'react-dom/server';
import { floorArea, totalInteriorArea } from '../../core/calc';
import type { Property } from '../../core/types';
import { STATUS_LABEL, fmtArea } from '../../core/units';
import { PlanContent, PRINT_THEME, floorBounds, type PlanOptions } from './PlanSVG';

/** Self-contained SVG of one floor for export and printing (light theme, legend, scale bar). */
export function renderPlanSvg(property: Property, floorId: string, opts: Partial<PlanOptions> & { title?: boolean; pxWidth?: number } = {}) {
  const fb = floorBounds(property, floorId, 900);
  const floor = property.floors.find((f) => f.id === floorId)!;
  const head = opts.title === false ? 0 : fb.h * 0.11 + 600;
  const foot = fb.h * 0.08 + 500;
  const vbH = fb.h + head + foot;
  const pxWidth = opts.pxWidth ?? 1800;
  const pxHeight = Math.round((pxWidth * vbH) / fb.w);
  const ext = Math.max(fb.w, fb.h);
  const fs = Math.max(110, ext / 70);
  const fa = floorArea(property, floor);
  const total = totalInteriorArea(property);
  const scaleLen = niceScale(fb.w / 5, property.units);
  const sx = fb.minX + fs * 2;
  const sy = fb.minY + fb.h + foot * 0.45;
  const markup = renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`${fb.minX} ${fb.minY - head} ${fb.w} ${vbH}`} width={pxWidth} height={pxHeight} fontFamily="Inter, -apple-system, Segoe UI, sans-serif">
      <rect x={fb.minX} y={fb.minY - head} width={fb.w} height={vbH} fill="#ffffff" />
      {opts.title !== false && (
        <g>
          <text x={fb.minX + fs * 2} y={fb.minY - head + fs * 3} fontSize={fs * 2.2} fontWeight={700} fill="#1d1d1f">
            {property.name}
          </text>
          <text x={fb.minX + fs * 2} y={fb.minY - head + fs * 5} fontSize={fs * 1.1} fill="#6b6b6b">
            {floor.name} · {fmtArea(fa.value, property.units)} ({STATUS_LABEL[fa.status].toLowerCase()}) · Total interior {fmtArea(total.value, property.units)}
          </text>
        </g>
      )}
      <PlanContent property={property} opts={{ showDims: true, showFurniture: true, ...opts, floorId, theme: PRINT_THEME }} />
      <g>
        <line x1={sx} y1={sy} x2={sx + scaleLen.mm} y2={sy} stroke="#1d1d1f" strokeWidth={fs * 0.15} />
        <line x1={sx} y1={sy - fs * 0.4} x2={sx} y2={sy + fs * 0.4} stroke="#1d1d1f" strokeWidth={fs * 0.12} />
        <line x1={sx + scaleLen.mm} y1={sy - fs * 0.4} x2={sx + scaleLen.mm} y2={sy + fs * 0.4} stroke="#1d1d1f" strokeWidth={fs * 0.12} />
        <text x={sx + scaleLen.mm / 2} y={sy - fs * 0.6} fontSize={fs * 0.9} textAnchor="middle" fill="#1d1d1f">
          {scaleLen.label}
        </text>
        <text x={sx + scaleLen.mm + fs * 2} y={sy + fs * 0.35} fontSize={fs * 0.78} fill="#6b6b6b">
          Solid dimension = measured · dashed “?” = drawn, not measured · “~” = estimate · * area not fully measured
        </text>
      </g>
    </svg>,
  );
  return { svg: markup, width: pxWidth, height: pxHeight };
}

function niceScale(target: number, units: Property['units']) {
  if (units === 'imperial') {
    const ft = [1, 2, 5, 10, 20, 50].reduce((b, v) => (Math.abs(v * 304.8 - target) < Math.abs(b * 304.8 - target) ? v : b), 5);
    return { mm: ft * 304.8, label: `${ft} ft` };
  }
  const m = [0.5, 1, 2, 5, 10, 20].reduce((b, v) => (Math.abs(v * 1000 - target) < Math.abs(b * 1000 - target) ? v : b), 2);
  return { mm: m * 1000, label: `${m} m` };
}
