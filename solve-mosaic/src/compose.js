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
  // the Solve paper-plane colours, as coloured marbles and glass
  red: ['#cc4a3e', '#c6463b', '#d14f42', '#c4473c'],
  redDark: ['#7e2621', '#78241f', '#842823', '#72221d'],
  yellow: ['#e0b443', '#dbae3f', '#e5ba4a', '#d8ab3d'],
  yellowDark: ['#9c731f', '#966f1d', '#a27822', '#8f6a1b'],
  blue: ['#46a2cf', '#429dca', '#4ba8d4', '#3f99c6'],
  blueDark: ['#22628a', '#205e85', '#246690', '#1e5980'],
  green: ['#78a947', '#74a444', '#7caf4b', '#70a042'],
  greenDark: ['#426a26', '#3f6524', '#467029', '#3b6022'],
};
// How each stone family behaves under light: 0 dark stone, 1 marble,
// 2 glass (smalti), 3 fired clay.
export const STONE_KIND = {
  ivory: 1, charcoal: 0, turquoise: 2, limestone: 1, terracotta: 3, greystone: 0,
  red: 1, redDark: 1, yellow: 1, yellowDark: 1, blue: 2, blueDark: 2, green: 2, greenDark: 2,
};
export const MORTAR = '#8d877c';

// Paper plane as in the Solve motif: an origami dart seen from above, nose at
// (1, 0), length 1. A light wing and a dark wing meet along the centre fold;
// a small keel shows in the notch at the back.
const PLANE_SHAPE = {
  N: [1, 0],
  WL: [0.0, 0.29], // left wing tip
  WR: [0.0, -0.29], // right wing tip
  C: [0.15, 0], // rear notch where the wings meet
  K0: [0.135, 0], // keel, sitting in the notch
  K1: [0.03, 0.045],
  K2: [-0.05, 0],
  K3: [0.03, -0.045],
};

export const PLANES = [
  // red hero: top right, climbing away; its trail arcs in over the wordmark
  {
    nose: [39.8, 16.6], heading: 19, length: 11.2, colour: 'red',
    camera: { from: -66, to: -58, turn: 18 }, // bearings for the chase (degrees)
    trail: [[[-5.5, 12.6], [3.5, 17.4], [12.5, 8.6], [28.0, 12.5]]],
  },
  // blue: bottom left, diving away; balances the hero across the centre
  {
    nose: [-39.6, -16.8], heading: 199, length: 10.8, colour: 'blue',
    camera: { from: -10, to: 6, turn: 14 },
    trail: [[[6.0, -13.0], [-3.5, -17.6], [-12.5, -8.8], [-28.2, -12.9]]],
  },
  // green: top left, rising up the left side
  {
    nose: [-36.2, 16.0], heading: 100, length: 8.4, colour: 'green',
    camera: { from: 20, to: 8, turn: -14 },
    trail: [[[-38.4, -7.0], [-33.4, -2.6], [-33.9, 2.6], [-34.5, 6.5]]],
  },
  // yellow: bottom right, sinking down the right side
  {
    nose: [36.4, -15.8], heading: -80, length: 8.4, colour: 'yellow',
    camera: { from: -72, to: -62, turn: 14 },
    trail: [[[38.5, 7.0], [33.4, 2.6], [34.1, -2.4], [34.7, -6.4]]],
  },
];

export function planeGeometry(p) {
  const a = (p.heading * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  // planes heading leftwards are mirrored so the light wing stays on top
  const flip = (p.flip ?? Math.cos(a) < 0) ? -1 : 1;
  const tf = ([x, y]) => {
    const lx = (x - 1) * p.length, ly = y * p.length * flip;
    return [p.nose[0] + lx * c - ly * s, p.nose[1] + lx * s + ly * c];
  };
  const P = Object.fromEntries(Object.entries(PLANE_SHAPE).map(([k, v]) => [k, tf(v)]));
  return {
    facets: [
      { name: 'light', tri: [P.N, P.WL, P.C], foldFrom: P.N, foldTo: P.C, tone: p.colour },
      { name: 'dark', tri: [P.N, P.C, P.WR], foldFrom: P.N, foldTo: P.C, tone: p.colour + 'Dark' },
      { name: 'keel', tri: [P.K0, P.K1, P.K2, P.K3], foldFrom: P.K0, foldTo: P.K2, tone: p.colour + 'Dark' },
    ],
    outline: [P.N, P.WL, P.C, P.K1, P.K2, P.K3, P.C, P.WR],
    tail: P.K2,
    dir: [c, s],
  };
}
