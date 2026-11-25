import { roomFloorArea, roomHasShape, totalInteriorArea } from './calc';
import { FLOOR_MATERIALS, roomTypeLabel } from './catalog';
import { bounds } from './geometry';
import type { Property, Room } from './types';
import { fmtArea, fmtLen } from './units';

/** A factual one-line room description built only from saved data. */
export function roomDescription(p: Property, r: Room): string {
  if (r.listingText?.trim()) return r.listingText.trim();
  const parts: string[] = [];
  const u = p.units;
  if (roomHasShape(r)) {
    const a = roomFloorArea(r);
    const b = bounds(r.polygon);
    const dims = r.polygon.length === 4 ? `${fmtLen(b.w, u)} × ${fmtLen(b.h, u)}` : `approx. ${fmtLen(b.w, u)} × ${fmtLen(b.h, u)} overall`;
    parts.push(`${dims}, ${a.status === 'measured' ? '' : 'approx. '}${fmtArea(a.value, u)}`);
  } else parts.push('size not recorded');
  if (r.ceilingHeight.status === 'measured') parts.push(`${fmtLen(r.ceilingHeight.value, u)} ceiling`);
  const floor = FLOOR_MATERIALS.find((m) => m.id === r.finishes.floorMaterial);
  if (floor) parts.push(`${floor.name.toLowerCase()} floor`);
  const win = r.openings.filter((o) => o.type === 'window').length;
  if (win) parts.push(`${win} window${win > 1 ? 's' : ''}`);
  if (r.openings.some((o) => o.type === 'sliding-door')) parts.push('sliding door');
  return parts.join(', ') + '.';
}

export function areaDisclaimer(p: Property): string {
  const t = totalInteriorArea(p);
  const base = 'Measurements were taken by the owner/agent with a tape or laser measure and are a guide only.';
  if (t.status === 'measured') return base + ' Areas are calculated from those measurements and exclude spaces marked as not counted.';
  return base + ' Some dimensions are drawn or estimated rather than measured; figures marked * are not verified. Interested parties should make their own enquiries.';
}

export function listingFacts(p: Property) {
  const beds = p.rooms.filter((r) => r.type === 'bedroom').length;
  const baths = p.rooms.filter((r) => r.type === 'bathroom').length;
  const total = totalInteriorArea(p);
  return { beds, baths, floors: p.floors.length, total, roomTypes: Array.from(new Set(p.rooms.map((r) => roomTypeLabel(r.type)))) };
}
