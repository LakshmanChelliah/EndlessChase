/**
 * Endless Chase — playable WebGL client (Three.js)
 * Fake GTA V visual tier: Mobile PBR-ish MeshStandard, golden-hour grit.
 * Gameplay mirrors Unity: 3-lane lerp, pools, biomes, red-light risk/reward, upgrades/save.
 */
import * as THREE from "three";

const LANE_X = [-3.2, 0, 3.2];
const SEG_LEN = 20;
const SAVE_KEY = "EndlessChase.Save.v1";
const MAX_UPGRADE = 5;
const COSTS = [50, 100, 200, 400, 800];

const PALETTE = {
  asphalt: 0x1c1f24,
  lane: 0xc9b896,
  curb: 0x8a8580,
  city: 0x6a655e,
  suburb: 0x5c6b45,
  highway: 0x5a6570,
  player: 0x2a2e33,
  playerAccent: 0x6b1d1d,
  police: 0x0e0e10,
  policeWhite: 0xe8e6e1,
  civA: 0x7a7e84,
  civB: 0x4a5560,
  civC: 0xc8c2b4,
  cross: 0x9a7b4f,
  coin: 0xd4af37,
  chrome: 0xb8bcc2,
  glass: 0x1a1e24,
  red: 0xc62828,
  yellow: 0xd4a017,
  green: 0x2e7d32,
  skyHaze: 0xc4a574,
  skyUpper: 0x6b8cae,
  sun: 0xffc98a,
};

// ---------- Save / Upgrades ----------
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { version: 1, coins: 0, topSpeedLevel: 0, accelerationLevel: 0, handlingLevel: 0 };
    const d = JSON.parse(raw);
    return {
      version: 1,
      coins: d.coins | 0,
      topSpeedLevel: d.topSpeedLevel | 0,
      accelerationLevel: d.accelerationLevel | 0,
      handlingLevel: d.handlingLevel | 0,
    };
  } catch {
    return { version: 1, coins: 0, topSpeedLevel: 0, accelerationLevel: 0, handlingLevel: 0 };
  }
}

function writeSave(data) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

const save = loadSave();

function topSpeedFactor() { return 1 + save.topSpeedLevel * 0.08; }
function accelFactor() { return 1 + save.accelerationLevel * 0.1; }
function handlingFactor() { return 1 + save.handlingLevel * 0.1; }
function costFor(level) { return level >= MAX_UPGRADE ? -1 : COSTS[Math.min(level, COSTS.length - 1)]; }

function tryUpgrade(key) {
  const level = save[key];
  const cost = costFor(level);
  if (cost < 0 || save.coins < cost) return false;
  save.coins -= cost;
  save[key] = level + 1;
  writeSave(save);
  return true;
}

class Pool {
  constructor(factory, prewarm = 0) {
    this.factory = factory;
    this.free = [];
    for (let i = 0; i < prewarm; i++) {
      const o = factory();
      o.visible = false;
      this.free.push(o);
    }
  }
  rent() {
    const o = this.free.length ? this.free.pop() : this.factory();
    o.visible = true;
    return o;
  }
  return(o) {
    o.visible = false;
    this.free.push(o);
  }
}

// ---------- DOM ----------
const canvas = document.getElementById("c");
const panels = {
  menu: document.getElementById("panel-menu"),
  hud: document.getElementById("panel-hud"),
  gameover: document.getElementById("panel-gameover"),
  upgrades: document.getElementById("panel-upgrades"),
};
const hudDistance = document.getElementById("hud-distance");
const hudCoins = document.getElementById("hud-coins");
const hudBoost = document.getElementById("hud-boost");
const hudLight = document.getElementById("hud-light");
const goScore = document.getElementById("go-score");
const goCoins = document.getElementById("go-coins");
const upCoins = document.getElementById("up-coins");
const upSpeedLabel = document.getElementById("up-speed-label");
const upAccelLabel = document.getElementById("up-accel-label");
const upHandlingLabel = document.getElementById("up-handling-label");
const btnUpSpeed = document.getElementById("btn-up-speed");
const btnUpAccel = document.getElementById("btn-up-accel");
const btnUpHandling = document.getElementById("btn-up-handling");

