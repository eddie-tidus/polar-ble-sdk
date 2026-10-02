import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildMosaic } from './layout.js';
import { buildMosaicMesh, buildBed, buildStage } from './mosaic.js';
import { buildSinopia } from './sinopia.js';
import { buildJointShade } from './joints.js';
import { createDirector } from './director.js';
import { assignTimeline, phaseAt, PHASES, FLIGHT, FLIGHT_ORDER, SINOPIA_FADE } from './timeline.js';
import { PANEL, MORTAR, toWorld } from './compose.js';
import { O_GEOM, DOTS } from './logo.js';

const SEED = 7878;
const phase = (id) => PHASES.find((p) => p.id === id);
const BED = phase('bed');
const SINOPIA = phase('sinopia');

const stage = document.getElementById('stage');
const bar = document.getElementById('bar');
const loading = document.getElementById('loading');
const ui = {
  replay: document.getElementById('replay'),
  pause: document.getElementById('pause'),
  speed: document.getElementById('speed'),
  cam: document.getElementById('cam'),
  finish: document.getElementById('finish'),
  view: document.getElementById('view'),
  phase: document.getElementById('phase'),
  count: document.getElementById('count'),
  progress: document.getElementById('progress'),
};

// ------------------------------------------------------------------ renderer & scene

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
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
stage.appendChild(renderer.domElement);

const SCENE_BG = new THREE.Color('#14110e');
const scene = new THREE.Scene();
scene.background = SCENE_BG;
scene.fog = new THREE.Fog(SCENE_BG, 200, 600); // distances follow the camera, see frame()
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;

const camera = new THREE.PerspectiveCamera(30, 1, 0.3, 2000);

// A low, warm key raking across the stones, a cool sky fill and a faint back
// light: long soft shadows in the joints and a glint on every bevel.
const hemi = new THREE.HemisphereLight(0xdfe7f0, 0x2b251f, 0.42);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffeedb, 2.7);
key.position.set(-48, 36, 30);
key.castShadow = true;
const mobile = Math.min(window.innerWidth, window.innerHeight) < 700;
key.shadow.mapSize.set(mobile ? 2048 : 4096, mobile ? 2048 : 4096);
Object.assign(key.shadow.camera, { left: -62, right: 62, top: 50, bottom: -50, near: 10, far: 170 });
key.shadow.bias = -0.0003;
key.shadow.normalBias = 0.012;
key.shadow.radius = 1.6;
scene.add(key, key.target);
const fill = new THREE.DirectionalLight(0xdfe8f2, 0.3);
fill.position.set(40, 30, -30);
scene.add(fill);
const back = new THREE.DirectionalLight(0xfff4e8, 0.45);
back.position.set(20, 14, -60);
scene.add(back);

scene.add(buildStage(PANEL)); // walnut frame and plank table

// ------------------------------------------------------------------ camera poses

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = true;
controls.minDistance = 3;
controls.maxDistance = 1000;
controls.maxPolarAngle = THREE.MathUtils.degToRad(84);

const FRAME_M = 2.75; // frame width beyond the panel edge
const panelCorners = [];
for (const x of [PANEL.x0 - FRAME_M, PANEL.x1 + FRAME_M]) for (const z of [-(PANEL.y0 - FRAME_M), -(PANEL.y1 + FRAME_M)]) for (const y of [0.5, -2.95]) panelCorners.push(new THREE.Vector3(x, y, z));

function poseToCamera(p, cam = camera) {
  const sp = Math.sin(p.polar);
  cam.position.set(
    p.target.x + p.radius * sp * Math.sin(p.azimuth),
    p.target.y + p.radius * Math.cos(p.polar),
    p.target.z + p.radius * sp * Math.cos(p.azimuth)
  );
  cam.lookAt(p.target);
  cam.updateMatrixWorld();
  // keep the orbit pivot in step, so taking over mid-move does not jump
  if (cam === camera) controls.target.copy(p.target);
}

