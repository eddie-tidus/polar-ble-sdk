// Construction schedule. Each tile carries a phase and a progress value in
// [0, 1] from the layout; this maps them to start times (seconds at 1×).

import { Rng } from './rng.js';

export const PHASES = [
  { id: 'bed', label: 'Spreading the mortar bed', from: 0.0, to: 2.0 },
  { id: 'sinopia', label: 'Drawing the red-ochre guidelines', from: 0.6, to: 2.8 },
  { id: 'planes', label: 'Laying the flight paths and paper planes', from: 2.4, to: 14.4 },
  { id: 'border', label: 'Laying the border', from: 14.0, to: 17.4 },
  { id: 'background', label: 'Closing the background in on the wordmark', from: 17.0, to: 25.0 },
  { id: 'outline', label: 'Setting the wordmark contours', from: 24.6, to: 28.2 },
  { id: 'fill', label: 'Filling the letters', from: 28.0, to: 31.0 },
  { id: 'dots', label: 'Setting the turquoise dots', from: 30.8, to: 33.8 },
];
// Within the planes phase (fractions of it): each trail is laid from its far
// end to its plane, then the plane itself. The two hero planes fly in turn;
// the two small side planes go down together.
export const FLIGHT = [
  { trail: [0.0, 0.22], body: [0.2, 0.32] },
  { trail: [0.45, 0.65], body: [0.63, 0.74] },
  { trail: [0.8, 0.95], body: [0.93, 1.0] },
  { trail: [0.8, 0.95], body: [0.93, 1.0] },
];
// The red-ochre underdrawing fades as the last stones go down.
export const SINOPIA_FADE = { from: 30.5, to: 34.5 };
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
