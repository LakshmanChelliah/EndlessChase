/**
 * Endless Chase — playable WebGL client (Three.js)
 * Mirrors Unity systems: 3-lane lerp, pooled tiles/traffic, red-light risk/reward,
 * upgrades + localStorage save. Mobile-safe touch (no page scroll / pull-to-refresh).
 */
import * as THREE from "three";

const LANE_X = [-3.2, 0, 3.2];
const SEG_LEN = 20;
const SAVE_KEY = "EndlessChase.Save.v1";
const MAX_UPGRADE = 5;
const COSTS = [50, 100, 200, 400, 800];

const PALETTE = {
  asphalt: 0x2b2f3a,
  lane: 0xf5e6a8,
  curb: 0xc4c8d0,
  city: 0xff4d6d,
  suburb: 0x3ddc97,
  highway: 0x4cc9f0,
  player: 0xffb703,
  playerStripe: 0xfb8500,
  police: 0x1d4ed8,
  policeWhite: 0xf8fafc,
  civTeal: 0x4a90a4,
  civCoral: 0xff6b6b,
  civCream: 0xf4f1de,
  cross: 0xe9c46a,
  coin: 0xffe66d,
  red: 0xef233c,
  yellow: 0xffd60a,
  green: 0x06d6a0,
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

// ---------- Object pool ----------
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
  upCoins.textContent = `Coins: ${save.coins}`;
  const bind = (labelEl, btn, title, key) => {
    const level = save[key];
    const cost = costFor(level);
    labelEl.textContent = `${title} Lv ${level}/${MAX_UPGRADE}` + (cost < 0 ? " (MAX)" : ` — ${cost}`);
    btn.disabled = cost < 0 || save.coins < cost;
  };
  bind(upSpeedLabel, btnUpSpeed, "Top Speed", "topSpeedLevel");
  bind(upAccelLabel, btnUpAccel, "Acceleration", "accelerationLevel");
  bind(upHandlingLabel, btnUpHandling, "Handling", "handlingLevel");
}

// ---------- Three.js scene ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x7bdff2);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xffcad4, 40, 120);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
const hemi = new THREE.HemisphereLight(0xffcad4, 0x2b2f3a, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 0.55);
sun.position.set(4, 10, -2);
scene.add(sun);

function boxMesh(w, h, d, color) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
  return m;
}

function makeCar(bodyColor, stripeColor = null, police = false) {
  const root = new THREE.Group();
  const body = boxMesh(1.6, 0.55, 3.2, bodyColor);
  body.position.y = 0.45;
  root.add(body);
  if (stripeColor != null) {
    const stripe = boxMesh(1.65, 0.12, 1.2, stripeColor);
    stripe.position.set(0, 0.7, 0.2);
    root.add(stripe);
  }
  const cabin = boxMesh(1.2, 0.4, 1.4, 0x1b1b2f);
  cabin.position.set(0, 0.95, -0.15);
  root.add(cabin);
  if (police) {
    const bar = boxMesh(1.0, 0.18, 0.35, 0xf8fafc);
    bar.position.set(0, 1.2, 0.1);
    root.add(bar);
    const r = boxMesh(0.25, 0.12, 0.2, PALETTE.red);
    r.position.set(-0.25, 1.32, 0.1);
    const b = boxMesh(0.25, 0.12, 0.2, PALETTE.police);
    b.position.set(0.25, 1.32, 0.1);
    root.add(r, b);
  }
  for (const [x, z] of [[-0.7, 1.0], [0.7, 1.0], [-0.7, -1.0], [0.7, -1.0]]) {
    const w = boxMesh(0.35, 0.35, 0.55, 0x111111);
    w.position.set(x, 0.2, z);
    root.add(w);
  }
  root.userData.kind = "car";
  return root;
}

function makeTruck() {
  const root = new THREE.Group();
  const cab = boxMesh(2.0, 1.0, 1.4, PALETTE.cross);
  cab.position.set(0, 0.7, 0.9);
  const box = boxMesh(2.1, 1.3, 2.4, 0xd4a84b);
  box.position.set(0, 0.9, -0.7);
  root.add(cab, box);
  root.userData.kind = "cross";
  return root;
}

