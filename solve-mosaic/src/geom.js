// Small 2D geometry toolkit used by the layout. Polygons are arrays of [x, y].

export function signedArea(p) {
  let a = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const q = p[i], r = p[(i + 1) % n];
    a += q[0] * r[1] - r[0] * q[1];
  }
  return a / 2;
}

export function centroid(p) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const q = p[i], r = p[(i + 1) % n];
    const c = q[0] * r[1] - r[0] * q[1];
    a += c; cx += (q[0] + r[0]) * c; cy += (q[1] + r[1]) * c;
  }
  if (Math.abs(a) < 1e-12) {
    let sx = 0, sy = 0;
    for (const q of p) { sx += q[0]; sy += q[1]; }
    return [sx / p.length, sy / p.length];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function ccw(p) {
  return signedArea(p) < 0 ? p.slice().reverse() : p;
}

export function isConvex(p) {
  const n = p.length;
  if (n < 3) return false;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n], c = p[(i + 2) % n];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cr) < 1e-9) continue;
    const s = Math.sign(cr);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return sign !== 0;
}

// Keep the part of a convex polygon where nx*x + ny*y <= c.
export function clipHalfPlane(p, nx, ny, c) {
  const out = [];
  for (let i = 0, n = p.length; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    const da = nx * a[0] + ny * a[1] - c, db = nx * b[0] + ny * b[1] - c;
    if (da <= 0) out.push(a);
    if ((da <= 0) !== (db <= 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

// Intersection of polygon p with convex polygon clip (both CCW).
export function clipConvex(p, clip) {
  let out = p;
  for (let i = 0, n = clip.length; i < n && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % n];
    // inside is to the left of a→b
    const nx = b[1] - a[1], ny = -(b[0] - a[0]);
    out = clipHalfPlane(out, nx, ny, nx * a[0] + ny * a[1]);
  }
  return out;
}

// Inward offset of a convex CCW polygon. Returns null if it collapses.
export function insetConvex(p, d) {
  const n = p.length;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const L = Math.hypot(tx, ty);
    if (L < 1e-9) continue;
    tx /= L; ty /= L;
    const nx = -ty, ny = tx; // inward normal for CCW
    lines.push({ px: a[0] + nx * d, py: a[1] + ny * d, tx, ty });
  }
  const m = lines.length;
  if (m < 3) return null;
  const out = [];
  for (let i = 0; i < m; i++) {
    const l1 = lines[(i + m - 1) % m], l2 = lines[i];
    const den = l1.tx * l2.ty - l1.ty * l2.tx;
    if (Math.abs(den) < 1e-9) { out.push([l2.px, l2.py]); continue; }
    const t = ((l2.px - l1.px) * l2.ty - (l2.py - l1.py) * l2.tx) / den;
    out.push([l1.px + l1.tx * t, l1.py + l1.ty * t]);
  }
  if (signedArea(out) <= 1e-6 || !isConvex(out)) return null;
  // reject if any edge flipped direction
  for (let i = 0; i < m; i++) {
    const a = out[i], b = out[(i + 1) % m];
    const l = lines[i];
    if ((b[0] - a[0]) * l.tx + (b[1] - a[1]) * l.ty < -1e-6) return null;
  }
  return out;
}

export function convexHull(points) {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

// Reduce a convex polygon to at most maxV vertices, dropping the vertices whose
// removal loses the least area (the result stays inside the original).
export function simplifyConvex(p, maxV, minEdge = 0) {
  let q = p.slice();
  const triArea = (a, b, c) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
  for (;;) {
    const n = q.length;
    if (n <= 3) break;
    let best = -1, bestA = Infinity;
    for (let i = 0; i < n; i++) {
      const a = triArea(q[(i + n - 1) % n], q[i], q[(i + 1) % n]);
      if (a < bestA) { bestA = a; best = i; }
    }
    let shortEdge = false;
    if (minEdge > 0) {
      for (let i = 0; i < n; i++) {
        const a = q[i], b = q[(i + 1) % n];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < minEdge) { shortEdge = true; break; }
      }
    }
    if (n > maxV || bestA < 1e-4 || shortEdge) q.splice(best, 1);
    else break;
  }
  return q;
}

export function pointInPolygon(x, y, rings) {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i], b = r[j];
      if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
  }
  return inside;
}

// Cubic Bézier sampled into an arc-length parametrised polyline.
export function sampleBezierChain(segments, step = 0.05) {
  const raw = [];
  for (let s = 0; s < segments.length; s++) {
    const [p0, p1, p2, p3] = segments[s];
    const n = 200;
    for (let i = s === 0 ? 0 : 1; i <= n; i++) {
      const t = i / n, mt = 1 - t;
      raw.push([
        mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0],
        mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
  }
  return resample(raw, step, false);
}

// Resample a polyline at constant arc-length spacing.
export function resample(pts, step, closed) {
  const src = closed ? pts.concat([pts[0]]) : pts;
  const cum = [0];
  for (let i = 1; i < src.length; i++) cum.push(cum[i - 1] + Math.hypot(src[i][0] - src[i - 1][0], src[i][1] - src[i - 1][1]));
  const total = cum[cum.length - 1];
  const n = Math.max(2, Math.round(total / step));
  const out = [];
  let j = 0;
  const count = closed ? n : n + 1;
  for (let i = 0; i < count; i++) {
    const s = (i / n) * total;
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    const t = Math.min(1, Math.max(0, (s - cum[j]) / seg));
    out.push([src[j][0] + (src[j + 1][0] - src[j][0]) * t, src[j][1] + (src[j + 1][1] - src[j][1]) * t]);
  }
  return { pts: out, length: total, closed };
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}
