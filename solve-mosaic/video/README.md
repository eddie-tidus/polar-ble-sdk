# Cinematic video

Scripts that turn the single-file build into an MP4 of the Cinematic camera at
1× speed, with music and a tap for every stone. The page is not modified: the
renderer drives its construction clock through `window.__mosaic` and hides the
control bar with an injected style.

## Rebuild

```sh
cd solve-mosaic
npm run build                    # if dist/solve-mosaic.html is out of date
video/build.sh                   # writes video/out/
```

Requirements: Node with Playwright and its Chromium (set `PLAYWRIGHT` to the
path of Playwright's `index.mjs` if Node cannot resolve `playwright`), Python 3
with numpy, librosa and soundfile, and ffmpeg.

Output in `video/out/`:

| File | Contents |
| --- | --- |
| `solve-mosaic-cinematic.mp4` | 43.0 s, 1280×720, 24 fps, H.264 CRF 22 + AAC 192 kbit/s stereo, about 54 MiB |
| `solve-mosaic-cinematic-small.mp4` | Same, two-pass at 5.1 Mbit/s, about 27 MiB, for upload limits |
| `mix.wav`, `sfx_only.wav` | The soundtrack, and the stone taps alone |

Rendering uses software WebGL (SwiftShader), so frames match what the page
draws, but it is slow: about 1 hour for the 1,032 frames on 4 cores. An
interrupted run resumes from the frames already on disk. `JOBS` sets the
number of renderers (default 2).

## Steps

1. `events.mjs`: every stone's landing and rebound time, position, size and
   stone family, from the same seeded layout and timeline as the page.
2. `campath.mjs`: the cinematic camera's path, sampled every 1/48 s.
3. `taps.py`: trims each tap recording to its strike and decay.
4. `mix.py`: places one tap per landing (and a quieter one per rebound).
   - Each tap's level follows the stone's distance from the camera, whether it
     is on screen, and its size; its pitch follows its size.
   - Taps are panned by where the stone sits on screen. Glass stones
     (turquoise, blue, green) use the glass taps.
   - A level rider caps dense passages, which reach several hundred stones a
     second, so they stay a soft patter about 9 dB under the music.
5. `render.mjs`: renders each frame at exactly frame/24 s.
6. `build.sh`: runs the steps above, then encodes. The audio is delayed by
   21 ms (half a frame), so each tap is within about ±21 ms of the frame where
   its stone lands.

## Sources (`sources/`)

Generated with ElevenLabs:

- **`music.mp3`**: Eleven Music v2.5, 44 s, instrumental. Prompt: *"Moody
  instrumental lo-fi jazz hop at about 84 BPM, built on mellow felt piano
  chords with jazzy sevenths and a breathy, melancholic flute melody, over
  dusty swung boom-bap drums, a warm round bass, soft vinyl crackle and gentle
  tape saturation…"*
  - Four takes were generated; this is take 1. All four brought the drums in
    at about 10 s, not the 4 s asked for.
- **`tap_1–4.mp3`**: text-to-sound v2, 1 s, prompt influence 0.6. Prompt: *"A
  single small marble mosaic tile set down onto soft wet lime mortar: one
  gentle, satisfying low tap with a tiny muted click…"*
- **`glass_1–4.mp3`**: the same settings. Prompt: *"A single small glass mosaic
  tile pressed onto soft wet mortar: one soft, bright glassy tick over a gentle
  low thud…"*
