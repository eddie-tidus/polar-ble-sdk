// Turns the laid-out tiles into real 3D stones: one instanced draw call where
// every instance is a bevelled prism with its own outline (3–6 corners),
// height, tilt, colour and settling animation.

import * as THREE from 'three';
import { insetConvex, centroid, signedArea } from './geom.js';
import { Rng } from './rng.js';
import { STONE, STONE_KIND } from './compose.js';

const MAXC = 6;

// ------------------------------------------------------------------ template prism

function prismTemplate() {
  const info = [], index = [];
  let v = 0;
  const vert = (c, l, f, e) => { info.push(c, l, f, e); return v++; };
  // top face (fan)
  const top = [];
  for (let c = 0; c < MAXC; c++) top.push(vert(c, 2, 0, 0));
  for (let c = 1; c < MAXC - 1; c++) index.push(top[0], top[c], top[c + 1]);
  // bevel and side walls per edge
  for (let e = 0; e < MAXC; e++) {
    const e1 = (e + 1) % MAXC;
    const b0 = vert(e, 1, 1, e), b1 = vert(e1, 1, 1, e), b2 = vert(e1, 2, 1, e), b3 = vert(e, 2, 1, e);
    index.push(b0, b1, b2, b0, b2, b3);
    const s0 = vert(e, 0, 2, e), s1 = vert(e1, 0, 2, e), s2 = vert(e1, 1, 2, e), s3 = vert(e, 1, 2, e);
    index.push(s0, s1, s2, s0, s2, s3);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(v * 3), 3));
  // corner index, layer (0 base, 1 shoulder, 2 top), face (0 top, 1 bevel, 2 side), edge
  g.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 4));
  g.setIndex(index);
  return g;
}

// ------------------------------------------------------------------ shaders