function showPanel(name) {
  for (const k of Object.keys(panels)) panels[k].classList.toggle("hidden", k !== name);
}

function refreshUpgradesUI() {
  upCoins.textContent = `Cash: $${save.coins}`;
  const bind = (labelEl, btn, title, key) => {
    const level = save[key];
    const cost = costFor(level);
    labelEl.textContent = `${title} Lv ${level}/${MAX_UPGRADE}` + (cost < 0 ? " (MAX)" : ` — $${cost}`);
    btn.disabled = cost < 0 || save.coins < cost;
  };
  bind(upSpeedLabel, btnUpSpeed, "Top Speed", "topSpeedLevel");
  bind(upAccelLabel, btnUpAccel, "Acceleration", "accelerationLevel");
  bind(upHandlingLabel, btnUpHandling, "Handling", "handlingLevel");
}

// ---------- Three.js scene (Fake GTA / golden-hour) ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(PALETTE.skyUpper);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(PALETTE.skyHaze, 35, 110);
scene.background = new THREE.Color(PALETTE.skyUpper);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);

const hemi = new THREE.HemisphereLight(PALETTE.skyHaze, 0x1c1f24, 0.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(PALETTE.sun, 1.35);
sun.position.set(-8, 14, 4);
scene.add(sun);
const fill = new THREE.DirectionalLight(PALETTE.skyUpper, 0.25);
fill.position.set(6, 4, -8);
scene.add(fill);

function stdMat(color, { metal = 0.05, rough = 0.85, emissive = 0x000000, emissiveIntensity = 0 } = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: metal,
    roughness: rough,
    emissive,
    emissiveIntensity,
  });
}

function boxMesh(w, h, d, color, opts) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stdMat(color, opts));
}

function makeCar(bodyColor, opts = {}) {
  const { accent = null, police = false } = opts;
  const root = new THREE.Group();

  const body = boxMesh(1.75, 0.5, 3.4, bodyColor, { metal: 0.65, rough: 0.35 });
  body.position.y = 0.48;
  root.add(body);

  const hood = boxMesh(1.7, 0.18, 0.9, bodyColor, { metal: 0.7, rough: 0.3 });
  hood.position.set(0, 0.72, 1.0);
  root.add(hood);

  const trunk = boxMesh(1.7, 0.2, 0.7, bodyColor, { metal: 0.65, rough: 0.38 });
  trunk.position.set(0, 0.7, -1.15);
  root.add(trunk);

  if (accent != null) {
    const stripe = boxMesh(0.35, 0.08, 2.8, accent, { metal: 0.4, rough: 0.45 });
    stripe.position.set(0, 0.76, 0.1);
    root.add(stripe);
  }

  if (police) {
    const doorL = boxMesh(0.08, 0.45, 1.4, PALETTE.policeWhite, { metal: 0.15, rough: 0.55 });
    doorL.position.set(-0.9, 0.5, 0.05);
    const doorR = boxMesh(0.08, 0.45, 1.4, PALETTE.policeWhite, { metal: 0.15, rough: 0.55 });
    doorR.position.set(0.9, 0.5, 0.05);
    root.add(doorL, doorR);
  }

  const cabin = boxMesh(1.35, 0.42, 1.5, PALETTE.glass, { metal: 0.1, rough: 0.15 });
  cabin.position.set(0, 0.98, -0.1);
  root.add(cabin);

  const bumperF = boxMesh(1.8, 0.22, 0.25, PALETTE.chrome, { metal: 0.9, rough: 0.25 });
  bumperF.position.set(0, 0.28, 1.7);
  const bumperR = boxMesh(1.8, 0.22, 0.25, PALETTE.chrome, { metal: 0.9, rough: 0.25 });
  bumperR.position.set(0, 0.28, -1.7);
  root.add(bumperF, bumperR);

  if (police) {
    const bar = boxMesh(1.05, 0.16, 0.4, PALETTE.policeWhite, { metal: 0.3, rough: 0.4 });
    bar.position.set(0, 1.28, 0.15);
    const r = boxMesh(0.28, 0.12, 0.22, PALETTE.red, { metal: 0.2, rough: 0.4, emissive: PALETTE.red, emissiveIntensity: 0.35 });
    r.position.set(-0.28, 1.38, 0.15);
    const b = boxMesh(0.28, 0.12, 0.22, 0x1565c0, { metal: 0.2, rough: 0.4, emissive: 0x1565c0, emissiveIntensity: 0.35 });
    b.position.set(0.28, 1.38, 0.15);
    root.add(bar, r, b);
  }

  for (const [x, z] of [[-0.78, 1.05], [0.78, 1.05], [-0.78, -1.05], [0.78, -1.05]]) {
    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.28, 10),
      stdMat(0x111111, { metal: 0.05, rough: 0.95 })
    );
    tire.rotation.z = Math.PI / 2;
    tire.position.set(x, 0.28, z);
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.3, 8),
      stdMat(PALETTE.chrome, { metal: 0.85, rough: 0.3 })
    );
    rim.rotation.z = Math.PI / 2;
    rim.position.set(x, 0.28, z);
    root.add(tire, rim);
  }

  root.userData.kind = "car";
  return root;
}

