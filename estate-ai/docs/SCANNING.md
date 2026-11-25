# Scanning without LiDAR: what works and what doesn't

## What ESTATE AI does

**Camera scan (quickest).** Stand near the middle of the room holding the phone at a known height, aim the
on-screen dot at each corner where the walls meet the floor and tap Mark. The motion sensors give the camera's
downward angle and direction; distance to the corner = phone height ÷ tan(angle). Corners are placed on the plan,
optionally squared up, and the whole outline can be rescaled from one tape-measured wall. Accuracy is a few
percent at best (worse for far corners seen at shallow angles), so every wall is saved as **Estimated** except a
wall you measure. A video alone can't do this reliably: without depth (LiDAR) or a known height, nothing in the
picture says how big the room is.


1. **You measure** walls and ceilings with a tape or laser (a basic laser measure is the single best accuracy
   upgrade). These are the only values marked **Measured**.
2. **The camera documents** each room with guided shots (overview, corners, walls, ceiling, floor, openings) and a
   level guide. Photos are filed to the room automatically.
3. **Estimate from photo** (optional): tape an A4 sheet (or card / anything you measured) flat to a wall, tap its
   corners, then tap two points on the same wall. A plane homography removes perspective, so angled photos work.
   Results are saved as **Estimated** and never overwrite a measurement. Typical error is a few percent, worse far
   from the reference, at steep angles, or with wide-angle lens distortion. Points off that wall are meaningless.

## What a normal phone camera cannot do in a web app

| Want | Status |
| --- | --- |
| LiDAR-accurate room capture (RoomPlan) | Needs a native iOS app and a LiDAR iPhone/iPad. Not possible here. |
| ARKit world tracking / plane detection | Native only. iPhone Safari has no WebXR immersive-ar. |
| Scale from a single photo with no reference | Not possible: one image has no absolute scale. |
| Visual feature tracking in the browser | Possible (e.g. OpenCV.js ORB), but without depth or a reference it still has no scale, so it was not added. |

## Free photogrammetry (offline, on a computer)

These produce a 3D mesh from 50–300 overlapping photos. They are free and open source, but slow, need a decent
computer (often an NVIDIA GPU for Meshroom), and the result has **no scale** until you measure one distance.
Interior rooms with blank walls often fail.

* **COLMAP** — structure-from-motion + dense reconstruction (BSD). CPU works, GPU much faster.
* **Meshroom / AliceVision** — GUI pipeline (MPL-2). Needs CUDA for dense meshing.
* **OpenMVG + OpenMVS** — command-line pipeline (MPL-2 / AGPL).

Not integrated: they cannot run in a phone browser. A future version could import a scaled OBJ/PLY as a
reference underlay; for floor plans, tape/laser measurement remains faster and more reliable.