// Radius at which the whole framed panel sits comfortably inside the viewport.
const probe = new THREE.PerspectiveCamera();
function fitRadius(pose, mx = 0.9, my = 0.86) {
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
      if (Math.abs(v.x) > mx || Math.abs(v.y) > my) { ok = false; break; }
    }
    if (ok) hi = mid; else lo = mid;
  }
  return hi;
}

const oCentre = toWorld([O_GEOM.cx, O_GEOM.cy]);
const dotsCentre = toWorld([(DOTS[0].cx + DOTS[1].cx) / 2, DOTS[0].cy]);
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

// Two camera modes:
//  cinematic – a choreographed move tied to the construction clock
//  overview  – the full panel throughout, then a glide to the "o" and back
// Any manual input hands the camera to the viewer until Replay.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let camMode = reducedMotion ? 'overview' : 'cinematic';
let director = null;
const tour = { state: 'build', t: 0, from: null };
const TOUR = { hold: 1.6, approach: 7.5, linger: 4.5, back: 7.5 };

function overviewTick(dt) {
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
function glideHome(dt) {
  tour.t += dt;
  poseToCamera(lerpPose(tour.from, openingPose(), tour.t / 1.6));
  if (tour.t >= 1.6) tour.from = null;
  return true;
}
// Returns true when the script placed the camera this frame.
function cameraTick(dt) {
  if (tour.state === 'user') return false;
  if (camMode === 'cinematic') {
    poseToCamera(director.poseAt(buildTime));
    return true;
  }
  return overviewTick(dt);
}

controls.addEventListener('start', () => { tour.state = 'user'; tour.from = null; });

// ------------------------------------------------------------------ build state

let mosaic = null;
let bed = null;
let buildEnd = 35;
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
  tour.from = camMode === 'overview' ? currentPose() : null;
}

function finish() {
  setPaused(false);
  if (camMode === 'cinematic') {
    // land on the closing shot as well as the finished panel
    buildTime = Math.max(buildEnd, director.endTime) + 0.01;
    if (tour.state === 'user') tour.state = 'build';
  } else {
    buildTime = buildEnd + 0.01;
    tour.state = 'done';
    poseToCamera(openingPose());
  }
}

function resetView() {
  tour.state = 'user';
  tour.from = null;
  poseToCamera(camMode === 'cinematic' && buildTime >= director.endTime ? director.poseAt(director.endTime) : openingPose());
}

function setCamMode(mode) {
  camMode = mode;
  ui.cam.value = mode;
  tour.from = null;
  tour.t = 0;
  if (mode === 'overview') {
    tour.state = buildTime >= buildEnd ? 'done' : 'build';
    poseToCamera(openingPose());
  } else {
    tour.state = 'build';
  }
}

ui.replay.addEventListener('click', replay);
ui.pause.addEventListener('click', () => setPaused(!paused));
ui.finish.addEventListener('click', finish);
ui.view.addEventListener('click', resetView);
ui.speed.addEventListener('change', () => { speed = parseFloat(ui.speed.value); });
ui.cam.addEventListener('change', () => setCamMode(ui.cam.value));
ui.cam.value = camMode;
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLSelectElement) return;
  if (e.code === 'Space') { e.preventDefault(); setPaused(!paused); }
  else if (e.key === 'r' || e.key === 'R') replay();
  else if (e.key === 'f' || e.key === 'F') finish();
  else if (e.key === 'v' || e.key === 'V') resetView();
  else if (e.key === 'c' || e.key === 'C') setCamMode(camMode === 'cinematic' ? 'overview' : 'cinematic');
});

// ------------------------------------------------------------------ layout

function resize() {
  const barH = bar.getBoundingClientRect().height;
  const w = window.innerWidth, h = Math.max(200, window.innerHeight - barH);
  stage.style.bottom = barH + 'px';
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (director) director.refit();
  if (camMode === 'overview' && tour.state === 'build' && !tour.from) poseToCamera(openingPose());
}
new ResizeObserver(resize).observe(bar);
window.addEventListener('resize', resize);

// ------------------------------------------------------------------ boot