function makeCoin() {
  const mesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.35, 0),
    new THREE.MeshLambertMaterial({ color: PALETTE.coin, emissive: 0x665500 })
  );
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
  const road = boxMesh(12, 0.15, SEG_LEN, PALETTE.asphalt);
  road.position.y = -0.05;
  root.add(road);

  for (const x of [-1.6, 1.6]) {
    for (let z = -SEG_LEN / 2 + 2; z < SEG_LEN / 2; z += 4) {
      const dash = boxMesh(0.15, 0.02, 1.5, PALETTE.lane);
      dash.position.set(x, 0.03, z);
      root.add(dash);
    }
  }

  const curbL = boxMesh(0.4, 0.25, SEG_LEN, PALETTE.curb);
  curbL.position.set(-6.1, 0.1, 0);
  const curbR = boxMesh(0.4, 0.25, SEG_LEN, PALETTE.curb);
  curbR.position.set(6.1, 0.1, 0);
  root.add(curbL, curbR);

  const accent = biomeAccent(biome);
  if (biome === "suburb") {
    const lawnL = boxMesh(3, 0.05, SEG_LEN, PALETTE.suburb);
    lawnL.position.set(-8.5, 0, 0);
    const lawnR = boxMesh(3, 0.05, SEG_LEN, PALETTE.suburb);
    lawnR.position.set(8.5, 0, 0);
    root.add(lawnL, lawnR);
    for (const side of [-1, 1]) {
      const trunk = boxMesh(0.3, 1.2, 0.3, 0x6b4f2a);
      trunk.position.set(side * 9, 0.6, -4);
      const leaf = new THREE.Mesh(
        new THREE.ConeGeometry(1.1, 2.2, 5),
        new THREE.MeshLambertMaterial({ color: PALETTE.suburb })
      );
      leaf.position.set(side * 9, 2.0, -4);
      root.add(trunk, leaf);
    }
  } else if (biome === "highway") {
    for (const side of [-1, 1]) {
      const rail = boxMesh(0.15, 0.5, SEG_LEN, PALETTE.curb);
      rail.position.set(side * 6.4, 0.4, 0);
      root.add(rail);
    }
    const gantry = boxMesh(14, 0.3, 0.4, accent);
    gantry.position.set(0, 4.2, 0);
    const postL = boxMesh(0.3, 4, 0.3, PALETTE.curb);
    postL.position.set(-6.5, 2, 0);
    const postR = boxMesh(0.3, 4, 0.3, PALETTE.curb);
    postR.position.set(6.5, 2, 0);
    root.add(gantry, postL, postR);
  } else {
    for (const side of [-1, 1]) {
      const b1 = boxMesh(3.5, 6 + Math.random() * 4, 6, accent);
      b1.position.set(side * 10, 3.5, -2);
      const b2 = boxMesh(3, 4 + Math.random() * 3, 5, 0x4a5068);
      b2.position.set(side * 10.5, 2.5, 5);
      root.add(b1, b2);
    }
  }

  let lightGroup = null;
  if (intersection) {
    const zebra = boxMesh(10, 0.03, 2.5, 0xe8e8e8);
    zebra.position.set(0, 0.04, 0);
    root.add(zebra);
    lightGroup = new THREE.Group();
    const pole = boxMesh(0.2, 3.2, 0.2, 0x333333);
    pole.position.set(-5.5, 1.6, 2);
    const lamp = boxMesh(0.5, 1.2, 0.35, 0x222222);
    lamp.position.set(-5.5, 3.2, 2);
    const bulb = boxMesh(0.35, 0.35, 0.2, PALETTE.green);
    bulb.position.set(-5.5, 3.4, 2.2);
    bulb.name = "bulb";
    lightGroup.add(pole, lamp, bulb);
    root.add(lightGroup);
  }

  root.userData = { biome, intersection, lightGroup, lightState: "green", lightTimer: 1.5 + Math.random(), resolved: false };
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

const player = makeCar(PALETTE.player, PALETTE.playerStripe);
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
  const colors = [PALETTE.civTeal, PALETTE.civCoral, PALETTE.civCream];
  const c = makeCar(colors[(Math.random() * colors.length) | 0]);
  scene.add(c);
  return c;
}, 8);
const policePool = new Pool(() => { const c = makeCar(PALETTE.police, null, true); scene.add(c); return c; }, 2);
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

  // Reset runtime fields (pool may reuse intersection meshes)
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
  hudCoins.textContent = String(save.coins);
  trafficTimer = 0.8;
}

function crash() {
  if (!alive) return;
  alive = false;
  running = false;
  goScore.textContent = `${Math.floor(distance)} m`;
  goCoins.textContent = `+${runCoins} coins`;
  writeSave(save);
  fromGameOver = true;
  showPanel("gameover");
}

// ---------- Input (web-safe swipe) ----------
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

// ---------- UI buttons ----------
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

// ---------- Loop ----------
let trafficTimer = 0;
let last = performance.now();

function updateLightVisual(seg) {
  const bulb = seg.userData.lightGroup?.getObjectByName("bulb");
  if (!bulb) return;
  const s = seg.userData.lightState;
  bulb.material.color.setHex(s === "red" ? PALETTE.red : s === "yellow" ? PALETTE.yellow : PALETTE.green);
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
    // SmoothDamp-ish
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

    camera.position.set(laneX * 0.35, 6.5, playerZ - 12);
    camera.lookAt(laneX, 1.2, playerZ + 8);

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
            hudLight.textContent = "RED — BOOST!";
            hudLight.style.color = "#ef233c";
            hudLight.classList.remove("hidden");
          } else {
            hudLight.textContent = "GREEN — clear";
            hudLight.style.color = "#06d6a0";
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
      c.rotation.y += dt * 3;
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
    hudCoins.textContent = String(save.coins);
    hudBoost.classList.toggle("hidden", boostTimer <= 0);
  } else if (!running) {
    camera.position.set(0, 7, -14);
    camera.lookAt(0, 1, 6);
    player.position.set(0, 0, 0);
    player.rotation.y += dt * 0.6;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

showPanel("menu");
requestAnimationFrame(tick);

// Expose for smoke tests
window.__endlessChase = {
  startRun,
  getSave: () => ({ ...save }),
  getState: () => ({ running, alive, distance, lane, coins: save.coins }),
};
