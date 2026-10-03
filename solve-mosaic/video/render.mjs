// Renders video frames at exact construction-clock times (frame / fps) and
// writes them as PNGs. Frames already on disk are skipped, so an interrupted
// run can be resumed, and several renderers can share a range with `step`.
//   node render.mjs <outDir> <fps> <firstFrame> <lastFrame> [step] [width] [height]

import fs from 'fs';
import { openMosaic } from './page.mjs';

const [, , outDir, fps, first, last, step = 1, width = 1280, height = 720] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const { browser, page } = await openMosaic(+width, +height);

// One animation frame: the page's own frame callback (registered earlier)
// draws the new time first, then this callback reads the drawing buffer before
// it is presented, so each video frame costs exactly one render.
const grab = (t) => page.evaluate((t) => new Promise((resolve) => {
  window.__mosaic.time = t;
  requestAnimationFrame(() => resolve(document.querySelector('canvas').toDataURL('image/png')));
}), t);

await grab(0);
for (let f = +first; f <= +last; f += +step) {
  const file = `${outDir}/f${String(f).padStart(5, '0')}.png`;
  if (fs.existsSync(file)) continue;
  const t0 = Date.now();
  const url = await grab(f / +fps);
  fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  console.log(`frame ${f} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
await browser.close();
