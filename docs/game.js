/**
 * Endless Chase — Retro NES WebGL client
 * Low-res nearest-neighbor CRT look, procedural NES-palette pixel textures.
 * Gameplay: 3-lane chase, pools, biomes, red-light risk/reward, upgrades/save.
 */
import * as THREE from "three";

const LANE_X = [-3.2, 0, 3.2];
const SEG_LEN = 20;
const SAVE_KEY = "EndlessChase.Save.v1";
const MAX_UPGRADE = 5;
const COSTS = [50, 100, 200, 400, 800];
const NES_W = 320;
const NES_H = 180;
const ASSET = "assets/nes";

const NES = {
  black: 0x000000,
  navy: 0x1d2b53,
  sky: 0x83769c,
  white: 0xfff1e8,
  red: 0xff004d,
  orange: 0xffa300,
  yellow: 0xffec27,
  green: 0x00e436,
  asphalt: 0x292a32,
  curb: 0x5a5a6e,
};

// ---------- Save ----------
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
  upCoins.textContent = `CASH $${save.coins}`;
  const bind = (labelEl, btn, title, key) => {
    const level = save[key];
    const cost = costFor(level);
    labelEl.textContent = `${title} ${level}/${MAX_UPGRADE}` + (cost < 0 ? " MAX" : ` $${cost}`);
    btn.disabled = cost < 0 || save.coins < cost;
  };
  bind(upSpeedLabel, btnUpSpeed, "SPEED", "topSpeedLevel");
  bind(upAccelLabel, btnUpAccel, "ACCEL", "accelerationLevel");
  bind(upHandlingLabel, btnUpHandling, "HANDL", "handlingLevel");
}

// ---------- Renderer: native NES-ish resolution, CSS upscale ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(1);
renderer.setSize(NES_W, NES_H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(NES.navy);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(NES.navy, 28, 85);

const camera = new THREE.PerspectiveCamera(50, NES_W / NES_H, 0.1, 200);

const loader = new THREE.TextureLoader();
function loadTex(file, { repeatX = 1, repeatY = 1 } = {}) {
  const t = loader.load(`${ASSET}/${file}`);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  return t;
}

const tex = {
  road: loadTex("road.png", { repeatX: 1, repeatY: 2 }),
  building: loadTex("building.png"),
  house: loadTex("house.png"),
  sky: loadTex("sky.png"),
  player: loadTex("car_player.png"),
  police: loadTex("car_police.png"),
  civA: loadTex("car_civ_a.png"),
  civB: loadTex("car_civ_b.png"),
  civC: loadTex("car_civ_c.png"),
  truck: loadTex("car_truck.png"),
  coin: loadTex("coin.png"),
  light: loadTex("traffic_light.png"),
  curb: loadTex("curb.png", { repeatX: 1, repeatY: 4 }),
};

// Unlit = NES flat (no PBR)
function basic(map, color = 0xffffff) {
  return new THREE.MeshBasicMaterial({ map, color, transparent: !!map, alphaTest: map ? 0.1 : 0 });
}
function basicColor(color) {
  return new THREE.MeshBasicMaterial({ color });
}

// Sky dome strip
{
  const skyGeo = new THREE.SphereGeometry(90, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const skyMat = new THREE.MeshBasicMaterial({ map: tex.sky, side: THREE.BackSide });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.position.y = -2;
  scene.add(sky);
}

function makeCar(spriteTex) {
  const root = new THREE.Group();
  // Chunky body (palette block)
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 2.8), basicColor(0x1a1c2c));
  body.position.y = 0.4;
  root.add(body);
  // Pixel sprite billboard on top (readable NES car art)
  const card = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 2.7),
    new THREE.MeshBasicMaterial({ map: spriteTex, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide })
  );
  card.rotation.x = -Math.PI / 2;
  card.position.y = 0.72;
  root.add(card);
  // Side decals
  const sideL = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.9),
    new THREE.MeshBasicMaterial({ map: spriteTex, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide })
  );
  sideL.position.set(-0.76, 0.55, 0);
  sideL.rotation.y = Math.PI / 2;
  const sideR = sideL.clone();
  sideR.position.x = 0.76;
  sideR.rotation.y = -Math.PI / 2;
  root.add(sideL, sideR);
  root.userData.kind = "car";
  return root;
}

function makeTruck() {
  return makeCar(tex.truck);
}

function makeCoin() {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.9),
    new THREE.MeshBasicMaterial({ map: tex.coin, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide })
  );
  mesh.userData.kind = "coin";
  return mesh;
}