function makeTruck() {
  const root = new THREE.Group();
  const cab = boxMesh(2.05, 1.05, 1.5, PALETTE.cross, { metal: 0.35, rough: 0.55 });
  cab.position.set(0, 0.75, 1.0);
  const box = boxMesh(2.15, 1.35, 2.5, 0x8a7348, { metal: 0.15, rough: 0.7 });
  box.position.set(0, 0.95, -0.75);
  const bumper = boxMesh(2.2, 0.25, 0.3, PALETTE.chrome, { metal: 0.85, rough: 0.3 });
  bumper.position.set(0, 0.3, 1.75);
  root.add(cab, box, bumper);
  root.userData.kind = "cross";
  return root;
}

function makeCoin() {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.08, 12),
    stdMat(PALETTE.coin, { metal: 0.9, rough: 0.25, emissive: 0x443300, emissiveIntensity: 0.15 })
  );
  mesh.rotation.x = Math.PI / 2;
  mesh.userData.kind = "coin";
  return mesh;
}

function biomeAccent(biome) {
  if (biome === "suburb") return PALETTE.suburb;
  if (biome === "highway") return PALETTE.highway;
  return PALETTE.city;
}

function makeSegment(biome, intersection) {
  const root = new THREE.Group();
  const road = boxMesh(12, 0.15, SEG_LEN, PALETTE.asphalt, { metal: 0.02, rough: 0.92 });
  road.position.y = -0.05;
  root.add(road);

  for (const x of [-1.6, 1.6]) {
    for (let z = -SEG_LEN / 2 + 2; z < SEG_LEN / 2; z += 4) {
      const dash = boxMesh(0.14, 0.02, 1.4, PALETTE.lane, { metal: 0.05, rough: 0.8 });
      dash.position.set(x, 0.03, z);
      root.add(dash);
    }
  }

  const curbL = boxMesh(0.4, 0.25, SEG_LEN, PALETTE.curb, { metal: 0.05, rough: 0.88 });
  curbL.position.set(-6.1, 0.1, 0);
  const curbR = boxMesh(0.4, 0.25, SEG_LEN, PALETTE.curb, { metal: 0.05, rough: 0.88 });
  curbR.position.set(6.1, 0.1, 0);
  root.add(curbL, curbR);

  const accent = biomeAccent(biome);
  if (biome === "suburb") {
    const lawnL = boxMesh(3, 0.05, SEG_LEN, 0x4a5a38, { metal: 0, rough: 0.95 });
    lawnL.position.set(-8.5, 0, 0);
    const lawnR = boxMesh(3, 0.05, SEG_LEN, 0x4a5a38, { metal: 0, rough: 0.95 });
    lawnR.position.set(8.5, 0, 0);
    root.add(lawnL, lawnR);
    for (const side of [-1, 1]) {
      const house = boxMesh(3.2, 2.4, 4.5, 0xb8a990, { metal: 0.05, rough: 0.85 });
      house.position.set(side * 10, 1.2, 0);
      const roof = boxMesh(3.4, 0.35, 4.7, 0x5c4033, { metal: 0.1, rough: 0.8 });
      roof.position.set(side * 10, 2.5, 0);
      root.add(house, roof);
    }
  } else if (biome === "highway") {
    for (const side of [-1, 1]) {
      const rail = boxMesh(0.12, 0.55, SEG_LEN, PALETTE.chrome, { metal: 0.7, rough: 0.45 });
      rail.position.set(side * 6.4, 0.4, 0);
      root.add(rail);
    }
    const gantry = boxMesh(14, 0.35, 0.45, 0x3d4a3a, { metal: 0.4, rough: 0.55 });
    gantry.position.set(0, 4.3, 0);
    const postL = boxMesh(0.28, 4.2, 0.28, PALETTE.curb, { metal: 0.5, rough: 0.5 });
    postL.position.set(-6.5, 2.1, 0);
    const postR = boxMesh(0.28, 4.2, 0.28, PALETTE.curb, { metal: 0.5, rough: 0.5 });
    postR.position.set(6.5, 2.1, 0);
    root.add(gantry, postL, postR);
  } else {
    for (const side of [-1, 1]) {
      const b1 = boxMesh(3.6, 7 + Math.random() * 3, 6.5, accent, {
        metal: 0.08,
        rough: 0.82,
        emissive: 0x332211,
        emissiveIntensity: 0.08,
      });
      b1.position.set(side * 10.2, 3.8, -2);
      const b2 = boxMesh(3.2, 5 + Math.random() * 2, 5, 0x4a4844, { metal: 0.06, rough: 0.88 });
      b2.position.set(side * 10.8, 2.8, 5);
      root.add(b1, b2);
    }
  }

  let lightGroup = null;
  if (intersection) {
    const zebra = boxMesh(10, 0.03, 2.5, 0xd0cbc0, { metal: 0.05, rough: 0.75 });
    zebra.position.set(0, 0.04, 0);
    root.add(zebra);
    lightGroup = new THREE.Group();
    const pole = boxMesh(0.18, 3.4, 0.18, 0x333333, { metal: 0.6, rough: 0.4 });
    pole.position.set(-5.5, 1.7, 2);
    const lamp = boxMesh(0.5, 1.15, 0.35, 0x222222, { metal: 0.5, rough: 0.45 });
    lamp.position.set(-5.5, 3.3, 2);
    const bulb = boxMesh(0.35, 0.35, 0.2, PALETTE.green, {
      metal: 0.2,
      rough: 0.35,
      emissive: PALETTE.green,
      emissiveIntensity: 0.5,
    });
    bulb.position.set(-5.5, 3.5, 2.2);
    bulb.name = "bulb";
    lightGroup.add(pole, lamp, bulb);
    root.add(lightGroup);
  }

  root.userData = {
    biome,
    intersection,
    lightGroup,
    lightState: "green",
    lightTimer: 1.5 + Math.random(),
    resolved: false,
  };
  return root;
}

