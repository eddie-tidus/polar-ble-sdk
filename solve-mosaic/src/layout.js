// Lays every tessera. Courses follow the design rather than a grid:
//  - letters: contour rows taken from the inside distance field of each glyph
//  - dots and corner rosettes: concentric rings of wedge-cut stones
//  - planes: straight rows parallel to each facet's fold, clipped to the facet
//  - trails: a single dashed course along each flight path
//  - background: rows offset outwards from every subject and from the frame,
//    so they bend round the lettering, planes and trails
//  - border: square-cut stones in aligned rows carrying a meander
// Leftover holes are filled with irregular cut pieces, as a mosaicist would.

import { Grid, fillRings, forEachCellInPolygon, edt, edtLabels, sample, contours } from './field.js';
import {
  signedArea, centroid, ccw, isConvex, clipHalfPlane, insetConvex, convexHull,
  simplifyConvex, resample, sampleBezierChain, pointInPolygon,
} from './geom.js';
import { Rng } from './rng.js';
import { FLIGHT } from './timeline.js';
import { FIELD, PANEL, BORDER, wordmark, PLANES, planeGeometry } from './compose.js';

const RES = 1 / 16;
const GAP = 0.12; // mortar joint in the background and border
const GAP_FINE = 0.09; // joints in the lettering, planes and dots
const TAU = Math.PI * 2;

const LETTER_ORDER = ['s', 'o', 'l', 'v', 'e'];
const mix = ([a, b], t) => a + (b - a) * Math.min(1, Math.max(0, t));