const VERT_PARS = /* glsl */ `
attribute vec4 aInfo;
attribute vec4 iB01; attribute vec4 iB23; attribute vec4 iB45;
attribute vec4 iT01; attribute vec4 iT23; attribute vec4 iT45;
attribute vec4 iShape;   // exposed height, bevel height, tilt x, tilt y
attribute vec4 iAnim;    // start, duration, drop, seed
attribute vec4 iColor;   // linear rgb, roughness
attribute vec4 iCenter;  // centroid xy, settling twist, depth below the bed
uniform float uTime;
varying vec3 vTileColor;
varying float vRough;
varying float vSeed;
varying float vShade;
varying vec3 vStone;

vec2 cornerB(int i) {
  if (i == 0) return iB01.xy; if (i == 1) return iB01.zw;
  if (i == 2) return iB23.xy; if (i == 3) return iB23.zw;
  if (i == 4) return iB45.xy; return iB45.zw;
}
vec2 cornerT(int i) {
  if (i == 0) return iT01.xy; if (i == 1) return iT01.zw;
  if (i == 2) return iT23.xy; if (i == 3) return iT23.zw;
  if (i == 4) return iT45.xy; return iT45.zw;
}

vec3 gTilePos;
vec3 gTileNormal;

void computeTile() {
  int ci = int(aInfo.x + 0.5);
  int layer = int(aInfo.y + 0.5);
  int face = int(aInfo.z + 0.5);
  int e = int(aInfo.w + 0.5);
  int e1 = e == 5 ? 0 : e + 1;
  float h = iShape.x, bh = iShape.y;
  vec2 c = iCenter.xy;
  vec2 xy = layer == 2 ? cornerT(ci) : cornerB(ci);
  float z = layer == 0 ? -iCenter.w : (layer == 1 ? h - bh : h);
  if (layer > 0) z += dot(iShape.zw, xy - c);

  vec3 n = vec3(0.0, 0.0, 1.0);
  if (face == 0) {
    n = normalize(vec3(-iShape.z, -iShape.w, 1.0));
  } else if (face == 2) {
    vec2 d = cornerB(e1) - cornerB(e);
    n = dot(d, d) > 1e-10 ? normalize(vec3(d.y, -d.x, 0.0)) : vec3(0.0, 0.0, 1.0);
  } else {
    vec3 p0 = vec3(cornerT(e), h), p1 = vec3(cornerT(e1), h), p2 = vec3(cornerB(e), h - bh);
    vec3 cr = cross(p1 - p0, p2 - p0);
    if (dot(cr, cr) < 1e-12) {
      vec2 d = cornerB(e1) - cornerB(e);
      cr = dot(d, d) > 1e-10 ? vec3(d.y, -d.x, 0.0) * 0.7 + vec3(0.0, 0.0, length(d) * 0.7) : vec3(0.0, 0.0, 1.0);
    }
    n = normalize(cr);
    if (n.z < 0.0) n = -n;
  }

  // stone texture coordinates stay attached to the stone while it moves
  vStone = vec3(xy, z) * 3.1 + iAnim.w * 57.0;
  vShade = layer == 0 ? 0.45 : (layer == 1 ? 0.88 : 1.0);
  if (face == 0) vShade = 1.0;

  // laying: the stone drops a short way, lands, rebounds very slightly and is
  // pressed into the bed; the twist and tilt it was released with relax away
  float t = (uTime - iAnim.x) / iAnim.y;
  if (t <= 0.0) {
    xy = c; z = -2.0; // hidden beneath the bed until it is laid
  } else if (t < 1.0) {
    const float TF = 0.5, TH = 0.24;
    float u = clamp(t / TF, 0.0, 1.0);
    float fall = iAnim.z * (1.0 - u * u);                       // released from rest
    float v = clamp((t - TF) / TH, 0.0, 1.0);
    float hop = min(0.07, 0.04 * iAnim.z) * 4.0 * v * (1.0 - v) * step(TF, t);
    float w = clamp((t - TF - TH) / (1.0 - TF - TH), 0.0, 1.0);
    float press = 0.012 * sin(3.14159 * w) * step(TF + TH, t);
    float release = 1.0 - smoothstep(0.0, TF, t);
    float twist = iCenter.z * release;
    float cs = cos(twist), sn = sin(twist);
    vec2 r = xy - c;
    float grow = mix(0.9, 1.0, smoothstep(0.0, 0.2, t));
    r = mat2(cs, sn, -sn, cs) * r * grow;
    xy = c + r;
    vec2 tiltDir = vec2(cos(iAnim.w * 40.0), sin(iAnim.w * 40.0));
    float rock = 0.12 * release + 0.05 * sin(3.14159 * v) * (1.0 - v);
    z += fall + hop - press + dot(tiltDir, r) * rock;
    n.xy = mat2(cs, sn, -sn, cs) * n.xy;
  }

  gTilePos = vec3(xy.x, z, -xy.y);
  gTileNormal = vec3(n.x, n.z, -n.y);
  vTileColor = iColor.rgb;
  vRough = iColor.a;
  vSeed = iAnim.w;
}
`;

const NOISE = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), u.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), u.x), u.y),
    mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), u.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), u.x), u.y),
    u.z);
}
// Bump from a scalar height without tangents (Mikkelsen's surface gradient).
vec3 bumpNormal(vec3 n, vec3 viewPos, float hgt, float strength) {
  vec3 dpdx = dFdx(viewPos), dpdy = dFdy(viewPos);
  float dhdx = dFdx(hgt) * strength, dhdy = dFdy(hgt) * strength;
  vec3 r1 = cross(dpdy, n), r2 = cross(n, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
  return normalize(abs(det) * n - grad);
}
`;

const FRAG_PARS = /* glsl */ `
varying vec3 vTileColor;
varying float vRough;
varying float vSeed;
varying float vShade;
varying vec3 vStone;
${NOISE}
`;

function tileMaterial(uniforms) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.0, envMapIntensity: 0.32 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <beginnormal_vertex>', 'computeTile();\nvec3 objectNormal = gTileNormal;')
      .replace('#include <begin_vertex>', 'vec3 transformed = gTilePos;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        // vRough carries the stone kind in its integer part:
        // 0 dark stone, 1 marble, 2 glass (smalti), 3 fired clay
        float kind = floor(vRough * 0.5);
        float rough0 = vRough - kind * 2.0;
        vec3 q = vStone;
        // three shared noise octaves feed every effect below
        float pillow = vnoise(q * 0.75);          // the uneven cut face, mottling
        float grain = vnoise(q * 3.6);
        float fine = vnoise(q * 12.0);
        vec3 stone = vTileColor * (0.9 + 0.12 * pillow + 0.06 * (grain - 0.5));
        float hgt = pillow * 0.55 + grain * 0.22 + fine * 0.07;
        float glint = 0.0;
        if (kind < 0.5) {
          // dark stone: fine speckle and faint crystalline glints
          stone *= 1.0 - 0.2 * smoothstep(0.86, 0.93, fine);
          glint = smoothstep(0.95, 0.985, vnoise(q * 26.0 + 5.0));
          stone += glint * 0.03;
        } else if (kind < 1.5) {
          // marble: soft, wandering veins
          float vein = abs(sin(dot(q.xy, vec2(0.9, 0.45)) * 2.1 + vnoise(q * 0.9 + 3.0) * 5.0 + grain * 1.2));
          float v = 1.0 - smoothstep(0.0, 0.12, vein);
          stone = mix(stone, stone * 0.7, v * 0.55);
          hgt -= v * 0.05;
        } else if (kind < 2.5) {
          // glass: a smoother face with tiny bubbles
          float bub = smoothstep(0.9, 0.95, fine);
          stone = mix(stone, stone * 1.3, bub * 0.5);
          hgt = pillow * 0.35 + bub * 0.08;
        } else {
          // fired clay: pitted and grainy
          float pit = smoothstep(0.8, 0.9, fine);
          stone *= 1.0 - 0.28 * pit;
          hgt -= pit * 0.25;
        }
        diffuseColor.rgb *= stone * mix(0.4, 1.0, vShade);`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
        roughnessFactor = clamp(rough0 + 0.07 * (grain - 0.5) - glint * 0.45, 0.25, 1.0);`
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        normal = bumpNormal(normal, -vViewPosition, hgt, 0.055);`
      );
  };
  mat.customProgramCacheKey = () => 'mosaic-tile-v4';
  return mat;
}

