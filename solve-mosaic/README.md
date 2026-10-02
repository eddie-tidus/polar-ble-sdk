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
| Pause / Play (`Space`) | Freeze or resume construction and the camera |
| Speed | 0.5×, 1×, 2× or 4× construction speed |
| Camera (`C`) | **Cinematic**: a choreographed move tied to the build. **Overview**: the full panel throughout, then a glide to the "o" and back |
| Completed mosaic (`F`) | Jump straight to the finished panel (and, in Cinematic, its closing shot) |
| Full view (`V`) | Return the camera to the full composition |
| Drag / right-drag / scroll | Orbit, pan and zoom. Any manual input takes over from the automatic camera until Replay |

Viewers who have asked their system for reduced motion start in Overview and
skip the automatic glide.

## What happens

The cinematic camera is keyed to the construction clock rather than to wall
time, so each move lands on the stones it is meant to show at any speed, and it
holds when paused.

| Time (1×) | Construction | Cinematic camera |
| --- | --- | --- |
| 0–2 s | Mortar bed spread with a damp, uneven front | Low macro at the start of the first flight path |
| 0.6–2.8 s | Red-ochre guidelines (the sinopia): setting-out lines and flight paths first, then frame, wordmark and meander | Still low, waiting at the start of the path |
| 2.4–6.2 s | First hero trail, laid stone by stone from its far end, then its plane | Chases the laying point along the trail and arrives with the plane |
| 7.8–11.3 s | Second hero trail and plane | Lifts over the panel, drops in behind the second trail and chases it |
| 12–14.4 s | Both small side trails and planes together | Wide, rising view |
| 14–17.4 s | Border, clockwise from the top-left corner | High overhead |
| 17–25 s | Background, laid from the outside in, until only the wordmark's shape is left bare | Descends towards the wordmark |
| 24.6–28.2 s | Letter contours, "s" to "e" | Tracks along the wordmark |
| 28–31 s | Inner letter courses | Rises to frame the whole wordmark |
| 30.8–33.8 s | The turquoise dots, the final stones, ring by ring | Close-up as the rings cascade in |
| about 38 s | Complete; the guidelines have faded | Straight-on view of the whole panel |

Each stone drops a short way, lands, rebounds very slightly and is pressed into
the bed.

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
- **Sinopia** (`src/sinopia.js`): the red-ochre underdrawing is generated from
  the design's own geometry: field axes, type guide lines, frame bands, letter,
  dot and plane outlines, flight paths and the meander's path. It is held as a
  small texture recording both the ink and the order in which each stroke is
  drawn, so it can be revealed stroke by stroke.
- **Staging**: a mitred walnut frame on a plank table, both with procedural wood
  grain. Distance fog fades the far table out at every camera distance.
- **Rendering** (`src/mosaic.js`): a single instanced draw call. Each instance is
  a bevelled prism with its own 3–6-corner outline, height, slight tilt, colour,
  roughness and settling animation, all computed in the vertex shader. A
  procedural fragment shader adds grain, mottling and a small bump. Shadows come
  from a directional key light. Stone depth follows stone width, so falling
  tesserae read as roughly cubic.
- **Camera** (`src/director.js`): keyed poses joined by a cubic spline, so the
  camera never stops dead between keys. The chase keys are generated from the
  trail curves themselves, so the camera rides behind each path's laying point.
  Wide shots are fitted to the viewport; close-ups back off on narrow screens.
- **Reproducibility**: every random choice comes from a seeded generator
  (`src/rng.js`, seed 7878), so each load lays the same mosaic.

Three.js r186 is vendored in `vendor/` (MIT licence, `vendor/LICENSE-three.txt`).
The only add-ons used are `OrbitControls` and `RoomEnvironment`.