function makeSegment(biome, intersection) {
  const root = new THREE.Group();

  const roadMat = basic(tex.road);
  roadMat.map = tex.road.clone();
  roadMat.map.needsUpdate = true;
  roadMat.map.wrapS = roadMat.map.wrapT = THREE.RepeatWrapping;
  roadMat.map.repeat.set(1, 2);
  roadMat.map.magFilter = THREE.NearestFilter;
  roadMat.map.minFilter = THREE.NearestFilter;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(12, SEG_LEN), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.01;
  root.add(road);

  const curbMat = basic(tex.curb);
  for (const x of [-6.2, 6.2]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, SEG_LEN), curbMat);
    c.position.set(x, 0.15, 0);
    root.add(c);
  }

  if (biome === "suburb") {
    for (const side of [-1, 1]) {
      const grass = new THREE.Mesh(new THREE.PlaneGeometry(4, SEG_LEN), basicColor(0x008751));
      grass.rotation.x = -Math.PI / 2;
      grass.position.set(side * 9, 0.02, 0);
      root.add(grass);
      const house = new THREE.Mesh(new THREE.BoxGeometry(3.5, 2.8, 4), basic(tex.house));
      house.position.set(side * 10, 1.4, 0);
      root.add(house);
    }
  } else if (biome === "highway") {
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, SEG_LEN), basicColor(0xc2c3c7));
      rail.position.set(side * 6.5, 0.4, 0);
      root.add(rail);
    }
    const gantry = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 0.4), basicColor(0x008751));
    gantry.position.set(0, 4, 0);
    root.add(gantry);
    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), basicColor(0x5a5a6e));
    postL.position.set(-6.5, 2, 0);
    const postR = postL.clone();
    postR.position.x = 6.5;
    root.add(postL, postR);
  } else {
    for (const side of [-1, 1]) {
      const h1 = 5 + (Math.random() * 4) | 0;
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(3.8, h1, 6), basic(tex.building));
      b1.position.set(side * 10.2, h1 / 2, -2);
      const h2 = 4 + (Math.random() * 3) | 0;
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(3.2, h2, 5), basic(tex.building));
      b2.position.set(side * 10.8, h2 / 2, 5);
      root.add(b1, b2);
    }
  }

  let lightGroup = null;
  if (intersection) {
    const zebra = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.2), basicColor(0xfff1e8));
    zebra.rotation.x = -Math.PI / 2;
    zebra.position.y = 0.03;
    root.add(zebra);
    lightGroup = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.2, 0.2), basicColor(0xc2c3c7));
    pole.position.set(-5.5, 1.6, 2);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 2.4),
      new THREE.MeshBasicMaterial({ map: tex.light, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide })
    );
    sign.position.set(-5.5, 3.2, 2);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.2), basicColor(NES.green));
    bulb.position.set(-5.5, 3.5, 2.15);
    bulb.name = "bulb";
    lightGroup.add(pole, sign, bulb);
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

// ---------- State ----------
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
let trafficTimer = 0;

const activeSegments = [];
const activeTraffic = [];
const activeCoins = [];
const activeCross = [];

const player = makeCar(tex.player);
scene.add(player);

const segmentPool = {
  city: new Pool(() => { const s = makeSegment("city", false); scene.add(s); return s; }, 4),
  cityI: new Pool(() => { const s = makeSegment("city", true); scene.add(s); return s; }, 2),
  suburb: new Pool(() => { const s = makeSegment("suburb", false); scene.add(s); return s; }, 3),
  suburbI: new Pool(() => { const s = makeSegment("suburb", true); scene.add(s); return s; }, 2),
  highway: new Pool(() => { const s = makeSegment("highway", false); scene.add(s); return s; }, 3),
  highwayI: new Pool(() => { const s = makeSegment("highway", true); scene.add(s); return s; }, 1),
};

const civTex = [tex.civA, tex.civB, tex.civC];
const carPool = new Pool(() => {
  const c = makeCar(civTex[(Math.random() * civTex.length) | 0]);
  scene.add(c);
  return c;
}, 8);
const policePool = new Pool(() => { const c = makeCar(tex.police); scene.add(c); return c; }, 2);
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
    coin.position.set(LANE_X[(Math.random() * 3) | 0], 1.0, nextSpawnZ + SEG_LEN * 0.5);
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
function pointerDown(x, y) { touchStart = { x, y, t: performance.now() }; }
function pointerUp(x, y) {
  if (!touchStart) return;
  const dx = x - touchStart.x;
  const dy = y - touchStart.y;
  const dt = performance.now() - touchStart.t;
  touchStart = null;
  if (dt > 450 || Math.hypot(dx, dy) < MIN_SWIPE) return;
  if (Math.abs(dx) > Math.abs(dy)) onSwipe(dx > 0 ? "right" : "left");
}

