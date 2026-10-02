// Construction schedule. Each tile carries a phase and a progress value in
// [0, 1] from the layout; this maps them to start times (seconds at 1×).

import { Rng } from './rng.js';

export const PHASES = [
  { id: 'bed', label: 'Spreading the mortar bed', from: 0.0, to: 2.2 },
  { id: 'sinopia', label: 'Drawing the red-ochre guidelines', from: 1.0, to: 3.4 },
  { id: 'outline', label: 'Setting the wordmark contours', from: 3.0, to: 8.0 },
  { id: 'fill', label: 'Filling the letters', from: 7.8, to: 11.6 },
  { id: 'dots', label: 'Setting the turquoise dots', from: 11.6, to: 15.0 },
  { id: 'planes', label: 'Laying the paper planes', from: 15.0, to: 20.5 },
  { id: 'background', label: 'Flowing the background', from: 20.5, to: 29.5 },
  { id: 'border', label: 'Laying the border', from: 29.0, to: 34.0 },
];
// The red-ochre underdrawing fades as the final stones go down.
export const SINOPIA_FADE = { from: 30.0, to: 34.5 };
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
