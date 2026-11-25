import { jsPDF } from 'jspdf';
import { floorArea, roomFloorArea, totalInteriorArea } from '../../core/calc';
import { buildDescription } from '../../core/copilot';
import { areaDisclaimer, listingFacts, roomDescription } from '../../core/listing';
import { uid } from '../../core/model';
import type { PhotoCollection, PhotoMeta, Property } from '../../core/types';
import { STATUS_LABEL, fmtArea } from '../../core/units';
import { blobToDataUrl } from '../../store/backup';
import { getPhotoBlob, saveExportBlob } from '../../store/db';
import { getState, toast, updateProperty } from '../../store/store';
import { downloadBlob, safeFileName, svgToPngBlob, blobToImage } from '../../ui/image';
import { renderPlanSvg } from '../plan/export';

/** jsPDF's built-in fonts use WinAnsi; swap characters it cannot draw. */
export function pdfText(s: string): string {
  return s
    .replace(/′/g, "'")
    .replace(/″/g, '"')
    .replace(/≈/g, '~')
    .replace(/[→↔]/g, '-')
    .replace(/✓/g, 'yes')
    .replace(/✕/g, 'no')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E -ÿ–—•…\n]/g, '');
}

const GOLD: [number, number, number] = [155, 123, 64];
const INK: [number, number, number] = [29, 29, 31];
const MUTED: [number, number, number] = [110, 110, 110];

export interface ListingOptions {
  plans: boolean;
  rooms: boolean;
  photos: boolean;
  description: string;
  highlights: string[];
  photoIds: string[];
  render3d?: string | null; // data URL
  coverId?: string;
}

async function photoData(id: string, maxSide = 1600): Promise<{ data: string; w: number; h: number } | null> {
  const blob = await getPhotoBlob(id, 'blob');
  if (!blob) return null;
  const img = await blobToImage(blob);
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return { data: c.toDataURL('image/jpeg', 0.85), w: c.width, h: c.height };
}

function fitBox(iw: number, ih: number, bw: number, bh: number) {
  const k = Math.min(bw / iw, bh / ih);
  return { w: iw * k, h: ih * k };
}

function coverCrop(doc: jsPDF, data: string, iw: number, ih: number, x: number, y: number, w: number, h: number) {
  // jsPDF has no clipping for images in all versions; fit inside the box instead, centred.
  const f = fitBox(iw, ih, w, h);
  doc.addImage(data, 'JPEG', x + (w - f.w) / 2, y + (h - f.h) / 2, f.w, f.h);
}

function footer(doc: jsPDF, p: Property, page: number) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  doc.setDrawColor(220);
  doc.line(14, H - 12, W - 14, H - 12);
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(pdfText(areaDisclaimer(p)), 14, H - 8, { maxWidth: W - 50 });
  doc.text(String(page), W - 14, H - 8, { align: 'right' });
}

function heading(doc: jsPDF, text: string, y = 22) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...INK);
  doc.text(pdfText(text), 14, y);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.8);
  doc.line(14, y + 3, 40, y + 3);
  doc.setLineWidth(0.2);
  doc.setFont('helvetica', 'normal');
}

