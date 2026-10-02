// Ambient shading for the mortar. Mortar squeezed between stones gets less sky
// than open mortar, so the joints read darker where stones crowd round them.
// Built from the laid stones themselves: a blurred stone-coverage map gives the
// darkening (R), and the time the nearest stone lands decides when it appears
// (G, seconds / 64), so open bed stays bright until stones arrive.

import * as THREE from 'three';
import { forEachCellInPolygon, Grid } from './field.js';

const PX = 16; // texels per world unit
const BLUR = 4; // radius in texels (0.25 units)
const T_MAX = 64;

export function buildJointShade(tiles, panel) {
  const grid = Grid.covering(panel.x0, panel.y0, panel.x1, panel.y1, 1 / PX);
  const { w, h } = grid, N = w * h;
  const cover = new Float32Array(N);
  const when = new Float32Array(N).fill(T_MAX);
  for (const t of tiles) {
    const landed = Math.min(T_MAX, t.start + t.duration * 0.55);
    forEachCellInPolygon(grid, t.poly, (k) => {
      cover[k] = 1;
      if (landed < when[k]) when[k] = landed;
    });
  }
  // separable box blur of coverage, separable minimum of landing time
  const tmpA = new Float32Array(N), tmpB = new Float32Array(N);
  const pass = (srcA, srcB, dstA, dstB, horizontal) => {
    const outer = horizontal ? h : w, inner = horizontal ? w : h;
    for (let o = 0; o < outer; o++) {
      for (let i = 0; i < inner; i++) {
        let sum = 0, cnt = 0, mn = T_MAX;
        for (let d = -BLUR; d <= BLUR; d++) {
          const j = i + d;
          if (j < 0 || j >= inner) continue;
          const k = horizontal ? o * w + j : j * w + o;
          sum += srcA[k]; cnt++;
          if (srcB[k] < mn) mn = srcB[k];
        }
        const k = horizontal ? o * w + i : i * w + o;
        dstA[k] = sum / cnt;
        dstB[k] = mn;
      }
    }
  };
  pass(cover, when, tmpA, tmpB, true);
  pass(tmpA, tmpB, cover, when, false);

  const data = new Uint8Array(N * 2);
  for (let k = 0; k < N; k++) {
    data[k * 2] = Math.round(Math.min(1, cover[k]) * 255);
    data[k * 2 + 1] = Math.round((when[k] / T_MAX) * 255);
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return { tex, timeScale: T_MAX };
}
