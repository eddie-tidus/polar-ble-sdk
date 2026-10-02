// Construction schedule. Each tile carries a phase and a progress value in
// [0, 1] from the layout; this maps them to start times (seconds at 1×).

import { Rng } from './rng.js';

export const PHASES = [
  { id: 'bed', label: 'Spreading the mortar bed', from: 0.0, to: 2.4 },
  { id: 'outline', label: 'Setting the wordmark contours', from: 2.6, to: 7.6 },
  { id: 'fill', label: 'Filling the letters', from: 7.4, to: 11.8 },
  { id: 'dots', label: 'Setting the turquoise dots', from: 11.6, to: 12.9 },
  { id: 'planes', label: 'Laying the paper planes', from: 12.9, to: 19.0 },
  { id: 'background', label: 'Flowing the background', from: 19.0, to: 28.6 },
  { id: 'border', label: 'Laying the border', from: 28.2, to: 33.2 },
];
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
