# Solve, imagined as a Roman mosaic

An interactive Three.js artwork. The Solve wordmark becomes the centrepiece of a
Roman floor panel, surrounded by four paper planes in the Solve motif (coloured
origami darts with dotted white flight paths), flowing background courses and a
meander border. All 7,878 tesserae are separate 3D stones, generated
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
| 0.6–2.8 s | Red-ochre guidelines (the sinopia): setting-out lines, flight paths and planes, frame bands, meander. The wordmark is deliberately not drawn | Still low, waiting at the start of the path |
| 2.4–5.3 s | Red plane (top right): its dotted trail, stone by stone from the far end, then the plane | Rides beside the laying point and arrives with the plane |
| 6.5–9.3 s | Yellow plane, down the right side | Short lift, then the same chase |
| 10.5–13.4 s | Blue plane, along the bottom | Lift across the panel, then the chase |
| 14.6–17.4 s | Green plane, up the left side | Short lift, then the chase |
| 18.2–21.4 s | Border, clockwise from the top-left corner; the guidelines fade | Out to the whole panel, high overhead |
| 21–28.4 s | Background, laid from the outside in, until only the wordmark's shape is left bare | Descends towards the wordmark |
| 28–31.4 s | Letter contours, "s" to "e" | Tracks along the wordmark |
| 31.2–34 s | Inner letter courses | Rises to frame the whole wordmark |
| 33.8–36.8 s | The turquoise dots, the final stones, ring by ring | Close-up as the rings cascade in |
| about 41 s | Complete | Straight-on view of the whole panel |

Each stone drops a short way, lands, rebounds very slightly and is pressed into
the bed.

## Video

`video/build.sh` renders the Cinematic camera at 1× to a 43-second MP4 with an
ElevenLabs soundtrack: a lo-fi jazz-hop bed (piano and flute) and a soft tap
for every stone, timed to its landing. It makes four versions, one for each
of the four music takes. See
[`video/README.md`](video/README.md).

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
- **Paper planes** (`src/compose.js`): the Solve motif seen from above, a
  light wing and a dark wing meeting at the centre fold with a small keel in the
  notch behind, in red, yellow, blue and green stone and glass. Trails are
  dotted: round-cut white stones with a dark stone between each.
- **Count**: 7,878 stones. Letters 1,100 (71 of them cut filler pieces), dots 34,
  planes 254, trails 155 (79 white dots and 76 dark stones between them),
  background 3,711 (540 cut filler pieces) and border 2,624. To land on the
  target, the 27 smallest background slivers are left as mortar.
- **Sinopia** (`src/sinopia.js`): the red-ochre underdrawing is generated from
  the design's own geometry: field axes, type guide lines, frame bands, plane
  outlines, flight paths and the meander's path. The letters and dots are left
  out so the wordmark is not given away early. It is held as a
  small texture recording both the ink and the order in which each stroke is
  drawn, so it can be revealed stroke by stroke.
- **Staging and light** (`src/sky.js`): golden-hour daylight. A low amber sun
  (about 17° up, from behind and to the left) rakes across the stones, so each
  one throws a long shadow over the joint beside it and the frame throws a long
  shadow across the plank table. Cool blue skylight fills the shadows, the table
  bounces warm light back up, and a procedural sky (amber at the horizon, soft
  blue overhead) serves both as the backdrop and as the environment lighting, so
  reflections agree with the sun. The sun's shadow camera is fitted tightly to
  the panel and its shadows to keep them sharp at that low angle. Neutral tone
  mapping keeps the gold in the highlights instead of bleaching them to white,
  and warm haze fades the far table into the horizon.
- **Mortar** (`src/joints.js`): stones stand a little proud of a gritty lime
  mortar with visible joints. A shading map built from the laid stones darkens
  joints where stones crowd round them, appearing only as those stones land.
- **Rendering** (`src/mosaic.js`): a single instanced draw call. Each instance is
  a bevelled prism with its own 3–6-corner outline, height, slight tilt, colour,
  roughness and settling animation, all computed in the vertex shader. A
  procedural fragment shader gives each material its own surface: veined marble
  (lettering, limestone, red and yellow), speckled dark stone with faint glints,
  smoother glass with tiny bubbles (turquoise, blue, green) and pitted fired
  clay (terracotta), all on slightly uneven cut faces. Stone depth follows stone
  width, so falling tesserae read as roughly cubic.
- **Camera** (`src/director.js`): keyed poses joined by a cubic spline, so the
  camera never stops dead between keys. The chase keys are generated from the
  trail curves themselves, so the camera rides behind each path's laying point.
  Wide shots are fitted to the viewport; close-ups back off on narrow screens.
- **Reproducibility**: every random choice comes from a seeded generator
  (`src/rng.js`, seed 7878), so each load lays the same mosaic.

Three.js r186 is vendored in `vendor/` (MIT licence, `vendor/LICENSE-three.txt`).
The only add-on used is `OrbitControls`.