function tileDepthMaterial(uniforms) {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <begin_vertex>', 'computeTile();\nvec3 transformed = gTilePos;');
  };
  mat.customProgramCacheKey = () => 'mosaic-depth-v3';
  return mat;
}

// ------------------------------------------------------------------ build

const TONE_ROUGHNESS = {
  ivory: 0.7, charcoal: 0.78, turquoise: 0.4, limestone: 0.85, terracotta: 0.92, greystone: 0.82,
  red: 0.68, redDark: 0.7, yellow: 0.68, yellowDark: 0.7, blue: 0.42, blueDark: 0.44, green: 0.42, greenDark: 0.44,
};
// Stones stand a little proud of the mortar; the lettering and dots slightly more.
const TONE_HEIGHT = { ivory: 0.15, turquoise: 0.16 };

export function buildMosaicMesh(tiles, { seed = 7878 } = {}) {
  const rng = new Rng(seed ^ 0x5eed);
  const n = tiles.length;
  const geo = prismTemplate();
  const B = [new Float32Array(n * 4), new Float32Array(n * 4), new Float32Array(n * 4)];
  const T = [new Float32Array(n * 4), new Float32Array(n * 4), new Float32Array(n * 4)];
  const shape = new Float32Array(n * 4);
  const anim = new Float32Array(n * 4);
  const color = new Float32Array(n * 4);
  const centre = new Float32Array(n * 4);
  const col = new THREE.Color();
  const hsl = {};
  const families = Object.fromEntries(Object.entries(STONE).map(([k, list]) => [k, list.map((h) => new THREE.Color(h))]));

  for (let i = 0; i < n; i++) {
    const t = tiles[i];
    // slightly irregular outline: each corner nudged inwards, a small rotation
    const c = centroid(t.poly);
    const rot = rng.jitter(0.022);
    const cr = Math.cos(rot), sr = Math.sin(rot);
    let poly = t.poly.map(([x, y]) => {
      const s = 0.985 - rng.float(0, 0.035);
      const dx = (x - c[0]) * s, dy = (y - c[1]) * s;
      return [c[0] + dx * cr - dy * sr, c[1] + dx * sr + dy * cr];
    });
    const area = Math.abs(signedArea(poly));
    const size = Math.sqrt(area);
    const bevel = Math.min(0.075, Math.max(0.03, size * 0.085));
    let top = insetConvex(poly, bevel);
    if (!top || top.length !== poly.length) top = poly.map(([x, y]) => [c[0] + (x - c[0]) * 0.82, c[1] + (y - c[1]) * 0.82]);
    while (poly.length < MAXC) { poly.push(poly[poly.length - 1]); top.push(top[top.length - 1]); }
    for (let k = 0; k < MAXC; k++) {
      const a = k >> 1, o = i * 4 + (k & 1) * 2;
      B[a][o] = poly[k][0]; B[a][o + 1] = poly[k][1];
      T[a][o] = top[k][0]; T[a][o + 1] = top[k][1];
    }
    const baseH = TONE_HEIGHT[t.tone] ?? 0.13;
    shape[i * 4] = baseH + rng.gauss(0.014) + Math.min(0.04, size * 0.02);
    shape[i * 4 + 1] = bevel * 0.85;
    shape[i * 4 + 2] = rng.gauss(0.014);
    shape[i * 4 + 3] = rng.gauss(0.014);

    const fam = families[t.tone] || families.charcoal;
    col.copy(fam[rng.int(fam.length)]);
    col.getHSL(hsl);
    // plane facets keep a tight range so each folded surface reads as one tone
    const dl = t.tone === 'charcoal' ? rng.gauss(0.009) : t.tone === 'ivory' || t.group === 'plane' ? rng.gauss(0.016) : rng.gauss(0.026);
    col.setHSL(hsl.h + rng.gauss(0.006), Math.max(0, hsl.s * (1 + rng.gauss(0.08))), Math.min(0.97, Math.max(0.02, hsl.l + dl)));
    color[i * 4] = col.r; color[i * 4 + 1] = col.g; color[i * 4 + 2] = col.b;
    // roughness, with the stone kind packed into the integer part
    color[i * 4 + 3] = Math.min(0.98, Math.max(0.3, (TONE_ROUGHNESS[t.tone] ?? 0.86) + rng.gauss(0.04))) + 2 * (STONE_KIND[t.tone] ?? 0);

    anim[i * 4] = t.start;
    anim[i * 4 + 1] = t.duration;
    anim[i * 4 + 2] = t.drop;
    anim[i * 4 + 3] = rng.next();
    // roughly cubic stones: total depth close to the stone's width
    centre[i * 4] = c[0]; centre[i * 4 + 1] = c[1]; centre[i * 4 + 2] = rng.jitter(0.35);
    centre[i * 4 + 3] = Math.min(0.5, Math.max(0.12, size * 0.92 - shape[i * 4]));
  }
  const ia = (arr, size) => new THREE.InstancedBufferAttribute(arr, size);
  geo.setAttribute('iB01', ia(B[0], 4)); geo.setAttribute('iB23', ia(B[1], 4)); geo.setAttribute('iB45', ia(B[2], 4));
  geo.setAttribute('iT01', ia(T[0], 4)); geo.setAttribute('iT23', ia(T[1], 4)); geo.setAttribute('iT45', ia(T[2], 4));
  geo.setAttribute('iShape', ia(shape, 4));
  geo.setAttribute('iAnim', ia(anim, 4));
  geo.setAttribute('iColor', ia(color, 4));
  geo.setAttribute('iCenter', ia(centre, 4));
  geo.instanceCount = n;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 70);
  geo.boundingBox = new THREE.Box3(new THREE.Vector3(-60, -3, -40), new THREE.Vector3(60, 3, 40));

  const uniforms = { uTime: { value: 0 } };
  const mesh = new THREE.Mesh(geo, tileMaterial(uniforms));
  mesh.customDepthMaterial = tileDepthMaterial(uniforms);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

