// Raster fields over the panel: masks, Euclidean distance transforms and
// iso-contour extraction. Tile courses are laid along the iso-contours.

export class Grid {
  // Covers [x0, x0 + w*res] × [y0, y0 + h*res]; cell (i, j) centre at
  // (x0 + (i + 0.5) * res, y0 + (j + 0.5) * res).
  constructor(x0, y0, w, h, res) {
    this.x0 = x0; this.y0 = y0; this.w = w; this.h = h; this.res = res;
  }
  static covering(xmin, ymin, xmax, ymax, res) {
    const w = Math.ceil((xmax - xmin) / res), h = Math.ceil((ymax - ymin) / res);
    return new Grid(xmin, ymin, w, h, res);
  }
  cx(i) { return this.x0 + (i + 0.5) * this.res; }
  cy(j) { return this.y0 + (j + 0.5) * this.res; }
  // continuous grid coordinates of a world point (cell centres at integers)
  gx(x) { return (x - this.x0) / this.res - 0.5; }
  gy(y) { return (y - this.y0) / this.res - 0.5; }
  idx(x, y) {
    const i = Math.floor((x - this.x0) / this.res), j = Math.floor((y - this.y0) / this.res);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return j * this.w + i;
  }
}

// Even–odd scanline fill of polygon rings into a Uint8 mask (value v).
export function fillRings(grid, mask, rings, v = 1) {
  const { w, h } = grid;
  let ymin = Infinity, ymax = -Infinity;
  for (const r of rings) for (const p of r) { if (p[1] < ymin) ymin = p[1]; if (p[1] > ymax) ymax = p[1]; }
  const j0 = Math.max(0, Math.floor(grid.gy(ymin))), j1 = Math.min(h - 1, Math.ceil(grid.gy(ymax)));
  const xs = [];
  for (let j = j0; j <= j1; j++) {
    const y = grid.cy(j);
    xs.length = 0;
    for (const r of rings) {
      for (let k = 0, n = r.length; k < n; k++) {
        const a = r[k], b = r[(k + 1) % n];
        if ((a[1] <= y) !== (b[1] <= y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil(grid.gx(xs[k]))), i1 = Math.min(w - 1, Math.floor(grid.gx(xs[k + 1])));
      for (let i = i0; i <= i1; i++) mask[j * w + i] = v;
    }
  }
}

// Fill a convex polygon, calling fn(index) for each covered cell.
export function forEachCellInPolygon(grid, poly, fn) {
  const { w, h } = grid;
  let ymin = Infinity, ymax = -Infinity;
  for (const p of poly) { if (p[1] < ymin) ymin = p[1]; if (p[1] > ymax) ymax = p[1]; }
  const j0 = Math.max(0, Math.ceil(grid.gy(ymin))), j1 = Math.min(h - 1, Math.floor(grid.gy(ymax)));
  for (let j = j0; j <= j1; j++) {
    const y = grid.cy(j);
    let xa = Infinity, xb = -Infinity;
    for (let k = 0, n = poly.length; k < n; k++) {
      const a = poly[k], b = poly[(k + 1) % n];
      if ((a[1] <= y) !== (b[1] <= y)) {
        const x = a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
        if (x < xa) xa = x;
        if (x > xb) xb = x;
      }
    }
    if (xa > xb) continue;
    const i0 = Math.max(0, Math.ceil(grid.gx(xa))), i1 = Math.min(w - 1, Math.floor(grid.gx(xb)));
    for (let i = i0; i <= i1; i++) fn(j * w + i);
  }
}

// Exact Euclidean distance transform (Felzenszwalb & Huttenlocher). Returns,
// for every cell, the distance in world units from its centre to the nearest
// cell centre where `isSeed` is true.
export function edt(grid, isSeed) {
  const { w, h, res } = grid;
  const INF = 1e20;
  const f = new Float64Array(Math.max(w, h));
  const d = new Float64Array(Math.max(w, h));
  const v = new Int32Array(Math.max(w, h));
  const z = new Float64Array(Math.max(w, h) + 1);
  const tmp = new Float64Array(w * h);
  const out = new Float32Array(w * h);
  const pass = (n) => {
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s;
      for (;;) {
        const p = v[k];
        s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p);
        if (s <= z[k]) { k--; if (k < 0) { k = 0; break; } } else break;
      }
      k++;
      v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      const p = v[k];
      d[q] = (q - p) * (q - p) + f[p];
    }
  };
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) f[j] = isSeed(j * w + i) ? 0 : INF;
    pass(h);
    for (let j = 0; j < h; j++) tmp[j * w + i] = d[j];
  }
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) f[i] = tmp[j * w + i];
    pass(w);
    for (let i = 0; i < w; i++) out[j * w + i] = Math.sqrt(d[i]) * res;
  }
  return out;
}

