// Construction schedule. Each tile carries a phase and a progress value in
// [0, 1] from the layout; this maps them to start times (seconds at 1×).

import { Rng } from './rng.js';

export const PHASES = [
  { id: 'bed', label: 'Spreading the mortar bed', from: 0.0, to: 2.0 },
  { id: 'sinopia', label: 'Drawing the red-ochre guidelines', from: 0.6, to: 2.8 },
  { id: 'planes', label: 'Laying the flight paths and paper planes', from: 2.4, to: 18.6 },
  { id: 'border', label: 'Laying the border', from: 18.2, to: 21.4 },
  { id: 'background', label: 'Closing the background in', from: 21.0, to: 28.4 },
  { id: 'outline', label: 'Setting the wordmark contours', from: 28.0, to: 31.4 },
  { id: 'fill', label: 'Filling the letters', from: 31.2, to: 34.0 },
  { id: 'dots', label: 'Setting the turquoise dots', from: 33.8, to: 36.8 },
];
// The four flights go clockwise round the panel, one after another: red (top
// right), yellow (down the right side), blue (along the bottom), green (up the
// left side). Each trail is laid from its far end to its plane, then the
// plane itself. Values are fractions of the planes phase, indexed by plane.
const slot = (k) => ({ trail: [k * 0.25, k * 0.25 + 0.13], body: [k * 0.25 + 0.12, k * 0.25 + 0.18] });
export const FLIGHT_ORDER = [0, 3, 1, 2];
export const FLIGHT = [slot(0), slot(2), slot(3), slot(1)];
// The red-ochre underdrawing fades once the planes and border are down.
export const SINOPIA_FADE = { from: 21.5, to: 24.5 };
const BY_ID = Object.fromEntries(PHASES.map((p) => [p.id, p]));

export function assignTimeline(tiles, seed) {
  const r = new Rng(seed ^ 0x7a11);
  let end = 0;
  for (const t of tiles) {
    const ph = BY_ID[t.phase] || BY_ID.background;
    const span = ph.to - ph.from;
    t.start = ph.from + Math.min(1, Math.max(0, t.prog)) * span + r.float(0, 0.12);
    t.duration = r.float(0.58, 0.78);
    t.drop = t.group === 'letter' || t.group === 'dot' ? r.float(1.4, 1.9) : r.float(1.0, 1.45);
    end = Math.max(end, t.start + t.duration);
  }
  return end;
}

export function phaseAt(time, end) {
  if (time >= end) return 'Complete';
  let label = PHASES[0].label;
  for (const p of PHASES) if (time >= p.from) label = p.label;
  return label;
}