// ---------- Game state ----------
let running = false;
let alive = false;
let lane = 1;
let laneX = 0;
let laneVel = 0;
let playerZ = 0;
let speed = 0;
let distance = 0;
let runCoins = 0;
let boostTimer = 0;
let boostMul = 1;
let nextSpawnZ = 0;
let spawnIndex = 0;
let fromGameOver = false;

const activeSegments = [];
const activeTraffic = [];
const activeCoins = [];
const activeCross = [];

const player = makeCar(PALETTE.player, { accent: PALETTE.playerAccent });
scene.add(player);

const segmentPool = {
  city: new Pool(() => { const s = makeSegment("city", false); scene.add(s); return s; }, 4),
  cityI: new Pool(() => { const s = makeSegment("city", true); scene.add(s); return s; }, 2),
  suburb: new Pool(() => { const s = makeSegment("suburb", false); scene.add(s); return s; }, 3),
  suburbI: new Pool(() => { const s = makeSegment("suburb", true); scene.add(s); return s; }, 2),
  highway: new Pool(() => { const s = makeSegment("highway", false); scene.add(s); return s; }, 3),
  highwayI: new Pool(() => { const s = makeSegment("highway", true); scene.add(s); return s; }, 1),
};

const carPool = new Pool(() => {
  const colors = [PALETTE.civA, PALETTE.civB, PALETTE.civC];
  const c = makeCar(colors[(Math.random() * colors.length) | 0]);
  scene.add(c);
  return c;
}, 8);
const policePool = new Pool(() => {
  const c = makeCar(PALETTE.police, { police: true });
  scene.add(c);
  return c;
}, 2);
const crossPool = new Pool(() => { const c = makeTruck(); scene.add(c); return c; }, 3);
const coinPool = new Pool(() => { const c = makeCoin(); scene.add(c); return c; }, 10);