function boot() {
  resize();
  const t0 = performance.now();
  const layout = buildMosaic({ seed: SEED });
  buildEnd = assignTimeline(layout.tiles, SEED);
  mosaic = buildMosaicMesh(layout.tiles, { seed: SEED });
  scene.add(mosaic.mesh);
  bed = buildBed(PANEL, MORTAR, buildSinopia(layout), buildJointShade(layout.tiles, PANEL), mosaic.uniforms.uTime);
  scene.add(bed.group);

  director = createDirector({
    fitRadius, aspect: () => camera.aspect, phases: PHASES, flight: FLIGHT, flightOrder: FLIGHT_ORDER,
    trails: layout.trails, planes: layout.planes, letters: layout.wm.letters, dots: dotsCentre,
  });
  poseToCamera(camMode === 'cinematic' ? director.poseAt(0) : openingPose());

  stats = { ...layout.stats, buildEnd: +buildEnd.toFixed(2), setupMs: Math.round(performance.now() - t0) };
  ui.count.textContent = `${layout.tiles.length.toLocaleString('en-GB')} tesserae`;
  loading.classList.add('done');
  window.__mosaic = {
    stats,
    get time() { return buildTime; },
    set time(v) { buildTime = v; },
    get tour() { return tour.state; },
    get mode() { return camMode; },
    setSpeed(v) { speed = v; },
    setCamMode,
    finish, replay, resetView,
    pose: () => currentPose(),
    cameraPath(step = 0.1) {
      const out = [];
      for (let t = 0; t <= director.endTime + 1e-6; t += step) {
        const p = director.poseAt(t);
        const sp = Math.sin(p.polar);
        out.push([t, p.target.x + p.radius * sp * Math.sin(p.azimuth), p.target.y + p.radius * Math.cos(p.polar), p.target.z + p.radius * sp * Math.cos(p.azimuth), p.radius, p.azimuth, p.polar, p.target.x, p.target.z]);
      }
      return out;
    },
    stepTour(seconds, step = 0.05) { for (let t = 0; t < seconds; t += step) overviewTick(step); },
    setPose(name) {
      tour.state = 'user';
      const p = typeof name === 'object'
        ? { target: new THREE.Vector3(...name.target), polar: THREE.MathUtils.degToRad(name.polar), azimuth: THREE.MathUtils.degToRad(name.azimuth), radius: name.radius }
        : name === 'close' ? closePose() : openingPose();
      poseToCamera(p);
    },
  };
  last = performance.now();
  requestAnimationFrame(frame);
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
let last = performance.now();
let fpsStart = performance.now(), fpsFrames = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) buildTime += dt * speed;
  mosaic.uniforms.uTime.value = buildTime;
  bed.uniforms.uBed.value = clamp01(buildTime / BED.to);
  bed.uniforms.uSinopia.value = clamp01((buildTime - SINOPIA.from) / (SINOPIA.to - SINOPIA.from));
  bed.uniforms.uSinopiaFade.value = 1 - smoother(clamp01((buildTime - SINOPIA_FADE.from) / (SINOPIA_FADE.to - SINOPIA_FADE.from)));
  const driven = paused ? tour.state !== 'user' && (camMode === 'cinematic' || tour.state !== 'done') : cameraTick(dt);
  if (!driven) controls.update();
  // fog only ever reaches the far table, whatever the camera distance
  const dist = camera.position.distanceTo(controls.target);
  scene.fog.near = dist * 1.25 + 10;
  scene.fog.far = dist * 5 + 90;
  renderer.render(scene, camera);
  ui.phase.textContent = paused ? 'Paused' : phaseAt(buildTime, buildEnd);
  ui.progress.style.transform = `scaleX(${Math.min(1, buildTime / buildEnd)})`;
  fpsFrames++;
  if (now - fpsStart > 1000) { window.__mosaic.fps = (fpsFrames * 1000) / (now - fpsStart); fpsStart = now; fpsFrames = 0; }
  requestAnimationFrame(frame);
}

requestAnimationFrame(() => setTimeout(boot, 30));
