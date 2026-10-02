# Solve, imagined as a Roman mosaic

An interactive Three.js artwork. The Solve wordmark becomes the centrepiece of a
Roman floor panel, surrounded by tessellated paper planes, flowing background courses
and a meander border. All 7,878 tesserae are separate 3D stones, generated
procedurally in the browser and laid one by one.

## Run it

**Option 1: open the single file (no server).** Open `dist/solve-mosaic.html` in a
current desktop browser (Chrome, Edge, Firefox or Safari). Three.js is bundled
inside the file, so it works offline.

**Option 2: run from source.** ES modules need an HTTP server:

```sh
cd solve-mosaic
python3 -m http.server 8000      # or: npx serve .
# then open http://localhost:8000/
```

To rebuild the single-file version after editing `src/`:

```sh
cd solve-mosaic
npm install
npm run build                    # writes dist/solve-mosaic.html
```

## Controls

The controls sit in a bar below the artwork.

| Control | Action |
| --- | --- |
| Replay (`R`) | Restart the construction from the mortar bed |
| Pause / Play (`Space`) | Freeze or resume construction and the camera tour |
| Speed | 0.5×, 1×, 2× or 4× construction speed |
| Completed mosaic (`F`) | Jump straight to the finished panel |
| Full view (`V`) | Return the camera to the full composition |
| Drag / right-drag / scroll | Orbit, pan and zoom. Any manual input takes over from the automatic camera |

## What happens

1. **Mortar bed** (0–2.4 s): spread across the backing slab with an uneven,
   damp leading edge.
2. **Wordmark contours** (2.6–7.6 s): the outer course of each letter, traced
   letter by letter.
3. **Letter fill and dots** (7.4–12.9 s): inner courses, then the turquoise dots,
   ring by ring.
4. **Paper planes** (12.9–19 s): facet by facet, followed by each dashed trail.
5. **Background** (19–28.6 s): courses spread outwards from every subject and
   inwards from the frame.
6. **Border** (28.2–33.2 s): laid clockwise from the top-left corner.

Construction completes at about 34 s at 1×. The camera then glides to the open
"o" and its dots to show individual stones, lingers, and returns to the full view.

## How it is made

- **Wordmark** (`src/logo.js`): the letterforms were measured from the supplied
  logo and rebuilt as code: elliptical arcs and a V-cut for the open "o", circles
  for the "e" and the dots, straight edges for the "l" and "v", and a fitted cubic
  Bézier outline for the "s". Rasterised against the reference, each letter matches
  with an intersection-over-union of 0.983–0.992. No image is loaded at runtime.
- **Tile layout** (`src/layout.js`, `src/field.js`): courses are iso-contours of
  distance fields, not a grid.
  - Letters get six contour courses across each stem; the dots get concentric
    wedge-cut rings.
  - Planes use rows parallel to each facet's fold.
  - Trails are single dashed courses.
  - The background is offset outwards from the letters, planes, trails and frame.
    Where neighbouring courses meet, each stone is cut back to a clean seam. Any
    remaining hole is filled with irregular cut pieces.
  - The border is a grid-aligned meander with turquoise-centred corner medallions.
- **Count**: 7,878 stones. Letters 1,120 (93 of them cut filler pieces), dots 34,
  planes 247, trails 165, background 3,688 (444 cut filler pieces) and border
  2,624. To land on the target, the 71 smallest background slivers are left as
  mortar.
- **Rendering** (`src/mosaic.js`): a single instanced draw call. Each instance is
  a bevelled prism with its own 3–6-corner outline, height, slight tilt, colour,
  roughness and settling animation, all computed in the vertex shader. A
  procedural fragment shader adds grain, mottling and a small bump. Shadows come
  from a directional key light.
- **Reproducibility**: every random choice comes from a seeded generator
  (`src/rng.js`, seed 7878), so each load lays the same mosaic.

Three.js r186 is vendored in `vendor/` (MIT licence, `vendor/LICENSE-three.txt`).
The only add-ons used are `OrbitControls` and `RoomEnvironment`.