function currentBiome() {
  if (distance < 400) return "city";
  if (distance < 900) return "suburb";
  return "highway";
}

function recycleSegment(seg) {
  seg.visible = false;
  const b = seg.userData.biome;
  const i = seg.userData.intersection;
  if (b === "city") (i ? segmentPool.cityI : segmentPool.city).return(seg);
  else if (b === "suburb") (i ? segmentPool.suburbI : segmentPool.suburb).return(seg);
  else (i ? segmentPool.highwayI : segmentPool.highway).return(seg);
}

function spawnSegment() {
  const biome = currentBiome();
  const wantI = spawnIndex > 2 && Math.random() < 0.22;
  let seg;
  if (biome === "city") seg = (wantI ? segmentPool.cityI : segmentPool.city).rent();
  else if (biome === "suburb") seg = (wantI ? segmentPool.suburbI : segmentPool.suburb).rent();
  else seg = (wantI ? segmentPool.highwayI : segmentPool.highway).rent();

  seg.userData.resolved = false;
  seg.userData.lightState = "green";
  seg.userData.lightTimer = 1.2 + Math.random() * 1.5;
  seg.position.set(0, 0, nextSpawnZ + SEG_LEN / 2);
  activeSegments.push(seg);

  if (Math.random() < 0.55) {
    const coin = coinPool.rent();
    const lx = LANE_X[(Math.random() * 3) | 0];
    coin.position.set(lx, 1.0, nextSpawnZ + SEG_LEN * 0.5);
    activeCoins.push(coin);
  }

  nextSpawnZ += SEG_LEN;
  spawnIndex++;
}

function clearWorld() {
  while (activeSegments.length) recycleSegment(activeSegments.pop());
  while (activeTraffic.length) {
    const t = activeTraffic.pop();
    (t.userData.police ? policePool : carPool).return(t);
  }
  while (activeCross.length) crossPool.return(activeCross.pop());
  while (activeCoins.length) coinPool.return(activeCoins.pop());
}

function startRun() {
  clearWorld();
  running = true;
  alive = true;
  lane = 1;
  laneX = LANE_X[1];
  laneVel = 0;
  playerZ = 0;
  speed = 12;
  distance = 0;
  runCoins = 0;
  boostTimer = 0;
  boostMul = 1;
  nextSpawnZ = 0;
  spawnIndex = 0;
  player.position.set(laneX, 0, 0);
  player.rotation.set(0, 0, 0);
  for (let i = 0; i < 10; i++) spawnSegment();
  showPanel("hud");
  hudCoins.textContent = `$${save.coins}`;
  trafficTimer = 0.8;
}

function crash() {
  if (!alive) return;
  alive = false;
  running = false;
  goScore.textContent = `${Math.floor(distance)} m`;
  goCoins.textContent = `+$${runCoins}`;
  writeSave(save);
  fromGameOver = true;
  showPanel("gameover");
}

let touchStart = null;
const MIN_SWIPE = 40;

function onSwipe(dir) {
  if (!running || !alive) return;
  if (dir === "left") lane = Math.max(0, lane - 1);
  if (dir === "right") lane = Math.min(2, lane + 1);
}

function pointerDown(x, y) {
  touchStart = { x, y, t: performance.now() };
}
function pointerUp(x, y) {
  if (!touchStart) return;
  const dx = x - touchStart.x;
  const dy = y - touchStart.y;
  const dt = performance.now() - touchStart.t;
  touchStart = null;
  if (dt > 450) return;
  if (Math.hypot(dx, dy) < MIN_SWIPE) return;
  if (Math.abs(dx) > Math.abs(dy)) onSwipe(dx > 0 ? "right" : "left");
}

