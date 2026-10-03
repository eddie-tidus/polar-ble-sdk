// The cinematic camera's path, sampled every half frame at 24 fps, so the stone
// taps can be panned and attenuated by where each stone sits on screen.
//   node campath.mjs <outDir>  →  <outDir>/campath.json
// Each sample is [t, x, y, z, r, az, polar, tx, tz].

import fs from 'fs';
import { openMosaic } from './page.mjs';

const outDir = process.argv[2] ?? 'out';
fs.mkdirSync(outDir, { recursive: true });
const { browser, page } = await openMosaic();
await page.waitForTimeout(500);
const path = await page.evaluate(() => window.__mosaic.cameraPath(1 / 48));
fs.writeFileSync(`${outDir}/campath.json`, JSON.stringify(path));
console.log('camera samples', path.length);
await browser.close();
