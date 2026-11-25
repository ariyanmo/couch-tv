// Local, rule-based property copilot. Every number comes from the saved data
// and the calculation module. When data is missing, it says so instead of
// guessing. An optional language model (off by default) may only rephrase
// these facts; it never supplies figures.

import { FURNITURE, catalogById, roomTypeLabel, FLOOR_MATERIALS } from './catalog';
import {
  flooringNeed,
  floorArea,
  missingMeasurements,
  paintNeed,
  roomCeilingArea,
  roomFloorArea,
  roomHasShape,
  roomWallArea,
  totalInteriorArea,
  type Figure,
} from './calc';
import { bounds, findFit, orientedRect } from './geometry';
import type { Property, Provenance, Room } from './types';
import { STATUS_LABEL, fmtArea, fmtLen, fmtVolumePaint } from './units';

export interface Fact {
  label: string;
  value: string;
  status?: Provenance;
}

export interface CopilotAnswer {
  intent: string;
  text: string;
  facts: Fact[];
  roomIds?: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();

export function findRoomInText(p: Property, q: string): Room | undefined {
  const t = norm(q);
  // longest name match first ("main bedroom" before "bedroom")
  const byName = [...p.rooms].sort((a, b) => b.name.length - a.name.length).find((r) => t.includes(norm(r.name)));
  if (byName) return byName;
  const typeWords: Record<string, Room['type']> = {
    living: 'living', lounge: 'living', 'family room': 'living', bedroom: 'bedroom', kitchen: 'kitchen', bathroom: 'bathroom',
    bath: 'bathroom', dining: 'dining', hall: 'hall', hallway: 'hall', laundry: 'laundry', office: 'office', study: 'office',
    garage: 'garage', balcony: 'balcony',
  };
  for (const [w, type] of Object.entries(typeWords)) {
    if (new RegExp(`\\b${w}\\b`).test(t)) {
      const rooms = p.rooms.filter((r) => r.type === type);
      if (rooms.length) return rooms.sort((a, b) => roomFloorArea(b).value - roomFloorArea(a).value)[0];
    }
  }
  return undefined;
}

const statusNote = (f: Figure) =>
  f.status === 'measured' ? 'calculated from measurements' : f.status === 'unknown' ? 'missing' : STATUS_LABEL[f.status].toLowerCase();

function figFact(label: string, f: Figure, fmt: (v: number) => string): Fact {
  return { label, value: f.status === 'unknown' ? 'Not recorded' : fmt(f.value), status: f.status };
}

function roomDims(r: Room, units: Property['units']) {
  if (!roomHasShape(r)) return 'no shape recorded';
  const b = bounds(r.polygon);
  return r.polygon.length === 4 ? `${fmtLen(b.w, units)} × ${fmtLen(b.h, units)}` : `${r.polygon.length} walls, overall ${fmtLen(b.w, units)} × ${fmtLen(b.h, units)}`;
}

function answerRoomSize(p: Property, r: Room): CopilotAnswer {
  const u = p.units;
  const a = roomFloorArea(r);
  const facts: Fact[] = [
    figFact('Floor area', a, (v) => fmtArea(v, u, 2)),
    { label: 'Dimensions', value: roomDims(r, u), status: a.status },
    { label: 'Ceiling height', value: r.ceilingHeight.status === 'unknown' ? 'Not recorded' : fmtLen(r.ceilingHeight.value, u), status: r.ceilingHeight.status },
  ];
  if (a.status === 'unknown') return { intent: 'room-size', text: `${r.name} has no recorded shape yet, so I can't give its size. Add its wall lengths in the scanner.`, facts, roomIds: [r.id] };
  return {
    intent: 'room-size',
    text: `${r.name} is ${fmtArea(a.value, u, 2)} (${statusNote(a)}), ${roomDims(r, u)}.${a.reasons.length ? ' Note: ' + a.reasons.join('; ') + '.' : ''}`,
    facts,
    roomIds: [r.id],
  };
}

function answerTotal(p: Property): CopilotAnswer {
  const u = p.units;
  const total = totalInteriorArea(p);
  const facts: Fact[] = [figFact('Total interior area', total, (v) => fmtArea(v, u))];
  for (const f of p.floors) facts.push(figFact(f.name, floorArea(p, f), (v) => fmtArea(v, u)));
  const excluded = p.rooms.filter((r) => !r.countsTowardArea);
  const measuredOnly = p.rooms.filter((r) => r.countsTowardArea && roomFloorArea(r).status === 'measured');
  const measuredSum = measuredOnly.reduce((s, r) => s + roomFloorArea(r).value, 0);
  facts.push({ label: 'From fully measured rooms only', value: fmtArea(measuredSum, u), status: 'measured' });
  let text = `Total interior area is ${fmtArea(total.value, u)} (${statusNote(total)}).`;
  if (total.status !== 'measured')
    text += ` Only ${measuredOnly.length} of ${p.rooms.filter((r) => r.countsTowardArea).length} counted rooms are fully measured, adding up to ${fmtArea(measuredSum, u)}.`;
  if (excluded.length) text += ` Not counted: ${excluded.map((r) => r.name).join(', ')}.`;
  return { intent: 'total-area', text, facts };
}

function pickFurniture(q: string) {
  const t = norm(q);
  const wantsKing = /\bking\b/.test(t);
  const wantsQueen = /\bqueen\b/.test(t);
  const region = /\b(au|australia|nz)\b/.test(t) ? 'au' : /\buk\b/.test(t) ? 'uk' : /\bcal(ifornia)?\b/.test(t) ? 'cal' : 'us';
  if (wantsKing) return catalogById(region === 'au' ? 'bed-king-au' : region === 'uk' ? 'bed-king-uk' : region === 'cal' ? 'bed-cal-king' : 'bed-king-us');
  if (wantsQueen) return catalogById(region === 'au' ? 'bed-queen-au' : 'bed-queen-us');
  const words: [RegExp, string][] = [
    [/\bdouble bed\b/, 'bed-double'], [/\bsingle bed\b/, 'bed-single'], [/\bcorner sofa\b/, 'sofa-l'], [/\b(3|three) seat/, 'sofa-3'],
    [/\bsofa|couch\b/, 'sofa-3'], [/\bdining table\b/, 'table-dining-6'], [/\bdesk\b/, 'desk'], [/\bwardrobe\b/, 'wardrobe'],
    [/\bisland\b/, 'island'], [/\bfridge\b/, 'fridge'], [/\bpiano\b/, ''], [/\bbath(tub)?\b/, 'bath'], [/\bbed\b/, 'bed-queen-us'],
  ];
  for (const [re, id] of words) if (re.test(t)) return id ? catalogById(id) : undefined;
  return FURNITURE.find((f) => t.includes(norm(f.name)));
}

/** Door swing areas as obstacles so furniture does not block doors. */
export function doorSwings(r: Room): ReturnType<typeof orientedRect>[] {
  const out: ReturnType<typeof orientedRect>[] = [];
  for (const o of r.openings) {
    if (o.type === 'window' || o.type === 'sliding-door' || o.type === 'opening' || o.swingIn === false) continue;
    const a = r.polygon[o.edge];
    const b = r.polygon[(o.edge + 1) % r.polygon.length];
    if (!a || !b) continue;
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / L;
    const uy = (b.y - a.y) / L;
    // inward normal: towards the room centroid side
    const cx = r.polygon.reduce((s, p) => s + p.x, 0) / r.polygon.length;
    const cy = r.polygon.reduce((s, p) => s + p.y, 0) / r.polygon.length;
    let nx = -uy;
    let ny = ux;
    const mx = a.x + ux * (o.offset + o.width.value / 2);
    const my = a.y + uy * (o.offset + o.width.value / 2);
    if ((cx - mx) * nx + (cy - my) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const w = o.width.value;
    const ang = (Math.atan2(uy, ux) * 180) / Math.PI;
    out.push(orientedRect(mx + (nx * w) / 2, my + (ny * w) / 2, w, w, ang));
  }
  return out;
}

export function fitReport(r: Room, itemId: string) {
  const item = catalogById(itemId)!;
  const empty = findFit(r.polygon, item.w, item.d);
  const withDoors = findFit(r.polygon, item.w, item.d, { obstacles: doorSwings(r) });
  const walkway = findFit(r.polygon, item.w, item.d, { obstacles: doorSwings(r), clearance: 600 });
  return { item, empty, withDoors, walkway, area: roomFloorArea(r) };
}

function answerFit(p: Property, q: string): CopilotAnswer {
  const item = pickFurniture(q);
  if (!item) return { intent: 'fit', text: 'Which piece of furniture? For example "Will a king-size bed fit in the main bedroom?". You can also test any size in the Furniture studio.', facts: [] };
  const named = findRoomInText(p, q.replace(/\bking\b|\bqueen\b|\bbed\b(?!room)/gi, ''));
  const candidates = named
    ? [named]
    : p.rooms.filter((r) => roomHasShape(r) && (item.kind === 'bed' ? r.type === 'bedroom' : item.kind === 'bath' ? r.type === 'bathroom' : true));
  if (!candidates.length) return { intent: 'fit', text: `No room with a recorded shape to test the ${item.name} in.`, facts: [] };
  const u = p.units;
  const facts: Fact[] = [{ label: item.name, value: `${fmtLen(item.w, u)} × ${fmtLen(item.d, u)} (typical size${item.note ? ', ' + item.note : ''})` }];
  const lines: string[] = [];
  for (const r of candidates.slice(0, 6)) {
    if (!roomHasShape(r)) {
      lines.push(`${r.name}: no shape recorded, can't test.`);
      continue;
    }
    const rep = fitReport(r, item.id);
    const caveat = rep.area.status === 'measured' ? '' : ` (room size is ${STATUS_LABEL[rep.area.status].toLowerCase()}, so treat this as provisional)`;
    let verdict: string;
    if (rep.walkway.fits) verdict = `fits with at least 600 mm to walk around it and clear of door swings`;
    else if (rep.withDoors.fits) verdict = `fits clear of door swings, but with less than 600 mm walkway on some side`;
    else if (rep.empty.fits) verdict = `only fits if it blocks a door swing`;
    else verdict = `does not fit at any wall-aligned position`;
    lines.push(`${r.name}: ${verdict}${caveat}.`);
    facts.push({ label: r.name, value: verdict, status: rep.area.status });
  }
  return {
    intent: 'fit',
    text: `Testing a ${item.name} (${fmtLen(item.w, u)} × ${fmtLen(item.d, u)}, a typical retail size; enter your exact piece in the Furniture studio):\n` + lines.join('\n'),
    facts,
    roomIds: candidates.map((r) => r.id),
  };
}

function answerFlooring(p: Property, q: string): CopilotAnswer {
  const r = findRoomInText(p, q);
  const rooms = r ? [r] : p.rooms.filter((x) => x.countsTowardArea);
  const need = flooringNeed(rooms, p.areaSettings);
  const u = p.units;
  return {
    intent: 'flooring',
    text: `${r ? r.name : 'All counted rooms'}: floor area ${fmtArea(need.area.value, u, 2)} (${statusNote(need.area)}). With ${p.areaSettings.flooringWastePct}% cutting waste, order about ${fmtArea(need.withWaste, u, 2)} of flooring.${need.area.status !== 'measured' ? ' Measure the rooms before ordering.' : ''}`,
    facts: [figFact('Floor area', need.area, (v) => fmtArea(v, u, 2)), { label: `With ${p.areaSettings.flooringWastePct}% waste`, value: fmtArea(need.withWaste, u, 2), status: need.area.status }],
    roomIds: rooms.map((x) => x.id),
  };
}

function answerPaint(p: Property, q: string): CopilotAnswer {
  const r = findRoomInText(p, q);
  const rooms = r ? [r] : p.rooms.filter((x) => x.countsTowardArea);
  const ceilings = /ceiling/.test(q.toLowerCase());
  const need = paintNeed(rooms, p.areaSettings, ceilings);
  const u = p.units;
  const s = p.areaSettings;
  const wall = sumWallGross(rooms);
  return {
    intent: 'paint',
    text: `${r ? r.name : 'All counted rooms'}: about ${fmtArea(need.wallArea.value, u, 1)} of wall to paint after taking out doors and windows (${statusNote(need.wallArea)}).${ceilings && need.ceilingArea ? ` Ceilings add ${fmtArea(need.ceilingArea.value, u, 1)}.` : ''} At ${s.paintCoats} coats and ${s.paintCoveragePerLitre} m² per litre, that is about ${fmtVolumePaint(need.litres, u)} of paint.`,
    facts: [
      figFact('Gross wall area', wall, (v) => fmtArea(v, u, 1)),
      figFact('Net paintable wall area', need.wallArea, (v) => fmtArea(v, u, 1)),
      { label: 'Paint', value: fmtVolumePaint(need.litres, u), status: need.wallArea.status },
    ],
    roomIds: rooms.map((x) => x.id),
  };
}

function sumWallGross(rooms: Room[]): Figure {
  const parts = rooms.map((r) => roomWallArea(r).gross);
  const value = parts.reduce((s, f) => s + f.value, 0);
  const order: Provenance[] = ['measured', 'drawn', 'estimated', 'unknown'];
  const status = parts.reduce<Provenance>((w, f) => (order.indexOf(f.status) > order.indexOf(w) ? f.status : w), 'measured');
  return { value, status, reasons: [] };
}

function answerOpportunities(p: Property): CopilotAnswer {
  const obs = p.inspection.filter((i) => i.source === 'observation' && (i.category === 'opportunity' || i.category === 'outdated' || i.category === 'damage' || i.condition === 'poor' || i.condition === 'damaged'));
  const pro = p.inspection.filter((i) => i.source === 'professional');
  const roomName = (id?: string) => p.rooms.find((r) => r.id === id)?.name ?? 'Whole property';
  if (!obs.length && !pro.length)
    return { intent: 'opportunities', text: 'No inspection notes are saved yet, so I have nothing to base renovation ideas on. Add observations in the Inspection section.', facts: [] };
  let text = '';
  if (obs.length) text += 'From your own observations (not a professional inspection):\n' + obs.map((i) => `• ${roomName(i.roomId)}: ${i.title} (${i.condition})`).join('\n');
  if (pro.length) text += (text ? '\n\n' : '') + 'From professional reports you entered:\n' + pro.map((i) => `• ${roomName(i.roomId)}: ${i.title}${i.inspector ? ' — ' + i.inspector : ''}`).join('\n');
  return { intent: 'opportunities', text, facts: [] };
}

export function buildDescription(p: Property): string {
  const u = p.units;
  const counted = p.rooms.filter((r) => r.countsTowardArea);
  const beds = p.rooms.filter((r) => r.type === 'bedroom').length;
  const baths = p.rooms.filter((r) => r.type === 'bathroom').length;
  const total = totalInteriorArea(p);
  const parts: string[] = [];
  const kind = p.floors.length > 1 ? `${p.floors.length}-level home` : 'single-level home';
  parts.push(
    `${p.name}${p.address ? ', ' + p.address + ',' : ''} is a ${beds ? beds + '-bedroom' : ''}${beds && baths ? ', ' : ''}${baths ? baths + '-bathroom ' : ' '}${kind}.`.replace(/\s+/g, ' ').replace(' .', '.'),
  );
  if (total.status !== 'unknown' && total.value > 0)
    parts.push(`Interior area is ${total.status === 'measured' ? '' : 'approximately '}${fmtArea(total.value, u)}${total.status === 'measured' ? ' (calculated from measurements)' : ' (not all rooms are measured)'}.`);
  const shaped = counted.filter(roomHasShape).sort((a, b) => roomFloorArea(b).value - roomFloorArea(a).value);
  if (shaped[0]) {
    const big = shaped[0];
    parts.push(`The largest space is the ${big.name.toLowerCase()} at ${fmtArea(roomFloorArea(big).value, u)}.`);
  }
  const living = p.rooms.filter((r) => ['living', 'dining', 'kitchen'].includes(r.type)).map((r) => r.name.toLowerCase());
  if (living.length) parts.push(`Living areas include the ${listJoin(living)}.`);
  const others = p.rooms.filter((r) => ['office', 'laundry', 'garage', 'balcony', 'storage'].includes(r.type)).map((r) => r.name.toLowerCase());
  if (others.length) parts.push(`Also: ${listJoin(others)}.`);
  const tall = p.rooms.filter((r) => r.ceilingHeight.status === 'measured' && r.ceilingHeight.value >= 2700);
  if (tall.length) parts.push(`Measured ceiling heights of ${fmtLen(Math.max(...tall.map((r) => r.ceilingHeight.value)), u)} in ${listJoin(tall.map((r) => r.name.toLowerCase()))}.`);
  const floors = Array.from(new Set(counted.map((r) => FLOOR_MATERIALS.find((m) => m.id === r.finishes.floorMaterial)?.name).filter(Boolean)));
  if (floors.length && p.rooms.some((r) => r.concepts.length === 0)) parts.push(`Recorded flooring: ${listJoin(floors.map((f) => f!.toLowerCase()))}.`);
  if (p.highlights?.length) parts.push(`Highlights: ${p.highlights.join('; ')}.`);
  return parts.join(' ');
}

function listJoin(xs: string[]) {
  if (xs.length <= 1) return xs.join('');
  return xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];
}

export function buildSummary(p: Property): CopilotAnswer {
  const u = p.units;
  const total = totalInteriorArea(p);
  const byType = new Map<string, number>();
  p.rooms.forEach((r) => byType.set(roomTypeLabel(r.type), (byType.get(roomTypeLabel(r.type)) ?? 0) + 1));
  const facts: Fact[] = [
    { label: 'Floors', value: String(p.floors.length) },
    { label: 'Rooms', value: String(p.rooms.length) },
    ...[...byType.entries()].map(([k, v]) => ({ label: k, value: String(v) })),
    figFact('Interior area', total, (v) => fmtArea(v, u)),
    { label: 'Photos', value: '' },
    { label: 'Inspection notes', value: String(p.inspection.length) },
  ].filter((f) => f.value !== '');
  const miss = missingMeasurements(p).length;
  return {
    intent: 'summary',
    text: `${p.name}: ${p.floors.length} floor(s), ${p.rooms.length} room(s) (${[...byType.entries()].map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ')}). Interior area ${fmtArea(total.value, u)} (${statusNote(total)}). ${miss ? `${miss} measurement(s) still missing.` : 'All recorded rooms are fully measured.'}`,
    facts,
  };
}

const HELP =
  'I answer from your saved measurements. Try: "How large is the living room?", "What is the total floor area?", "Will a king-size bed fit?", "How much flooring for the kitchen?", "How much wall needs painting?", "What renovation opportunities are there?", "Write a property description", "Summarize the property", "What still needs measuring?".';

export function ask(p: Property, question: string): CopilotAnswer {
  const q = question.trim();
  const t = norm(q);
  if (!t) return { intent: 'help', text: HELP, facts: [] };
  if (/\b(fit|fits|fitting)\b/.test(t)) return answerFit(p, q);
  if (/\b(floor(ing)?|tiles?|carpet|laminate|timber)\b.*\b(need|how much|order|buy)\b|\bhow much (flooring|carpet|tile)/.test(t)) return answerFlooring(p, q);
  if (/\b(paint|painting|wall surface|wall area)\b/.test(t)) return answerPaint(p, q);
  if (/\b(renovat|opportunit|improve|upgrade|outdated|damage)/.test(t)) return answerOpportunities(p);
  if (/\b(describe|description|listing|advert|write)\b/.test(t))
    return { intent: 'description', text: buildDescription(p), facts: [{ label: 'Source', value: 'Saved rooms, measurements and highlights only' }] };
  if (/\b(summar|overview|features)\b/.test(t)) return buildSummary(p);
  if (/\b(missing|still need|what should i measure|incomplete|to measure)\b/.test(t)) {
    const miss = missingMeasurements(p);
    return {
      intent: 'missing',
      text: miss.length ? `Still to measure (${miss.length}):\n` + miss.slice(0, 25).map((m) => `• ${m.roomName}: ${m.what}`).join('\n') + (miss.length > 25 ? '\n…' : '') : 'Every recorded wall, ceiling and opening is measured.',
      facts: [],
    };
  }
  if (/\bceiling\b/.test(t)) {
    const r = findRoomInText(p, q);
    if (r) {
      const c = roomCeilingArea(r);
      return {
        intent: 'ceiling',
        text: `${r.name}: ceiling height ${r.ceilingHeight.status === 'unknown' ? 'not recorded' : fmtLen(r.ceilingHeight.value, p.units) + ' (' + STATUS_LABEL[r.ceilingHeight.status].toLowerCase() + ')'}; ceiling area ${fmtArea(c.value, p.units, 2)} (${statusNote(c)}, flat ceiling assumed).`,
        facts: [],
        roomIds: [r.id],
      };
    }
  }
  if (/\b(total|whole|entire|overall|all)\b.*\b(area|size|square|sq)\b|\b(area|size)\b.*\b(total|property|house|home|apartment)\b/.test(t)) return answerTotal(p);
  if (/\bhow many\b.*\b(bed|bath|room)/.test(t)) return buildSummary(p);
  const r = findRoomInText(p, q);
  if (r && /\b(large|big|size|area|dimension|dimensions|measure|wide|long|square|sq)\b/.test(t)) return answerRoomSize(p, r);
  if (r) return answerRoomSize(p, r);
  if (/\b(area|square|sq)\b/.test(t)) return answerTotal(p);
  return { intent: 'help', text: "I can't answer that from the saved data. " + HELP, facts: [] };
}
