import type { PhotoMeta, Property } from '../core/types';
import * as idb from './db';

export const BACKUP_FORMAT = 'estate-ai-backup';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  properties: Property[];
  photos: (PhotoMeta & { data?: string; thumbData?: string })[];
}

export async function blobToDataUrl(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  return `data:${b.type || 'application/octet-stream'};base64,${btoa(bin)}`;
}

export function dataUrlToBlob(url: string): Blob {
  const [head, b64] = url.split(',');
  const mime = head.match(/data:([^;]+)/)?.[1] ?? 'application/octet-stream';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/** Build a backup of the given properties (all when omitted), photos included. */
export async function createBackup(properties: Property[], photos: PhotoMeta[], opts: { includePhotos?: boolean } = {}): Promise<BackupFile> {
  const ids = new Set(properties.map((p) => p.id));
  const out: BackupFile['photos'] = [];
  for (const m of photos.filter((ph) => ids.has(ph.propertyId))) {
    if (opts.includePhotos === false) {
      out.push({ ...m });
      continue;
    }
    const [blob, thumb] = await Promise.all([idb.getPhotoBlob(m.id, 'blob'), idb.getPhotoBlob(m.id, 'thumb')]);
    out.push({ ...m, data: blob ? await blobToDataUrl(blob) : undefined, thumbData: thumb ? await blobToDataUrl(thumb) : undefined });
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), properties, photos: out };
}

export function validateBackup(x: unknown): asserts x is BackupFile {
  const b = x as BackupFile;
  if (!b || b.format !== BACKUP_FORMAT) throw new Error('This file is not an ESTATE AI backup.');
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) throw new Error('This backup was made by a newer version of ESTATE AI.');
  if (!Array.isArray(b.properties) || !Array.isArray(b.photos)) throw new Error('The backup is incomplete.');
  for (const p of b.properties) {
    if (!p.id || !Array.isArray(p.rooms) || !Array.isArray(p.floors)) throw new Error('A property in the backup is damaged.');
  }
}

/**
 * Restore a backup. mode 'merge' adds the backup's properties, replacing any
 * with the same id; mode 'replace' deletes everything else first.
 */
export async function restoreBackup(
  b: BackupFile,
  mode: 'merge' | 'replace',
  existing: Property[],
): Promise<{ properties: Property[]; photos: PhotoMeta[] }> {
  validateBackup(b);
  if (mode === 'replace') for (const p of existing) await idb.deletePropertyData(p.id);
  else for (const p of b.properties) if (existing.some((e) => e.id === p.id)) await idb.deletePropertyData(p.id);
  for (const p of b.properties) await idb.saveProperty(p);
  for (const ph of b.photos) {
    const { data, thumbData, ...meta } = ph;
    if (data) {
      const blob = dataUrlToBlob(data);
      await idb.savePhoto(meta, blob, thumbData ? dataUrlToBlob(thumbData) : blob);
    } else await idb.savePhotoMeta(meta);
  }
  const all = await idb.loadAll();
  return { properties: all.properties, photos: all.photos };
}
