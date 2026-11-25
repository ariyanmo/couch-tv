import * as THREE from 'three';
import { roomHasShape } from '../../core/calc';
import { FLOOR_MATERIALS } from '../../core/catalog';
import { edgeLength, edgeOutwardNormal, norm, sub } from '../../core/geometry';
import type { FurnitureItem, Property, Room, RoomFinishes } from '../../core/types';

const S = 0.001; // mm -> metres

export interface SceneOptions {
  floorId: string | 'all';
  walls: 'full' | 'cutaway' | 'hidden';
  ceilings: boolean;
  furniture: boolean;
  explode: boolean;
  focusRoomId?: string;
  overrides?: Record<string, { finishes?: RoomFinishes; furniture?: FurnitureItem[] }>;
}

export interface BuiltScene {
  group: THREE.Group;
  center: THREE.Vector3;
  radius: number;
  roomCenters: Record<string, THREE.Vector3>;
  unknownCeilingRooms: string[];
  dispose: () => void;
}

const texCache = new Map<string, THREE.Texture>();

function floorTexture(id: string): THREE.Texture {
  const hit = texCache.get(id);
  if (hit) return hit;
  const m = FLOOR_MATERIALS.find((x) => x.id === id) ?? FLOOR_MATERIALS[0];
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = m.base;
  g.fillRect(0, 0, 256, 256);
  let seed = id.split('').reduce((s, ch) => s + ch.charCodeAt(0), 0);
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  if (m.kind === 'wood' || m.kind === 'vinyl') {
    if (id === 'herringbone') {
      g.strokeStyle = m.accent;
      g.lineWidth = 2;
      for (let y = -256; y < 512; y += 32)
        for (let x = 0; x < 256; x += 64) {
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + 32, y + 32);
          g.lineTo(x + 64, y);
          g.stroke();
        }
    } else {
      for (let y = 0; y < 256; y += 32) {
        g.fillStyle = m.accent;
        g.fillRect(0, y, 256, 1.5);
        const off = rnd() * 256;
        g.fillRect(off, y, 1.5, 32);
        for (let k = 0; k < 6; k++) {
          g.globalAlpha = 0.08;
          g.fillRect(0, y + rnd() * 32, 256, 1);
          g.globalAlpha = 1;
        }
      }
    }
  } else if (m.kind === 'tile' || m.kind === 'stone') {
    g.strokeStyle = m.accent;
    g.lineWidth = 2;
    const step = m.kind === 'tile' ? 64 : 128;
    for (let i = 0; i <= 256; i += step) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 256);
      g.moveTo(0, i);
      g.lineTo(256, i);
      g.stroke();
    }
    if (id === 'marble' || id === 'terrazzo') {
      for (let k = 0; k < (id === 'terrazzo' ? 220 : 14); k++) {
        g.fillStyle = m.accent;
        g.globalAlpha = id === 'terrazzo' ? 0.7 : 0.25;
        if (id === 'terrazzo') g.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 4, 2 + rnd() * 4);
        else {
          g.beginPath();
          g.moveTo(rnd() * 256, rnd() * 256);
          g.bezierCurveTo(rnd() * 256, rnd() * 256, rnd() * 256, rnd() * 256, rnd() * 256, rnd() * 256);
          g.strokeStyle = m.accent;
          g.stroke();
        }
        g.globalAlpha = 1;
      }
    }
  } else {
    for (let k = 0; k < 3000; k++) {
      g.fillStyle = rnd() > 0.5 ? m.accent : '#ffffff';
      g.globalAlpha = 0.06;
      g.fillRect(rnd() * 256, rnd() * 256, 2, 2);
    }
    g.globalAlpha = 1;
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(id, t);
  return t;
}

/** Approximate colour of a light at a given colour temperature. */
export function kelvinToColor(k: number): THREE.Color {
  const t = k / 100;
  let r: number, g: number, b: number;
  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
    b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332);
    g = 288.12 * Math.pow(t - 60, -0.0755);
    b = 255;
  }
  const c = (v: number) => Math.min(255, Math.max(0, v)) / 255;
  return new THREE.Color(c(r), c(g), c(b));
}