export function buildMosaic({ seed = 7878, targetCount = 7878 } = {}) {
  const t0 = performance.now();
  const rng = new Rng(seed);
  const tiles = [];
  const wm = wordmark();

  const grid = Grid.covering(FIELD.x0 - 1, FIELD.y0 - 1, FIELD.x1 + 1, FIELD.y1 + 1, RES);
  const N = grid.w * grid.h;
  const occ = new Int32Array(N).fill(-1); // tile id covering each cell
  const region = new Uint16Array(N); // region id per cell (0 = none)
  const regions = [null];
  const addRegion = (info) => regions.push(info) - 1;

  // ------------------------------------------------------------ placement

  function polyOk(p, minArea = 0.012, minWidth = 0.16) {
    if (p.length < 3) return false;
    const a = signedArea(p);
    if (a < minArea) return false;
    if (!isConvex(p)) return false;
    let maxE = 0;
    for (let i = 0; i < p.length; i++) {
      const q = p[i], r = p[(i + 1) % p.length];
      maxE = Math.max(maxE, Math.hypot(r[0] - q[0], r[1] - q[1]));
    }
    return (2 * a) / maxE > minWidth; // reject needle-thin slivers
  }

  // Place a tile if it does not overlap stones already laid.
  function place(poly, meta, tolerance = 0.03, minWidth = 0.16) {
    poly = ccw(poly);
    if (poly.length > 6) poly = simplifyConvex(poly, 6);
    if (!polyOk(poly, 0.012, minWidth)) return -1;
    const cells = [];
    let over = 0;
    forEachCellInPolygon(grid, poly, (k) => { cells.push(k); if (occ[k] >= 0) over++; });
    if (over > Math.max(1, tolerance * cells.length)) return -1;
    const id = tiles.length;
    for (const k of cells) if (occ[k] < 0) occ[k] = id;
    tiles.push({ poly, ...meta });
    return id;
  }

  // Place without touching the occupancy grid (border, outside the field grid).
  function placeFree(poly, meta) {
    poly = ccw(poly);
    if (poly.length > 6) poly = simplifyConvex(poly, 6);
    tiles.push({ poly, ...meta });
    return tiles.length - 1;
  }

  // ------------------------------------------------------------ rows along a polyline

  // Lays a course of stones along `line`. The "up" side is where `field`
  // increases (away from the subject the course is hugging).
  // opts: halfUp, halfDown, len, gap, rng, meta(i, s, L), field | normalSign,
  //       clip(aDn, bDn, bUp, aUp) → polygon | null, trim
  function layCourse(line, opts) {
    const rs = resample(line.pts, 0.04, line.closed);
    const P = rs.pts, n = P.length, L = rs.length;
    if (L < opts.len * 0.45 || n < 4) return [];
    const wrap = (i) => (line.closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i)));
    const T = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = P[wrap(i - 2)], b = P[wrap(i + 2)];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      T[i] = [dx / l, dy / l];
    }
    let sgn = 0;
    if (opts.field) {
      for (let i = 0; i < n; i += Math.max(1, (n / 12) | 0)) {
        const nx = -T[i][1], ny = T[i][0];
        const fp = sample(grid, opts.field, P[i][0] + nx * 0.15, P[i][1] + ny * 0.15);
        const fm = sample(grid, opts.field, P[i][0] - nx * 0.15, P[i][1] - ny * 0.15);
        sgn += fp > fm ? 1 : -1;
      }
    } else sgn = opts.normalSign || 1;
    const sg = sgn >= 0 ? 1 : -1;
    const Nrm = T.map((t) => [-t[1] * sg, t[0] * sg]);

    // Corners: gentle ones are mitred, sharp ones break the course.
    const K = 3;
    const turn = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (!line.closed && (i < K || i >= n - K)) continue;
      const a = T[wrap(i - K)], b = T[wrap(i + K)];
      turn[i] = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])));
    }
    const corners = [];
    for (let i = 0; i < n; i++) {
      if (turn[i] < 0.7) continue;
      let isMax = true;
      for (let j = -4; j <= 4; j++) if (j && turn[wrap(i + j)] > turn[i]) { isMax = false; break; }
      if (isMax && (!corners.length || i - corners[corners.length - 1].i > 4)) {
        corners.push({ i, kind: turn[i] < 1.62 ? 'mitre' : 'break' });
      }
    }
    const pieces = [];
    if (corners.length === 0) {
      pieces.push({ a: 0, b: line.closed ? n : n - 1, ka: null, kb: null, loop: line.closed });
    } else if (line.closed) {
      for (let c = 0; c < corners.length; c++) {
        const A = corners[c], B = corners[(c + 1) % corners.length];
        pieces.push({ a: A.i, b: c + 1 < corners.length ? B.i : B.i + n, ka: A.kind, kb: B.kind });
      }
    } else {
      let prev = 0, pk = null;
      for (const c of corners) { pieces.push({ a: prev, b: c.i, ka: pk, kb: c.kind }); prev = c.i; pk = c.kind; }
      pieces.push({ a: prev, b: n - 1, ka: pk, kb: null });
    }
    const step = L / (line.closed ? n : n - 1);
    const mitre = (i) => {
      const a = Nrm[wrap(i - K)], b = Nrm[wrap(i + K)];
      let mx = a[0] + b[0], my = a[1] + b[1];
      const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
      return { m: [mx, my], k: 1 / Math.max(0.6, mx * a[0] + my * a[1]) };
    };
    const pointAt = (fi) => {
      const j = Math.floor(fi), f = fi - j;
      const A = P[wrap(j)], B = P[wrap(j + 1)];
      return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f];
    };
    const g2 = opts.gap / 2;
    const ids = [];
    for (const pc of pieces) {
      const len = (pc.b - pc.a) * step;
      if (len < opts.len * 0.45) continue;
      const count = Math.max(1, Math.round(len / opts.len));
      const base = len / count;
      const a0 = pc.a + (pc.loop ? opts.rng.float(0, base) / step : 0);
      const cuts = [0];
      for (let k = 1; k < count; k++) cuts.push(k * base + opts.rng.jitter(base * 0.14));
      cuts.push(len);
      // side: +1 at the start of a stone (push forwards), -1 at its end
      const end = (sArc, kind, side) => {
        const fi = a0 + sArc / step;
        if (kind === 'mitre') {
          const ci = wrap(Math.round(fi));
          const { m, k } = mitre(ci);
          const V = P[ci], tp = T[wrap(ci + side * (K + 1))];
          const bx = V[0] + tp[0] * g2 * k * side, by = V[1] + tp[1] * g2 * k * side;
          return [[bx + m[0] * opts.halfUp * k, by + m[1] * opts.halfUp * k], [bx - m[0] * opts.halfDown * k, by - m[1] * opts.halfDown * k]];
        }
        let fs = fi + (side * g2) / step;
        let ni = wrap(Math.round(fs));
        if (kind === 'break') { fs += (side * g2) / step; ni = wrap(Math.round(fi) + side * (K + 2)); }
        const B = pointAt(fs), nn = Nrm[ni];
        return [[B[0] + nn[0] * opts.halfUp, B[1] + nn[1] * opts.halfUp], [B[0] - nn[0] * opts.halfDown, B[1] - nn[1] * opts.halfDown]];
      };
      for (let k = 0; k < count; k++) {
        const [aUp, aDn] = end(cuts[k], k === 0 ? pc.ka : null, +1);
        const [bUp, bDn] = end(cuts[k + 1], k === count - 1 ? pc.kb : null, -1);
        let poly = [aDn, bDn, bUp, aUp];
        if (opts.clip) poly = opts.clip(aDn, bDn, bUp, aUp);
        if (!poly) continue;
        if (opts.reshape) poly = opts.reshape(poly, ids.length);
        const sMid = ((a0 - pc.a) * step + pc.a * step + (cuts[k] + cuts[k + 1]) / 2) % L;
        const meta = opts.meta(ids.length, sMid, L);
        let id = place(poly, meta);
        if (id < 0 && opts.trim) {
          // squeeze the far side, where colliding courses meet, before giving up
          const [pDn0, pDn1, pUp1, pUp0] = poly.length === 4 ? poly : [aDn, bDn, bUp, aUp];
          for (const f of [0.62, 0.34]) {
            id = place([pDn0, pDn1, lerp2(pDn1, pUp1, f), lerp2(pDn0, pUp0, f)], meta);
            if (id >= 0) break;
          }
        }
        if (id >= 0) ids.push(id);
      }
    }
    return ids;
  }
  const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

  // A round-cut stone (hexagon) set in the middle of a course quad.
  function roundStone(q) {
    const c = centroid(q);
    const ux = q[1][0] - q[0][0], uy = q[1][1] - q[0][1], len = Math.hypot(ux, uy) || 1;
    const across = Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1]);
    const r = Math.min(len, across) * 0.5;
    const a0 = Math.atan2(uy, ux);
    const out = [];
    for (let k = 0; k < 6; k++) {
      const a = a0 + (k / 6) * TAU + TAU / 12;
      out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
    }
    return out;
  }

  // ------------------------------------------------------------ concentric rings

  function ringSector(c, r0, r1, aA, aB, gap, arcSub) {
    const g2 = gap / 2;
    const ri = r0 + g2, ro = r1 - g2;
    const dO = Math.asin(Math.min(1, g2 / ro)), dI = Math.asin(Math.min(1, g2 / Math.max(ri, g2 * 1.01)));
    const pts = [];
    for (let i = 0; i <= arcSub; i++) {
      const a = aA + dO + ((aB - dO) - (aA + dO)) * (i / arcSub);
      pts.push([c[0] + ro * Math.cos(a), c[1] + ro * Math.sin(a)]);
    }
    if (ri > g2 * 1.5) {
      pts.push([c[0] + ri * Math.cos(aB - dI), c[1] + ri * Math.sin(aB - dI)]);
      pts.push([c[0] + ri * Math.cos(aA + dI), c[1] + ri * Math.sin(aA + dI)]);
    } else pts.push([c[0], c[1]]);
    return pts;
  }

  function rosette(c, rings, gap, r, meta, useGrid) {
    // rings: [{ r0, r1, n, tone }] ; first ring with r0 = 0 is a single centre stone
    const ids = [];
    rings.forEach((ring, ri) => {
      const put = (poly, k, kn) => {
        const m = meta(ring, ri, k / kn);
        const id = useGrid ? place(poly, m, 0.08, 0.05) : placeFree(poly, m);
        if (id >= 0) ids.push(id);
      };
      if (ring.r0 === 0) {
        const a0 = r.float(0, TAU), sides = ring.sides || 6, rr = ring.r1 - gap / 2;
        const poly = [];
        for (let k = 0; k < sides; k++) {
          const a = a0 + (k / sides) * TAU;
          poly.push([c[0] + rr * Math.cos(a), c[1] + rr * Math.sin(a)]);
        }
        put(poly, 0, 1);
        return;
      }
      const a0 = r.float(0, TAU);
      for (let k = 0; k < ring.n; k++) {
        const jitA = k === 0 ? 0 : r.jitter(0.06 / ring.n) * TAU;
        const jitB = k === ring.n - 1 ? 0 : r.jitter(0.06 / ring.n) * TAU;
        const aA = a0 + (k / ring.n) * TAU + jitA, aB = a0 + ((k + 1) / ring.n) * TAU + jitB;
        const arcLen = (aB - aA) * ring.r1;
        put(ringSector(c, ring.r0, ring.r1, aA, aB, gap, arcLen > 0.9 ? 3 : 2), k, ring.n);
      }
    });
    return ids;
  }

  // ------------------------------------------------------------ masks & regions

  const letterMask = new Uint8Array(N); // letter index + 1
  wm.letters.forEach((l, i) => fillRings(grid, letterMask, l.rings, i + 1));
  const obstacle = new Uint8Array(N);
  for (let k = 0; k < N; k++) if (letterMask[k]) obstacle[k] = 1;
  const letterRegion = wm.letters.map((l) => addRegion({ kind: 'letter', tone: 'ivory', letter: l.id }));
  for (let k = 0; k < N; k++) if (letterMask[k]) region[k] = letterRegion[letterMask[k] - 1];

  // dots
  const dotMask = new Uint8Array(N);
  wm.dots.forEach((d) => fillRings(grid, dotMask, [d.ring], 1));
  for (let k = 0; k < N; k++) if (dotMask[k]) obstacle[k] = 1;

  // planes
  const planes = PLANES.map((p) => ({ spec: p, geo: planeGeometry(p) }));
  const planeMask = new Uint8Array(N);
  planes.forEach((pl, pi) => {
    pl.facetRegions = pl.geo.facets.map((f) => {
      const id = addRegion({ kind: 'plane', tone: f.tone, plane: pi, facet: f.name });
      const m = new Uint8Array(N);
      fillRings(grid, m, [f.tri], 1);
      for (let k = 0; k < N; k++) if (m[k]) { region[k] = id; planeMask[k] = 1; }
      return id;
    });
  });
  for (let k = 0; k < N; k++) if (planeMask[k]) obstacle[k] = 1;

  // trails (sampled now, laid later)
  const TRAIL_W = 0.6;
  const trails = planes.map((pl) => {
    const line = sampleBezierChain(pl.spec.trail, 0.04);
    // run from the far end until the path comes within a stone's width of the
    // plane, so the trail stops just behind it
    const out = pl.geo.outline;
    const clear = (q) => {
      if (pointInPolygon(q[0], q[1], [out])) return false;
      for (let i = 0; i < out.length; i++) {
        const a = out[i], b = out[(i + 1) % out.length];
        const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2));
        if (Math.hypot(q[0] - a[0] - dx * t, q[1] - a[1] - dy * t) < 1.05) return false;
      }
      return true;
    };
    const pts = [];
    for (const q of line.pts) { if (!clear(q)) break; pts.push(q); }
    return { pts, closed: false };
  });
  const trailMask = new Uint8Array(N);
  for (const tr of trails) {
    const P = tr.pts;
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i], b = P[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      const nx = (-dy / l) * (TRAIL_W / 2), ny = (dx / l) * (TRAIL_W / 2);
      forEachCellInPolygon(grid, [[a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny], [a[0] + nx, a[1] + ny]], (k) => (trailMask[k] = 1));
    }
  }
  for (let k = 0; k < N; k++) if (trailMask[k]) obstacle[k] = 1;

  // background region = field minus subjects
  const inField = (k) => {
    const i = k % grid.w, j = (k / grid.w) | 0;
    const x = grid.cx(i), y = grid.cy(j);
    return x > FIELD.x0 && x < FIELD.x1 && y > FIELD.y0 && y < FIELD.y1;
  };
  const bgRegion = addRegion({ kind: 'background', tone: 'charcoal' });
  for (let k = 0; k < N; k++) if (inField(k) && !obstacle[k] && !region[k]) region[k] = bgRegion;

  // ------------------------------------------------------------ 1. letters

  const pL = wm.stroke / 6; // six courses across a stem
  const dIn = edt(grid, (k) => !letterMask[k]);
  for (let k = 0; k < N; k++) dIn[k] = letterMask[k] ? dIn[k] - RES / 2 : -RES / 2;
  const letterRows = [0, 1, 2];
  const rLetters = rng.fork(11);
  for (const r of letterRows) {
    const level = (r + 0.5) * pL;
    const lines = contours(grid, dIn, level);
    for (const line of lines) {
      // which letter?
      const q = line.pts[0];
      const li = letterMask[grid.idx(q[0], q[1])] || nearestLetter(q);
      if (!li) continue;
      const letterId = wm.letters[li - 1].id;
      const order = LETTER_ORDER.indexOf(letterId);
      const h = pL / 2 - GAP_FINE / 2;
      layCourse(line, {
        field: dIn, halfUp: h, halfDown: h, len: pL * 1.12, gap: GAP_FINE, rng: rLetters, trim: true,
        meta: (_, s, L) => ({
          tone: 'ivory', group: 'letter', region: letterRegion[li - 1],
          phase: r === 0 ? 'outline' : 'fill',
          prog: r === 0 ? (order + s / L) / 5 : (order + (r - 1) * 0.5 + 0.5 * (s / L)) / 5,
        }),
      });
    }
  }
  function nearestLetter(q) {
    for (let d = 1; d < 6; d++) {
      for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) {
        const k = grid.idx(q[0] + dx * RES, q[1] + dy * RES);
        if (k >= 0 && letterMask[k]) return letterMask[k];
      }
    }
    return 0;
  }

  // ------------------------------------------------------------ 2. dots

  const rDots = rng.fork(23);
  wm.dots.forEach((d, di) => {
    const R = d.r;
    const reg = addRegion({ kind: 'dot', tone: 'turquoise' });
    rosette(d.c, [
      { r0: 0, r1: R * 0.31, tone: 'turquoise', sides: 6 },
      { r0: R * 0.31, r1: R * 0.67, n: 6, tone: 'turquoise' },
      { r0: R * 0.67, r1: R, n: 10, tone: 'turquoise' },
    ], 0.07, rDots, (ring, ri, f) => ({
      // both dots together, outer ring first, each ring running round in turn
      tone: ring.tone, group: 'dot', region: reg, phase: 'dots',
      prog: Math.min(1, ((2 - ri) + f * 0.92 + di * 0.08) / 3),
    }), true);
  });

  // ------------------------------------------------------------ 3. planes

  const rPlanes = rng.fork(37);
  planes.forEach((pl, pi) => {
    const small = pl.spec.length < 9;
    const pitch = small ? 0.5 : 0.6;
    const len = pitch * 1.25;
    const facetOrder = { light: 0, dark: 1, keel: 2 };
    pl.geo.facets.forEach((f, fi) => {
      const tri = ccw(f.tri);
      const inset = insetConvex(tri, GAP_FINE / 2);
      if (!inset) return;
      const ux0 = f.foldTo[0] - f.foldFrom[0], uy0 = f.foldTo[1] - f.foldFrom[1];
      const ul = Math.hypot(ux0, uy0);
      const u = [ux0 / ul, uy0 / ul];
      let v = [-u[1], u[0]];
      const cen = centroid(tri);
      if ((cen[0] - f.foldFrom[0]) * v[0] + (cen[1] - f.foldFrom[1]) * v[1] < 0) v = [-v[0], -v[1]];
      const sv = (p) => (p[0] - f.foldFrom[0]) * v[0] + (p[1] - f.foldFrom[1]) * v[1];
      const su = (p) => (p[0] - f.foldFrom[0]) * u[0] + (p[1] - f.foldFrom[1]) * u[1];
      let smin = Infinity, smax = -Infinity;
      for (const p of inset) { smin = Math.min(smin, sv(p)); smax = Math.max(smax, sv(p)); }
      const rows = Math.max(1, Math.round((smax - smin) / pitch));
      const rp = (smax - smin) / rows;
      for (let r = 0; r < rows; r++) {
        const a = smin + r * rp + (r > 0 ? GAP_FINE / 2 : 0);
        const b = smin + (r + 1) * rp - (r < rows - 1 ? GAP_FINE / 2 : 0);
        // band: a <= v·(p - o) <= b   →  -v·p <= -a - v·o ;  v·p <= b + v·o
        const vo = v[0] * f.foldFrom[0] + v[1] * f.foldFrom[1];
        let band = clipHalfPlane(inset, -v[0], -v[1], -(a + vo));
        band = clipHalfPlane(band, v[0], v[1], b + vo);
        if (band.length < 3) continue;
        let umin = Infinity, umax = -Infinity;
        for (const p of band) { umin = Math.min(umin, su(p)); umax = Math.max(umax, su(p)); }
        const span = umax - umin;
        const count = Math.max(1, Math.round(span / len));
        let cuts = [umin];
        for (let k = 1; k < count; k++) cuts.push(umin + (k / count) * span + rPlanes.jitter((span / count) * 0.15));
        cuts.push(umax);
        const uo = u[0] * f.foldFrom[0] + u[1] * f.foldFrom[1];
        const pieceOf = (c0, c1, first, last) => {
          let pc = band;
          if (!first) pc = clipHalfPlane(pc, -u[0], -u[1], -(c0 + GAP_FINE / 2 + uo));
          if (!last) pc = clipHalfPlane(pc, u[0], u[1], c1 - GAP_FINE / 2 + uo);
          return pc;
        };
        // merge slivers at the narrow end
        for (let guard = 0; guard < 6 && cuts.length > 2; guard++) {
          let worst = -1, worstA = Infinity;
          for (let k = 0; k + 1 < cuts.length; k++) {
            const pc = pieceOf(cuts[k], cuts[k + 1], k === 0, k + 1 === cuts.length - 1);
            const A = pc.length >= 3 ? signedArea(ccw(pc)) : 0;
            if (A < worstA) { worstA = A; worst = k; }
          }
          if (worstA > 0.3 * rp * len) break;
          // remove the cut shared with the smaller neighbour
          const rm = worst === 0 ? 1 : worst + 1 === cuts.length - 1 ? worst : worst;
          cuts.splice(rm, 1);
        }
        for (let k = 0; k + 1 < cuts.length; k++) {
          const pc = pieceOf(cuts[k], cuts[k + 1], k === 0, k + 1 === cuts.length - 1);
          if (pc.length < 3) continue;
          const uf = 1 - ((cuts[k] + cuts[k + 1]) / 2 - umin) / Math.max(span, 1e-6); // nose first
          place(pc, {
            tone: f.tone, group: 'plane', region: pl.facetRegions[fi], phase: 'planes',
            prog: mix(FLIGHT[pi].body, (facetOrder[f.name] + (r + uf) / rows) / 3),
          }, 0.05, 0.08);
        }
      }
    });
    // trail: a dotted course laid from its far end up to the plane, as in the
    // Solve motif: round white stones with dark stones between them
    const tr = trails[pi];
    const line = { pts: tr.pts, closed: false };
    const half = TRAIL_W / 2 - GAP_FINE / 2;
    layCourse(line, {
      halfUp: half, halfDown: half, len: 0.62, gap: GAP_FINE, rng: rPlanes, normalSign: 1,
      reshape: (poly, i) => (i % 2 === 0 ? roundStone(poly) : poly),
      meta: (i, s, L) => ({
        tone: i % 2 === 0 ? 'ivory' : 'charcoal', group: i % 2 === 0 ? 'trail' : 'trail-gap', region: 0,
        phase: 'planes', prog: mix(FLIGHT[pi].trail, s / L),
      }),
    });
  });

  // ------------------------------------------------------------ 4. background

  // Every background cell belongs to the zone of its nearest subject (each
  // letter, each plane with its trail, or the frame). Courses offset from a
  // subject are cut cleanly where its zone meets the next one.
  const FRAME_ZONE = 9;
  const srcLabel = new Int8Array(N).fill(-1);
  for (let k = 0; k < N; k++) {
    if (!inField(k)) srcLabel[k] = FRAME_ZONE;
    else if (letterMask[k]) srcLabel[k] = letterMask[k] - 1;
    else if (dotMask[k]) srcLabel[k] = 10; // the dots get their own halo zone
  }
  planes.forEach((pl, pi) => {
    for (let k = 0; k < N; k++) if (region[k] && regions[region[k]].plane === pi) srcLabel[k] = 5 + pi;
  });
  trails.forEach((tr, pi) => {
    const P = tr.pts;
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i], b = P[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      const nx = (-dy / l) * (TRAIL_W / 2), ny = (dx / l) * (TRAIL_W / 2);
      forEachCellInPolygon(grid, [[a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny], [a[0] + nx, a[1] + ny]], (k) => { if (srcLabel[k] < 0 || srcLabel[k] === FRAME_ZONE) srcLabel[k] = 5 + pi; });
    }
  });
  const near = edtLabels(grid, (k) => srcLabel[k]);
  const dBg = near.dist, zone = near.label;
  for (let k = 0; k < N; k++) dBg[k] -= RES / 2;
  const W = grid.w;
  const dSeam = edt(grid, (k) => {
    const i = k % W, z = zone[k];
    return (i > 0 && zone[k - 1] !== z) || (i < W - 1 && zone[k + 1] !== z) ||
      (k >= W && zone[k - W] !== z) || (k + W < N && zone[k + W] !== z);
  });
  const zoneAt = (p) => { const k = grid.idx(p[0], p[1]); return k < 0 ? -2 : zone[k]; };
  const clipToZone = (aDn, bDn, bUp, aUp) => {
    const z = zoneAt([(aDn[0] + bDn[0]) / 2, (aDn[1] + bDn[1]) / 2]);
    const ok = (p) => zoneAt(p) === z && sample(grid, dSeam, p[0], p[1]) >= GAP / 2 + RES * 0.5;
    if (!ok(aDn) || !ok(bDn)) {
      // the course runs into the seam lengthwise: keep what lies in the zone
      return null;
    }
    const fix = (dn, up) => {
      if (ok(up)) return up;
      let lo = 0, hi = 1;
      for (let it = 0; it < 9; it++) { const t = (lo + hi) / 2; if (ok(lerp2(dn, up, t))) lo = t; else hi = t; }
      return lerp2(dn, up, lo);
    };
    return [aDn, bDn, fix(bDn, bUp), fix(aDn, aUp)];
  };

  const heights = [];
  {
    const sched = [0.74, 0.85, 0.95, 1.03, 1.09];
    let acc = 0, r = 0;
    while (acc < 26) {
      const h = r < sched.length ? sched[r] : 1.14;
      heights.push({ lo: acc, hi: acc + h });
      acc += h; r++;
    }
  }
  let maxBg = 0;
  for (let k = 0; k < N; k++) if (region[k] === bgRegion && dBg[k] > maxBg) maxBg = dBg[k];
  const rBg = rng.fork(53);
  for (let r = 0; r < heights.length; r++) {
    const { lo, hi } = heights[r];
    if (lo > maxBg) break;
    const level = (lo + hi) / 2;
    const h = (hi - lo) / 2 - GAP / 2;
    const lines = contours(grid, dBg, level);
    for (const line of lines) {
      layCourse(line, {
        field: dBg, halfUp: h, halfDown: h, len: (hi - lo) * rBg.float(1.08, 1.26), gap: GAP, rng: rBg,
        trim: true, clip: clipToZone,
        meta: (_, s, L) => ({
          tone: 'charcoal', group: 'background', region: bgRegion, phase: 'background',
          prog: Math.min(1, (level / Math.min(maxBg, 12)) * 0.82 + 0.18 * (s / L)),
        }),
      });
    }
  }

  // ------------------------------------------------------------ 5. fill holes

  const holeStats = fillHoles();

  function fillHoles() {
    const dOcc = edt(grid, (k) => occ[k] >= 0);
    // distance to the nearest change of region, so cut pieces keep a joint
    // from neighbouring areas that have no stones yet at that point
    const W = grid.w;
    const dReg = edt(grid, (k) => {
      const i = k % W, rg = region[k];
      return (i > 0 && region[k - 1] !== rg) || (i < W - 1 && region[k + 1] !== rg) ||
        (k >= W && region[k - W] !== rg) || (k + W < N && region[k + W] !== rg);
    });
    const seen = new Uint8Array(N);
    const rFill = rng.fork(71);
    let filled = 0;
    const queue = new Int32Array(N);
    for (let k0 = 0; k0 < N; k0++) {
      if (seen[k0] || !region[k0] || occ[k0] >= 0) continue;
      const reg = region[k0];
      const g = regions[reg].kind === 'background' ? GAP : GAP_FINE;
      if (dOcc[k0] < g || dReg[k0] < g / 2) continue;
      // flood fill the free component inside this region
      let qh = 0, qt = 0;
      queue[qt++] = k0; seen[k0] = 1;
      const cells = [];
      while (qh < qt) {
        const k = queue[qh++];
        cells.push(k);
        const i = k % grid.w, j = (k / grid.w) | 0;
        const nb = [i > 0 ? k - 1 : -1, i < grid.w - 1 ? k + 1 : -1, j > 0 ? k - grid.w : -1, j < grid.h - 1 ? k + grid.w : -1];
        for (const m of nb) {
          if (m < 0 || seen[m] || region[m] !== reg || occ[m] >= 0 || dOcc[m] < g || dReg[m] < g / 2) continue;
          seen[m] = 1; queue[qt++] = m;
        }
      }
      const area = cells.length * RES * RES;
      if (area < 0.05) continue;
      const kind = regions[reg].kind;
      const target = kind === 'background' ? 0.62 : kind === 'letter' ? 0.3 : 0.28;
      const pts = cells.map((k) => [grid.cx(k % grid.w), grid.cy((k / grid.w) | 0)]);
      const hull = convexHull(pts);
      const single = area < 1.5 * target && signedArea(hull) < area * 1.25;
      const groups = single ? [pts] : kmeans(pts, Math.max(2, Math.round(area / target)), rFill);
      const group = kind === 'background' ? 'background' : kind;
      const metaFor = (poly) => {
        const ref = tiles[nearestTile(centroid(poly), group)];
        return {
          tone: regions[reg].tone, region: reg, group: kind === 'background' ? 'background' : kind,
          phase: ref ? ref.phase : kind === 'letter' ? 'fill' : kind === 'plane' ? 'planes' : 'background',
          prog: ref ? Math.min(1, ref.prog + 0.01) : 1,
          filler: true,
        };
      };
      // Cut a piece to fit; if it will not sit flat in the hole, split it.
      const fit = (gp, separated, depth) => {
        if (gp.length * RES * RES < 0.045) return;
        let poly = convexHull(gp);
        if (poly.length < 3) return;
        poly = simplifyConvex(ccw(poly), 6, 0.05);
        if (separated) poly = insetConvex(poly, g / 2 - RES / 2) || poly;
        if (place(poly, metaFor(poly), 0.03, 0.08) >= 0) { filled++; return; }
        if (depth < 3 && gp.length > 12) for (const sub of kmeans(gp, 2, rFill)) fit(sub, true, depth + 1);
      };
      for (const gp of groups) fit(gp, groups.length > 1, 0);
    }
    return { filled };
  }

  // Nearest laid stone of the same group, so a cut piece goes down with the
  // stones around it rather than with a neighbouring subject.
  function nearestTile(c, group) {
    for (let r = 0; r < 60; r++) {
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * TAU;
        const k = grid.idx(c[0] + Math.cos(ang) * r * RES, c[1] + Math.sin(ang) * r * RES);
        if (k >= 0 && occ[k] >= 0 && tiles[occ[k]].group === group) return occ[k];
      }
    }
    return -1;
  }

  function kmeans(pts, k, r) {
    if (k <= 1) return [pts];
    const centres = [pts[r.int(pts.length)].slice()];
    const dmin = new Float64Array(pts.length).fill(Infinity);
    while (centres.length < k) {
      const c = centres[centres.length - 1];
      let best = 0;
      for (let i = 0; i < pts.length; i++) {
        dmin[i] = Math.min(dmin[i], (pts[i][0] - c[0]) ** 2 + (pts[i][1] - c[1]) ** 2);
        if (dmin[i] > dmin[best]) best = i;
      }
      centres.push(pts[best].slice());
    }
    const assign = new Int32Array(pts.length);
    for (let it = 0; it < 8; it++) {
      for (let i = 0; i < pts.length; i++) {
        let best = 0, bd = Infinity;
        for (let c = 0; c < k; c++) {
          const d = (pts[i][0] - centres[c][0]) ** 2 + (pts[i][1] - centres[c][1]) ** 2;
          if (d < bd) { bd = d; best = c; }
        }
        assign[i] = best;
      }
      const sum = centres.map(() => [0, 0, 0]);
      for (let i = 0; i < pts.length; i++) { const s = sum[assign[i]]; s[0] += pts[i][0]; s[1] += pts[i][1]; s[2]++; }
      for (let c = 0; c < k; c++) if (sum[c][2]) centres[c] = [sum[c][0] / sum[c][2], sum[c][1] / sum[c][2]];
    }
    const groups = centres.map(() => []);
    for (let i = 0; i < pts.length; i++) groups[assign[i]].push(pts[i]);
    return groups.filter((g) => g.length);
  }

  // ------------------------------------------------------------ 6. border

  const borderStats = layBorder(rng.fork(97));

  function layBorder(r) {
    // band rows from the outer edge inwards
    const bandTone = (u, v) => {
      if (v === 0) return 'charcoal';
      if (v === 1 || v === 7) return 'limestone';
      if (v === 8) return 'terracotta';
      const y = v - 2; // meander rows 0..4
      const x = ((u % 6) + 6) % 6;
      const line =
        (y === 4 && x <= 4) || (y === 3 && (x === 0 || x === 4)) || (y === 2 && (x === 0 || x >= 2) && x <= 4) ||
        (y === 1 && (x === 0 || x === 2)) || (y === 0 && x !== 1);
      return line ? 'charcoal' : 'limestone';
    };
    const perim = 2 * (PANEL.x1 - PANEL.x0 + PANEL.y1 - PANEL.y0);
    const cell = (cx, cy, tone, along, v) => {
      const s = (1 - GAP) / 2;
      const rot = r.jitter(0.03);
      const c = Math.cos(rot), sn = Math.sin(rot);
      const sx = s * (1 + r.jitter(0.025)), sy = s * (1 + r.jitter(0.025));
      const corners = [[-sx, -sy], [sx, -sy], [sx, sy], [-sx, sy]].map(([x, y]) => {
        const jx = x * (1 - r.float(0, 0.05)), jy = y * (1 - r.float(0, 0.05));
        return [cx + jx * c - jy * sn, cy + jx * sn + jy * c];
      });
      placeFree(corners, { tone, group: 'border', region: 0, phase: 'border', prog: Math.min(1, along / perim + v * 0.004) });
    };
    // perimeter position (clockwise from the top-left corner)
    const along = (x, y) => {
      const W = PANEL.x1 - PANEL.x0, H = PANEL.y1 - PANEL.y0;
      const dTop = PANEL.y1 - y, dRight = PANEL.x1 - x, dBottom = y - PANEL.y0, dLeft = x - PANEL.x0;
      const m = Math.min(dTop, dRight, dBottom, dLeft);
      if (m === dTop) return x - PANEL.x0;
      if (m === dRight) return W + (PANEL.y1 - y);
      if (m === dBottom) return W + H + (PANEL.x1 - x);
      return 2 * W + H + (y - PANEL.y0);
    };
    const sideLenX = FIELD.x1 - FIELD.x0, sideLenY = FIELD.y1 - FIELD.y0;
    let count = 0;
    for (let v = 0; v < BORDER; v++) {
      for (let u = 0; u < sideLenX; u++) {
        // top: left → right ; bottom: right → left (clockwise travel)
        let x = FIELD.x0 + u + 0.5, y = PANEL.y1 - v - 0.5;
        cell(x, y, bandTone(u, v), along(x, y), v); count++;
        x = FIELD.x1 - u - 0.5; y = PANEL.y0 + v + 0.5;
        cell(x, y, bandTone(u, v), along(x, y), v); count++;
      }
      for (let u = 0; u < sideLenY; u++) {
        // right: top → bottom ; left: bottom → top
        let x = PANEL.x1 - v - 0.5, y = FIELD.y1 - u - 0.5;
        cell(x, y, bandTone(u, v), along(x, y), v); count++;
        x = PANEL.x0 + v + 0.5; y = FIELD.y0 + u + 0.5;
        cell(x, y, bandTone(u, v), along(x, y), v); count++;
      }
    }
    // corner blocks: framed rosettes echoing the turquoise dots
    const corners = [
      [PANEL.x0, PANEL.y1, 1, -1], [PANEL.x1, PANEL.y1, -1, -1],
      [PANEL.x1, PANEL.y0, -1, 1], [PANEL.x0, PANEL.y0, 1, 1],
    ];
    for (const [ox, oy, sx, sy] of corners) {
      for (let a = 0; a < BORDER; a++) {
        for (let b = 0; b < BORDER; b++) {
          const m = Math.min(a, b), M = Math.max(a, b);
          let tone = null;
          if (m === 0) tone = 'charcoal';
          else if (m === 1) tone = 'limestone';
          else if (M === 8) tone = 'terracotta';
          else if (M === 7) tone = 'limestone';
          if (!tone) continue;
          const x = ox + sx * (a + 0.5), y = oy + sy * (b + 0.5);
          cell(x, y, tone, along(x, y), m); count++;
        }
      }
      // 5 × 5 medallion
      const c = [ox + sx * 4.5, oy + sy * 4.5];
      const pr = along(c[0], c[1]) / perim;
      const R = 2.45;
      rosette(c, [
        { r0: 0, r1: 0.6, tone: 'turquoise', sides: 6 },
        { r0: 0.6, r1: 1.45, n: 7, tone: 'terracotta' },
        { r0: 1.45, r1: R, n: 12, tone: 'charcoal' },
      ], GAP, r, (ring) => ({ tone: ring.tone, group: 'border', region: 0, phase: 'border', prog: Math.min(1, pr + 0.002) }), false);
      // spandrels between the medallion and the square
      for (let q = 0; q < 4; q++) {
        for (let k = 0; k < 3; k++) {
          const aA = (q * Math.PI) / 2 + (k * Math.PI) / 6, aB = aA + Math.PI / 6;
          const am = (aA + aB) / 2;
          const half = 2.5;
          const rayToSquare = (ang) => {
            const dx = Math.cos(ang), dy = Math.sin(ang);
            const t = half / Math.max(Math.abs(dx), Math.abs(dy));
            return [dx * t, dy * t];
          };
          const tanR = R;
          // tangent line at am, intersect with rays aA and aB
          const onTangent = (ang) => { const t = tanR / Math.cos(ang - am); return [Math.cos(ang) * t, Math.sin(ang) * t]; };
          const pts = [onTangent(aA + 0.01), onTangent(aB - 0.01)];
          const pB = rayToSquare(aB - 0.01), pA = rayToSquare(aA + 0.01);
          pts.push(pB);
          // include the square corner if the sector contains it
          for (const cAng of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
            if (cAng > aA && cAng < aB) pts.push([Math.sign(Math.cos(cAng)) * half, Math.sign(Math.sin(cAng)) * half]);
          }
          pts.push(pA);
          const poly = ccw(pts.map(([x, y]) => [c[0] + x, c[1] + y]));
          const ins = insetConvex(poly, GAP / 2);
          if (ins && signedArea(ins) > 0.03) {
            placeFree(ins, { tone: 'limestone', group: 'border', region: 0, phase: 'border', prog: Math.min(1, pr + 0.003) });
            count++;
          }
        }
      }
    }
    return { count };
  }

  // ------------------------------------------------------------ finish

  // The background is laid from the outside in, closing on the wordmark: each
  // stone's moment in the phase follows its distance from the lettering.
  {
    const dLogo = edt(grid, (k) => letterMask[k] || dotMask[k]);
    const rOrder = rng.fork(83);
    const bg = tiles.filter((t) => t.group === 'background');
    const dist = bg.map((t) => { const c = centroid(t.poly); return sample(grid, dLogo, c[0], c[1]); });
    const dMax = Math.max(...dist);
    bg.forEach((t, i) => { t.prog = Math.min(1, Math.max(0, 1 - dist[i] / dMax + rOrder.jitter(0.012))); });
  }

  // If the laying overshoots the target count, leave the smallest cut pieces
  // out (those slivers become mortar). The composition is unaffected.
  let omitted = 0;
  if (targetCount && tiles.length > targetCount) {
    const extra = tiles.length - targetCount;
    // only background pieces, so the lettering and planes stay complete
    const fillers = tiles.map((t, i) => [i, t.filler && t.group === 'background' ? Math.abs(signedArea(t.poly)) : Infinity]).filter((a) => a[1] < Infinity);
    fillers.sort((a, b) => a[1] - b[1]);
    const drop = new Set(fillers.slice(0, extra).map((a) => a[0]));
    omitted = drop.size;
    const kept = tiles.filter((_, i) => !drop.has(i));
    tiles.length = 0;
    tiles.push(...kept);
  }

  const counts = {};
  for (const t of tiles) counts[t.group] = (counts[t.group] || 0) + 1;
  return {
    tiles,
    stats: {
      total: tiles.length,
      counts,
      fillers: holeStats.filled - omitted,
      omittedSlivers: omitted,
      borderCells: borderStats.count,
      ms: Math.round(performance.now() - t0),
      letterPitch: pL,
    },
    planes,
    trails,
    wm,
    debug: { grid, occ, region, regions },
  };
}
