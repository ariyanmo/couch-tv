# ESTATE AI — Property Scanner & Design Studio

A local-first Progressive Web App for measuring properties, drawing architectural floor plans, viewing them in
3D, planning renovations and furniture, keeping inspection notes and producing listing presentations.

* **Zero cost.** Open-source libraries only (React, Three.js, jsPDF, idb). No accounts, no paid APIs, no cloud.
* **Local-first.** Everything is stored in your browser's IndexedDB. Backups are a single `.json` file.
* **Honest numbers.** Every dimension is tagged **Measured**, **Drawn**, **Estimated** or **Missing**, and every
  calculated figure carries the weakest tag of its inputs. Estimates are never shown as verified measurements.
* **Works without LiDAR.** You measure with a tape or laser; the camera documents rooms and can make clearly
  labelled estimates from a reference object. See [docs/SCANNING.md](docs/SCANNING.md).

## Run it on your computer

Needs [Node.js](https://nodejs.org) 20 or newer (free).

```sh
cd estate-ai
npm install
npm run dev          # http://localhost:5173 on this computer
```

### Use it on your iPhone (same Wi-Fi)

Safari only allows the live camera, offline mode and "Add to Home Screen" on **https** pages. Run:

```sh
npm run build
npm run preview:https   # serves https://<your-computer-ip>:4173 with a self-signed certificate
```

Open the `Network:` address it prints in Safari on the iPhone, accept the certificate warning (Show Details →
visit this website), then Share → **Add to Home Screen**. Even on plain http, **Take photo** still works: it opens
the iPhone camera through the file picker.

### Tests

```sh
npm test             # 45 unit tests: geometry, units, area/paint/flooring maths, copilot, homography, backup
npm run build
npm run test:e2e     # 19 browser tests in Chromium (needs Playwright: npm i -D playwright && npx playwright install chromium)
```

## Modules

| Module | What it does |
| --- | --- |
| Properties | Multiple properties, address, units (metric/imperial), sample data, delete, completeness meter |
| Scanner | Floors, rooms, guided 11-step workflow, room connections |
| Room editor | Rectangle or wall-by-wall entry with closure-error check, wall lengths with method, ceiling height, doors/windows, guided camera capture, photo estimate |
| Floor plan | Editable SVG plan: move rooms (snap to neighbours), drag walls and corners, add/split corners, draw rooms, place doors/windows, type measured lengths, undo/redo, wall thickness, labels, areas |
| 3D model | Three.js model from the plan: walls with real openings, glass, ceilings toggle, dollhouse, no-walls, room focus, multi-floor and separated floors, furniture, PNG export |
| Renovation studio | Concepts per room (existing vs ideas), flooring, wall/ceiling colour, cabinets, benchtop, tile, light colour and brightness, furniture layout, before/after slider |
| Virtual staging | Six styles: colour grading + placeable furniture over a photo (labelled “Virtual staging concept”), or a furnished 3D concept that only places pieces that fit |
| Wall elevations | Per-wall drawing with opening sizes, offsets, sill heights and statuses; SVG/PNG export |
| Inspection | Your observations and professional findings kept strictly apart, conditions, photos |
| Area calculator | Room/floor/total area, perimeter, gross/net wall area, ceiling area, flooring with waste and boxes, paint litres; configurable inclusions; CSV |
| Photos | Library by room, unsorted inbox with filename/time suggestions, notes, tags, plan location pins, collections, collection PDF |
| Copilot | Local answers from saved data (sizes, totals, will-it-fit, flooring, paint, opportunities, description, summary, what's missing). Optional local LLM wording, off by default |
| Listing & export | Factual description draft, highlights, room descriptions, photo selection, presentation PDF, plan PNG/SVG, export history |
| Settings | Units, grid, backup/restore (merge or replace), storage protection, optional AI, install help, limitations |

## Documentation

* [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — stack, data model, folders, design decisions
* [docs/CHECKLIST.md](docs/CHECKLIST.md) — development checklist by phase, what is done and what is not
* [docs/SCANNING.md](docs/SCANNING.md) — camera, measurement and photogrammetry research and limits
* [docs/AI.md](docs/AI.md) — optional free local AI with Ollama
* [docs/DEPLOY.md](docs/DEPLOY.md) — putting it online later, and what would cost money