// ------------------------------------------------------------------ mortar bed and slab

export function buildBed(panel, mortarHex, sinopiaTex, joints, timeUniform) {
  const uniforms = {
    uTime: timeUniform,
    uJointTex: { value: joints.tex },
    uBed: { value: 0 },
    uSinopia: { value: 0 }, // how much of the underdrawing has been drawn
    uSinopiaFade: { value: 1 },
    uSinopiaTex: { value: sinopiaTex },
  };
  const w = panel.x1 - panel.x0, d = panel.y1 - panel.y0;
  const group = new THREE.Group();

  // backing slab
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(w + 1.6, 2.4, d + 1.6),
    new THREE.MeshStandardMaterial({ color: 0x3b3631, roughness: 0.92, metalness: 0 })
  );
  slab.position.y = -0.55 - 1.2;
  slab.receiveShadow = true;
  slab.castShadow = true;
  group.add(slab);

  // mortar bed, spread across the slab at the start, then drawn on in red ochre
  const bedMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(mortarHex), roughness: 1.0, metalness: 0 });
  bedMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBedPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBedPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uBed, uSinopia, uSinopiaFade, uTime;
        uniform sampler2D uSinopiaTex, uJointTex;
        varying vec3 vBedPos;
        ${NOISE}`
      )
      .replace(
        '#include <clipping_planes_fragment>',
        /* glsl */ `#include <clipping_planes_fragment>
        float sweep = (vBedPos.x + ${(w / 2).toFixed(2)}) / ${w.toFixed(2)};
        float rowWave = 0.035 * sin(vBedPos.z * 0.35) + 0.03 * (vnoise(vec3(vBedPos.xz * 0.4, 1.0)) - 0.5);
        float front = uBed * 1.12 - 0.06;
        if (sweep + rowWave > front) discard;`
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        float sand = vnoise(vec3(vBedPos.xz * 7.0, 2.0)) * 0.6 + vnoise(vec3(vBedPos.xz * 23.0, 5.0)) * 0.4;
        // overlapping arcs left by the trowel
        vec2 cell = floor(vBedPos.xz / 7.0);
        vec2 ctr = (cell + vec2(hash13(vec3(cell, 1.0)), hash13(vec3(cell, 2.0)))) * 7.0;
        float arc = sin(length(vBedPos.xz - ctr) * 5.5 + hash13(vec3(cell, 3.0)) * 6.0);
        float sweepMask = smoothstep(0.35, 0.75, vnoise(vec3(vBedPos.xz * 0.35, 6.0)));
        float trowel = smoothstep(0.7, 1.0, arc) * sweepMask * (0.4 + 0.6 * vnoise(vec3(vBedPos.xz * 0.9, 4.0)));
        sand = sand * 0.8 + trowel * 0.4;
        float wet = 1.0 - smoothstep(0.0, 0.12, front - (sweep + rowWave));
        diffuseColor.rgb *= (0.86 + 0.2 * sand) * mix(1.0, 0.72, wet * step(uBed, 0.999));
        // coarse aggregate: darker and lighter grains in the lime mortar
        float agg = vnoise(vec3(vBedPos.xz * 31.0, 7.0));
        diffuseColor.rgb *= 1.0 - 0.22 * smoothstep(0.78, 0.9, agg) + 0.1 * smoothstep(0.1, 0.02, agg);
        if (vBedPos.y > 0.27) {
          vec2 suv = vec2(sweep, (${(d / 2).toFixed(2)} - vBedPos.z) / ${d.toFixed(2)});
          // mortar between laid stones gets less light than open bed
          vec2 jt = texture2D(uJointTex, suv).rg;
          float laid = smoothstep(jt.g * ${joints.timeScale.toFixed(1)} - 0.05, jt.g * ${joints.timeScale.toFixed(1)} + 0.3, uTime);
          diffuseColor.rgb *= 1.0 - jt.r * 0.6 * laid;
          vec2 sk = texture2D(uSinopiaTex, suv).rg;
          float drawn = smoothstep(sk.g - 0.012, sk.g + 0.004, uSinopia);
          float brush = 0.6 + 0.5 * vnoise(vec3(vBedPos.xz * 5.0, 9.0));
          float ochre = clamp(sk.r * drawn * brush, 0.0, 1.0) * uSinopiaFade;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.40, 0.085, 0.045), ochre * 0.85);
        }`
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        normal = bumpNormal(normal, -vViewPosition, sand, 0.05);`
      );
  };
  bedMat.customProgramCacheKey = () => 'mosaic-bed-v4';
  const bed = new THREE.Mesh(new THREE.BoxGeometry(w, 0.55, d), bedMat);
  bed.position.y = -0.275;
  bed.receiveShadow = true;
  group.add(bed);
  return { group, uniforms };
}

// ------------------------------------------------------------------ frame and table

const WOOD = /* glsl */ `
// q.x runs along the grain; q.yz is the cross-section
vec3 woodGrain(vec3 q, vec3 light, vec3 dark, float seed) {
  float warp = vnoise(vec3(q.x * 0.045 + seed, q.y * 0.3, q.z * 0.3)) * 3.2
             + vnoise(vec3(q.x * 0.5, q.y * 2.2, q.z * 2.2 + seed)) * 0.3;
  float rings = length(q.yz + vec2(9.0 + seed * 3.0, -4.0)) * 1.1 + warp;
  float band = abs(fract(rings) - 0.5) * 2.0;
  float late = smoothstep(0.5, 0.95, band);
  float fibre = vnoise(vec3(q.x * 1.1, q.y * 38.0, q.z * 38.0));
  vec3 col = mix(light, dark, late * 0.7 + 0.12);
  return col * (0.86 + 0.24 * fibre);
}
`;

function woodMaterial(light, dark, roughness, grainCode, key) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness, metalness: 0 });
  const uniforms = { uLight: { value: new THREE.Color(light) }, uDark: { value: new THREE.Color(dark) } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWoodPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWoodPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uLight, uDark;\nvarying vec3 vWoodPos;\n${NOISE}\n${WOOD}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${grainCode}`);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

