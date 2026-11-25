import { useRef, useSyncExternalStore } from 'react';
import { createProperty, uid } from '../core/model';
import type { AppSettings, PhotoMeta, Property, Room } from '../core/types';
import * as idb from './db';

export interface State {
  ready: boolean;
  properties: Property[];
  photos: PhotoMeta[];
  settings: AppSettings;
  toast?: { id: number; text: string; kind?: 'ok' | 'warn' | 'error' };
}

export const DEFAULT_SETTINGS: AppSettings = {
  units: 'metric',
  ai: { enabled: false, provider: 'ollama', endpoint: 'http://localhost:11434', model: 'llama3.2' },
  gridMm: 50,
  snap: true,
};

let state: State = { ready: false, properties: [], photos: [], settings: DEFAULT_SETTINGS };
const listeners = new Set<() => void>();
const pending = new Map<string, ReturnType<typeof setTimeout>>();
const undoStacks = new Map<string, Property[]>();
const redoStacks = new Map<string, Property[]>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function getState() {
  return state;
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * Subscribe to a slice of state. The selector result is cached per state
 * object, so selectors may derive new arrays (filter/map) without causing
 * render loops; components re-render only when the state actually changes.
 */
export function useStore<T>(sel: (s: State) => T): T {
  const cache = useRef<{ s: State | null; v: T }>({ s: null, v: undefined as T });
  const get = () => {
    if (cache.current.s !== state) cache.current = { s: state, v: sel(state) };
    return cache.current.v;
  };
  return useSyncExternalStore(subscribe, get, get);
}

export async function init() {
  try {
    const { properties, photos, settings } = await idb.loadAll();
    properties.sort((a, b) => b.updatedAt - a.updatedAt);
    set({ ready: true, properties, photos, settings: { ...DEFAULT_SETTINGS, ...settings, ai: { ...DEFAULT_SETTINGS.ai, ...settings?.ai } } });
    // Ask the browser to keep our data (Safari may evict site data otherwise).
    navigator.storage?.persist?.().catch(() => {});
  } catch (e) {
    console.error(e);
    set({ ready: true });
    toast('Local storage is unavailable in this browser mode. Changes will not be saved.', 'error');
  }
}

let toastSeq = 0;
export function toast(text: string, kind: 'ok' | 'warn' | 'error' = 'ok') {
  const id = ++toastSeq;
  set({ toast: { id, text, kind } });
  setTimeout(() => {
    if (state.toast?.id === id) set({ toast: undefined });
  }, 3800);
}

function persist(p: Property) {
  const t = pending.get(p.id);
  if (t) clearTimeout(t);
  pending.set(
    p.id,
    setTimeout(() => {
      pending.delete(p.id);
      idb.saveProperty(p).catch((e) => {
        console.error(e);
        toast('Could not save. Storage may be full.', 'error');
      });
    }, 250),
  );
}

/** Wait for queued writes (used before backup and in tests). */
export async function flush() {
  const ids = [...pending.keys()];
  for (const id of ids) {
    clearTimeout(pending.get(id)!);
    pending.delete(id);
    const p = state.properties.find((x) => x.id === id);
    if (p) await idb.saveProperty(p);
  }
}

export function getProperty(id: string) {
  return state.properties.find((p) => p.id === id);
}

export function addProperty(p: Property) {
  set({ properties: [p, ...state.properties] });
  persist(p);
  return p;
}

export function newProperty(name: string, address: string) {
  return addProperty(createProperty(name, address, state.settings.units));
}

export function updateProperty(id: string, fn: (p: Property) => Property, opts: { history?: boolean } = { history: true }) {
  const cur = getProperty(id);
  if (!cur) return;
  const next = { ...fn(cur), updatedAt: Date.now() };
  if (opts.history !== false) {
    const st = undoStacks.get(id) ?? [];
    st.push(cur);
    if (st.length > 60) st.shift();
    undoStacks.set(id, st);
    redoStacks.set(id, []);
  }
  set({ properties: state.properties.map((p) => (p.id === id ? next : p)) });
  persist(next);
}

export function canUndo(id: string) {
  return (undoStacks.get(id)?.length ?? 0) > 0;
}
export function canRedo(id: string) {
  return (redoStacks.get(id)?.length ?? 0) > 0;
}

export function undo(id: string) {
  const st = undoStacks.get(id);
  const cur = getProperty(id);
  if (!st?.length || !cur) return;
  const prev = st.pop()!;
  (redoStacks.get(id) ?? redoStacks.set(id, []).get(id)!).push(cur);
  set({ properties: state.properties.map((p) => (p.id === id ? prev : p)) });
  persist(prev);
}

export function redo(id: string) {
  const st = redoStacks.get(id);
  const cur = getProperty(id);
  if (!st?.length || !cur) return;
  const next = st.pop()!;
  (undoStacks.get(id) ?? undoStacks.set(id, []).get(id)!).push(cur);
  set({ properties: state.properties.map((p) => (p.id === id ? next : p)) });
  persist(next);
}

export function updateRoom(pid: string, rid: string, fn: (r: Room) => Room, opts?: { history?: boolean }) {
  updateProperty(pid, (p) => ({ ...p, rooms: p.rooms.map((r) => (r.id === rid ? { ...fn(r), updatedAt: Date.now() } : r)) }), opts);
}

export async function deleteProperty(id: string) {
  set({ properties: state.properties.filter((p) => p.id !== id), photos: state.photos.filter((ph) => ph.propertyId !== id) });
  const t = pending.get(id);
  if (t) clearTimeout(t);
  pending.delete(id);
  await idb.deletePropertyData(id);
}

export function updateSettings(fn: (s: AppSettings) => AppSettings) {
  const s = fn(state.settings);
  set({ settings: s });
  idb.saveSettings(s).catch(console.error);
}

// ---------- photos ----------

export async function addPhoto(
  propertyId: string,
  blob: Blob,
  info: Partial<PhotoMeta> & { name: string },
): Promise<PhotoMeta> {
  const { makeThumb, imageSize } = await import('../ui/image');
  const [thumb, size] = await Promise.all([makeThumb(blob), imageSize(blob)]);
  const meta: PhotoMeta = {
    id: uid('ph_'),
    propertyId,
    tags: [],
    takenAt: Date.now(),
    addedAt: Date.now(),
    width: size.width,
    height: size.height,
    collectionIds: [],
    ...info,
  };
  await idb.savePhoto(meta, blob, thumb);
  set({ photos: [...state.photos, meta] });
  return meta;
}

export function updatePhoto(id: string, fn: (m: PhotoMeta) => PhotoMeta) {
  const cur = state.photos.find((p) => p.id === id);
  if (!cur) return;
  const next = fn(cur);
  set({ photos: state.photos.map((p) => (p.id === id ? next : p)) });
  idb.savePhotoMeta(next).catch(console.error);
}

export async function removePhoto(id: string) {
  set({ photos: state.photos.filter((p) => p.id !== id) });
  // remove references
  for (const p of state.properties) {
    if (p.inspection.some((i) => i.photoIds.includes(id)) || p.collections.some((c) => c.photoIds.includes(id)) || p.coverPhotoId === id) {
      updateProperty(
        p.id,
        (pp) => ({
          ...pp,
          coverPhotoId: pp.coverPhotoId === id ? undefined : pp.coverPhotoId,
          inspection: pp.inspection.map((i) => ({ ...i, photoIds: i.photoIds.filter((x) => x !== id) })),
          collections: pp.collections.map((c) => ({ ...c, photoIds: c.photoIds.filter((x) => x !== id) })),
        }),
        { history: false },
      );
    }
  }
  await idb.deletePhoto(id);
}

/** Replace in-memory state after a restore. */
export function replaceAll(properties: Property[], photos: PhotoMeta[]) {
  properties.sort((a, b) => b.updatedAt - a.updatedAt);
  set({ properties, photos });
}

/** Test helper. */
export function _resetForTests() {
  state = { ready: false, properties: [], photos: [], settings: DEFAULT_SETTINGS };
  undoStacks.clear();
  redoStacks.clear();
  pending.forEach((t) => clearTimeout(t));
  pending.clear();
}