function std(color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });
}

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Simple procedural furniture, in metres, origin at the floor centre. */
export function furnitureMesh(f: FurnitureItem): THREE.Object3D {
  const g = new THREE.Group();
  const W = f.w * S;
  const D = f.d * S;
  const H = f.h * S;
  const col = f.color ?? '#999999';
  const mat = std(col);
  const dark = std('#2a2724', { roughness: 0.6 });
  const soft = std('#f1eee8', { roughness: 0.95 });
  switch (f.kind) {
    case 'bed': {
      g.add(box(W, 0.25, D, dark, 0, 0.125, 0));
      g.add(box(W - 0.04, 0.22, D - 0.06, soft, 0, 0.36, 0.02));
      g.add(box(W, 0.9, 0.08, mat, 0, 0.45, -D / 2 + 0.04));
      g.add(box(W * 0.4, 0.12, 0.35, std('#ffffff'), -W * 0.24, 0.53, -D / 2 + 0.3));
      g.add(box(W * 0.4, 0.12, 0.35, std('#ffffff'), W * 0.24, 0.53, -D / 2 + 0.3));
      g.add(box(W - 0.02, 0.05, D * 0.55, mat, 0, 0.49, D * 0.2));
      break;
    }
    case 'sofa': {
      g.add(box(W, 0.42, D, mat, 0, 0.21, 0));
      g.add(box(W, H - 0.42, 0.2, mat, 0, 0.42 + (H - 0.42) / 2, D / 2 - 0.1));
      g.add(box(0.18, 0.62, D, mat, -W / 2 + 0.09, 0.31, 0));
      g.add(box(0.18, 0.62, D, mat, W / 2 - 0.09, 0.31, 0));
      break;
    }
    case 'chair': {
      g.add(box(W, 0.06, D, mat, 0, 0.45, 0));
      g.add(box(W, H - 0.48, 0.05, mat, 0, 0.48 + (H - 0.48) / 2, D / 2 - 0.03));
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(0.04, 0.45, 0.04, dark, (x * (W - 0.06)) / 2, 0.225, (z * (D - 0.06)) / 2));
      break;
    }
    case 'table':
    case 'desk': {
      g.add(box(W, 0.04, D, mat, 0, H - 0.02, 0));
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(0.05, H - 0.04, 0.05, dark, (x * (W - 0.1)) / 2, (H - 0.04) / 2, (z * (D - 0.1)) / 2));
      break;
    }
    case 'rug': {
      const m = new THREE.Mesh(new THREE.BoxGeometry(W, 0.01, D), std(col, { roughness: 1 }));
      m.position.y = 0.005;
      m.receiveShadow = true;
      g.add(m);
      break;
    }
    case 'plant': {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.3, W * 0.24, 0.35, 16), std('#d8d2c8'));
      pot.position.y = 0.175;
      const leaves = new THREE.Mesh(new THREE.SphereGeometry(W * 0.5, 16, 12), std(col));
      leaves.position.y = 0.35 + (H - 0.35) * 0.55;
      leaves.scale.y = (H - 0.35) / W;
      leaves.castShadow = true;
      g.add(pot, leaves);
      break;
    }
    case 'lamp': {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, H, 8), dark);
      pole.position.y = H / 2;
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.3, W * 0.45, 0.3, 20, 1, true), std(col, { side: THREE.DoubleSide, emissive: new THREE.Color('#ffdca0'), emissiveIntensity: 0.4 }));
      shade.position.y = H - 0.15;
      g.add(pole, shade);
      break;
    }
    case 'bath': {
      g.add(box(W, H, D, std('#f6f6f4', { roughness: 0.3 }), 0, H / 2, 0));
      const inner = box(W - 0.12, 0.05, D - 0.12, std('#cfe3ea', { roughness: 0.1 }), 0, H - 0.04, 0);
      g.add(inner);
      break;
    }
    case 'toilet': {
      g.add(box(W, 0.4, D * 0.6, std('#f6f6f4', { roughness: 0.3 }), 0, 0.2, D * 0.15));
      g.add(box(W, 0.4, 0.18, std('#f6f6f4', { roughness: 0.3 }), 0, 0.6, -D / 2 + 0.09));
      break;
    }
    case 'shower': {
      g.add(box(W, 0.05, D, std('#e9e7e2'), 0, 0.025, 0));
      const glass = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.01), new THREE.MeshStandardMaterial({ color: '#cfe3ea', transparent: true, opacity: 0.25, roughness: 0.05 }));
      glass.position.set(0, H / 2, D / 2);
      g.add(glass);
      break;
    }
    case 'tv': {
      g.add(box(W, H, D, std('#111', { roughness: 0.3, metalness: 0.2 }), 0, 0.6 + H / 2, 0));
      break;
    }
    default:
      g.add(box(W, H, D, mat, 0, H / 2, 0));
      if (f.kind === 'cabinet' || f.kind === 'storage' || f.kind === 'vanity') {
        g.add(box(W + 0.01, 0.03, D + 0.01, std('#e5e1da', { roughness: 0.4 }), 0, H + 0.015, 0));
      }
  }
  g.position.set(f.x * S, 0, f.y * S);
  g.rotation.y = (-f.rotation * Math.PI) / 180;
  return g;
}

