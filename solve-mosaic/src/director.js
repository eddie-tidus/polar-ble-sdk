// Cinematic camera, keyed to the construction clock so every move lands on the
// stones it is meant to show, at any speed and when paused.
//
// Each key is a camera pose at a moment of the build: what it looks at (panel
// coordinates), how far away it is ('fit' = the whole panel in frame), its
// angle down from vertical and its bearing round the panel. Poses are joined
// by a smooth cubic spline, so the camera never stops dead between keys.

import * as THREE from 'three';

const D = THREE.MathUtils.degToRad;

export function createDirector({ fitRadius, firstStone, dots, aspect }) {
  const [fx, fy] = firstStone;
  const keys = [
    // 0–4 s: down on the bed as the mortar sweeps through and the guidelines
    // are drawn, easing in on the first stones of the "s"
    { t: 0.0, at: [fx - 14, fy - 1.5], r: 11, polar: 77, az: -64 },
    { t: 2.2, at: [fx - 5, fy - 0.5], r: 9.5, polar: 74, az: -52 },
    { t: 3.9, at: [fx, fy], r: 7.5, polar: 70, az: -40 },
    // 4–9 s: pull back and rise as the contours are traced, to a three-quarter
    // view of the framed panel on its table
    { t: 6.3, at: [-16, 0], r: 30, polar: 61, az: -30 },
    { t: 8.7, at: [0, 0], r: 'fit', polar: 53, az: -23 },
    // 9–11.5 s: higher, orbiting gently while the letters fill
    { t: 10.0, at: [-3, 0.5], r: 'fit', polar: 36, az: -8 },
    // 11.5–15.5 s: in to the open "o" and right down to the dots as their
    // rings are laid
    { t: 12.3, at: dots, r: 26, polar: 47, az: 2 },
    { t: 13.9, at: dots, r: 7.8, polar: 53, az: 16 },
    { t: 15.3, at: dots, r: 7.0, polar: 51, az: 30 },
    // 15.5–29 s: back out over the planes, then a slow overhead orbit while the
    // background spreads
    { t: 18.2, at: [6, -1], r: 80, polar: 48, az: 24 },
    { t: 22.6, at: [0, 0], r: 'fit', polar: 37, az: 12 },
    { t: 27.6, at: [0, 0], r: 'fit', polar: 34, az: -8 },
    // 29–34 s: lower three-quarter as the border goes round, rising at the end
    { t: 31.0, at: [0, 0], r: 'fit', polar: 46, az: -22 },
    { t: 34.4, at: [0, 0], r: 'fit', polar: 24, az: -8 },
    // then a clean, straight-on view of the finished panel
    { t: 37.5, at: [0, 0.2], r: 'fit', polar: 2.5, az: 0 },
  ];

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

  return { poseAt, refit, endTime: keys[keys.length - 1].t };
}