export async function buildListingPdf(p: Property, opts: ListingOptions): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const facts = listingFacts(p);
  const total = totalInteriorArea(p);
  let page = 1;

  // ---- cover
  doc.setFillColor(17, 17, 19);
  doc.rect(0, 0, W, H, 'F');
  const coverId = opts.coverId ?? opts.photoIds[0];
  const cover = coverId ? await photoData(coverId, 2000) : null;
  if (cover) coverCrop(doc, cover.data, cover.w, cover.h, W * 0.42, 0, W * 0.58, H);
  else if (opts.render3d) doc.addImage(opts.render3d, 'PNG', W * 0.42, H * 0.15, W * 0.56, (W * 0.56) / 1.6);
  doc.setTextColor(226, 200, 143);
  doc.setFontSize(9);
  doc.text('PROPERTY PRESENTATION', 16, 30, { charSpace: 1.2 });
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.text(doc.splitTextToSize(pdfText(p.name), W * 0.36), 16, 48);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(200, 200, 200);
  doc.text(doc.splitTextToSize(pdfText(p.address || ''), W * 0.36), 16, 78);
  const stats: [string, string][] = [];
  if (facts.beds) stats.push([String(facts.beds), facts.beds === 1 ? 'Bedroom' : 'Bedrooms']);
  if (facts.baths) stats.push([String(facts.baths), facts.baths === 1 ? 'Bathroom' : 'Bathrooms']);
  if (total.status !== 'unknown') stats.push([fmtArea(total.value, p.units, 0) + (total.status === 'measured' ? '' : '*'), 'Interior']);
  stats.push([String(facts.floors), facts.floors === 1 ? 'Level' : 'Levels']);
  stats.forEach(([v, l], i) => {
    const x = 16 + i * 30;
    doc.setTextColor(226, 200, 143);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(pdfText(v), x, 120);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(170, 170, 170);
    doc.text(l, x, 126);
  });
  if (opts.highlights.length) {
    doc.setFontSize(10);
    doc.setTextColor(220, 220, 220);
    opts.highlights.slice(0, 6).forEach((h, i) => doc.text(pdfText('•  ' + h), 16, 145 + i * 7, { maxWidth: W * 0.36 }));
  }
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text(pdfText(`Prepared ${new Date().toLocaleDateString()} with ESTATE AI${total.status === 'measured' ? '' : ' · * not fully measured'}`), 16, H - 10);

  // ---- description
  doc.addPage();
  page++;
  heading(doc, 'About the property');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  const desc = doc.splitTextToSize(pdfText(opts.description || buildDescription(p)), W * 0.55);
  doc.text(desc, 14, 36);
  if (opts.render3d) {
    const f = fitBox(1600, 1000, W * 0.36, H * 0.6);
    doc.addImage(opts.render3d, 'PNG', W - 14 - f.w, 30, f.w, f.h);
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text('3D model generated from the floor plan (not a photograph).', W - 14 - f.w, 30 + f.h + 5);
  }
  footer(doc, p, page);

  // ---- floor plans
  if (opts.plans) {
    for (const f of [...p.floors].sort((a, b) => a.level - b.level)) {
      if (!p.rooms.some((r) => r.floorId === f.id && r.polygon.length >= 3)) continue;
      doc.addPage();
      page++;
      const fa = floorArea(p, f);
      heading(doc, `${f.name} — ${fmtArea(fa.value, p.units)}${fa.status === 'measured' ? '' : '*'}`);
      const { svg, width, height } = renderPlanSvg(p, f.id, { title: false, pxWidth: 2400, showFurniture: false });
      const png = await svgToPngBlob(svg, width, height);
      const data = await blobToDataUrl(png);
      const box = fitBox(width, height, W - 28, H - 50);
      doc.addImage(data, 'PNG', (W - box.w) / 2, 32, box.w, box.h);
      footer(doc, p, page);
    }
  }

  // ---- room schedule
  if (opts.rooms && p.rooms.length) {
    doc.addPage();
    page++;
    heading(doc, 'Rooms');
    let y = 36;
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text('ROOM', 14, y);
    doc.text('LEVEL', 70, y);
    doc.text('AREA', 105, y);
    doc.text('DESCRIPTION', 140, y);
    y += 3;
    doc.setDrawColor(220);
    doc.line(14, y, W - 14, y);
    y += 6;
    for (const r of p.rooms) {
      const a = roomFloorArea(r);
      const descLines = doc.splitTextToSize(pdfText(roomDescription(p, r)), W - 154);
      const rowH = Math.max(7, descLines.length * 4.2 + 2.5);
      if (y + rowH > H - 18) {
        footer(doc, p, page);
        doc.addPage();
        page++;
        heading(doc, 'Rooms (continued)');
        y = 40;
      }
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      doc.text(pdfText(r.name), 14, y);
      doc.setTextColor(...MUTED);
      doc.text(pdfText(p.floors.find((f) => f.id === r.floorId)?.name ?? ''), 70, y);
      doc.setTextColor(...INK);
      doc.text(a.status === 'unknown' ? '-' : pdfText(fmtArea(a.value, p.units) + (a.status === 'measured' ? '' : '*')), 105, y);
      doc.setFontSize(9);
      doc.setTextColor(70, 70, 70);
      doc.text(descLines, 140, y);
      y += rowH;
      doc.setDrawColor(238);
      doc.line(14, y - 4, W - 14, y - 4);
    }
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.text(pdfText(`Total interior: ${fmtArea(total.value, p.units)}${total.status === 'measured' ? '' : '*'} (${STATUS_LABEL[total.status].toLowerCase()})`), 14, Math.min(y + 4, H - 16));
    doc.setFont('helvetica', 'normal');
    footer(doc, p, page);
  }

  // ---- photos, 2 × 2 per page
  if (opts.photos && opts.photoIds.length) {
    const ids = opts.photoIds;
    const metas = getState().photos;
    for (let i = 0; i < ids.length; i += 4) {
      doc.addPage();
      page++;
      heading(doc, i === 0 ? 'Photographs' : 'Photographs (continued)');
      const cellW = (W - 28 - 8) / 2;
      const cellH = (H - 50 - 14) / 2;
      for (let k = 0; k < 4 && i + k < ids.length; k++) {
        const ph = await photoData(ids[i + k]);
        if (!ph) continue;
        const cx = 14 + (k % 2) * (cellW + 8);
        const cy = 32 + Math.floor(k / 2) * (cellH + 7);
        const f = fitBox(ph.w, ph.h, cellW, cellH - 6);
        doc.addImage(ph.data, 'JPEG', cx + (cellW - f.w) / 2, cy, f.w, f.h);
        const meta = metas.find((m) => m.id === ids[i + k]);
        const room = p.rooms.find((r) => r.id === meta?.roomId)?.name;
        doc.setFontSize(8.5);
        doc.setTextColor(...MUTED);
        doc.text(pdfText([room, meta?.tags.includes('staged') ? 'virtually staged' : '', meta?.note].filter(Boolean).join(' · ')), cx + (cellW - f.w) / 2, cy + f.h + 4, { maxWidth: cellW });
      }
      footer(doc, p, page);
    }
  }

  return doc.output('blob');
}

