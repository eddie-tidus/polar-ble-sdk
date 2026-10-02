// Golden-hour daylight: a low sun behind and to the left of the panel, a sky
// that is amber at the horizon and soft blue overhead, and that same sky used
// as the environment so reflections and skylight agree with the sun.

import * as THREE from 'three';

// Direction towards the sun: about 17° above the horizon, from the back left.
export const SUN_DIR = new THREE.Vector3(-0.72, 0.29, -0.63).normalize();
export const SUN_COLOUR = new THREE.Color('#ffc58a');
// Horizon haze, used for the fog so the far table melts into the sky.
export const HAZE = new THREE.Color().setRGB(0.62, 0.4, 0.24);

const SKY_FRAG = /* glsl */ `
uniform vec3 uSun;
uniform float uDisc;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 zenith = vec3(0.16, 0.27, 0.5);
  vec3 upper = vec3(0.4, 0.48, 0.62);
  vec3 horizon = vec3(0.8, 0.5, 0.27);
  vec3 ground = vec3(0.22, 0.15, 0.1);
  float toward = max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSun.x, 0.0, uSun.z))), 0.0);
  vec3 col;
  if (h >= 0.0) {
    // the band of warm light hugs the horizon, broader on the sun's side
    col = mix(horizon, upper, smoothstep(0.0, 0.18 + 0.12 * toward, h));
    col = mix(col, zenith, smoothstep(0.22, 0.95, h));
  } else {
    col = mix(horizon * 0.8, ground, smoothstep(0.0, 0.1, -h));
  }
  float s = max(dot(d, uSun), 0.0);
  col += vec3(1.0, 0.55, 0.22) * (pow(s, 5.0) * 0.4 + pow(s, 48.0) * 0.9);
  col += vec3(1.0, 0.86, 0.62) * pow(s, 1400.0) * uDisc;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function skyMaterial(disc) {
  return new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN_DIR.clone() }, uDisc: { value: disc } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
}

// The visible sky: a large dome drawn behind everything, kept centred on the
// camera so it never shows parallax.
export function buildSkyDome() {
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), skyMaterial(6));
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  return dome;
}

// Environment lighting from the same sky, with a brighter sun disc so glossy
// stones (glass, polished marble) catch warm highlights.
export function buildSkyEnvironment(renderer) {
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), skyMaterial(40)));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(envScene, 0.02).texture;
  pmrem.dispose();
  return tex;
}

// Fit the sun's shadow camera tightly round the panel, frame and the long
// shadows they throw across the table, as seen from the sun.
export function fitSunShadow(light, box) {
  const cam = light.shadow.camera;
  // same placement three.js gives the shadow camera: at the light, facing the target
  const probe = new THREE.OrthographicCamera();
  probe.position.copy(light.position);
  probe.lookAt(light.target.position);
  probe.updateMatrixWorld();
  const inv = probe.matrixWorldInverse;
  const v = new THREE.Vector3();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  // tall edges throw shadows this far across the floor
  const reach = (box.max.y - box.min.y) / Math.tan(Math.asin(SUN_DIR.y));
  const sx = -SUN_DIR.x / Math.hypot(SUN_DIR.x, SUN_DIR.z), sz = -SUN_DIR.z / Math.hypot(SUN_DIR.x, SUN_DIR.z);
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    for (const k of [0, 1]) {
      v.set(x + sx * reach * k, k ? box.min.y : y, z + sz * reach * k).applyMatrix4(inv);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x);
      y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
      z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z);
    }
  }
  Object.assign(cam, { left: x0 - 1, right: x1 + 1, bottom: y0 - 1, top: y1 + 1, near: Math.max(0.5, -z1 - 5), far: -z0 + 5 });
  cam.updateProjectionMatrix();
}
