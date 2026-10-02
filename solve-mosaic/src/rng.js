// Seeded randomness. Every random choice in the artwork flows from here so the
// same seed always lays the same mosaic.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) {
    this.next = mulberry32(seed);
  }
  float(a = 0, b = 1) {
    return a + (b - a) * this.next();
  }
  // Symmetric jitter in [-s, s].
  jitter(s) {
    return (this.next() * 2 - 1) * s;
  }
  // Roughly normal, mean 0, sd ~ s (sum of three uniforms).
  gauss(s) {
    return (this.next() + this.next() + this.next() - 1.5) * s * 2;
  }
  int(n) {
    return Math.floor(this.next() * n);
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  fork(salt) {
    return new Rng(Math.floor(this.next() * 4294967296) ^ salt);
  }
}

// Stateless hash in [0, 1) for per-position decisions that must not depend on
// the order in which tiles are generated.
export function hash2(x, y, seed = 0) {
  let h = Math.imul((x * 73856093) | 0, 0x27d4eb2d) ^ Math.imul((y * 19349663) | 0, 0x165667b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
