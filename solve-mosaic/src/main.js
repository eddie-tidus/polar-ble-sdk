import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildMosaic } from './layout.js';
import { buildMosaicMesh, buildBed } from './mosaic.js';
import { assignTimeline, phaseAt, PHASES } from './timeline.js';
import { PANEL, MORTAR, toWorld } from './compose.js';
import { O_GEOM } from './logo.js';

const SEED = 7878;
const BED_TIME = PHASES[0].to;

const stage = document.getElementById('stage');
const bar = document.getElementById('bar');
const loading = document.getElementById('loading');
const ui = {
  replay: document.getElementById('replay'),
  pause: document.getElementById('pause'),
  speed: document.getElementById('speed'),
  finish: document.getElementById('finish'),
  view: document.getElementById('view'),
  phase: document.getElementById('phase'),
  count: document.getElementById('count'),
  progress: document.getElementById('progress'),
};

// ------------------------------------------------------------------ renderer & scene

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (err) {
  loading.textContent = 'This artwork needs WebGL, which is not available in this browser.';
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.94;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setClearColor(0x000000, 0);
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;

const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 2000);

const hemi = new THREE.HemisphereLight(0xe9eef2, 0x2b251f, 0.55);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff1e0, 2.3);
key.position.set(-44, 50, 34);
key.castShadow = true;
const mobile = Math.min(window.innerWidth, window.innerHeight) < 700;
key.shadow.mapSize.set(mobile ? 2048 : 4096, mobile ? 2048 : 4096);
Object.assign(key.shadow.camera, { left: -66, right: 66, top: 46, bottom: -46, near: 10, far: 160 });
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.015;
key.shadow.radius = 2;
scene.add(key, key.target);
const fill = new THREE.DirectionalLight(0xdfe8f2, 0.35);
fill.position.set(40, 30, -30);
scene.add(fill);

// soft contact shadow under the slab
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.32 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -2.96;
ground.receiveShadow = true;
scene.add(ground);

const bed = buildBed(PANEL, MORTAR);
scene.add(bed.group);

// ------------------------------------------------------------------ camera poses

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = true;
controls.minDistance = 3;
controls.maxDistance = 1000;
controls.maxPolarAngle = THREE.MathUtils.degToRad(84);

const panelCorners = [];
for (const x of [PANEL.x0 - 0.8, PANEL.x1 + 0.8]) for (const z of [-(PANEL.y0 - 0.8), -(PANEL.y1 + 0.8)]) for (const y of [0.3, -2.95]) panelCorners.push(new THREE.Vector3(x, y, z));

function poseToCamera(p, cam = camera) {
  const sp = Math.sin(p.polar);
  cam.position.set(
    p.target.x + p.radius * sp * Math.sin(p.azimuth),
    p.target.y + p.radius * Math.cos(p.polar),
    p.target.z + p.radius * sp * Math.cos(p.azimuth)
  );
  cam.lookAt(p.target);
  cam.updateMatrixWorld();
}

// Radius at which the whole panel sits comfortably inside the viewport.
const probe = new THREE.PerspectiveCamera();
function fitRadius(pose) {
  probe.copy(camera);
  let lo = 20, hi = 1200;
  const v = new THREE.Vector3();
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    poseToCamera({ ...pose, radius: mid }, probe);
    probe.updateProjectionMatrix();
    let ok = true;
    for (const c of panelCorners) {
      v.copy(c).project(probe);
      if (Math.abs(v.x) > 0.9 || Math.abs(v.y) > 0.86) { ok = false; break; }
    }
    if (ok) hi = mid; else lo = mid;
  }
  return hi;
}

const oCentre = toWorld([O_GEOM.cx, O_GEOM.cy]);
function openingPose() {
  const p = { target: new THREE.Vector3(0, 0, 0.6), polar: THREE.MathUtils.degToRad(25), azimuth: 0, radius: 100 };
  p.radius = fitRadius(p);
  return p;
}
function closePose() {
  return {
    target: new THREE.Vector3(oCentre[0], 0.1, -oCentre[1] - 2.6),
    polar: THREE.MathUtils.degToRad(47),
    azimuth: THREE.MathUtils.degToRad(-14),
    radius: 16.5,
  };
}
const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function lerpPose(a, b, t) {
  const k = smoother(Math.min(1, Math.max(0, t)));
  return {
    target: a.target.clone().lerp(b.target, k),
    polar: a.polar + (b.polar - a.polar) * k,
    azimuth: a.azimuth + (b.azimuth - a.azimuth) * k,
    radius: Math.exp(Math.log(a.radius) + (Math.log(b.radius) - Math.log(a.radius)) * k),
  };
}
function currentPose() {
  const off = camera.position.clone().sub(controls.target);
  const r = off.length();
  return { target: controls.target.clone(), radius: r, polar: Math.acos(off.y / r), azimuth: Math.atan2(off.x, off.z) };
}

