import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AppSettings, PhotoMeta, Property } from '../core/types';

interface EstateDB extends DBSchema {
  properties: { key: string; value: Property };
  photoMeta: { key: string; value: PhotoMeta; indexes: { byProperty: string } };
  photoBlobs: { key: string; value: { id: string; blob: Blob; thumb: Blob } };
  exportBlobs: { key: string; value: { id: string; propertyId: string; blob: Blob } };
  settings: { key: string; value: AppSettings };
}

let dbp: Promise<IDBPDatabase<EstateDB>> | null = null;

export function db() {
  if (!dbp) {
    dbp = openDB<EstateDB>('estate-ai', 1, {
      upgrade(d) {
        d.createObjectStore('properties', { keyPath: 'id' });
        const pm = d.createObjectStore('photoMeta', { keyPath: 'id' });
        pm.createIndex('byProperty', 'propertyId');
        d.createObjectStore('photoBlobs', { keyPath: 'id' });
        d.createObjectStore('exportBlobs', { keyPath: 'id' });
        d.createObjectStore('settings');
      },
    });
  }
  return dbp;
}

/** For tests: forget the open connection. */
export function resetDbHandle() {
  dbp = null;
}

export async function loadAll(): Promise<{ properties: Property[]; photos: PhotoMeta[]; settings?: AppSettings }> {
  const d = await db();
  const [properties, photos, settings] = await Promise.all([d.getAll('properties'), d.getAll('photoMeta'), d.get('settings', 'app')]);
  return { properties, photos, settings };
}

export async function saveProperty(p: Property) {
  await (await db()).put('properties', p);
}

export async function deletePropertyData(id: string) {
  const d = await db();
  const metas = await d.getAllFromIndex('photoMeta', 'byProperty', id);
  const tx = d.transaction(['properties', 'photoMeta', 'photoBlobs', 'exportBlobs'], 'readwrite');
  await tx.objectStore('properties').delete(id);
  for (const m of metas) {
    await tx.objectStore('photoMeta').delete(m.id);
    await tx.objectStore('photoBlobs').delete(m.id);
  }
  let cursor = await tx.objectStore('exportBlobs').openCursor();
  while (cursor) {
    if (cursor.value.propertyId === id) await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function savePhoto(meta: PhotoMeta, blob: Blob, thumb: Blob) {
  const d = await db();
  const tx = d.transaction(['photoMeta', 'photoBlobs'], 'readwrite');
  await tx.objectStore('photoMeta').put(meta);
  await tx.objectStore('photoBlobs').put({ id: meta.id, blob, thumb });
  await tx.done;
}

export async function savePhotoMeta(meta: PhotoMeta) {
  await (await db()).put('photoMeta', meta);
}

export async function deletePhoto(id: string) {
  const d = await db();
  const tx = d.transaction(['photoMeta', 'photoBlobs'], 'readwrite');
  await tx.objectStore('photoMeta').delete(id);
  await tx.objectStore('photoBlobs').delete(id);
  await tx.done;
}

export async function getPhotoBlob(id: string, which: 'blob' | 'thumb' = 'blob'): Promise<Blob | undefined> {
  const rec = await (await db()).get('photoBlobs', id);
  return rec?.[which];
}

export async function saveExportBlob(id: string, propertyId: string, blob: Blob) {
  await (await db()).put('exportBlobs', { id, propertyId, blob });
}

export async function getExportBlob(id: string) {
  return (await (await db()).get('exportBlobs', id))?.blob;
}

export async function saveSettings(s: AppSettings) {
  await (await db()).put('settings', s, 'app');
}

export async function storageEstimate(): Promise<{ usage?: number; quota?: number; persisted?: boolean }> {
  try {
    const est = await navigator.storage?.estimate?.();
    const persisted = await navigator.storage?.persisted?.();
    return { usage: est?.usage, quota: est?.quota, persisted };
  } catch {
    return {};
  }
}
