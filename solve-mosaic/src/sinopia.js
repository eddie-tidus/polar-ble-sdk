// The sinopia: the red-ochre underdrawing a Roman mosaicist sketched onto the
// setting bed before laying stones. It is drawn here from the design's own
// geometry into a small two-channel texture: R = ink, G = the moment in the
// drawing sequence (0..1) at which that bit of line is drawn.

import * as THREE from 'three';
import { PANEL, FIELD, toWorld } from './compose.js';

const PX = 12; // texels per world unit

export function buildSinopia({ planes, trails }) {
  const W = Math.ceil((PANEL.x1 - PANEL.x0) * PX), H = Math.ceil((PANEL.y1 - PANEL.y0) * PX);
  const ink = new Float32Array(W * H);
  const order = new Float32Array(W * H).fill(1);

  // Stroke a polyline; the drawing order runs from o0 to o1 along its length.
  function stroke(pts, o0, o1, { width = 0.09, strength = 1, closed = false } = {}) {
    const P = (closed ? pts.concat([pts[0]]) : pts).map(([x, y]) => [(x - PANEL.x0) * PX, (y - PANEL.y0) * PX]);
    const cum = [0];
    for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const total = cum[cum.length - 1] || 1;
    const hw = (width * PX) / 2;
    for (let i = 0; i + 1 < P.length; i++) {
      const [ax, ay] = P[i], [bx, by] = P[i + 1];
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - hw - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + hw + 1));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - hw - 1)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + hw + 1));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5, py = y + 0.5;
          const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
          const d = Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
          const a = Math.max(0, Math.min(1, hw + 0.5 - d)) * strength;
          if (a <= 0) continue;
          const k = y * W + x;
          if (a > ink[k]) ink[k] = a;
          if (a > 0.3) {
            const o = o0 + (o1 - o0) * ((cum[i] + Math.sqrt(L2) * t) / total);
            if (o < order[k]) order[k] = o;
          }
        }
      }
    }
  }
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

  // 1. Setting out: the field, its axes, and the type guides for the wordmark.
  stroke(rect(FIELD.x0, FIELD.y0, FIELD.x1, FIELD.y1), 0.0, 0.06, { closed: true });
  stroke([[FIELD.x0, 0], [FIELD.x1, 0]], 0.04, 0.08, { strength: 0.55, width: 0.07 });
  stroke([[0, FIELD.y0], [0, FIELD.y1]], 0.05, 0.09, { strength: 0.55, width: 0.07 });
  const xl = toWorld([-20, 0])[0], xr = toWorld([1220, 0])[0];
  for (const py of [18, 104.9, 364.9]) { // ascender, x-height, baseline in reference pixels
    const y = toWorld([0, py])[1];
    stroke([[xl, y], [xr, y]], 0.06, 0.1, { strength: 0.5, width: 0.06 });
  }

  // 3. The frame band and corner squares.
  for (const v of [0, 1, 2, 7, 8, 9]) {
    stroke(rect(PANEL.x0 + v, PANEL.y0 + v, PANEL.x1 - v, PANEL.y1 - v), 0.34 + v * 0.008, 0.4 + v * 0.008, { closed: true, strength: 0.8, width: 0.07 });
  }
  for (const [cx, cy] of [[PANEL.x0, PANEL.y1], [PANEL.x1, PANEL.y1], [PANEL.x1, PANEL.y0], [PANEL.x0, PANEL.y0]]) {
    const sx = cx < 0 ? 1 : -1, sy = cy < 0 ? 1 : -1;
    const c = [cx + sx * 4.5, cy + sy * 4.5];
    const circ = [];
    for (let i = 0; i < 48; i++) circ.push([c[0] + 2.45 * Math.cos((i / 48) * Math.PI * 2), c[1] + 2.45 * Math.sin((i / 48) * Math.PI * 2)]);
    stroke(circ, 0.46, 0.5, { closed: true, strength: 0.8, width: 0.07 });
  }

  // The wordmark itself is deliberately left out: its shape stays hidden until
  // the background closes round it.

  // 2. Planes (outline and folds) and their flight paths, drawn early so the
  //    opening chase follows a freshly drawn line.
  planes.forEach((pl, i) => {
    const o0 = 0.1 + i * 0.06;
    stroke(pl.geo.outline, o0, o0 + 0.025, { closed: true });
    for (const f of pl.geo.facets) stroke([f.foldFrom, f.foldTo], o0 + 0.02, o0 + 0.03, { strength: 0.7, width: 0.07 });
    stroke(trails[i].pts, o0 + 0.01, o0 + 0.04, { strength: 0.6, width: 0.07 });
  });

  // 4. The meander's path along each side of the band.
  const sides = [
    { n: FIELD.x1 - FIELD.x0, at: (u, v) => [FIELD.x0 + u + 0.5, PANEL.y1 - v - 0.5] },
    { n: FIELD.y1 - FIELD.y0, at: (u, v) => [PANEL.x1 - v - 0.5, FIELD.y1 - u - 0.5] },
    { n: FIELD.x1 - FIELD.x0, at: (u, v) => [FIELD.x1 - u - 0.5, PANEL.y0 + v + 0.5] },
    { n: FIELD.y1 - FIELD.y0, at: (u, v) => [PANEL.x0 + v + 0.5, FIELD.y0 + u + 0.5] },
  ];
  sides.forEach((side, si) => {
    const path = [];
    for (let u0 = 0; u0 + 6 < side.n; u0 += 6) {
      for (const [du, y] of [[0, 0], [0, 4], [4, 4], [4, 2], [2, 2], [2, 0]]) path.push(side.at(u0 + du, 2 + y));
    }
    path.push(side.at(side.n - 1, 2), side.at(side.n - 1, 6));
    stroke(path, 0.84 + si * 0.04, 0.88 + si * 0.04, { strength: 0.75, width: 0.07 });
  });

  const data = new Uint8Array(W * H * 2);
  for (let k = 0; k < W * H; k++) {
    data[k * 2] = Math.round(ink[k] * 255);
    data[k * 2 + 1] = Math.round(Math.min(1, order[k]) * 255);
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
