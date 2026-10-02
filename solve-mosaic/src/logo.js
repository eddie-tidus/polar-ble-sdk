// The Solve wordmark, reconstructed as code-defined contours.
//
// Coordinates are in the pixel space of the supplied reference artwork
// (1200 × 392, y pointing down). Shapes were measured from the reference and
// rebuilt from geometric primitives: ellipses for the "o", circles for the "e"
// and the dots, straight edges for the "l" and "v", and a fitted cubic Bézier
// outline for the "s". No image data is used at runtime.

export const LOGO_BOUNDS = { x0: 9, y0: 18, x1: 1192, y1: 374 };
export const LOGO_STROKE = 76; // typical stem width in reference pixels

const DEG = Math.PI / 180;

// ---------------------------------------------------------------- helpers

function ellipsePoint(cx, cy, rx, ry, t) {
  return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];
}

// Arc from angle a0 to a1 (radians, y-down so positive = clockwise on screen).
function arc(out, cx, cy, rx, ry, a0, a1, step = 2.5) {
  const len = Math.abs(a1 - a0) * Math.max(rx, ry);
  const n = Math.max(2, Math.ceil(len / step));
  for (let i = 0; i <= n; i++) out.push(ellipsePoint(cx, cy, rx, ry, a0 + (a1 - a0) * (i / n)));
}

