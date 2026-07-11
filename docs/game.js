/**
 * Endless Chase — Retro NES WebGL client (modular)
 * 4-lane city (2 opposing), rural 2-way, highway 2 one-way.
 * Brake / heat bust / prompted turn biomes.
 */
import * as THREE from "three";
import {
  SEG_LEN, NES_W, NES_H, NES, MAX_UPGRADE,
  BRAKE_DURATION, BRAKE_SPEED_MUL,
  HEAT_SLOW_THRESHOLD, HEAT_GRACE, HEAT_RISE, HEAT_DECAY,
  TURN_COOLDOWN_SEGS, TURN_WINDOW, TURN_YAW, MIN_SWIPE,
  layoutFor, biomeLabel, poolKey,
} from "./js/constants.js?v=7";
import {
  loadSave, writeSave, topSpeedFactor, accelFactor, handlingFactor, costFor, tryUpgrade,
} from "./js/save.js?v=7";
import { Pool } from "./js/pool.js?v=7";
import {
  createTextures, addSky, makeCar, makeTruck, makeCoin, makeSegment, updateLightVisual,
} from "./js/nes.js?v=7";
import {
  mulberry32, hash2, pickTurnBiomes, decideSegment, buildTransitionPlan, nearestLane,
} from "./js/worldgen.js?v=7";

const save = loadSave();

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
const hudHeatFill = document.getElementById("hud-heat-fill");
const hudHeat = document.getElementById("hud-heat");
const hudTurn = document.getElementById("hud-turn");
const hudLaneWarn = document.getElementById("hud-lane-warn");
const goTitle = document.getElementById("go-title");
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