canvas.addEventListener("touchstart", (e) => {
  if (e.cancelable) e.preventDefault();
  const t = e.changedTouches[0];
  pointerDown(t.clientX, t.clientY);
}, { passive: false });
canvas.addEventListener("touchmove", (e) => {
  if (e.cancelable) e.preventDefault();
}, { passive: false });
canvas.addEventListener("touchend", (e) => {
  if (e.cancelable) e.preventDefault();
  const t = e.changedTouches[0];
  pointerUp(t.clientX, t.clientY);
}, { passive: false });
canvas.addEventListener("mousedown", (e) => pointerDown(e.clientX, e.clientY));
canvas.addEventListener("mouseup", (e) => pointerUp(e.clientX, e.clientY));

window.addEventListener("keydown", (e) => {
  if (e.key === "a" || e.key === "ArrowLeft") onSwipe("left");
  if (e.key === "d" || e.key === "ArrowRight") onSwipe("right");
});

document.body.addEventListener("touchmove", (e) => {
  if (e.target === canvas || canvas.contains(e.target)) {
    if (e.cancelable) e.preventDefault();
  }
}, { passive: false });

document.getElementById("btn-play").onclick = () => startRun();
document.getElementById("btn-retry").onclick = () => startRun();
document.getElementById("btn-menu").onclick = () => { fromGameOver = false; showPanel("menu"); };
document.getElementById("btn-upgrades-menu").onclick = () => {
  fromGameOver = false;
  refreshUpgradesUI();
  showPanel("upgrades");
};
document.getElementById("btn-upgrades-go").onclick = () => {
  fromGameOver = true;
  refreshUpgradesUI();
  showPanel("upgrades");
};
document.getElementById("btn-up-back").onclick = () => {
  showPanel(fromGameOver ? "gameover" : "menu");
};
btnUpSpeed.onclick = () => { if (tryUpgrade("topSpeedLevel")) refreshUpgradesUI(); };
btnUpAccel.onclick = () => { if (tryUpgrade("accelerationLevel")) refreshUpgradesUI(); };
btnUpHandling.onclick = () => { if (tryUpgrade("handlingLevel")) refreshUpgradesUI(); };

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let trafficTimer = 0;
let last = performance.now();

function updateLightVisual(seg) {
  const bulb = seg.userData.lightGroup?.getObjectByName("bulb");
  if (!bulb) return;
  const s = seg.userData.lightState;
  const hex = s === "red" ? PALETTE.red : s === "yellow" ? PALETTE.yellow : PALETTE.green;
  bulb.material.color.setHex(hex);
  bulb.material.emissive.setHex(hex);
  bulb.material.emissiveIntensity = 0.55;
}