function slabGeometry(room: Room) {
  const shape = new THREE.Shape(room.polygon.map((p) => new THREE.Vector2(p.x * S, -p.y * S)));
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

export function buildScene(p: Property, opts: SceneOptions): BuiltScene {
  const group = new THREE.Group();
  const floors = [...p.floors].sort((a, b) => a.level - b.level).filter((f) => opts.floorId === 'all' || f.id === opts.floorId);
  const roomCenters: Record<string, THREE.Vector3> = {};
  const unknownCeilingRooms: string[] = [];
  const bbox = new THREE.Box3();
  const disposables: { dispose: () => void }[] = [];

  floors.forEach((floor, fi) => {
    const fy = (floor.elevation + (opts.explode ? fi * 1500 : 0)) * S;
    const fg = new THREE.Group();
    fg.position.y = fy;
    group.add(fg);
    for (const room of p.rooms.filter((r) => r.floorId === floor.id && roomHasShape(r))) {
      const ov = opts.overrides?.[room.id];
      const fin = ov?.finishes ?? room.finishes;
      const knownH = room.ceilingHeight.status !== 'unknown' && room.ceilingHeight.value > 0;
      if (!knownH) unknownCeilingRooms.push(room.name);
      const H = (knownH ? room.ceilingHeight.value : floor.defaultCeiling) * S;
      const dimmed = opts.focusRoomId && opts.focusRoomId !== room.id;
      // floor
      const tex = floorTexture(fin.floorMaterial).clone();
      tex.needsUpdate = true;
      tex.repeat.set(1, 1);
      const floorMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, side: THREE.DoubleSide, transparent: !!dimmed, opacity: dimmed ? 0.35 : 1 });
      // world-scale UVs: ShapeGeometry UVs are in metres already (shape coords), so 1 repeat = 1 m tile
      const sg = slabGeometry(room);
      const floorMesh = new THREE.Mesh(sg, floorMat);
      floorMesh.receiveShadow = true;
      fg.add(floorMesh);
      disposables.push(sg, floorMat, tex);
      // walls
      const wallH = opts.walls === 'cutaway' ? Math.min(H, 1.0) : H;
      if (opts.walls !== 'hidden') {
        const wallMat = std(fin.wallColor, { transparent: !!dimmed || !knownH, opacity: dimmed ? 0.18 : !knownH ? 0.75 : 1 });
        const glass = new THREE.MeshStandardMaterial({ color: '#a8c8d8', transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1 });
        disposables.push(wallMat, glass);
        const n = room.polygon.length;
        for (let i = 0; i < n; i++) {
          const a = room.polygon[i];
          const b = room.polygon[(i + 1) % n];
          const L = edgeLength(room.polygon, i);
          const dir = norm(sub(b, a));
          const out = edgeOutwardNormal(room.polygon, i);
          const T = room.wallThickness;
          const ang = -Math.atan2(dir.y, dir.x);
          // intervals along the wall: [start, end, kind]
          const ops = room.openings.filter((o) => o.edge === i).sort((x, y) => x.offset - y.offset);
          const segs: { s: number; e: number; y0: number; y1: number; glass?: boolean }[] = [];
          let cur = -T; // extend past the corner to close outside corners
          for (const o of ops) {
            const s = Math.max(0, o.offset);
            const e = Math.min(L, o.offset + o.width.value);
            if (s > cur) segs.push({ s: cur, e: s, y0: 0, y1: wallH / S });
            const sill = o.type === 'window' ? o.sill.value : 0;
            const head = sill + o.height.value;
            if (sill > 0) segs.push({ s, e, y0: 0, y1: Math.min(sill, wallH / S) });
            if (head < wallH / S) segs.push({ s, e, y0: head, y1: wallH / S });
            if (o.type === 'window' && sill < wallH / S) segs.push({ s, e, y0: sill, y1: Math.min(head, wallH / S), glass: true });
            cur = Math.max(cur, e);
          }
          if (cur < L + T) segs.push({ s: cur, e: L + T, y0: 0, y1: wallH / S });
          for (const sgm of segs) {
            const len = (sgm.e - sgm.s) * S;
            const h = (sgm.y1 - sgm.y0) * S;
            if (len <= 0.001 || h <= 0.001) continue;
            const mid = (sgm.s + sgm.e) / 2;
            const thick = sgm.glass ? T * 0.15 : T;
            const cx = (a.x + dir.x * mid + out.x * (T / 2)) * S;
            const cz = (a.y + dir.y * mid + out.y * (T / 2)) * S;
            const m = box(len, h, thick * S, sgm.glass ? glass : wallMat, cx, (sgm.y0 * S) + h / 2, cz);
            m.rotation.y = ang;
            if (sgm.glass) m.castShadow = false;
            fg.add(m);
          }
        }
      }
      // ceiling
      if (opts.ceilings && opts.walls === 'full') {
        const cg = slabGeometry(room);
        const cm = new THREE.MeshStandardMaterial({ color: fin.ceilingColor, side: THREE.DoubleSide, roughness: 0.95, transparent: !!dimmed, opacity: dimmed ? 0.2 : 1 });
        const ceil = new THREE.Mesh(cg, cm);
        ceil.position.y = H;
        fg.add(ceil);
        disposables.push(cg, cm);
      }
      // furniture
      if (opts.furniture)
        for (const f of ov?.furniture ?? room.furniture)
          fg.add(furnitureMesh(fin.cabinetColor && (f.kind === 'cabinet' || f.kind === 'vanity') ? { ...f, color: fin.cabinetColor } : f));
      // room light
      const cx = room.polygon.reduce((s, q) => s + q.x, 0) / n2(room) * S;
      const cz = room.polygon.reduce((s, q) => s + q.y, 0) / n2(room) * S;
      const light = new THREE.PointLight(kelvinToColor(fin.lightTemperature), 1.4 * fin.lightIntensity, 9, 1.6);
      light.position.set(cx, H - 0.25, cz);
      fg.add(light);
      roomCenters[room.id] = new THREE.Vector3(cx, fy + H / 2, cz);
      for (const q of room.polygon) bbox.expandByPoint(new THREE.Vector3(q.x * S, fy, q.y * S));
      bbox.expandByPoint(new THREE.Vector3(cx, fy + H, cz));
    }
  });

  if (bbox.isEmpty()) bbox.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5));
  const center = bbox.getCenter(new THREE.Vector3());
  const radius = bbox.getSize(new THREE.Vector3()).length() / 2;
  return {
    group,
    center,
    radius,
    roomCenters,
    unknownCeilingRooms,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
    },
  };
}

const n2 = (r: Room) => r.polygon.length || 1;
