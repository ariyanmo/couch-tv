import type { PhotoMeta, Room } from './types';

export interface Suggestion {
  photoId: string;
  roomId: string;
  reason: string;
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Suggest rooms for unassigned photos without any image recognition:
 * 1. the file name mentions a room name ("kitchen-2.jpg"),
 * 2. it was taken within `windowMin` minutes of photos already filed to one room
 *    (people photograph one room at a time).
 * Suggestions are never applied automatically; the user accepts them.
 */
export function suggestRooms(photos: PhotoMeta[], rooms: Room[], windowMin = 6): Suggestion[] {
  const assigned = photos.filter((p) => p.roomId).sort((a, b) => a.takenAt - b.takenAt);
  const out: Suggestion[] = [];
  const byName = [...rooms].sort((a, b) => b.name.length - a.name.length);
  for (const ph of photos.filter((p) => !p.roomId)) {
    const n = ' ' + words(ph.name) + ' ';
    const named = byName.find((r) => words(r.name) && n.includes(' ' + words(r.name) + ' '));
    if (named) {
      out.push({ photoId: ph.id, roomId: named.id, reason: `File name mentions “${named.name}”` });
      continue;
    }
    let best: { d: number; roomId: string } | null = null;
    for (const a of assigned) {
      const d = Math.abs(a.takenAt - ph.takenAt);
      if (d <= windowMin * 60_000 && (!best || d < best.d)) best = { d, roomId: a.roomId! };
    }
    if (best) {
      const r = rooms.find((x) => x.id === best!.roomId);
      if (r) out.push({ photoId: ph.id, roomId: r.id, reason: `Taken ${Math.max(1, Math.round(best.d / 60000))} min from other ${r.name} photos` });
    }
  }
  return out;
}
