# Development checklist

`[x]` built and covered by an automated test · `[~]` built, checked by hand or only partly tested ·
`[ ]` not built. Nothing here is marked done that isn't.

Automated: 45 unit tests (`npm test`), 19 browser tests (`npm run test:e2e`) in desktop Chromium and an emulated
iPhone 13 viewport. **Not yet tested on a real iPhone** — that is the most important next check.

## Phase 1 — Core platform, dashboard, property management
- [x] Create / open / delete properties; name, address, created/updated dates, units
- [x] Dashboard with stats, cover photo, measured-completeness meter; sample data (labelled as sample)
- [x] IndexedDB storage; storage persistence request
- [x] Backup (all or one property, with/without photos) and restore (merge or replace)
- [x] Desktop sidebar, mobile bottom navigation, premium dark theme
- [~] Undo/redo (plan editor and room edits; history is per session, not saved)

## Phase 2 — Room measurement and manual scanning
- [x] Floors (above/basement), rooms by type, room connections
- [x] Rectangle entry; wall-by-wall entry with turn angles and closure-error reporting
- [x] Wall lengths with method (tape, laser, plan, camera estimate, rough estimate) and status
- [x] Ceiling heights, wall thickness, doors/windows/openings with width/height/sill/offset
- [x] Guided capture with camera (getUserMedia) and file-picker fallback; photos filed to the room
- [~] Level guide from device orientation (needs a real phone to verify)
- [x] Camera room scan: aim at each floor corner from one spot; phone height + motion sensors place corners; square-up; one tape measurement rescales; ceiling from one aim; saved as estimates (maths unit-tested, flow tested with simulated sensors; not yet on a real iPhone)
- [x] Automatic camera scan: turn on the spot; on-device vision finds the floor edge in each frame, sensors + phone height place it on the plan, walls are fitted (square corners, L-shapes, small furniture ignored). Tested with rendered synthetic camera frames; **not yet tested with a real camera in a real room**
- [x] Measure sheet after a scan: wall lengths, ceiling height, door/window sizes and any custom measurement, all saved as measured
- [x] Plan tape tool: drag between two points (snaps to corners and walls), name it, enter the measured length
- [x] Photo estimate with rectangle reference (homography) or known length; saved as estimates only
- [x] Metric and imperial input/display (feet-inches, fractions)

## Phase 3 — Editable 2D floor plan
- [x] Walls with thickness, corners, room labels and areas, dimensions coloured by status
- [x] Doors (single/double, hinge side, swing in/out), sliding doors, openings, windows
- [x] Move rooms with snapping to neighbouring walls; drag walls; drag/add/remove corners; draw rooms
- [x] Type a measured length → consistent reshape; split walls; duplicate rooms
- [x] Pan/zoom with mouse, wheel, touch and pinch; grid snapping
- [x] Plan export SVG/PNG with scale bar and legend
- [ ] Automatic merging of shared walls between rooms (rooms each draw their own wall)
- [ ] Curved walls, stairs geometry

## Phase 4 — 3D reconstruction
- [x] Walls with real door/window openings and glass, floors with materials, optional ceilings
- [x] Dollhouse (cut walls), no walls, full walls; room focus; multi-floor and separated floors
- [x] Furniture meshes; orbit, zoom, pan; top view; PNG snapshot
- [~] Rooms without ceiling height are shown translucent at the floor default and listed
- [ ] First-person walk-through; textures from your photos

## Phase 5 — Renovation and furniture studio
- [x] Concepts per room, existing finishes kept separate
- [x] Flooring, wall/ceiling colour, cabinet style/colour, benchtop, bathroom tile, lighting colour/brightness
- [x] Furniture catalogue (typical sizes, editable), placement, rotate/duplicate, fit status (walls, overlaps, door swings)
- [x] “Will it fit?” search with walkway clearance
- [x] Before/after slider from the same viewpoint
- [x] Virtual staging: 6 styles, photo grading + placeable furniture, disclosure label; staging as 3D concept
- [~] Cabinet style, benchtop and tile choices are recorded but drawn only as colours in 3D
- [ ] AI image generation (deliberately not included: no free local option is bundled; see docs/AI.md)

## Phase 6 — Inspection and AI copilot
- [x] Observations vs professional findings kept apart (never mixed in summaries)
- [x] Categories, conditions, notes, photos, room filter
- [x] Area calculator: room/floor/total, perimeter, wall gross/net, ceiling, flooring + waste + boxes, paint; inclusion settings; CSV
- [x] Copilot local intents: room size, totals, fit, flooring, paint, ceiling, opportunities, description, summary, missing
- [~] Optional Ollama / OpenAI-compatible wording, off by default (connection test built; not run against a live model here)

## Phase 7 — Listing presentation and exports
- [x] Factual description draft from data, highlights, room descriptions, photo selection
- [x] Presentation PDF: cover, description + 3D view, floor plans, room schedule, photos, disclaimer on every page
- [x] Plan PNG/SVG; wall elevation SVG/PNG; collection PDF; export history with re-download
- [~] Print stylesheet

## Phase 8 — Mobile, testing, PWA
- [x] Manifest, icons (incl. maskable, apple-touch), standalone display, safe areas
- [x] Offline app shell via service worker (tested offline in Chromium)
- [x] No horizontal overflow at iPhone width (tested in emulation)
- [x] `npm run preview:https` for LAN https (camera, install, offline on iPhone)
- [ ] Verified on a real iPhone in Safari, installed to the Home Screen
- [ ] Lighthouse/accessibility audit