// Distance along a ray (origin inside the ellipse) to the ellipse boundary.
function rayEllipse(ox, oy, dx, dy, cx, cy, rx, ry) {
  const px = (ox - cx) / rx, py = (oy - cy) / ry;
  const qx = dx / rx, qy = dy / ry;
  const a = qx * qx + qy * qy, b = 2 * (px * qx + py * qy), c = px * px + py * py - 1;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

function angleOn(cx, cy, rx, ry, x, y) {
  return Math.atan2((y - cy) / ry, (x - cx) / rx);
}

// Flatten an SVG-like command list (M, L, C, Z) into a polygon ring.
function flattenPath(cmds, step = 2.0) {
  const ring = [];
  let cx = 0, cy = 0;
  for (const c of cmds) {
    const op = c[0];
    if (op === 'M' || op === 'L') {
      cx = c[1]; cy = c[2];
      ring.push([cx, cy]);
    } else if (op === 'C') {
      const [, x1, y1, x2, y2, x3, y3] = c;
      const est = Math.hypot(x1 - cx, y1 - cy) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
      const n = Math.max(4, Math.ceil(est / step));
      for (let i = 1; i <= n; i++) {
        const t = i / n, mt = 1 - t;
        ring.push([
          mt * mt * mt * cx + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3,
          mt * mt * mt * cy + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3,
        ]);
      }
      cx = x3; cy = y3;
    }
  }
  return ring;
}

// ---------------------------------------------------------------- letters

// "s": one closed outline, two flat terminal cuts joined by fitted cubics.
const S_PATH = [
  ['M', 85.9, 288.2], ['L', 9.2, 288.2],
  ['C', 12.4, 342.0, 57.7, 369.5, 107.6, 373.8],
  ['C', 163.7, 378.7, 228.5, 339.9, 220.3, 278.0],
  ['C', 218.3, 262.8, 215.7, 251.2, 204.6, 239.5],
  ['C', 173.7, 206.7, 126.9, 209.2, 100.1, 192.3],
  ['C', 94.9, 189.0, 90.6, 184.5, 90.1, 178.2],
  ['C', 88.1, 155.2, 131.4, 147.2, 136.7, 177.6],
  ['L', 212.5, 177.6],
  ['C', 205.3, 61.6, 12.2, 76.4, 12.2, 178.9],
  ['C', 12.2, 260.8, 133.8, 250.3, 142.2, 285.1],
  ['C', 143.5, 290.6, 143.5, 296.2, 139.9, 301.0],
  ['C', 135.0, 307.3, 126.8, 310.9, 118.9, 311.6],
  ['C', 100.0, 313.2, 90.9, 305.0, 85.9, 288.2],
];

function letterS() {
  return [flattenPath(S_PATH)];
}

// "o": elliptical ring with a V-shaped opening at the top. The opening's two
// cut lines meet at an apex just below the ring centre; the two dots sit in it.
export const O_GEOM = {
  cx: 387.5, cy: 234.4,
  outer: { rx: 140.8, ry: 139.5 },
  inner: { rx: 62.3, ry: 66.0 },
  apexY: 248.7,
  halfAngle: 36.6 * DEG,
};

function letterO() {
  const { cx, cy, outer, inner, apexY, halfAngle } = O_GEOM;
  const ax = cx, ay = apexY;
  const dirs = [[-Math.sin(halfAngle), -Math.cos(halfAngle)], [Math.sin(halfAngle), -Math.cos(halfAngle)]];
  const hit = (d, e) => {
    const s = rayEllipse(ax, ay, d[0], d[1], cx, cy, e.rx, e.ry);
    return [ax + d[0] * s, ay + d[1] * s];
  };
  const oL = hit(dirs[0], outer), oR = hit(dirs[1], outer);
  const iL = hit(dirs[0], inner), iR = hit(dirs[1], inner);
  const toR = angleOn(cx, cy, outer.rx, outer.ry, ...oR);
  let toL = angleOn(cx, cy, outer.rx, outer.ry, ...oL);
  if (toL < toR) toL += 2 * Math.PI;
  const tiR = angleOn(cx, cy, inner.rx, inner.ry, ...iR);
  let tiL = angleOn(cx, cy, inner.rx, inner.ry, ...iL);
  if (tiL < tiR) tiL += 2 * Math.PI;
  const ring = [];
  arc(ring, cx, cy, outer.rx, outer.ry, toR, toL); // right cut → round the bottom → left cut
  arc(ring, cx, cy, inner.rx, inner.ry, tiL, tiR); // back along the counter
  return [ring];
}

// "l": a plain stem.
function letterL() {
  return [[[558, 18], [636, 18], [636, 365], [558, 365]]];
}

// "v": straight-sided with a flat foot; the inner notch is slightly shallower
// than the outer strokes, as in the reference.
function letterV() {
  return [[
    [662.8, 104.9], [743.1, 104.9], [793.1, 269.0], [843.1, 104.9],
    [923.6, 104.9], [829.9, 364.9], [755.5, 364.9],
  ]];
}

// "e": circular bowl, a horizontal bar, an upper counter that is a circular
// segment and a lower counter that opens into the horizontal aperture cut.
export const E_GEOM = {
  cx: 1054.65, cy: 234.6, r: 137.7,
  upper: { cx: 1054.6, cy: 224.5, r: 63.1 },
  lower: { cx: 1054.55, cy: 244.6, r: 63.35 },
  barTop: 205.9, barBottom: 259.1, apertureY: 283.0,
};

function letterE() {
  const { cx, cy, r, upper, lower, barTop, barBottom, apertureY } = E_GEOM;
  const outerAt = (y) => Math.asin((y - cy) / r); // right-hand side angle at height y
  const ring = [];
  // From the bar's lower edge on the right, up over the top, round the left and
  // bottom, and back up the right side to the aperture cut.
  arc(ring, cx, cy, r, r, outerAt(barBottom), outerAt(apertureY) - 2 * Math.PI);
  // Aperture cut runs inwards to the lower counter, which is followed round to
  // the bar's underside; the closing edge is the underside of the bar.
  const lcRight = Math.asin((apertureY - lower.cy) / lower.r);
  const lcLeft = Math.PI - Math.asin((barBottom - lower.cy) / lower.r);
  arc(ring, lower.cx, lower.cy, lower.r, lower.r, lcRight, lcLeft);
  const counter = [];
  const ucA = Math.asin((barTop - upper.cy) / upper.r); // right end (angle in (-π/2, 0))
  arc(counter, upper.cx, upper.cy, upper.r, upper.r, ucA, -Math.PI - ucA, 2.0);
  return [ring, counter];
}

// Turquoise dots.
export const DOTS = [
  { cx: 348.85, cy: 139.77, r: 25 },
  { cx: 425.22, cy: 139.77, r: 25 },
];

export function logoLetters() {
  return [
    { id: 's', rings: letterS() },
    { id: 'o', rings: letterO() },
    { id: 'l', rings: letterL() },
    { id: 'v', rings: letterV() },
    { id: 'e', rings: letterE() },
  ];
}

export function dotRing(d, step = 1.5) {
  const ring = [];
  arc(ring, d.cx, d.cy, d.r, d.r, 0, 2 * Math.PI, step);
  ring.pop();
  return ring;
}
