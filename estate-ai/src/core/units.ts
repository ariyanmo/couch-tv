import type { Measure, Provenance, UnitSystem } from './types';

export const MM_PER_INCH = 25.4;
export const MM_PER_FOOT = 304.8;
export const MM2_PER_SQFT = MM_PER_FOOT * MM_PER_FOOT; // 92 903.04
export const MM2_PER_M2 = 1_000_000;
export const LITRES_PER_US_GALLON = 3.785411784;

/** Format a length in mm for display. */
export function fmtLen(mm: number | null | undefined, units: UnitSystem, opts: { precise?: boolean } = {}): string {
  if (mm == null || !Number.isFinite(mm)) return '—';
  if (units === 'metric') {
    if (Math.abs(mm) >= 1000) return `${(mm / 1000).toFixed(opts.precise ? 3 : 2)} m`;
    return `${Math.round(mm)} mm`;
  }
  const totalIn = mm / MM_PER_INCH;
  const sign = totalIn < 0 ? '-' : '';
  const abs = Math.abs(totalIn);
  let ft = Math.floor(abs / 12);
  // round to 1/4 inch normally, 1/16 when precise
  const step = opts.precise ? 16 : 4;
  let inch = Math.round((abs - ft * 12) * step) / step;
  if (inch >= 12) {
    ft += 1;
    inch -= 12;
  }
  const whole = Math.floor(inch);
  const frac = inch - whole;
  let fracStr = '';
  if (frac > 0) {
    const num = Math.round(frac * step);
    const g = gcd(num, step);
    fracStr = ` ${num / g}/${step / g}`;
  }
  if (ft === 0) return `${sign}${whole}${fracStr}″`;
  return `${sign}${ft}′ ${whole}${fracStr}″`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Format an area in mm². */
export function fmtArea(mm2: number | null | undefined, units: UnitSystem, digits = 1): string {
  if (mm2 == null || !Number.isFinite(mm2)) return '—';
  if (units === 'metric') return `${(mm2 / MM2_PER_M2).toFixed(digits)} m²`;
  return `${(mm2 / MM2_PER_SQFT).toFixed(digits === 1 ? 0 : digits)} sq ft`;
}

export function areaNumber(mm2: number, units: UnitSystem): number {
  return units === 'metric' ? mm2 / MM2_PER_M2 : mm2 / MM2_PER_SQFT;
}

export function areaUnitLabel(units: UnitSystem) {
  return units === 'metric' ? 'm²' : 'sq ft';
}

export function fmtVolumePaint(litres: number, units: UnitSystem): string {
  if (!Number.isFinite(litres)) return '—';
  if (units === 'metric') return `${litres.toFixed(1)} L`;
  return `${(litres / LITRES_PER_US_GALLON).toFixed(2)} US gal`;
}

/**
 * Parse a length typed by a person. Accepts:
 *  metric: "3.45" (metres when units=metric and value < 100), "3450mm", "345cm", "3.45m"
 *  imperial: 12' 6", 12'6, 12 ft 6 in, 150", 12.5ft, 12-6, "12 6 1/2"
 * Returns mm or null when it cannot be understood.
 */
export function parseLength(input: string, units: UnitSystem): number | null {
  const s = input.trim().toLowerCase().replace(/,/g, '.').replace(/[′’]/g, "'").replace(/[″”]/g, '"');
  if (!s) return null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(-?\d+(?:\.\d+)?)\s*mm$/))) return +m[1];
  if ((m = s.match(/^(-?\d+(?:\.\d+)?)\s*cm$/))) return +m[1] * 10;
  if ((m = s.match(/^(-?\d+(?:\.\d+)?)\s*m$/))) return +m[1] * 1000;
  // feet and inches
  const frac = (t?: string) => {
    if (!t) return 0;
    const f = t.match(/^(\d+)\/(\d+)$/);
    return f && +f[2] !== 0 ? +f[1] / +f[2] : 0;
  };
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)\s*(?:(\d+(?:\.\d+)?)\s*(\d+\/\d+)?\s*(?:"|in|inch|inches)?)?$/)))
    return +m[1] * MM_PER_FOOT + (m[2] ? +m[2] : 0) * MM_PER_INCH + frac(m[3]) * MM_PER_INCH;
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*(\d+\/\d+)?\s*(?:"|in|inch|inches)$/))) return (+m[1] + frac(m[2])) * MM_PER_INCH;
  if (units === 'imperial') {
    if ((m = s.match(/^(\d+)\s*-\s*(\d+(?:\.\d+)?)$/))) return +m[1] * MM_PER_FOOT + +m[2] * MM_PER_INCH;
    if ((m = s.match(/^(\d+)\s+(\d+(?:\.\d+)?)(?:\s+(\d+\/\d+))?$/)))
      return +m[1] * MM_PER_FOOT + +m[2] * MM_PER_INCH + frac(m[3]) * MM_PER_INCH;
    if ((m = s.match(/^(\d+(?:\.\d+)?)$/))) return +m[1] * MM_PER_FOOT; // bare number = feet
    return null;
  }
  if ((m = s.match(/^(-?\d+(?:\.\d+)?)$/))) {
    const v = +m[1];
    return v < 100 ? v * 1000 : v; // bare small number = metres, large = mm
  }
  return null;
}

/** Value to show in an input box for the given unit system. */
export function lenToInput(mm: number | null | undefined, units: UnitSystem): string {
  if (mm == null || !Number.isFinite(mm)) return '';
  if (units === 'metric') return (mm / 1000).toFixed(3).replace(/\.?0+$/, '');
  const totalIn = mm / MM_PER_INCH;
  const ft = Math.floor(totalIn / 12);
  const inch = Math.round((totalIn - ft * 12) * 8) / 8;
  return inch ? `${ft}' ${inch}"` : `${ft}'`;
}

export const STATUS_RANK: Record<Provenance, number> = { measured: 0, drawn: 1, estimated: 2, unknown: 3 };

/** The weakest provenance among inputs: a result is only as good as its worst input. */
export function worst(...statuses: Provenance[]): Provenance {
  let w: Provenance = 'measured';
  for (const s of statuses) if (STATUS_RANK[s] > STATUS_RANK[w]) w = s;
  return w;
}

export const STATUS_LABEL: Record<Provenance, string> = {
  measured: 'Measured',
  drawn: 'Drawn, not measured',
  estimated: 'Estimated',
  unknown: 'Missing',
};

export function measure(value: number, status: Provenance, method?: Measure['method']): Measure {
  return { value, status, method, at: Date.now() };
}

export const UNKNOWN: Measure = { value: 0, status: 'unknown' };