// ---------- Renderer ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(1);
renderer.setSize(NES_W, NES_H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(NES.navy);

const scene = new THREE.Scene();
scene.background = new THREE.Color(NES.navy);
scene.fog = new THREE.Fog(NES.navy, 35, 95);
const camera = new THREE.PerspectiveCamera(72, 160 / 256, 0.1, 200);
scene.add(camera);

const tex = createTextures();
addSky(camera);

// ---------- State ----------
let running = false;
let alive = false;
let activeBiome = "city";
let lane = 2;
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
let braking = false;
let brakeTimer = 0;
let heat = 0;
let slowTimer = 0;
let turnCooldown = 4;
let turnActive = null;
let turnYaw = 0;
let turnYawVel = 0;
let onRampPending = false;
let pursuit = null;
let bustPending = false;
let keysBrake = false;
let touchStart = null;
let last = performance.now();
let worldSeed = 1;
let transitionQueue = [];
let transitionFrom = null;
let transitionTo = null;
let transitioning = false;

const activeSegments = [];
const activeTraffic = [];
const activeCoins = [];
const activeCross = [];

const player = makeCar(tex.player);
scene.add(player);

function segFactory(biome, kind) {
  const opts = { distance };
  if (kind === "I") opts.intersection = true;
  if (kind === "T") opts.turnOffer = true;
  if (kind === "R") opts.onRamp = true;
  const s = makeSegment(tex, biome, opts);
  scene.add(s);
  return s;
}

const segmentPool = {
  city: new Pool(() => segFactory("city", ""), 4),
  cityI: new Pool(() => segFactory("city", "I"), 2),
  cityT: new Pool(() => segFactory("city", "T"), 1),
  cityR: new Pool(() => segFactory("city", "R"), 1),
  rural: new Pool(() => segFactory("rural", ""), 3),
  ruralI: new Pool(() => segFactory("rural", "I"), 2),
  ruralT: new Pool(() => segFactory("rural", "T"), 1),
  ruralR: new Pool(() => segFactory("rural", "R"), 1),
  highway: new Pool(() => segFactory("highway", ""), 3),
  highwayI: new Pool(() => segFactory("highway", "I"), 1),
  highwayT: new Pool(() => segFactory("highway", "T"), 1),
  highwayR: new Pool(() => segFactory("highway", "R"), 1),
};

const civTex = [tex.civA, tex.civB, tex.civC];
const carPool = new Pool(() => {
  const c = makeCar(civTex[(Math.random() * civTex.length) | 0]);
  scene.add(c);
  return c;
}, 10);
const policePool = new Pool(() => { const c = makeCar(tex.police); scene.add(c); return c; }, 3);
const crossPool = new Pool(() => { const c = makeTruck(tex); scene.add(c); return c; }, 3);
const coinPool = new Pool(() => { const c = makeCoin(tex); scene.add(c); return c; }, 10);

function currentLayout() { return layoutFor(activeBiome); }

function remapLaneToLayout() {
  const layout = currentLayout();
  let best = layout.defaultLane;
  let bestDist = Infinity;
  for (let i = 0; i < layout.count; i++) {
    const d = Math.abs(layout.xs[i] - laneX);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  lane = best;
  laneX = layout.xs[lane];
  laneVel = 0;
}

function softRemapLane() {
  const layout = currentLayout();
  lane = nearestLane(layout, laneX, true);
  // Keep laneX; spring damp will ease toward layout.xs[lane]
  laneVel *= 0.4;
}

function clearAheadTrafficSoft() {
  // Only cull traffic far ahead so the corridor isn't jammed with wrong-biome cars
  for (let i = activeTraffic.length - 1; i >= 0; i--) {
    const t = activeTraffic[i];
    if (t.userData.pursuit) continue;
    if (t.position.z > playerZ + 55) {
      activeTraffic.splice(i, 1);
      (t.userData.police ? policePool : carPool).return(t);
    }
  }
}

function beginBiomeTransition(toBiome) {
  if (transitioning && transitionTo === toBiome) return;
  const from = activeBiome;
  transitionFrom = from;
  transitionTo = toBiome;
  transitionQueue = buildTransitionPlan(from, toBiome);
  transitioning = true;
  turnCooldown = TURN_COOLDOWN_SEGS + transitionQueue.length + 2;
  turnActive = null;
  clearAheadTrafficSoft();
  softRemapLane();
  if (hudTurn) hudTurn.classList.add("hidden");
  if (hudLight) {
    hudLight.textContent = `→ ${biomeLabel(toBiome)}`;
    hudLight.style.color = "#ffec27";
    hudLight.classList.remove("hidden");
    setTimeout(() => hudLight.classList.add("hidden"), 1400);
  }
}

function applyBiomeSwitch(biome) {
  beginBiomeTransition(biome);
}

function recycleSegment(seg) {
  seg.visible = false;
  const b = seg.userData.biome;
  let key = b;
  if (seg.userData.turnOffer) key = poolKey(b, "T");
  else if (seg.userData.onRamp) key = poolKey(b, "R");
  else if (seg.userData.intersection) key = poolKey(b, "I");
  if (!segmentPool[key]) key = b;
  segmentPool[key].return(seg);
}

function configureGantry(seg) {
  const g = seg.userData.gantryGroup;
  if (!g) return;
  // ~every 5–6 segments (~100–120m), never back-to-back
  g.visible = seg.userData.biome === "highway" && spawnIndex > 2 && spawnIndex % 6 === 0;
}

function placeSegment(seg) {
  seg.userData.resolved = false;
  seg.userData.lightState = "green";
  seg.userData.lightTimer = 1.2 + Math.random() * 1.5;
  seg.userData.turnResolved = false;
  if (seg.userData.lightGroup) updateLightVisual(seg);
  if (seg.userData.gantryGroup) seg.userData.gantryGroup.visible = false;
  seg.visible = true;
  seg.position.set(0, 0, nextSpawnZ + SEG_LEN / 2);
  configureGantry(seg);
  activeSegments.push(seg);
  nextSpawnZ += SEG_LEN;
  spawnIndex++;
}

function spawnTransitionStep(plan) {
  const key = poolKey(plan.biome, plan.kind || "");
  const seg = segmentPool[key].rent();
  seg.userData.transitionPhase = plan.phase;
  placeSegment(seg);

  if (plan.adopt && transitionTo) {
    activeBiome = transitionTo;
    softRemapLane();
  }
}

function spawnSegment() {
  // Seamless transition corridor — pooled tiles only (keeps textures alive)
  if (transitionQueue.length) {
    const step = transitionQueue.shift();
    spawnTransitionStep(step);
    if (!transitionQueue.length) {
      activeBiome = transitionTo || activeBiome;
      transitioning = false;
      transitionFrom = null;
      softRemapLane();
    }
    return;
  }

  const biome = activeBiome;
  const rng = mulberry32(hash2(spawnIndex, worldSeed ^ 0x9e3779b9));
  const decided = decideSegment(biome, spawnIndex, turnCooldown, rng);
  let kind = decided.kind;

  if (kind === "T") turnCooldown = TURN_COOLDOWN_SEGS;
  else if (turnCooldown > 0) turnCooldown--;

  const key = poolKey(biome, kind);
  const seg = segmentPool[key].rent();

  if (seg.userData.turnOffer) {
    const pair = pickTurnBiomes(biome, distance, rng);
    seg.userData.turnLeftBiome = pair.left;
    seg.userData.turnRightBiome = pair.right;
  }

  placeSegment(seg);

  const layout = layoutFor(biome);
  if (rng() < 0.55 && kind !== "T") {
    const coin = coinPool.rent();
    const sameDir = [];
    for (let i = 0; i < layout.count; i++) if (layout.dirs[i] === 1) sameDir.push(i);
    const li = sameDir.length ? sameDir[(rng() * sameDir.length) | 0] : layout.defaultLane;
    coin.position.set(layout.xs[li], 1.0, seg.position.z);
    activeCoins.push(coin);
  }
}

function clearWorld() {
  while (activeSegments.length) recycleSegment(activeSegments.pop());
  while (activeTraffic.length) {
    const t = activeTraffic.pop();
    (t.userData.police ? policePool : carPool).return(t);
  }
  while (activeCross.length) crossPool.return(activeCross.pop());
  while (activeCoins.length) coinPool.return(activeCoins.pop());
  pursuit = null;
  transitionQueue = [];
  transitioning = false;
  transitionFrom = null;
  transitionTo = null;
}

function updateHeatUI() {
  if (!hudHeatFill) return;
  hudHeatFill.style.width = `${Math.min(100, heat)}%`;
  if (hudHeat) hudHeat.classList.toggle("hot", heat >= 70);
}

function startBrake() {
  braking = true;
}

function resumeThrottle() {
  braking = false;
  keysBrake = false;
  brakeTimer = 0;
}

function spawnPursuit() {
  if (pursuit) return;
  const layout = currentLayout();
  const car = policePool.rent();
  const tLane = Math.min(lane, layout.count - 1);
  car.position.set(layout.xs[tLane], 0, playerZ - 18);
  car.rotation.y = 0;
  car.userData.police = true;
  car.userData.pursuit = true;
  car.userData.dir = 1;
  car.userData.speed = speed + 2;
  car.userData.lane = tLane;
  activeTraffic.push(car);
  pursuit = car;
  bustPending = true;
}

function spawnTrafficCar() {
  const layout = currentLayout();
  const oncomingIdx = [];
  const sameIdx = [];
  for (let i = 0; i < layout.count; i++) {
    if (layout.dirs[i] === -1) oncomingIdx.push(i);
    else sameIdx.push(i);
  }
  const wantOncoming = oncomingIdx.length > 0 && Math.random() < 0.45;
  const poolLanes = wantOncoming ? oncomingIdx : sameIdx;
  if (!poolLanes.length) return;

  let tLane = poolLanes[(Math.random() * poolLanes.length) | 0];
  if (!wantOncoming && tLane === lane && Math.random() < 0.4) {
    tLane = poolLanes[(tLane + 1) % poolLanes.length];
  }

  const police = !wantOncoming && Math.random() < 0.12;
  const car = (police ? policePool : carPool).rent();
  const dir = layout.dirs[tLane];
  if (dir === -1) {
    car.position.set(layout.xs[tLane], 0, playerZ + 50 + Math.random() * 40);
    car.rotation.y = Math.PI;
    car.userData.speed = 14 + Math.random() * 8;
  } else {
    car.position.set(layout.xs[tLane], 0, playerZ + 40 + Math.random() * 30);
    car.rotation.y = 0;
    car.userData.speed = police ? speed * 0.9 : 6 + Math.random() * 6;
  }
  car.userData.police = police;
  car.userData.pursuit = false;
  car.userData.dir = dir;
  car.userData.lane = tLane;
  activeTraffic.push(car);
}

function endRun(reason) {
  if (!alive) return;
  alive = false;
  running = false;
  if (goTitle) goTitle.textContent = reason === "bust" ? "Busted!" : "Wrecked!";
  goScore.textContent = `${Math.floor(distance)} m`;
  goCoins.textContent = `+$${runCoins}`;
  writeSave(save);
  fromGameOver = true;
  showPanel("gameover");
}

function crash() { endRun("wreck"); }
function bust() { endRun("bust"); }

function startRun() {
  clearWorld();
  running = true;
  alive = true;
  activeBiome = "city";
  const layout = layoutFor(activeBiome);
  lane = layout.defaultLane;
  laneX = layout.xs[lane];
  laneVel = 0;
  playerZ = 0;
  speed = 12;
  distance = 0;
  runCoins = 0;
  boostTimer = 0;
  boostMul = 1;
  nextSpawnZ = 0;
  spawnIndex = 0;
  braking = false;
  brakeTimer = 0;
  heat = 0;
  slowTimer = 0;
  turnCooldown = 6;
  turnActive = null;
  turnYaw = 0;
  turnYawVel = 0;
  onRampPending = false;
  bustPending = false;
  keysBrake = false;
  worldSeed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
  transitionQueue = [];
  transitioning = false;
  transitionFrom = null;
  transitionTo = null;
  player.position.set(laneX, 0, 0);
  player.rotation.set(0, 0, 0);
  for (let i = 0; i < 10; i++) spawnSegment();
  showPanel("hud");
  hudCoins.textContent = `$${save.coins}`;
  if (hudTurn) hudTurn.classList.add("hidden");
  if (hudLaneWarn) hudLaneWarn.classList.add("hidden");
  updateHeatUI();
  trafficTimer = 0.8;
}

function onSwipe(dir) {
  if (!running || !alive) return;
  if (turnActive && (dir === "left" || dir === "right")) {
    const biome = dir === "left" ? turnActive.left : turnActive.right;
    turnYawVel = dir === "left" ? TURN_YAW * 4 : -TURN_YAW * 4;
    turnActive.seg.userData.turnResolved = true;
    turnActive = null;
    if (hudTurn) hudTurn.classList.add("hidden");
    applyBiomeSwitch(biome);
    return;
  }
  const layout = currentLayout();
  // Inverted side-to-side: swipe left → move right lane, swipe right → move left
  if (dir === "left") lane = Math.min(layout.count - 1, lane + 1);
  if (dir === "right") lane = Math.max(0, lane - 1);
  if (dir === "down") startBrake();
  if (dir === "up") resumeThrottle();
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
  else onSwipe(dy > 0 ? "down" : "up");
}

canvas.addEventListener("touchstart", (e) => {
  if (e.cancelable) e.preventDefault();
  pointerDown(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
}, { passive: false });
canvas.addEventListener("touchmove", (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
canvas.addEventListener("touchend", (e) => {
  if (e.cancelable) e.preventDefault();
  pointerUp(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
}, { passive: false });
canvas.addEventListener("mousedown", (e) => pointerDown(e.clientX, e.clientY));
canvas.addEventListener("mouseup", (e) => pointerUp(e.clientX, e.clientY));

window.addEventListener("keydown", (e) => {
  if (e.key === "a" || e.key === "ArrowLeft") onSwipe("left");
  if (e.key === "d" || e.key === "ArrowRight") onSwipe("right");
  if (e.key === "s" || e.key === "ArrowDown") startBrake();
  if (e.key === "w" || e.key === "ArrowUp" || e.key === " ") resumeThrottle();
});
window.addEventListener("keyup", (e) => {
  // Sticky brake: release of S does not resume — only swipe up / W / Space
  if (e.key === "s" || e.key === "ArrowDown") keysBrake = false;
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
  fromGameOver = false; refreshUpgradesUI(); showPanel("upgrades");
};
document.getElementById("btn-upgrades-go").onclick = () => {
  fromGameOver = true; refreshUpgradesUI(); showPanel("upgrades");
};
document.getElementById("btn-up-back").onclick = () => showPanel(fromGameOver ? "gameover" : "menu");
btnUpSpeed.onclick = () => { if (tryUpgrade(save, "topSpeedLevel")) refreshUpgradesUI(); };
btnUpAccel.onclick = () => { if (tryUpgrade(save, "accelerationLevel")) refreshUpgradesUI(); };
btnUpHandling.onclick = () => { if (tryUpgrade(save, "handlingLevel")) refreshUpgradesUI(); };

function layoutCanvas() {
  // Always render as portrait (9:16). If the phone is landscape, letterbox
  // the portrait stage inside the landscape window and show a rotate hint.
  const vw = Math.max(1, window.innerWidth);
  const vh = Math.max(1, window.innerHeight);
  const isPortrait = vh >= vw;
  const rotateHint = document.getElementById("rotate-hint");
  if (rotateHint) rotateHint.classList.toggle("hidden", isPortrait);

  // Fixed NES portrait buffer — wider FOV so outer lanes stay on-screen
  const iw = 160;
  const ih = 256;
  renderer.setSize(iw, ih, false);
  camera.aspect = iw / ih;
  camera.fov = 72;
  camera.updateProjectionMatrix();

  // Size the canvas as a portrait stage that covers the short side
  const stage = document.getElementById("game-stage") || canvas;
  if (isPortrait) {
    stage.style.width = "100%";
    stage.style.height = "100%";
    stage.style.maxWidth = "none";
    stage.style.maxHeight = "none";
  } else {
    // Fit portrait 9:16 into landscape viewport
    const fitH = vh;
    const fitW = Math.round(fitH * (9 / 16));
    stage.style.width = `${fitW}px`;
    stage.style.height = `${fitH}px`;
  }
  canvas.style.width = "100%";
  canvas.style.height = "100%";
}
window.addEventListener("resize", layoutCanvas);
window.addEventListener("orientationchange", () => setTimeout(layoutCanvas, 150));
layoutCanvas();

function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (running && alive) {
    // Sticky brake: stays on until swipe up / W. No timed auto-release.
    let targetSpeed = 18 * topSpeedFactor(save) * (boostTimer > 0 ? boostMul : 1);
    if (braking) targetSpeed *= BRAKE_SPEED_MUL;
    speed = THREE.MathUtils.damp(speed, targetSpeed, (braking ? 6 : 3) * accelFactor(save), dt);
    playerZ += speed * dt;
    distance = playerZ;

    if (speed < HEAT_SLOW_THRESHOLD || braking) {
      slowTimer += dt;
      if (slowTimer > HEAT_GRACE) heat = Math.min(100, heat + HEAT_RISE * dt);
    } else {
      slowTimer = 0;
      heat = Math.max(0, heat - HEAT_DECAY * dt);
    }
    if (heat >= 100 && !bustPending) spawnPursuit();
    updateHeatUI();

    const layout = currentLayout();
    const smooth = THREE.MathUtils.lerp(0.18, 0.08, Math.min(1, (handlingFactor(save) - 1) / 0.5));
    const targetX = layout.xs[lane];
    const omega = 2 / Math.max(0.05, smooth);
    const x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = laneX - targetX;
    const temp = (laneVel + omega * change) * dt;
    laneVel = (laneVel - omega * temp) * exp;
    laneX = targetX + (change + temp) * exp;

    turnYaw += turnYawVel * dt;
    turnYaw = THREE.MathUtils.damp(turnYaw, 0, 3.5, dt);
    turnYawVel = THREE.MathUtils.damp(turnYawVel, 0, 5, dt);

    player.position.set(Math.round(laneX * 8) / 8, 0, playerZ);
    player.rotation.y = turnYaw;

    if (hudLaneWarn) {
      hudLaneWarn.classList.toggle("hidden", layout.dirs[lane] !== -1);
    }

    if (boostTimer > 0) {
      boostTimer -= dt;
      if (boostTimer <= 0) { boostTimer = 0; boostMul = 1; }
    }

    // Portrait chase cam: stay near road center so left/rightmost lanes stay visible
    camera.position.set(laneX * 0.08, 8.4, playerZ - 14);
    camera.lookAt(laneX * 0.05, 1.0, playerZ + 14);

    while (nextSpawnZ < playerZ + 8 * SEG_LEN) spawnSegment();

    for (let i = activeSegments.length - 1; i >= 0; i--) {
      const seg = activeSegments[i];
      if (seg.position.z + SEG_LEN < playerZ - 2 * SEG_LEN) {
        activeSegments.splice(i, 1);
        recycleSegment(seg);
        continue;
      }

      if (seg.userData.turnOffer && !seg.userData.turnResolved) {
        const dz = seg.position.z - playerZ;
        if (dz < 12 && dz > -2) {
          if (!turnActive || turnActive.seg !== seg) {
            turnActive = {
              seg,
              left: seg.userData.turnLeftBiome,
              right: seg.userData.turnRightBiome,
              timer: TURN_WINDOW,
            };
            if (hudTurn) {
              hudTurn.textContent = `← ${biomeLabel(turnActive.left)}  ·  ${biomeLabel(turnActive.right)} →`;
              hudTurn.classList.remove("hidden");
            }
          }
        }
        if (turnActive && turnActive.seg === seg) {
          turnActive.timer -= dt;
          if (turnActive.timer <= 0 || dz < -2) {
            seg.userData.turnResolved = true;
            turnActive = null;
            if (hudTurn) hudTurn.classList.add("hidden");
          }
        }
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
          const state = seg.userData.lightState;
          const goingFast = speed > 12 && !braking;
          if (state === "red") {
            if (goingFast) {
              boostTimer = 2.5;
              boostMul = 1.35;
              heat = Math.min(100, heat + 22);
              const truck = crossPool.rent();
              truck.position.set(-(layout.width / 2 + 4), 0, seg.position.z);
              truck.userData.vx = 22;
              activeCross.push(truck);
              hudLight.textContent = "RED! BOOST";
              hudLight.style.color = "#ff004d";
            } else {
              hudLight.textContent = "RED SLOW";
              hudLight.style.color = "#ffa300";
            }
            hudLight.classList.remove("hidden");
          } else if (state === "yellow" && goingFast) {
            heat = Math.min(100, heat + 8);
            hudLight.textContent = "YELLOW!";
            hudLight.style.color = "#ffec27";
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
      trafficTimer = Math.max(0.55, 1.35 - distance / 2000);
      spawnTrafficCar();
    }

    for (let i = activeTraffic.length - 1; i >= 0; i--) {
      const t = activeTraffic[i];
      if (t.userData.pursuit) {
        t.userData.speed = speed + 2.5;
        const lx = currentLayout().xs[Math.min(lane, currentLayout().count - 1)];
        t.position.x = THREE.MathUtils.damp(t.position.x, lx, 4, dt);
        t.position.z += t.userData.speed * dt;
        if (t.position.z >= playerZ - 2.5) { bust(); break; }
        continue;
      }
      const dir = t.userData.dir || 1;
      t.position.z += (dir === -1 ? -t.userData.speed : t.userData.speed) * dt;
      if (t.position.z < playerZ - 25 || t.position.z > playerZ + 100) {
        activeTraffic.splice(i, 1);
        (t.userData.police ? policePool : carPool).return(t);
        continue;
      }
      if (Math.abs(t.position.z - playerZ) < 2.2 && Math.abs(t.position.x - laneX) < 1.35) {
        crash();
        break;
      }
    }

    for (let i = activeCross.length - 1; i >= 0; i--) {
      const t = activeCross[i];
      t.position.x += t.userData.vx * dt;
      if (t.position.x > currentLayout().width / 2 + 8) {
        activeCross.splice(i, 1);
        crossPool.return(t);
        continue;
      }
      if (Math.abs(t.position.z - playerZ) < 2.5 && Math.abs(t.position.x - laneX) < 2.0) {
        crash();
        break;
      }
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
    if (braking && boostTimer <= 0) {
      hudBoost.textContent = "BRAKE";
      hudBoost.classList.remove("hidden");
    } else {
      hudBoost.textContent = "BOOST";
      hudBoost.classList.toggle("hidden", boostTimer <= 0);
    }
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
  getState: () => ({
    running, alive, distance, lane, biome: activeBiome, heat, braking, coins: save.coins,
  }),
};
