// Every stone's landing, from the same seeded layout and timeline as the page.
//   node events.mjs <outDir>  →  <outDir>/events.json

import fs from 'fs';
import { buildMosaic } from '../src/layout.js';
import { assignTimeline } from '../src/timeline.js';
import { centroid, signedArea } from '../src/geom.js';

const outDir = process.argv[2] ?? 'out';
fs.mkdirSync(outDir, { recursive: true });
const m = buildMosaic({ seed: 7878 });
const end = assignTimeline(m.tiles, 7878);
// in the vertex shader the fall ends at 50% of the stone's duration, and the
// small rebound lands again at 74%
const events = m.tiles.map((t) => {
  const c = centroid(t.poly);
  return {
    land: t.start + 0.5 * t.duration, rebound: t.start + 0.74 * t.duration, x: c[0], y: c[1],
    size: Math.sqrt(Math.abs(signedArea(t.poly))), group: t.group, tone: t.tone,
  };
});
fs.writeFileSync(`${outDir}/events.json`, JSON.stringify(events));
console.log(events.length, 'stones; build ends at', end.toFixed(2), 's');
