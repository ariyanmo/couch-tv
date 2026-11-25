# Architecture

## Environment found (when this was built)

Node 22, npm 10, Python 3.13, Chromium + Playwright, Linux. The app needs only Node to build and any modern browser
to run. No server-side code: the production build is static files.

## Stack (all free, open source)

| Need | Choice | Licence | Why |
| --- | --- | --- | --- |
| UI | React 18 + TypeScript | MIT / Apache-2 | Mature, typed, small runtime |
| Build/dev server | Vite (+ `@vitejs/plugin-basic-ssl` for LAN https) | MIT | Fast, static output, self-signed https for iPhone testing |
| 3D | Three.js | MIT | Standard WebGL library; OrbitControls |
| Storage | IndexedDB via `idb` | ISC | Large quota, stores photo blobs, works offline |
| PDF | jsPDF | MIT | Client-side PDF generation |
| Offline | Hand-written service worker + build plugin | — | No Workbox dependency; precache list generated at build |
| Tests | Vitest + fake-indexeddb; Playwright for e2e | MIT / Apache-2 | Unit + real-browser tests |

Rejected: Apple RoomPlan/ARKit (native app + LiDAR), WebXR (not in iPhone Safari), OpenCV.js (≈8 MB, no reliable
measuring benefit without depth), paid image/LLM APIs (cost).

## Folders

```
src/core/      pure logic, no React: types, units, geometry, calc (areas/paint/flooring with provenance),
               model (factories, wall walk, setWallLength), catalog, copilot, homography, organize, listing, ai
src/store/     IndexedDB (db.ts), app store with undo/redo (store.ts), backup/restore (backup.ts)
src/ui/        shared components, icons, router (hash routes), image helpers
src/features/  one file per screen; plan/ (SVG plan renderer, pan/zoom canvas, export), three/ (scene builder,
               viewer), capture/ (camera, photo measure), listing/ (PDF)
public/        manifest, icons, sw.js
tests/unit     vitest     tests/e2e  Playwright script
```

## Data model (src/core/types.ts)

All lengths are **millimetres**, areas mm². A `Measure` is `{ value, status, method }` where status is
`measured | drawn | estimated | unknown`.

* `Property` → `floors[]`, `rooms[]`, `connections[]`, `inspection[]`, `collections[]`, `exports[]`, `areaSettings`.
* `Room` → `polygon` (interior wall faces, plan coordinates), `edges[i]` (measure of wall i → i+1),
  `ceilingHeight`, `wallThickness` (drawn outward, not part of area), `openings[]` (on an edge, offset from its
  start), `furniture[]`, `finishes` (existing), `concepts[]` (renovation ideas with their own finishes/furniture),
  `closureError` from a wall walk.
* Photos: metadata in `photoMeta`, blobs and thumbnails in `photoBlobs` (IndexedDB), never inside the property.

## Rules that keep geometry honest

* A room with no polygon has **unknown** area, never 0-as-fact.
* Area is **measured** only when every wall is measured and the room is rectilinear (square corners assumed and
  said so). A measured non-rectilinear room is **drawn**: lengths alone don't fix angles.
* Dragging walls/corners turns changed walls into **drawn**. Typing a length makes that wall **measured** and
  reshapes the polygon consistently (`setEdgeLength`: the next anti-parallel wall absorbs the change).
* A wall walk that does not close keeps its gap (`closureError`), marks the closing wall drawn and downgrades area.
* New doors/windows start at typical sizes marked **estimated**. Camera estimates are saved as **estimated** and
  never overwrite a measured value.
* Derived figures (`calc.ts`) take the weakest status of their inputs (`worst()`), with reasons for tooltips.

## Plan and 3D

The same React SVG renderer (`PlanContent`) draws the editor, previews and exports (via `renderToStaticMarkup`).
Walls are an even-odd ring between the polygon and its outward offset; shared-wall dimensions are moved inside
the room. The 3D builder extrudes each wall in segments around openings (sill/head pieces, glass for windows),
floors are `ShapeGeometry` slabs with procedural canvas textures, and furniture is procedural meshes.

## Deployment shape

Static files with relative paths and hash routing, so it runs from any folder or static host with no rewrites.