// Camera tour after construction: hold, glide to the "o" and dots, linger,
// return to the full panel. Any manual input hands control to the viewer.
const tour = { state: 'build', t: 0, from: null };
// Viewers who ask for reduced motion keep the construction but skip the glide.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const TOUR = { hold: 1.6, approach: 7.5, linger: 4.5, back: 7.5 };
function tourTick(dt) {
  if (tour.state === 'user' || tour.state === 'done') return false;
  if (tour.state === 'build') {
    if (buildTime >= buildEnd) { tour.state = reducedMotion ? 'done' : 'hold'; tour.t = 0; }
    return tour.state !== 'build' ? true : (tour.from ? glideHome(dt) : false);
  }
  tour.t += dt;
  const open = openingPose(), close = closePose();
  if (tour.state === 'hold') {
    if (tour.t >= TOUR.hold) { tour.state = 'approach'; tour.t = 0; tour.from = currentPose(); }
    return true;
  }
  if (tour.state === 'approach') {
    poseToCamera(lerpPose(tour.from, close, tour.t / TOUR.approach));
    if (tour.t >= TOUR.approach) { tour.state = 'linger'; tour.t = 0; }
  } else if (tour.state === 'linger') {
    const k = tour.t / TOUR.linger;
    poseToCamera({ ...close, azimuth: close.azimuth + THREE.MathUtils.degToRad(9) * smoother(k), radius: close.radius * (1 - 0.06 * smoother(k)) });
    if (tour.t >= TOUR.linger) { tour.state = 'back'; tour.t = 0; tour.from = currentPose(); }
  } else if (tour.state === 'back') {
    poseToCamera(lerpPose(tour.from, open, tour.t / TOUR.back));
    if (tour.t >= TOUR.back) tour.state = 'done';
  }
  return true;
}
// After a replay, ease back to the opening view.
function glideHome(dt) {
  tour.t += dt;
  poseToCamera(lerpPose(tour.from, openingPose(), tour.t / 1.6));
  if (tour.t >= 1.6) tour.from = null;
  return true;
}

controls.addEventListener('start', () => { tour.state = 'user'; tour.from = null; });

// ------------------------------------------------------------------ build state

let mosaic = null;
let buildEnd = 34;
let buildTime = 0;
let speed = 1;
let paused = false;
let stats = null;

function setPaused(p) {
  paused = p;
  ui.pause.querySelector('span').textContent = paused ? 'Play' : 'Pause';
  ui.pause.querySelector('.ico-pause').style.display = paused ? 'none' : '';
  ui.pause.querySelector('.ico-play').style.display = paused ? '' : 'none';
  ui.pause.setAttribute('aria-pressed', String(paused));
}

function replay() {
  buildTime = 0;
  setPaused(false);
  tour.state = 'build';
  tour.t = 0;
  tour.from = currentPose();
}

function finish() {
  buildTime = buildEnd + 0.01;
  setPaused(false);
}

function resetView() {
  tour.state = 'done';
  tour.from = null;
  poseToCamera(openingPose());
  controls.target.copy(openingPose().target);
}

ui.replay.addEventListener('click', replay);
ui.pause.addEventListener('click', () => setPaused(!paused));
ui.finish.addEventListener('click', finish);
ui.view.addEventListener('click', resetView);
ui.speed.addEventListener('change', () => { speed = parseFloat(ui.speed.value); });
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLSelectElement) return;
  if (e.code === 'Space') { e.preventDefault(); setPaused(!paused); }
  else if (e.key === 'r' || e.key === 'R') replay();
  else if (e.key === 'f' || e.key === 'F') finish();
  else if (e.key === 'v' || e.key === 'V') resetView();
});

// ------------------------------------------------------------------ layout

function resize() {
  const barH = bar.getBoundingClientRect().height;
  const w = window.innerWidth, h = Math.max(200, window.innerHeight - barH);
  stage.style.bottom = barH + 'px';
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (tour.state === 'build' && !tour.from) {
    const p = openingPose();
    poseToCamera(p);
    controls.target.copy(p.target);
  }
}
new ResizeObserver(resize).observe(bar);
window.addEventListener('resize', resize);

// ------------------------------------------------------------------ boot

function boot() {
  resize();
  const p = openingPose();
  poseToCamera(p);
  controls.target.copy(p.target);
  const t0 = performance.now();
  const layout = buildMosaic({ seed: SEED });
  buildEnd = assignTimeline(layout.tiles, SEED);
  mosaic = buildMosaicMesh(layout.tiles, { seed: SEED });
  scene.add(mosaic.mesh);
  stats = { ...layout.stats, buildEnd: +buildEnd.toFixed(2), setupMs: Math.round(performance.now() - t0) };
  ui.count.textContent = `${layout.tiles.length.toLocaleString('en-GB')} tesserae`;
  loading.classList.add('done');
  window.__mosaic = {
    stats,
    get time() { return buildTime; },
    set time(v) { buildTime = v; },
    get tour() { return tour.state; },
    setSpeed(v) { speed = v; },
    finish, replay, resetView,
    pose: () => currentPose(),
    stepTour(seconds, step = 0.05) { for (let t = 0; t < seconds; t += step) tourTick(step); },
    setPose(name) {
      tour.state = 'user';
      const p = typeof name === 'object'
        ? { target: new THREE.Vector3(...name.target), polar: THREE.MathUtils.degToRad(name.polar), azimuth: THREE.MathUtils.degToRad(name.azimuth), radius: name.radius }
        : name === 'close' ? closePose() : openingPose();
      poseToCamera(p);
      controls.target.copy(p.target);
    },
  };
  last = performance.now();
  requestAnimationFrame(frame);
}

let last = performance.now();
let fpsStart = performance.now(), fpsFrames = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) buildTime += dt * speed;
  mosaic.uniforms.uTime.value = buildTime;
  bed.uniforms.uBed.value = Math.min(1, buildTime / BED_TIME);
  const driven = paused ? tour.state !== 'user' && tour.state !== 'done' : tourTick(dt);
  if (!driven) controls.update();
  renderer.render(scene, camera);
  ui.phase.textContent = paused ? 'Paused' : phaseAt(buildTime, buildEnd);
  ui.progress.style.transform = `scaleX(${Math.min(1, buildTime / buildEnd)})`;
  fpsFrames++;
  if (now - fpsStart > 1000) { window.__mosaic.fps = (fpsFrames * 1000) / (now - fpsStart); fpsStart = now; fpsFrames = 0; }
  requestAnimationFrame(frame);
}

requestAnimationFrame(() => setTimeout(boot, 30));
