// Cinematic camera, keyed to the construction clock so every move lands on the
// stones it is meant to show, at any speed and when paused.
//
// Each key is a camera pose at a moment of the build: what it looks at (panel
// coordinates), how far away it is ('fit' = the whole panel in frame), its
// angle down from vertical and its bearing round the panel. Poses are joined
// by a smooth cubic spline, so the camera never stops dead between keys.
//
// The story follows the build: chase each flight path as its dashed stones are
// laid and arrive with the plane, rise for the border, come down as the
// background closes in, track along the wordmark as it is set, and finish in
// close on the turquoise dots before a straight-on view of the whole panel.

import * as THREE from 'three';
import { centroid } from './geom.js';

const D = THREE.MathUtils.degToRad;
const lerp = (a, b, t) => a + (b - a) * t;

// Point and direction of travel at fraction f along an evenly sampled path.
function along(pts, f) {
  const n = pts.length, x = Math.min(1, Math.max(0, f)) * (n - 1);
  const i = Math.min(n - 2, Math.floor(x)), k = x - i;
  const p = [lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k)];
  const a = pts[Math.max(0, i - 6)], b = pts[Math.min(n - 1, i + 7)];
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  return { p, dir: [dx / l, dy / l] };
}
// Bearing (degrees) that puts the camera behind a direction of travel, swung
// a little to one side for a three-quarter chase.
const behind = ([dx, dy], swing = 22) => (Math.atan2(-dx, dy) * 180) / Math.PI + swing;

export function createDirector({ fitRadius, aspect, trails, planes, dots, letters, phases, flight }) {
  const ph = Object.fromEntries(phases.map((p) => [p.id, p]));
  const P = ph.planes;
  const T = (f) => P.from + f * (P.to - P.from);
  const keys = [];
  const key = (t, at, r, polar, az) => keys.push({ t, at, r, polar, az });

  // --- the flight paths --------------------------------------------------
  // swing: which side of the path the camera rides; turn: how far it orbits
  // round as the plane goes down
  const chase = (i, swing, turn) => {
    const tr = trails[i].pts, [ta, tb] = flight[i].trail;
    for (const f of [0.12, 0.42, 0.72, 0.97]) {
      // stones land a moment after their start, so frame just behind the head
      const lead = along(tr, Math.max(0, f - 0.035));
      // steer by the path's broad heading, not every wiggle of the curve
      const a = along(tr, f - 0.22).p, b = along(tr, f + 0.22).p;
      key(T(lerp(ta, tb, f)), lead.p, 14, 63, behind([b[0] - a[0], b[1] - a[1]], swing));
    }
    const body = centroid(planes[i].geo.outline);
    const last = keys[keys.length - 1];
    key(T((flight[i].body[0] + flight[i].body[1]) / 2), body, 17, 54, last.az + turn);
  };
  const a0 = along(trails[0].pts, 0);
  // down on the bed as the mortar sweeps through and the guidelines are drawn
  const aHead = along(trails[0].pts, 0.3).p;
  const aDir = [aHead[0] - a0.p[0], aHead[1] - a0.p[1]];
  key(0, [a0.p[0] - a0.dir[0] * 7, a0.p[1] - a0.dir[1] * 7], 11, 75, behind(aDir, 30));
  key(T(flight[0].trail[0]) - 0.15, a0.p, 10, 69, behind(aDir, 24));
  chase(0, 22, 26);
  // lift over the panel between the two hero flights
  const b0 = along(trails[1].pts, 0);
  const bodyA = centroid(planes[0].geo.outline);
  key(T(flight[0].body[1] + 0.03), [(bodyA[0] + b0.p[0]) / 2, (bodyA[1] + b0.p[1]) / 2], 40, 46, 8);
  const bHead = along(trails[1].pts, 0.3).p;
  key(T(flight[1].trail[0]) - 0.05, b0.p, 13, 66, behind([bHead[0] - b0.p[0], bHead[1] - b0.p[1]], -40));
  chase(1, -40, -22);
  // the two small side planes go down together: a wide, rising view
  key(T(flight[2].trail[0] + 0.03), [0, 0], 'fit', 46, 18);
  key(T(1.0), [0, 0], 'fit', 38, 8);

  // --- border and background -------------------------------------------
  key((ph.border.from + ph.border.to) / 2 + 0.2, [0, 0], 'fit', 30, -6);
  key(lerp(ph.background.from, ph.background.to, 0.45), [0, 0], 'fit', 36, -14);
  key(ph.background.to - 1.8, [-6, -0.5], 60, 48, -16);

  // --- the wordmark, letter by letter ------------------------------------
  const O = ph.outline;
  letters.forEach((l, i) => {
    const c = centroid(l.rings[0]);
    key(lerp(O.from, O.to, (i + 0.6) / letters.length), [c[0], -0.8], 32, 58, -18 + i * 3);
  });
  key(lerp(ph.fill.from, ph.fill.to, 0.55), [0, -0.5], 62, 44, -6);

  // --- the dots, last stones in, then the whole panel --------------------
  const Dt = ph.dots;
  key(Dt.from + 0.5, dots, 24, 48, 4);
  key(lerp(Dt.from, Dt.to, 0.55), dots, 7.8, 53, 16);
  key(Dt.to, dots, 7.0, 51, 30);
  key(Dt.to + 4.2, [0, 0.2], 'fit', 2.5, 0);

  // keep bearings continuous so the spline never spins the long way round
  for (let i = 1; i < keys.length; i++) {
    while (keys[i].az - keys[i - 1].az > 180) keys[i].az -= 360;
    while (keys[i].az - keys[i - 1].az < -180) keys[i].az += 360;
  }
  // the closing shot should be square to the panel, whichever way we wound up
  const end = keys[keys.length - 1];
  end.az = Math.round(end.az / 360) * 360;

  let vals = [];
  const refit = () => {
    // close-ups were framed for a landscape view; back off on narrow screens
    const narrow = Math.max(1, 1.45 / aspect());
    vals = keys.map((k) => {
      const target = new THREE.Vector3(k.at[0], 0.1, -k.at[1]);
      const pose = { target, polar: D(k.polar), azimuth: D(k.az) };
      const r = k.r === 'fit' ? fitRadius(pose, 0.95, 0.92) : k.r * narrow;
      return [target.x, target.z, Math.log(r), pose.polar, pose.azimuth];
    });
  };
  refit();

  // Cubic Hermite with Catmull–Rom tangents; flat at both ends.
  function poseAt(time) {
    const n = keys.length;
    const t = Math.min(keys[n - 1].t, Math.max(0, time));
    let i = 0;
    while (i < n - 2 && keys[i + 1].t < t) i++;
    const t0 = keys[i].t, t1 = keys[i + 1].t, h = t1 - t0;
    const s = (t - t0) / h;
    const tangent = (j) => {
      if (j === 0 || j === n - 1) return vals[j].map(() => 0);
      const dt = keys[j + 1].t - keys[j - 1].t;
      return vals[j].map((_, c) => (vals[j + 1][c] - vals[j - 1][c]) / dt);
    };
    const m0 = tangent(i), m1 = tangent(i + 1);
    const s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    const v = vals[i].map((a, c) => h00 * a + h10 * h * m0[c] + h01 * vals[i + 1][c] + h11 * h * m1[c]);
    return {
      target: new THREE.Vector3(v[0], 0.1, v[1]),
      radius: Math.exp(v[2]),
      polar: Math.min(D(80), Math.max(D(2), v[3])),
      azimuth: v[4],
    };
  }

  return { poseAt, refit, endTime: keys[keys.length - 1].t, keys };
}