// Distance transform that also reports which seed group is nearest.
// seedLabel(k) returns a label >= 0 for seed cells and -1 elsewhere.
export function edtLabels(grid, seedLabel) {
  const { w, h, res } = grid;
  const INF = 1e20;
  const M = Math.max(w, h);
  const f = new Float64Array(M), d = new Float64Array(M), z = new Float64Array(M + 1);
  const v = new Int32Array(M), arg = new Int32Array(M);
  const tmp = new Float64Array(w * h);
  const lab1 = new Int32Array(w * h).fill(-1);
  const dist = new Float32Array(w * h);
  const label = new Int32Array(w * h).fill(-1);
  const pass = (n) => {
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s;
      for (;;) {
        const p = v[k];
        s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p);
        if (s <= z[k]) { k--; if (k < 0) { k = 0; break; } } else break;
      }
      k++;
      v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      const p = v[k];
      d[q] = (q - p) * (q - p) + f[p];
      arg[q] = p;
    }
  };
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) f[j] = seedLabel(j * w + i) >= 0 ? 0 : INF;
    pass(h);
    for (let j = 0; j < h; j++) {
      tmp[j * w + i] = d[j];
      if (d[j] < INF / 2) lab1[j * w + i] = seedLabel(arg[j] * w + i);
    }
  }
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) f[i] = tmp[j * w + i];
    pass(w);
    for (let i = 0; i < w; i++) {
      dist[j * w + i] = Math.sqrt(d[i]) * res;
      label[j * w + i] = lab1[j * w + arg[i]];
    }
  }
  return { dist, label };
}

// Bilinear sample of a field at world coordinates.
export function sample(grid, field, x, y) {
  let gx = grid.gx(x), gy = grid.gy(y);
  gx = Math.max(0, Math.min(grid.w - 1.001, gx));
  gy = Math.max(0, Math.min(grid.h - 1.001, gy));
  const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j, w = grid.w;
  const a = field[j * w + i], b = field[j * w + i + 1], c = field[(j + 1) * w + i], d = field[(j + 1) * w + i + 1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

export function gradient(grid, field, x, y) {
  const e = grid.res;
  return [
    (sample(grid, field, x + e, y) - sample(grid, field, x - e, y)) / (2 * e),
    (sample(grid, field, x, y + e) - sample(grid, field, x, y - e)) / (2 * e),
  ];
}

// Marching squares. Returns polylines (world coordinates) of field == level,
// restricted to cells where every corner passes `valid` (if given).
export function contours(grid, field, level, valid) {
  const { w, h } = grid;
  // Edge ids: horizontal edge from (i,j) to (i+1,j) → 2*(j*w+i); vertical edge
  // from (i,j) to (i,j+1) → 2*(j*w+i)+1.
  const pointOf = new Map();
  const adj = new Map();
  const edgePoint = (id) => {
    let p = pointOf.get(id);
    if (p) return p;
    const cell = id >> 1, i = cell % w, j = (cell / w) | 0;
    const a = field[cell];
    let b, x, y;
    if ((id & 1) === 0) {
      b = field[cell + 1];
      const t = (level - a) / (b - a);
      x = grid.cx(i) + t * grid.res; y = grid.cy(j);
    } else {
      b = field[cell + w];
      const t = (level - a) / (b - a);
      x = grid.cx(i); y = grid.cy(j) + t * grid.res;
    }
    p = [x, y];
    pointOf.set(id, p);
    return p;
  };
  const link = (e1, e2) => {
    let l = adj.get(e1); if (!l) adj.set(e1, (l = [])); l.push(e2);
    l = adj.get(e2); if (!l) adj.set(e2, (l = [])); l.push(e1);
  };
  for (let j = 0; j < h - 1; j++) {
    for (let i = 0; i < w - 1; i++) {
      const k = j * w + i;
      const v0 = field[k], v1 = field[k + 1], v2 = field[k + w + 1], v3 = field[k + w];
      const c = (v0 > level ? 1 : 0) | (v1 > level ? 2 : 0) | (v2 > level ? 4 : 0) | (v3 > level ? 8 : 0);
      if (c === 0 || c === 15) continue;
      if (valid && !(valid(k) && valid(k + 1) && valid(k + w) && valid(k + w + 1))) continue;
      const eB = 2 * k, eT = 2 * (k + w), eL = 2 * k + 1, eR = 2 * (k + 1) + 1;
      switch (c) {
        case 1: case 14: link(eL, eB); break;
        case 2: case 13: link(eB, eR); break;
        case 3: case 12: link(eL, eR); break;
        case 4: case 11: link(eR, eT); break;
        case 6: case 9: link(eB, eT); break;
        case 7: case 8: link(eL, eT); break;
        case 5: case 10: {
          const centre = (v0 + v1 + v2 + v3) / 4 > level;
          if ((c === 5) === centre) { link(eL, eT); link(eB, eR); } else { link(eL, eB); link(eR, eT); }
          break;
        }
      }
    }
  }
  // Walk the adjacency into polylines.
  const used = new Set();
  const lines = [];
  const walk = (start) => {
    const ids = [start];
    used.add(start);
    let prev = -1, cur = start;
    for (;;) {
      const nb = adj.get(cur);
      let next = -1;
      for (const n of nb) if (n !== prev && !used.has(n)) { next = n; break; }
      if (next < 0) {
        // closed if the start is adjacent to the end
        const closed = ids.length > 2 && nb.includes(start);
        return { ids, closed };
      }
      used.add(next); ids.push(next); prev = cur; cur = next;
    }
  };
  // open polylines first (start at endpoints of degree 1)
  for (const [id, nb] of adj) {
    if (nb.length === 1 && !used.has(id)) {
      const { ids } = walk(id);
      lines.push({ pts: ids.map(edgePoint), closed: false });
    }
  }
  for (const id of adj.keys()) {
    if (!used.has(id)) {
      const { ids, closed } = walk(id);
      lines.push({ pts: ids.map(edgePoint), closed });
    }
  }
  return lines;
}