// A mitred walnut frame round the panel, standing on a plank table.
export function buildStage(panel) {
  const group = new THREE.Group();
  const M = 2.6, gap = 0.12, top = 0.5, floor = -2.96;
  const hx = (panel.x1 - panel.x0) / 2, hz = (panel.y1 - panel.y0) / 2;
  const ix = hx + gap, iz = hz + gap, ox = ix + M, oz = iz + M;

  // the bevel grows the solid outwards by `bev`, so the outline is drawn inset
  const bev = 0.22;
  const sx = ox - bev, sz = oz - bev, hx2 = ix + bev, hz2 = iz + bev;
  const shape = new THREE.Shape([new THREE.Vector2(-sx, -sz), new THREE.Vector2(sx, -sz), new THREE.Vector2(sx, sz), new THREE.Vector2(-sx, sz)]);
  shape.holes.push(new THREE.Path([new THREE.Vector2(-hx2, -hz2), new THREE.Vector2(-hx2, hz2), new THREE.Vector2(hx2, hz2), new THREE.Vector2(hx2, -hz2)]));
  const frameGeo = new THREE.ExtrudeGeometry(shape, { depth: top - floor - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 1 });
  frameGeo.rotateX(-Math.PI / 2);
  frameGeo.translate(0, floor + bev, 0);
  const frameGrain = /* glsl */ `
    vec3 p = vWoodPos;
    float sideBar = step(abs(p.z) - ${iz.toFixed(3)}, abs(p.x) - ${ix.toFixed(3)});
    vec3 q = sideBar > 0.5 ? vec3(p.z, abs(p.x) - ${(ix + M / 2).toFixed(3)}, p.y) : vec3(p.x, abs(p.z) - ${(iz + M / 2).toFixed(3)}, p.y);
    float seed = sideBar * 2.0 + step(0.0, sideBar > 0.5 ? p.x : p.z);
    vec3 wood = woodGrain(q + vec3(seed * 40.0, 0.0, 0.0), uLight, uDark, seed);
    float mitre = abs((abs(p.x) - ${ix.toFixed(3)}) - (abs(p.z) - ${iz.toFixed(3)}));
    wood *= mix(0.55, 1.0, smoothstep(0.0, 0.05, mitre));
    diffuseColor.rgb = wood;`;
  const frame = new THREE.Mesh(frameGeo, woodMaterial('#6a4a31', '#352214', 0.58, frameGrain, 'mosaic-frame-v2'));
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);

  const tableGrain = /* glsl */ `
    vec3 p = vWoodPos;
    float plankW = 9.0;
    float plank = floor(p.z / plankW);
    float zl = p.z - plank * plankW;
    float seed = fract(sin(plank * 12.9898) * 43758.5453);
    vec3 wood = woodGrain(vec3(p.x + seed * 90.0, zl - plankW * 0.5, 2.0 + seed * 4.0), uLight, uDark, seed * 7.0);
    wood *= 0.9 + 0.2 * seed;
    float seam = min(zl, plankW - zl);
    wood *= mix(0.35, 1.0, smoothstep(0.03, 0.12, seam));
    diffuseColor.rgb = wood;`;
  const table = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), woodMaterial('#3d2c21', '#22170f', 0.66, tableGrain, 'mosaic-table-v4'));
  table.rotation.x = -Math.PI / 2;
  table.position.y = floor;
  table.receiveShadow = true;
  group.add(table);
  return group;
}