canvas.addEventListener("touchstart", (e) => { if (e.cancelable) e.preventDefault(); pointerDown(e.changedTouches[0].clientX, e.changedTouches[0].clientY); }, { passive: false });
canvas.addEventListener("touchmove", (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
canvas.addEventListener("touchend", (e) => { if (e.cancelable) e.preventDefault(); pointerUp(e.changedTouches[0].clientX, e.changedTouches[0].clientY); }, { passive: false });
canvas.addEventListener("mousedown", (e) => pointerDown(e.clientX, e.clientY));
canvas.addEventListener("mouseup", (e) => pointerUp(e.clientX, e.clientY));
window.addEventListener("keydown", (e) => {
  if (e.key === "a" || e.key === "ArrowLeft") onSwipe("left");
  if (e.key === "d" || e.key === "ArrowRight") onSwipe("right");
});
document.body.addEventListener("touchmove", (e) => {
  if (e.target === canvas || canvas.contains(e.target)) { if (e.cancelable) e.preventDefault(); }
}, { passive: false });

document.getElementById("btn-play").onclick = () => startRun();
document.getElementById("btn-retry").onclick = () => startRun();
document.getElementById("btn-menu").onclick = () => { fromGameOver = false; showPanel("menu"); };
document.getElementById("btn-upgrades-menu").onclick = () => { fromGameOver = false; refreshUpgradesUI(); showPanel("upgrades"); };
document.getElementById("btn-upgrades-go").onclick = () => { fromGameOver = true; refreshUpgradesUI(); showPanel("upgrades"); };
document.getElementById("btn-up-back").onclick = () => showPanel(fromGameOver ? "gameover" : "menu");
btnUpSpeed.onclick = () => { if (tryUpgrade("topSpeedLevel")) refreshUpgradesUI(); };
btnUpAccel.onclick = () => { if (tryUpgrade("accelerationLevel")) refreshUpgradesUI(); };
btnUpHandling.onclick = () => { if (tryUpgrade("handlingLevel")) refreshUpgradesUI(); };

function layoutCanvas() {
  // Keep internal NES resolution; CSS scales with pixelated filtering
  renderer.setSize(NES_W, NES_H, false);
  camera.aspect = NES_W / NES_H;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", layoutCanvas);
layoutCanvas();

function updateLightVisual(seg) {
  const bulb = seg.userData.lightGroup?.getObjectByName("bulb");
  if (!bulb) return;
  const s = seg.userData.lightState;
  bulb.material.color.setHex(s === "red" ? NES.red : s === "yellow" ? NES.yellow : NES.green);
}

let last = performance.now();
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
    // Pixel-snap lateral for NES feel
    player.position.set(Math.round(laneX * 8) / 8, 0, playerZ);

    if (boostTimer > 0) {
      boostTimer -= dt;
      if (boostTimer <= 0) { boostTimer = 0; boostMul = 1; }
    }

    camera.position.set(Math.round(laneX * 0.3 * 4) / 4, 5.8, playerZ - 11);
    camera.lookAt(laneX, 1.0, playerZ + 8);

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
            hudLight.textContent = "RED! BOOST";
            hudLight.style.color = "#ff004d";
            hudLight.classList.remove("hidden");
          } else {
            hudLight.textContent = "GREEN OK";
            hudLight.style.color = "#00e436";
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
      if (Math.abs(t.position.z - playerZ) < 2.2 && Math.abs(t.position.x - laneX) < 1.3) crash();
    }

    for (let i = activeCross.length - 1; i >= 0; i--) {
      const t = activeCross[i];
      t.position.x += t.userData.vx * dt;
      if (t.position.x > 14) {
        activeCross.splice(i, 1);
        crossPool.return(t);
        continue;
      }
      if (Math.abs(t.position.z - playerZ) < 2.5 && Math.abs(t.position.x - laneX) < 2.0) crash();
    }

    for (let i = activeCoins.length - 1; i >= 0; i--) {
      const c = activeCoins[i];
      c.rotation.y += dt * 4;
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
    camera.position.set(2, 5, -9);
    camera.lookAt(0, 1, 3);
    player.position.set(0, 0, 0);
    player.rotation.y += dt * 0.5;
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
