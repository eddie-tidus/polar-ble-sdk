// Composition: panel proportions, where the wordmark sits, the paper planes
// and their flight paths, and the stone palette.

import { logoLetters, dotRing, DOTS, LOGO_STROKE } from './logo.js';

// One border cell = 1 world unit. The meander period is 6 cells, so each side
// between corner blocks is 6n + 1 cells long and both ends close on a stem.
export const BORDER = 9; // cells across the frame band
export const FIELD = { x0: -42.5, x1: 42.5, y0: -21.5, y1: 21.5 }; // 85 × 43 cells
export const PANEL = { x0: FIELD.x0 - BORDER, x1: FIELD.x1 + BORDER, y0: FIELD.y0 - BORDER, y1: FIELD.y1 + BORDER };

// Wordmark placement: reference pixels → world units (y up).
export const LOGO_SCALE = 0.049;
export const LOGO_ORIGIN = [600.5, 210]; // reference pixel mapped to the field centre
export const toWorld = ([x, y]) => [(x - LOGO_ORIGIN[0]) * LOGO_SCALE, (LOGO_ORIGIN[1] - y) * LOGO_SCALE];

export function wordmark() {
  const letters = logoLetters().map((l) => ({ id: l.id, rings: l.rings.map((r) => r.map(toWorld)) }));
  const dots = DOTS.map((d) => ({ c: toWorld([d.cx, d.cy]), r: d.r * LOGO_SCALE, ring: dotRing(d).map(toWorld) }));
  return { letters, dots, stroke: LOGO_STROKE * LOGO_SCALE };
}

// Stone palette (sRGB). Each entry is a family of closely related stones.
export const STONE = {
  ivory: ['#e8e1d1', '#e3dbca', '#ece6d8', '#ddd5c3', '#e6ddcb'],
  charcoal: ['#1f1f1f', '#222120', '#242322', '#1d1e1f', '#252321', '#212223'],
  turquoise: ['#26a7ab', '#2299a0', '#2cb0b1', '#1f9297', '#29a3a2'],
  limestone: ['#c4b08c', '#bba783', '#cab896', '#b5a07c', '#c0ab86'],
  terracotta: ['#86503f', '#7c4a3a', '#8f5a48', '#744536', '#88533f'],
  greystone: ['#857c6e', '#7c7466', '#8d8477', '#767063'],
};
export const MORTAR = '#6e685f';

// Paper plane, local units: nose at (1, 0), tail near x = 0, length 1.
// Three folded facets: the upper wing, the narrow inside of the fold, and the
// lower wing seen beneath it.
const PLANE_SHAPE = {
  N: [1, 0],
  A: [0.0, 0.5], // upper wing tip
  B: [0.26, 0.05], // end of the centre fold
  D: [0.2, -0.13], // keel corner
  C: [0.05, -0.36], // lower wing tip
};

export const PLANES = [
  // hero: top right, climbing away; its trail arcs in over the wordmark
  {
    nose: [39.8, 16.6], heading: 19, length: 10.6,
    tones: { upper: 'limestone', fold: 'terracotta', lower: 'greystone' },
    trail: [[[-5.5, 12.6], [3.5, 17.4], [12.5, 8.6], [27.0, 12.9]]],
    trailTone: 'limestone',
  },
  // bottom left, diving away; balances the hero across the centre
  {
    nose: [-39.6, -16.8], heading: 199, length: 10.2,
    tones: { upper: 'limestone', fold: 'terracotta', lower: 'turquoise' },
    trail: [[[6.0, -13.0], [-3.5, -17.6], [-12.5, -8.8], [-27.3, -13.3]]],
    trailTone: 'limestone',
  },
  // top left, small, rising up the left side
  {
    nose: [-36.2, 16.0], heading: 118, length: 7.2,
    tones: { upper: 'limestone', fold: 'greystone', lower: 'terracotta' },
    trail: [[[-38.4, -7.0], [-33.2, -1.6], [-39.6, 4.4], [-33.4, 9.6]]],
    trailTone: 'greystone',
  },
  // bottom right, small, sinking down the right side
  {
    nose: [36.4, -15.8], heading: -62, length: 7.2,
    tones: { upper: 'limestone', fold: 'terracotta', lower: 'greystone' },
    trail: [[[38.5, 7.0], [33.3, 1.6], [39.7, -4.4], [33.6, -9.5]]],
    trailTone: 'greystone',
  },
];

export function planeGeometry(p) {
  const a = (p.heading * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  // local (x along nose direction, y to the left); scale: length along x, 0.62 × length across
  // planes heading leftwards are mirrored so the upper wing stays on top
  const flip = (p.flip ?? Math.cos(a) < 0) ? -1 : 1;
  const tf = ([x, y]) => {
    const lx = (x - 1) * p.length, ly = y * p.length * flip;
    return [p.nose[0] + lx * c - ly * s, p.nose[1] + lx * s + ly * c];
  };
  const P = Object.fromEntries(Object.entries(PLANE_SHAPE).map(([k, v]) => [k, tf(v)]));
  return {
    facets: [
      { name: 'upper', tri: [P.N, P.A, P.B], foldFrom: P.N, foldTo: P.B, tone: p.tones.upper },
      { name: 'fold', tri: [P.N, P.B, P.D], foldFrom: P.N, foldTo: P.B, tone: p.tones.fold },
      { name: 'lower', tri: [P.N, P.D, P.C], foldFrom: P.N, foldTo: P.D, tone: p.tones.lower },
    ],
    outline: [P.N, P.A, P.B, P.D, P.C],
    tail: tf([0.12, 0.0]),
    dir: [c, s],
  };
}