function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (running && alive) {
    const targetSpeed = 18 * topSpeedFactor() * (boostTimer > 0 ? boostMul : 1);
    speed = THREE.MathUtils.damp(speed, targetSpeed, 3 * accelFactor(), dt);

    playerZ += speed * dt;
    distance = playerZ;

    const smooth = THREE.MathUtils.lerp(0.18, 0.08, Math.min(1, (handlingFactor() - 1) / 0.5));
    const targetX = LANE_X[lane];
    const omega = 2 / Math.max(0.05, smooth);
    const x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = laneX - targetX;
    const temp = (laneVel + omega * change) * dt;
    laneVel = (laneVel - omega * temp) * exp;
    laneX = targetX + (change + temp) * exp;

    player.position.set(laneX, 0, playerZ);

    if (boostTimer > 0) {
      boostTimer -= dt;
      if (boostTimer <= 0) { boostTimer = 0; boostMul = 1; }
    }

    camera.position.set(laneX * 0.35, 6.2, playerZ - 11.5);
    camera.lookAt(laneX, 1.1, playerZ + 9);

    while (nextSpawnZ < playerZ + 8 * SEG_LEN) spawnSegment();

    for (let i = activeSegments.length - 1; i >= 0; i--) {
      const seg = activeSegments[i];
      if (seg.position.z + SEG_LEN < playerZ - 2 * SEG_LEN) {
        activeSegments.splice(i, 1);
        recycleSegment(seg);
        continue;
      }

      if (seg.userData.intersection && seg.userData.lightGroup) {
        seg.userData.lightTimer -= dt;
        if (seg.userData.lightTimer <= 0) {
          const order = ["green", "yellow", "red"];
          const idx = order.indexOf(seg.userData.lightState);
          seg.userData.lightState = order[(idx + 1) % 3];
          seg.userData.lightTimer = seg.userData.lightState === "yellow" ? 0.7 : 2.0;
          updateLightVisual(seg);
        }

        const dz = Math.abs(playerZ - seg.position.z);
        if (!seg.userData.resolved && dz < 4) {
          seg.userData.resolved = true;
          if (seg.userData.lightState === "red") {
            boostTimer = 2.5;
            boostMul = 1.35;
            const truck = crossPool.rent();
            truck.position.set(-12, 0, seg.position.z);
            truck.userData.vx = 22;
            activeCross.push(truck);
            hudLight.textContent = "RED LIGHT — NOS";
            hudLight.style.color = "#e57373";
            hudLight.classList.remove("hidden");
          } else {
            hudLight.textContent = "GREEN — clear";
            hudLight.style.color = "#81c784";
            hudLight.classList.remove("hidden");
          }
          setTimeout(() => hudLight.classList.add("hidden"), 1200);
        }
      }
    }

    trafficTimer -= dt;
    if (trafficTimer <= 0) {
      trafficTimer = Math.max(0.65, 1.4 - distance / 2000);
      const police = Math.random() < 0.12;
      const car = (police ? policePool : carPool).rent();
      let tLane = (Math.random() * 3) | 0;
      if (tLane === lane && Math.random() < 0.4) tLane = (tLane + 1) % 3;
      car.position.set(LANE_X[tLane], 0, playerZ + 40 + Math.random() * 30);
      car.userData.police = police;
      car.userData.speed = police ? speed * 0.9 : 6 + Math.random() * 6;
      car.userData.lane = tLane;
      activeTraffic.push(car);
    }

    for (let i = activeTraffic.length - 1; i >= 0; i--) {
      const t = activeTraffic[i];
      t.position.z += t.userData.speed * dt;
      if (t.position.z < playerZ - 20 || t.position.z > playerZ + 90) {
        activeTraffic.splice(i, 1);
        (t.userData.police ? policePool : carPool).return(t);
        continue;
      }
      if (Math.abs(t.position.z - playerZ) < 2.2 && Math.abs(t.position.x - laneX) < 1.3) {
        crash();
      }
    }

    for (let i = activeCross.length - 1; i >= 0; i--) {
      const t = activeCross[i];
      t.position.x += t.userData.vx * dt;
      if (t.position.x > 14) {
        activeCross.splice(i, 1);
        crossPool.return(t);
        continue;
      }
      if (Math.abs(t.position.z - playerZ) < 2.5 && Math.abs(t.position.x - laneX) < 2.0) {
        crash();
      }
    }

    for (let i = activeCoins.length - 1; i >= 0; i--) {
      const c = activeCoins[i];
      c.rotation.z += dt * 3;
      if (c.position.z < playerZ - 10) {
        activeCoins.splice(i, 1);
        coinPool.return(c);
        continue;
      }
      if (Math.abs(c.position.z - playerZ) < 1.2 && Math.abs(c.position.x - laneX) < 1.2) {
        activeCoins.splice(i, 1);
        coinPool.return(c);
        runCoins += 1;
        save.coins += 1;
        writeSave(save);
      }
    }

    hudDistance.textContent = `${Math.floor(distance)} m`;
    hudCoins.textContent = `$${save.coins}`;
    hudBoost.classList.toggle("hidden", boostTimer <= 0);
  } else if (!running) {
    camera.position.set(2.5, 5.5, -10);
    camera.lookAt(-0.5, 1.2, 4);
    player.position.set(0, 0, 0);
    player.rotation.y += dt * 0.35;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

showPanel("menu");
requestAnimationFrame(tick);

window.__endlessChase = {
  startRun,
  getSave: () => ({ ...save }),
  getState: () => ({ running, alive, distance, lane, coins: save.coins }),
};