export async function recordExport(p: Property, blob: Blob, name: string, kind: 'pdf' | 'png' | 'svg') {
  const id = uid('ex_');
  await saveExportBlob(id, p.id, blob);
  updateProperty(p.id, (x) => ({ ...x, exports: [{ id, kind, name, createdAt: Date.now(), size: blob.size }, ...x.exports] }), { history: false });
}

export async function exportCollectionPdf(p: Property, c: PhotoCollection) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const metas: PhotoMeta[] = getState().photos;
  for (let i = 0; i < c.photoIds.length; i += 6) {
    if (i > 0) doc.addPage();
    heading(doc, `${c.name}${i ? ' (continued)' : ''}`);
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(pdfText(p.name + (p.address ? ' · ' + p.address : '')), 14, 31);
    const cw = (W - 28 - 16) / 3;
    const ch = (H - 60) / 2;
    for (let k = 0; k < 6 && i + k < c.photoIds.length; k++) {
      const ph = await photoData(c.photoIds[i + k], 1200);
      if (!ph) continue;
      const x = 14 + (k % 3) * (cw + 8);
      const y = 38 + Math.floor(k / 3) * (ch + 4);
      const f = fitBox(ph.w, ph.h, cw, ch - 8);
      doc.addImage(ph.data, 'JPEG', x, y, f.w, f.h);
      const m = metas.find((mm) => mm.id === c.photoIds[i + k]);
      doc.setFontSize(8);
      doc.text(pdfText([p.rooms.find((r) => r.id === m?.roomId)?.name, m?.note].filter(Boolean).join(' · ') || (m?.name ?? '')), x, y + f.h + 4, { maxWidth: cw });
    }
  }
  const blob = doc.output('blob');
  const name = `${safeFileName(p.name)}-${safeFileName(c.name)}.pdf`;
  downloadBlob(blob, name);
  await recordExport(p, blob, name, 'pdf');
  toast('Collection PDF saved.');
}
