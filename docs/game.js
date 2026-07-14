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
  INTERSECTION_COOLDOWN_SEGS,
  LIGHT_GREEN, LIGHT_YELLOW, LIGHT_RED, LIGHT_HUD_AHEAD, NPC_STOP_OFFSET,
  CROSS_SPAWN_X, CROSS_SPEED, CROSS_HAZARD_SPEED, CROSS_MAX, CROSS_SPAWN_INTERVAL,
  GAS_START_MIN, GAS_START_MAX, GAS_DRAIN_PER_SEC, GAS_DRAIN_BOOST_MUL, GAS_DRAIN_BRAKE_MUL,
  GAS_EMPTY_SPEED_MUL, GAS_STATION_COOLDOWN_SEGS, GAS_HUD_AHEAD, GAS_INTERACT_RANGE,
  GAS_COLOR_OK, GAS_COLOR_LOW,
  GAS_HOLD_FILL_PER_SEC, GAS_HOLD_HEAT_PER_SEC, GAS_PULL_DURATION,
  GAS_COP_Z_FAR, GAS_COP_Z_NEAR,
  layoutFor, biomeLabel, poolKey,
} from "./js/constants.js?v=18";
import {
  loadSave, writeSave, topSpeedFactor, accelFactor, handlingFactor, costFor, tryUpgrade,
} from "./js/save.js?v=18";
import { Pool } from "./js/pool.js?v=18";
import {
  createTextures, addSky, makeCar, makeTruck, makeCoin, makeSegment, updateLightVisual, pulseLightGlow,
  makeCone, makeBarricade, applyRoadTaper, resetRoadTaper, addGasStationVisuals,
} from "./js/nes.js?v=18";
import {
  mulberry32, hash2, pickTurnBiomes, decideSegment, buildTransitionPlan,
  nearestUsableLane,
} from "./js/worldgen.js?v=18";

const save = loadSave();

// ---------- DOM ----------
const canvas = document.getElementById("c");
const panels = {
  menu: document.getElementById("panel-menu"),
  hud: document.getElementById("panel-hud"),
  gameover: document.getElementById("panel-gameover"),
  upgrades: document.getElementById("panel-upgrades"),
  pump: document.getElementById("panel-pump"),
};
const hudDistance = document.getElementById("hud-distance");
const hudCoins = document.getElementById("hud-coins");
const hudBoost = document.getElementById("hud-boost");
const hudLight = document.getElementById("hud-light");
const hudHeatFill = document.getElementById("hud-heat-fill");
const hudHeat = document.getElementById("hud-heat");
const hudGasBlock = document.getElementById("hud-gas-block");
const hudGasFill = document.getElementById("hud-gas-fill");
const hudGasHint = document.getElementById("hud-gas-hint");
const hudStationFloat = document.getElementById("hud-station-float");
const hudTurn = document.getElementById("hud-turn");
const hudLaneWarn = document.getElementById("hud-lane-warn");
const hudSpeed = document.getElementById("hud-speed");
const pumpCurrent = document.getElementById("pump-current");
const pumpPreview = document.getElementById("pump-preview");
const pumpBarNow = document.getElementById("pump-bar-now");
const pumpHeatFill = document.getElementById("pump-heat-fill");
const btnPumpHold = document.getElementById("btn-pump-hold");
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
  for (const k of Object.keys(panels)) {
    if (!panels[k]) continue;
    // Pump overlays HUD — don't force-hide via this helper when opening pump
    if (k === "pump") continue;
    panels[k].classList.toggle("hidden", k !== name);
  }
}

function showPumpPanel(show) {
  if (panels.pump) panels.pump.classList.toggle("hidden", !show);
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

// ---------- Menu / intro camera ----------
/** City curb sits at ±8.2; park fully on the left sidewalk just outside it. */
const MENU_PARK = { x: -10.25, z: 2.8, yaw: 0.06 };
/** Long enough to read the steer-out → straighten arc. */
const INTRO_DURATION = 2.05;

const _menuCamPos = new THREE.Vector3(-4.6, 2.55, -2.4);
const _menuCamLook = new THREE.Vector3(-9.8, 0.5, 6.2);
const _camLook = new THREE.Vector3().copy(_menuCamLook);
const _tmpV = new THREE.Vector3();
const _tmpV2 = new THREE.Vector3();

function gameplayCamPos(lx, pz, out = _tmpV) {
  return out.set(lx * 0.08, 8.4, pz - 14);
}
function gameplayCamLook(lx, pz, out = _tmpV2) {
  return out.set(lx * 0.05, 1.0, pz + 14);
}
function setCameraLook(x, y, z) {
  _camLook.set(x, y, z);
  camera.lookAt(_camLook);
}
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}
function easeInCubic(t) {
  return t * t * t;
}
/** Cubic Bezier scalar. */
function bezier3(a, b, c, d, t) {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}
/** Cubic Bezier derivative (path tangent). */
function bezier3Deriv(a, b, c, d, t) {
  const u = 1 - t;
  return 3 * u * u * (b - a) + 6 * u * t * (c - b) + 3 * t * t * (d - c);
}

// ---------- State ----------
let running = false;
let alive = false;
/** @type {null | {
 *   t:number, duration:number,
 *   fromCam:THREE.Vector3, fromLook:THREE.Vector3,
 *   toCam:THREE.Vector3, toLook:THREE.Vector3,
 *   laneX:number,
 *   p1x:number, p1z:number, p2x:number, p2z:number, p3x:number, p3z:number,
 *   yaw:number, roll:number
 * }} */
let intro = null;
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
let gas = 50;
let slowTimer = 0;
let turnCooldown = 4;
let intersectionCooldown = 2;
let gasCooldown = 12;
let turnActive = null;
/** @type {null | { seg: object }} */
let nearbyStation = null;
/**
 * Gas visit state machine: pullIn → pumping → pullOut (or bust).
 * @type {null | {
 *   phase: "pullIn"|"pumping"|"pullOut",
 *   seg: object,
 *   requiredLane: number,
 *   fromX: number, fromZ: number, fromYaw: number,
 *   lotX: number, lotZ: number,
 *   outX: number, outZ: number,
 *   t: number, duration: number,
 *   holding: boolean,
 *   cop: object|null,
 * }}
 */
let gasVisit = null;
let gasHintTimer = 0;
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
let menuTime = 0;
let crossSpawnTimer = 0;

const activeSegments = [];
const activeTraffic = [];
const activeCoins = [];
const activeCross = [];
const activeObstacles = [];

const player = makeCar(tex.player);
scene.add(player);

function segFactory(biome, kind) {
  const opts = { distance };
  if (kind === "I") opts.intersection = true;
  if (kind === "T") opts.turnOffer = true;
  if (kind === "R") opts.onRamp = true;
  if (kind === "G") opts.gasStation = true;
  const s = makeSegment(tex, biome, opts);
  scene.add(s);
  return s;
}

const segmentPool = {
  city: new Pool(() => segFactory("city", ""), 4),
  cityI: new Pool(() => segFactory("city", "I"), 2),
  cityT: new Pool(() => segFactory("city", "T"), 1),
  cityR: new Pool(() => segFactory("city", "R"), 1),
  cityG: new Pool(() => segFactory("city", "G"), 1),
  rural: new Pool(() => segFactory("rural", ""), 3),
  ruralI: new Pool(() => segFactory("rural", "I"), 2),
  ruralT: new Pool(() => segFactory("rural", "T"), 1),
  ruralR: new Pool(() => segFactory("rural", "R"), 1),
  ruralG: new Pool(() => segFactory("rural", "G"), 1),
  highway: new Pool(() => segFactory("highway", ""), 3),
  highwayI: new Pool(() => segFactory("highway", "I"), 1),
  highwayT: new Pool(() => segFactory("highway", "T"), 1),
  highwayR: new Pool(() => segFactory("highway", "R"), 1),
  highwayG: new Pool(() => segFactory("highway", "G"), 1),
};

const civTex = [tex.civA, tex.civB, tex.civC];
const carPool = new Pool(() => {
  const c = makeCar(civTex[(Math.random() * civTex.length) | 0]);
  scene.add(c);
  return c;
}, 10);
const policePool = new Pool(() => { const c = makeCar(tex.police); scene.add(c); return c; }, 3);
const crossPool = new Pool(() => { const c = makeTruck(tex); scene.add(c); return c; }, 4);
const coinPool = new Pool(() => { const c = makeCoin(tex); scene.add(c); return c; }, 10);
const conePool = new Pool(() => { const o = makeCone(); scene.add(o); return o; }, 24);
const barricadePool = new Pool(() => { const o = makeBarricade(); scene.add(o); return o; }, 12);

/** Layout for global biome (traffic defaults / HUD). Player control uses segment layout. */
function currentLayout() { return layoutFor(activeBiome); }

/** Segment under a world Z (segment centers at position.z, length SEG_LEN). */
function getSegmentAt(z) {
  const half = SEG_LEN / 2;
  for (const seg of activeSegments) {
    if (z >= seg.position.z - half && z < seg.position.z + half) return seg;
  }
  return null;
}

function layoutBiomeForSegment(seg) {
  if (!seg) return activeBiome;
  return seg.userData.layoutBiome || seg.userData.biome || activeBiome;
}

function layoutForSegment(seg) {
  return layoutFor(layoutBiomeForSegment(seg));
}

function usableLanesForSegment(seg) {
  const layout = layoutForSegment(seg);
  if (seg && Array.isArray(seg.userData.usableLanes) && seg.userData.usableLanes.length) {
    return seg.userData.usableLanes.filter((i) => i >= 0 && i < layout.count);
  }
  return [...Array(layout.count).keys()];
}

function playerControlLayout() {
  const seg = getSegmentAt(playerZ);
  const layout = layoutForSegment(seg);
  const usable = usableLanesForSegment(seg);
  return { seg, layout, usable };
}

function stampSegmentDefaults(seg) {
  const layout = layoutFor(seg.userData.biome);
  seg.userData.layoutBiome = seg.userData.biome;
  seg.userData.usableLanes = [...Array(layout.count).keys()];
  seg.userData.adoptBiome = false;
  seg.userData.closedLaneXs = [];
  seg.userData.transitionPhase = null;
  seg.userData.widthStart = layout.width;
  seg.userData.widthEnd = layout.width;
}

function returnObstacle(o) {
  if (o.userData.kind === "barricade") barricadePool.return(o);
  else conePool.return(o);
}

function spawnTransitionObstacles(seg, closedLaneXs) {
  if (!closedLaneXs || !closedLaneXs.length) return;
  const zBase = seg.position.z;
  for (const x of closedLaneXs) {
    // Barricade near approach edge of the tile
    const bar = barricadePool.rent();
    bar.position.set(x, 0, zBase - SEG_LEN * 0.28);
    bar.rotation.y = 0;
    activeObstacles.push(bar);
    // Cone row along the closed lane
    for (let i = 0; i < 4; i++) {
      const cone = conePool.rent();
      cone.position.set(x + (i % 2 === 0 ? 0 : 0.15), 0, zBase - SEG_LEN * 0.15 + i * 3.2);
      cone.rotation.y = 0;
      activeObstacles.push(cone);
    }
  }
}

function remapLaneToLayout() {
  const { layout, usable } = playerControlLayout();
  lane = nearestUsableLane(layout, laneX, usable, true);
  laneX = layout.xs[lane];
  laneVel = 0;
}

function softRemapLane() {
  const { layout, usable } = playerControlLayout();
  lane = nearestUsableLane(layout, laneX, usable, true);
  // Keep laneX; spring damp will ease toward layout.xs[lane]
  laneVel *= 0.4;
}

function adoptBiomeFromSegment(seg) {
  if (!seg || !seg.userData.adoptBiome) return;
  const next = seg.userData.biome;
  if (!next || next === activeBiome) return;
  activeBiome = next;
  softRemapLane();
  if (!transitionQueue.length && transitioning && transitionTo === next) {
    transitioning = false;
    transitionFrom = null;
    transitionTo = null;
  }
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
  intersectionCooldown = Math.max(intersectionCooldown, INTERSECTION_COOLDOWN_SEGS + 1);
  gasCooldown = Math.max(gasCooldown, 4);
  turnActive = null;
  nearbyStation = null;
  hideStationFloat();
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
  resetRoadTaper(seg);
  stampSegmentDefaults(seg);
  seg.visible = false;
  const b = seg.userData.biome;
  let key = b;
  if (seg.userData.turnOffer) key = poolKey(b, "T");
  else if (seg.userData.onRamp) key = poolKey(b, "R");
  else if (seg.userData.intersection) key = poolKey(b, "I");
  else if (seg.userData.gasStation) key = poolKey(b, "G");
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
  seg.userData.lightTimer = LIGHT_GREEN * (0.4 + Math.random() * 0.6);
  seg.userData.turnResolved = false;
  seg.userData.gasResolved = false;
  if (seg.userData.lightGroup) updateLightVisual(seg);
  if (seg.userData.gantryGroup) seg.userData.gantryGroup.visible = false;
  if (seg.userData.gasStation) configureGasStationSide(seg);
  seg.visible = true;
  seg.position.set(0, 0, nextSpawnZ + SEG_LEN / 2);
  configureGantry(seg);
  activeSegments.push(seg);
  nextSpawnZ += SEG_LEN;
  spawnIndex++;
}

/** Rebuild gas station visuals on a random left/right berm each spawn. */
function configureGasStationSide(seg) {
  if (seg.userData.gasGroup) {
    seg.remove(seg.userData.gasGroup);
    seg.userData.gasGroup = null;
  }
  const side = Math.random() < 0.5 ? -1 : 1;
  const half = (seg.userData.baseWidth || layoutFor(seg.userData.biome).width) / 2;
  seg.userData.gasSide = side;
  seg.userData.gasGroup = addGasStationVisuals(seg, half, seg.userData.biome, side);
}

function spawnTransitionStep(plan) {
  const key = poolKey(plan.biome, plan.kind || "");
  const seg = segmentPool[key].rent();
  seg.userData.transitionPhase = plan.phase;
  seg.userData.usableLanes = (plan.usableLanes || []).slice();
  seg.userData.closedLaneXs = (plan.closedLaneXs || []).slice();
  seg.userData.widthStart = plan.widthStart;
  seg.userData.widthEnd = plan.widthEnd;
  seg.userData.layoutBiome = plan.layoutBiome || plan.biome;
  seg.userData.adoptBiome = !!plan.adopt;
  // Do NOT flip activeBiome here — adoption is player-position based
  placeSegment(seg);

  if (plan.widthStart != null && plan.widthEnd != null) {
    applyRoadTaper(seg, plan.widthStart, plan.widthEnd);
  }
  if (plan.closedLaneXs && plan.closedLaneXs.length) {
    spawnTransitionObstacles(seg, plan.closedLaneXs);
  }
}

function spawnSegment() {
  // Seamless transition corridor — pooled tiles + taper metadata
  if (transitionQueue.length) {
    const step = transitionQueue.shift();
    spawnTransitionStep(step);
    if (!transitionQueue.length) {
      // Queue drained; keep transitioning flag until player adopts enter tile
      transitionFrom = null;
    }
    return;
  }

  const biome = activeBiome;
  const rng = mulberry32(hash2(spawnIndex, worldSeed ^ 0x9e3779b9));
  const decided = decideSegment(
    biome, spawnIndex, turnCooldown, rng, intersectionCooldown, gasCooldown
  );
  let kind = decided.kind;

  if (kind === "T") turnCooldown = TURN_COOLDOWN_SEGS;
  else if (turnCooldown > 0) turnCooldown--;

  if (kind === "I") intersectionCooldown = INTERSECTION_COOLDOWN_SEGS;
  else if (intersectionCooldown > 0) intersectionCooldown--;
  // Turns also push lights apart so a light isn't glued to an on-ramp
  if (kind === "T" && intersectionCooldown < 2) intersectionCooldown = 2;

  if (kind === "G") gasCooldown = GAS_STATION_COOLDOWN_SEGS;
  else if (gasCooldown > 0) gasCooldown--;
  // Keep stations away from turns/lights
  if ((kind === "T" || kind === "I") && gasCooldown < 3) gasCooldown = 3;

  const key = poolKey(biome, kind);
  const seg = segmentPool[key].rent();
  stampSegmentDefaults(seg);

  if (seg.userData.turnOffer) {
    const pair = pickTurnBiomes(biome, distance, rng);
    seg.userData.turnLeftBiome = pair.left;
    seg.userData.turnRightBiome = pair.right;
  }

  placeSegment(seg);

  const layout = layoutFor(biome);
  const usable = usableLanesForSegment(seg);
  if (rng() < 0.55 && kind !== "T") {
    const coin = coinPool.rent();
    const sameDir = [];
    for (const i of usable) if (layout.dirs[i] === 1) sameDir.push(i);
    const li = sameDir.length ? sameDir[(rng() * sameDir.length) | 0] : (usable[0] ?? layout.defaultLane);
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
  while (activeCross.length) returnCross(activeCross.pop());
  while (activeCoins.length) coinPool.return(activeCoins.pop());
  while (activeObstacles.length) returnObstacle(activeObstacles.pop());
  pursuit = null;
  transitionQueue = [];
  transitioning = false;
  transitionFrom = null;
  transitionTo = null;
  nearbyStation = null;
  endGasVisit({ resume: false, busted: false });
  hideStationFloat();
  hideGasHint();
}

function updateHeatUI() {
  if (!hudHeatFill) return;
  hudHeatFill.style.width = `${Math.min(100, heat)}%`;
  if (hudHeat) hudHeat.classList.toggle("hot", heat >= 70);
}

function updateGasUI() {
  const g = Math.max(0, Math.min(100, gas));
  if (hudGasFill) hudGasFill.style.width = `${g}%`;
  if (hudGasBlock) {
    hudGasBlock.classList.remove("ok", "low", "critical");
    if (g < GAS_COLOR_LOW) hudGasBlock.classList.add("critical");
    else if (g < GAS_COLOR_OK) hudGasBlock.classList.add("low");
    else hudGasBlock.classList.add("ok");
  }
}

function randomStartGas() {
  return GAS_START_MIN + Math.random() * (GAS_START_MAX - GAS_START_MIN);
}

function hideStationFloat() {
  if (hudStationFloat) hudStationFloat.classList.add("hidden");
}

function hideGasHint() {
  if (hudGasHint) hudGasHint.classList.add("hidden");
  gasHintTimer = 0;
}

function showGasHint(msg = "Move closer to enter") {
  if (!hudGasHint) return;
  hudGasHint.textContent = msg;
  hudGasHint.classList.remove("hidden");
  gasHintTimer = 1.4;
}

function updateStationFloat(seg) {
  if (!hudStationFloat || !seg?.userData.gasGroup || gasVisit) {
    hideStationFloat();
    return;
  }
  const anchor = seg.userData.gasGroup.getObjectByName("gasAnchor") || seg.userData.gasGroup;
  const world = new THREE.Vector3();
  anchor.getWorldPosition(world);
  world.project(camera);
  if (world.z > 1) {
    hideStationFloat();
    return;
  }
  const stage = document.getElementById("game-stage") || canvas.parentElement;
  const rect = stage.getBoundingClientRect();
  const x = (world.x * 0.5 + 0.5) * rect.width;
  const y = (-world.y * 0.5 + 0.5) * rect.height;
  hudStationFloat.style.left = `${x}px`;
  hudStationFloat.style.top = `${y}px`;
  // Dim float when in wrong lane
  const ok = playerInStationLane(seg);
  hudStationFloat.style.opacity = ok ? "1" : "0.55";
  hudStationFloat.classList.remove("hidden");
}

function findInteractableStation() {
  let best = null;
  let bestAbs = Infinity;
  for (const seg of activeSegments) {
    if (!seg.userData.gasStation || seg.userData.gasResolved) continue;
    const dz = seg.position.z - playerZ;
    if (dz < -6 || dz > GAS_HUD_AHEAD) continue;
    const a = Math.abs(dz);
    if (a < bestAbs) {
      bestAbs = a;
      best = seg;
    }
  }
  return best;
}

/** Literal outermost lane: left station → lane 0, right → last index. */
function requiredLaneForStation(seg) {
  const layout = layoutForSegment(seg);
  const side = seg.userData.gasSide < 0 ? -1 : 1;
  return side < 0 ? 0 : layout.count - 1;
}

function playerInStationLane(seg) {
  return lane === requiredLaneForStation(seg);
}

function stationLotX(seg) {
  const group = seg.userData.gasGroup;
  if (!group) return laneX;
  const anchor = group.getObjectByName("gasAnchor");
  if (anchor) {
    const w = new THREE.Vector3();
    anchor.getWorldPosition(w);
    return w.x;
  }
  const half = (seg.userData.baseWidth || layoutForSegment(seg).width) / 2;
  const side = seg.userData.gasSide < 0 ? -1 : 1;
  return side * (half + (seg.userData.biome === "city" ? 6.2 : 5.4));
}

function beginGasVisit(seg) {
  if (gasVisit || !seg || !alive) return;
  nearbyStation = null;
  hideStationFloat();
  hideGasHint();
  seg.userData.gasResolved = true;

  const requiredLane = requiredLaneForStation(seg);
  const layout = layoutForSegment(seg);
  const lotX = stationLotX(seg);
  const lotZ = seg.position.z;

  gasVisit = {
    phase: "pullIn",
    seg,
    requiredLane,
    fromX: laneX,
    fromZ: playerZ,
    fromYaw: turnYaw,
    lotX,
    lotZ,
    outX: layout.xs[requiredLane],
    outZ: playerZ + 2.5,
    t: 0,
    duration: GAS_PULL_DURATION,
    holding: false,
    cop: null,
  };
  speed = 0;
  braking = true;
  running = false;
  showPumpPanel(false);
}

function startPumpingPhase() {
  if (!gasVisit) return;
  gasVisit.phase = "pumping";
  gasVisit.holding = false;
  gasVisit.t = 0;
  // Threat cop approaches from behind while you hold
  const car = policePool.rent();
  car.position.set(gasVisit.lotX * 0.35, 0, playerZ - GAS_COP_Z_FAR);
  car.rotation.y = 0;
  car.userData.police = true;
  car.userData.pursuit = false;
  car.userData.gasThreat = true;
  car.userData.dir = 1;
  car.userData.speed = 0;
  activeTraffic.push(car);
  gasVisit.cop = car;
  showPumpPanel(true);
  updatePumpHoldUI();
}

function beginPullOut() {
  if (!gasVisit || gasVisit.phase === "pullOut") return;
  setPumpHolding(false);
  showPumpPanel(false);
  // Return threat cop to pool unless we're about to bust
  if (gasVisit.cop) {
    const idx = activeTraffic.indexOf(gasVisit.cop);
    if (idx >= 0) activeTraffic.splice(idx, 1);
    policePool.return(gasVisit.cop);
    gasVisit.cop = null;
  }
  gasVisit.phase = "pullOut";
  gasVisit.t = 0;
  gasVisit.duration = GAS_PULL_DURATION;
  gasVisit.fromX = laneX;
  gasVisit.fromZ = playerZ;
  gasVisit.fromYaw = turnYaw || player.rotation.y || 0;
  const layout = layoutForSegment(gasVisit.seg);
  lane = gasVisit.requiredLane;
  gasVisit.outX = layout.xs[Math.min(Math.max(0, gasVisit.requiredLane), layout.count - 1)];
  gasVisit.outZ = playerZ + 4.5;
}

function endGasVisit({ resume = true, busted = false } = {}) {
  if (gasVisit?.cop) {
    const idx = activeTraffic.indexOf(gasVisit.cop);
    if (idx >= 0) activeTraffic.splice(idx, 1);
    policePool.return(gasVisit.cop);
  }
  const was = !!gasVisit;
  gasVisit = null;
  showPumpPanel(false);
  if (btnPumpHold) btnPumpHold.classList.remove("holding");
  if (busted) {
    heat = 100;
    updateHeatUI();
    bust();
    return;
  }
  if (resume && was && alive) {
    running = true;
    // Smooth blend back into traffic — don't leave speed at 0
    speed = Math.max(speed, 10 * topSpeedFactor(save));
    laneVel = 0;
    turnYaw = 0;
    turnYawVel = 0;
    resumeThrottle();
    updateGasUI();
    updateHeatUI();
  }
}

function bustAtPump() {
  // Snap cop onto the player then end run
  if (gasVisit?.cop) {
    gasVisit.cop.position.set(laneX, 0, playerZ - 1.5);
  }
  showPumpPanel(false);
  endGasVisit({ resume: false, busted: true });
}

function setPumpHolding(on) {
  if (!gasVisit || gasVisit.phase !== "pumping") return;
  gasVisit.holding = !!on;
  if (btnPumpHold) btnPumpHold.classList.toggle("holding", !!on);
}

function updatePumpHoldUI() {
  const now = Math.max(0, Math.min(100, gas));
  if (pumpCurrent) pumpCurrent.textContent = `FUEL ${Math.round(now)}%`;
  if (pumpBarNow) pumpBarNow.style.width = `${now}%`;
  if (pumpHeatFill) pumpHeatFill.style.width = `${Math.min(100, heat)}%`;
  if (pumpPreview) {
    pumpPreview.classList.toggle("hot", heat >= 70);
    if (heat >= 85) pumpPreview.textContent = "COPS CLOSING IN — RELEASE!";
    else if (gasVisit?.holding) pumpPreview.textContent = "FILLING… DANGER RISING";
    else pumpPreview.textContent = "HOLD TO FILL · RELEASE TO ESCAPE";
  }
  updateGasUI();
  updateHeatUI();
}

function updateGasVisit(dt) {
  if (!gasVisit || !alive) return;

  if (gasVisit.phase === "pullIn") {
    gasVisit.t += dt;
    const u = easeInOutCubic(Math.min(1, gasVisit.t / gasVisit.duration));
    laneX = THREE.MathUtils.lerp(gasVisit.fromX, gasVisit.lotX, u);
    playerZ = THREE.MathUtils.lerp(gasVisit.fromZ, gasVisit.lotZ, u);
    distance = playerZ;
    const yawTarget = Math.atan2(gasVisit.lotX - gasVisit.fromX, Math.max(1, gasVisit.lotZ - gasVisit.fromZ));
    turnYaw = THREE.MathUtils.lerp(gasVisit.fromYaw, yawTarget * 0.65, u);
    player.position.set(laneX, 0, playerZ);
    player.rotation.set(0, turnYaw, turnYaw * -0.15);
    camera.position.copy(gameplayCamPos(laneX, playerZ));
    const look = gameplayCamLook(laneX, playerZ);
    setCameraLook(look.x, look.y, look.z);
    if (u >= 1) {
      turnYaw = 0;
      lane = gasVisit.requiredLane;
      startPumpingPhase();
    }
    return;
  }

  if (gasVisit.phase === "pumping") {
    player.position.set(laneX, 0, playerZ);
    player.rotation.set(0, 0, 0);
    camera.position.copy(gameplayCamPos(laneX * 0.6, playerZ));
    const look = gameplayCamLook(laneX * 0.6, playerZ);
    setCameraLook(look.x, look.y, look.z);

    if (gasVisit.holding) {
      gas = Math.min(100, gas + GAS_HOLD_FILL_PER_SEC * dt);
      heat = Math.min(100, heat + GAS_HOLD_HEAT_PER_SEC * dt);
    }

    // Cop closes in with heat (even before hold, mild creep); faster while holding
    const threat = heat / 100;
    const zOff = THREE.MathUtils.lerp(GAS_COP_Z_FAR, GAS_COP_Z_NEAR, threat);
    if (gasVisit.cop) {
      const targetZ = playerZ - zOff;
      gasVisit.cop.position.z = THREE.MathUtils.damp(gasVisit.cop.position.z, targetZ, gasVisit.holding ? 5 : 2, dt);
      gasVisit.cop.position.x = THREE.MathUtils.damp(gasVisit.cop.position.x, laneX, 3, dt);
    }

    updatePumpHoldUI();

    if (heat >= 100) {
      bustAtPump();
      return;
    }
    if (gas >= 100) {
      gas = 100;
      beginPullOut();
      return;
    }
    return;
  }

  if (gasVisit.phase === "pullOut") {
    gasVisit.t += dt;
    const u = easeInOutCubic(Math.min(1, gasVisit.t / gasVisit.duration));
    laneX = THREE.MathUtils.lerp(gasVisit.fromX, gasVisit.outX, u);
    playerZ = THREE.MathUtils.lerp(gasVisit.fromZ, gasVisit.outZ, u);
    distance = playerZ;
    // Ease yaw back to straight while merging into the curb lane
    turnYaw = THREE.MathUtils.lerp(gasVisit.fromYaw, 0, u);
    // Soft speed ramp so resume doesn't feel stuck
    speed = THREE.MathUtils.lerp(0, 12 * topSpeedFactor(save), u);
    player.position.set(laneX, 0, playerZ);
    player.rotation.set(0, turnYaw, turnYaw * -0.08);
    camera.position.copy(gameplayCamPos(laneX, playerZ));
    const look = gameplayCamLook(laneX, playerZ);
    setCameraLook(look.x, look.y, look.z);
    if (u >= 1) {
      lane = gasVisit.requiredLane;
      turnYaw = 0;
      player.rotation.set(0, 0, 0);
      endGasVisit({ resume: true, busted: false });
    }
  }
}

function tryBeginGasVisit(seg) {
  if (!seg || gasVisit || !alive || !running) return false;
  if (!playerInStationLane(seg)) {
    showGasHint("Move closer to enter");
    return false;
  }
  const dz = Math.abs(seg.position.z - playerZ);
  if (dz > GAS_INTERACT_RANGE) return false;
  beginGasVisit(seg);
  return true;
}

function tryTapGasStation(clientX, clientY) {
  if (!running || !alive || gasVisit) return false;
  const seg = nearbyStation || findInteractableStation();
  if (!seg) return false;
  const dz = Math.abs(seg.position.z - playerZ);
  if (dz > GAS_INTERACT_RANGE) return false;

  if (hudStationFloat && !hudStationFloat.classList.contains("hidden")) {
    const r = hudStationFloat.getBoundingClientRect();
    if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
      return tryBeginGasVisit(seg);
    }
  }

  const stage = document.getElementById("game-stage") || canvas;
  const rect = stage.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  const hits = raycaster.intersectObject(seg.userData.gasGroup, true);
  if (hits.length && hits.some((h) => h.object.userData.gasHit)) {
    return tryBeginGasVisit(seg);
  }
  if (nearbyStation === seg && dz < GAS_INTERACT_RANGE * 0.75) {
    return tryBeginGasVisit(seg);
  }
  return false;
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

function lightDuration(state) {
  if (state === "yellow") return LIGHT_YELLOW;
  if (state === "red") return LIGHT_RED;
  return LIGHT_GREEN;
}

function findAheadIntersection(fromZ, maxAhead = 40) {
  let best = null;
  let bestDz = Infinity;
  for (const seg of activeSegments) {
    if (!seg.userData.intersection) continue;
    const dz = seg.position.z - fromZ;
    if (dz < -2 || dz > maxAhead) continue;
    if (dz < bestDz) {
      bestDz = dz;
      best = seg;
    }
  }
  return best;
}

function findNearbyRedIntersection() {
  let best = null;
  let bestAbs = Infinity;
  for (const seg of activeSegments) {
    if (!seg.userData.intersection) continue;
    if (seg.userData.lightState !== "red") continue;
    const dz = seg.position.z - playerZ;
    if (dz < -8 || dz > 40) continue;
    const a = Math.abs(dz);
    if (a < bestAbs) {
      bestAbs = a;
      best = seg;
    }
  }
  return best;
}

/** Spawn cross traffic far off-screen so approach is visible (no curb teleport). */
function spawnCrossVehicle(seg, { hazard = false, fromLeft = Math.random() < 0.5 } = {}) {
  if (activeCross.length >= CROSS_MAX && !hazard) return null;
  if (activeCross.length >= CROSS_MAX + 1) return null;
  const useTruck = hazard || Math.random() < 0.35;
  const car = useTruck ? crossPool.rent() : carPool.rent();
  const speed = hazard ? CROSS_HAZARD_SPEED : CROSS_SPEED * (0.85 + Math.random() * 0.3);
  const laneZ = seg.position.z + (Math.random() - 0.5) * 3.2;
  const startX = fromLeft ? -CROSS_SPAWN_X : CROSS_SPAWN_X;
  car.position.set(startX, 0, laneZ);
  car.rotation.y = fromLeft ? Math.PI / 2 : -Math.PI / 2;
  car.userData.vx = fromLeft ? speed : -speed;
  car.userData.crossKind = useTruck ? "truck" : "car";
  car.userData.hazard = hazard;
  car.userData.police = false;
  car.userData.pursuit = false;
  activeCross.push(car);
  return car;
}

function returnCross(car) {
  if (car.userData.crossKind === "truck") crossPool.return(car);
  else carPool.return(car);
}

function spawnTrafficCar() {
  // Prefer layout of the segment where the car will spawn (~40–70m ahead)
  const spawnZ = playerZ + 45;
  const aheadSeg = getSegmentAt(spawnZ) || getSegmentAt(playerZ);
  const layout = aheadSeg ? layoutForSegment(aheadSeg) : currentLayout();
  const usable = aheadSeg ? usableLanesForSegment(aheadSeg) : [...Array(layout.count).keys()];
  const oncomingIdx = [];
  const sameIdx = [];
  for (const i of usable) {
    if (i < 0 || i >= layout.count) continue;
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

  // Avoid stacking same-dir cars in a red/yellow stop box
  if (!wantOncoming) {
    const ahead = findAheadIntersection(playerZ + 35, 55);
    if (ahead && (ahead.userData.lightState === "red" || ahead.userData.lightState === "yellow")) {
      const stopZ = ahead.position.z - NPC_STOP_OFFSET;
      // Spawn past the junction instead of in the stop queue box
      const zTry = playerZ + 40 + Math.random() * 30;
      if (Math.abs(zTry - stopZ) < 8) {
        // skip this spawn tick
        return;
      }
    }
  }

  const police = !wantOncoming && Math.random() < 0.12;
  const car = (police ? policePool : carPool).rent();
  const dir = layout.dirs[tLane];
  if (dir === -1) {
    car.position.set(layout.xs[tLane], 0, playerZ + 50 + Math.random() * 40);
    car.rotation.y = Math.PI;
    car.userData.speed = 14 + Math.random() * 8;
    car.userData.cruiseSpeed = car.userData.speed;
  } else {
    car.position.set(layout.xs[tLane], 0, playerZ + 40 + Math.random() * 30);
    car.rotation.y = 0;
    car.userData.speed = police ? speed * 0.9 : 6 + Math.random() * 6;
    car.userData.cruiseSpeed = car.userData.speed;
  }
  car.userData.police = police;
  car.userData.pursuit = false;
  car.userData.dir = dir;
  car.userData.lane = tLane;
  car.userData.stopped = false;
  activeTraffic.push(car);
}

function endRun(reason) {
  if (!alive) return;
  alive = false;
  running = false;
  intro = null;
  if (gasVisit?.cop) {
    const idx = activeTraffic.indexOf(gasVisit.cop);
    if (idx >= 0) activeTraffic.splice(idx, 1);
    policePool.return(gasVisit.cop);
  }
  gasVisit = null;
  showPumpPanel(false);
  nearbyStation = null;
  hideStationFloat();
  hideGasHint();
  if (goTitle) goTitle.textContent = reason === "bust" ? "Busted!" : "Wrecked!";
  goScore.textContent = `${Math.floor(distance)} m`;
  goCoins.textContent = `+$${runCoins}`;
  writeSave(save);
  fromGameOver = true;
  showPanel("gameover");
}

function crash() { endRun("wreck"); }
function bust() { endRun("bust"); }

function parkPlayerCurbside() {
  player.position.set(MENU_PARK.x, 0, MENU_PARK.z);
  player.rotation.set(0, MENU_PARK.yaw, 0);
}

function applyMenuCamera() {
  camera.position.copy(_menuCamPos);
  setCameraLook(_menuCamLook.x, _menuCamLook.y, _menuCamLook.z);
}

/** Attract / title street: city blocks + player parked on the left curb. */
function setupMenuScene() {
  clearWorld();
  running = false;
  alive = false;
  intro = null;
  activeBiome = "city";
  nextSpawnZ = -SEG_LEN;
  spawnIndex = 0;
  worldSeed = 0xc0ffee;
  playerZ = 0;
  distance = 0;
  speed = 0;
  turnYaw = 0;
  turnYawVel = 0;
  turnActive = null;
  heat = 0;
  braking = false;

  // Plain city blocks only — no intersections / turn offers on the title street
  for (let i = 0; i < 7; i++) {
    const seg = segmentPool.city.rent();
    seg.userData.resolved = false;
    seg.userData.lightState = "green";
    seg.userData.lightTimer = 2;
    if (seg.userData.lightGroup) updateLightVisual(seg);
    seg.position.set(0, 0, nextSpawnZ + SEG_LEN / 2);
    configureGantry(seg);
    activeSegments.push(seg);
    nextSpawnZ += SEG_LEN;
    spawnIndex++;
  }

  // Quiet parked deco cars further along the same curb
  const decoZs = [15, 27];
  for (let i = 0; i < decoZs.length; i++) {
    const deco = carPool.rent();
    deco.position.set(MENU_PARK.x - 0.15 * i, 0, decoZs[i]);
    deco.rotation.y = (i === 0 ? 0.04 : -0.03);
    deco.userData.police = false;
    deco.userData.pursuit = false;
    deco.userData.dir = 1;
    deco.userData.speed = 0;
    deco.userData.lane = -1;
    activeTraffic.push(deco);
  }

  parkPlayerCurbside();
  applyMenuCamera();
  menuTime = 0;
}

function resetRunState() {
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
  gas = randomStartGas();
  slowTimer = 0;
  turnCooldown = 6;
  intersectionCooldown = 3;
  gasCooldown = 14;
  turnActive = null;
  nearbyStation = null;
  gasVisit = null;
  gasHintTimer = 0;
  turnYaw = 0;
  turnYawVel = 0;
  onRampPending = false;
  bustPending = false;
  keysBrake = false;
  crossSpawnTimer = 0.4;
  worldSeed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
  transitionQueue = [];
  transitioning = false;
  transitionFrom = null;
  transitionTo = null;
}

/**
 * Build the run world, keep the car at the curb, then lerp camera + pull-out into lane.
 * @param {{instant?: boolean}} [opts]
 */
function startRun(opts = {}) {
  if (intro) return;
  const instant = !!opts.instant;

  clearWorld();
  resetRunState();
  for (let i = 0; i < 10; i++) spawnSegment();

  showPanel("hud");
  showPumpPanel(false);
  hudCoins.textContent = `$${save.coins}`;
  if (hudTurn) hudTurn.classList.add("hidden");
  hideStationFloat();
  hideGasHint();
  if (hudLaneWarn) hudLaneWarn.classList.add("hidden");
  updateHeatUI();
  updateGasUI();
  trafficTimer = 0.8;

  const toCam = gameplayCamPos(laneX, 0).clone();
  const toLook = gameplayCamLook(laneX, 0).clone();

  if (instant) {
    intro = null;
    running = true;
    alive = true;
    player.position.set(laneX, 0, 0);
    player.rotation.set(0, 0, 0);
    camera.position.copy(toCam);
    setCameraLook(toLook.x, toLook.y, toLook.z);
    return;
  }

  // Seamless: stay parked, then steer out of the curb into the forward lane
  parkPlayerCurbside();
  applyMenuCamera();
  running = false;
  alive = true;

  // Bezier pull-out (left curb → lane). Control points shape a real parallel exit:
  // P1: creep forward with nose starting to cut in
  // P2: deep into the street while still angled
  // P3: settled in-lane heading down the road
  const p0x = MENU_PARK.x;
  const p0z = MENU_PARK.z;
  intro = {
    t: 0,
    duration: INTRO_DURATION,
    fromCam: camera.position.clone(),
    fromLook: _camLook.clone(),
    toCam,
    toLook,
    laneX,
    p1x: p0x + 1.1,
    p1z: p0z + 3.4,
    p2x: laneX + 0.6,
    p2z: p0z + 9.5,
    p3x: laneX,
    p3z: p0z + 17,
    yaw: MENU_PARK.yaw,
    roll: 0,
  };
}

function finishIntro() {
  if (!intro) return;
  const pz = Math.max(0, intro.p3z);
  playerZ = pz;
  laneX = intro.laneX;
  player.position.set(laneX, 0, pz);
  player.rotation.set(0, 0, 0);
  camera.position.copy(gameplayCamPos(laneX, pz));
  const look = gameplayCamLook(laneX, pz);
  setCameraLook(look.x, look.y, look.z);
  distance = pz;
  turnYaw = 0;
  intro = null;
  running = true;
  alive = true;
}

/**
 * Parallel-park pull-out along a Bezier whose tangent sets yaw —
 * nose leads the turn; body follows the arc (not a sideways slide).
 */
function updateIntro(dt) {
  if (!intro) return;
  intro.t += dt;
  const uLinear = Math.min(1, intro.t / intro.duration);
  // Ease-in so the first beat is a slow curb creep, then it opens up
  const u = easeInOutCubic(uLinear);

  const x = bezier3(MENU_PARK.x, intro.p1x, intro.p2x, intro.p3x, u);
  const z = bezier3(MENU_PARK.z, intro.p1z, intro.p2z, intro.p3z, u);
  const tx = bezier3Deriv(MENU_PARK.x, intro.p1x, intro.p2x, intro.p3x, u);
  const tz = bezier3Deriv(MENU_PARK.z, intro.p1z, intro.p2z, intro.p3z, u);
  // Game convention: yaw 0 faces +Z; positive yaw noses toward +X (into the road
  // from the left curb) — same sign as gameplay turnYaw when changing to a rightward lane.
  const tangentYaw = Math.atan2(tx, Math.max(0.001, tz));
  intro.yaw = THREE.MathUtils.damp(intro.yaw, tangentYaw, 18, dt);

  const rollTarget = THREE.MathUtils.clamp(-intro.yaw * 0.2, -0.1, 0.1);
  intro.roll = THREE.MathUtils.damp(intro.roll, uLinear > 0.88 ? 0 : rollTarget, 10, dt);

  player.position.set(x, 0, z);
  player.rotation.set(intro.roll * 0.35, intro.yaw, intro.roll);

  playerZ = Math.max(0, z);
  distance = playerZ;
  // Feed chase-cam a blended lateral so it doesn't whip while we arc
  laneX = THREE.MathUtils.lerp(x, intro.laneX, Math.min(1, Math.max(0, (u - 0.45) / 0.55)));

  // Hold the curb framing while the nose cuts out, then rise into chase cam
  const camU = easeInOutCubic(Math.max(0, (uLinear - 0.22) / 0.78));
  gameplayCamPos(laneX, playerZ, intro.toCam);
  gameplayCamLook(laneX, playerZ, intro.toLook);
  camera.position.lerpVectors(intro.fromCam, intro.toCam, camU);
  _camLook.lerpVectors(intro.fromLook, intro.toLook, camU);
  camera.lookAt(_camLook);

  if (uLinear >= 1) finishIntro();
}

function onSwipe(dir) {
  if (!alive || gasVisit) return;
  if (!running) return;
  if (turnActive && (dir === "left" || dir === "right")) {
    const biome = dir === "left" ? turnActive.left : turnActive.right;
    turnYawVel = dir === "left" ? TURN_YAW * 4 : -TURN_YAW * 4;
    turnActive.seg.userData.turnResolved = true;
    turnActive = null;
    if (hudTurn) hudTurn.classList.add("hidden");
    applyBiomeSwitch(biome);
    return;
  }
  const { layout, usable } = playerControlLayout();
  // Inverted side-to-side: swipe left → move right lane, swipe right → move left
  if (dir === "left" || dir === "right") {
    const delta = dir === "left" ? 1 : -1;
    let next = lane + delta;
    // Walk toward the swipe until we hit a usable lane; block if none
    while (next >= 0 && next < layout.count && !usable.includes(next)) next += delta;
    if (next >= 0 && next < layout.count && usable.includes(next)) lane = next;
  }
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
  if (gasVisit) return;
  const dist = Math.hypot(dx, dy);
  // Tap (not swipe) — try gas station interact
  if (dist < MIN_SWIPE && dt < 450) {
    if (tryTapGasStation(x, y)) return;
    return;
  }
  if (dt > 450 || dist < MIN_SWIPE) return;
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
  if (gasVisit?.phase === "pumping") {
    if (e.key === " " || e.key === "f" || e.key === "F") {
      e.preventDefault();
      setPumpHolding(true);
    }
    return;
  }
  if (gasVisit) return;
  if (e.key === "a" || e.key === "ArrowLeft") onSwipe("left");
  if (e.key === "d" || e.key === "ArrowRight") onSwipe("right");
  if (e.key === "s" || e.key === "ArrowDown") startBrake();
  if (e.key === "w" || e.key === "ArrowUp" || e.key === " ") resumeThrottle();
});

window.addEventListener("keyup", (e) => {
  if (gasVisit?.phase === "pumping" && (e.key === " " || e.key === "f" || e.key === "F")) {
    if (gasVisit.holding) {
      setPumpHolding(false);
      beginPullOut();
    }
    return;
  }
  // Sticky brake: release of S does not resume — only swipe up / W / Space
  if (e.key === "s" || e.key === "ArrowDown") keysBrake = false;
});

if (hudStationFloat) {
  hudStationFloat.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (nearbyStation) tryBeginGasVisit(nearbyStation);
  });
}

function bindPumpHold(el) {
  if (!el) return;
  const down = (e) => {
    e.preventDefault();
    setPumpHolding(true);
  };
  const up = (e) => {
    e.preventDefault();
    if (gasVisit?.phase === "pumping" && gasVisit.holding) {
      setPumpHolding(false);
      beginPullOut();
    }
  };
  el.addEventListener("mousedown", down);
  el.addEventListener("mouseup", up);
  el.addEventListener("mouseleave", up);
  el.addEventListener("touchstart", down, { passive: false });
  el.addEventListener("touchend", up, { passive: false });
  el.addEventListener("touchcancel", up, { passive: false });
}
bindPumpHold(btnPumpHold);
document.body.addEventListener("touchmove", (e) => {
  if (e.target === canvas || canvas.contains(e.target)) {
    if (e.cancelable) e.preventDefault();
  }
}, { passive: false });

document.getElementById("btn-play").onclick = () => startRun();
document.getElementById("btn-retry").onclick = () => startRun({ instant: true });
document.getElementById("btn-menu").onclick = () => {
  fromGameOver = false;
  setupMenuScene();
  showPanel("menu");
};
document.getElementById("btn-upgrades-menu").onclick = () => {
  fromGameOver = false; refreshUpgradesUI(); showPanel("upgrades");
};
document.getElementById("btn-upgrades-go").onclick = () => {
  fromGameOver = true; refreshUpgradesUI(); showPanel("upgrades");
};
document.getElementById("btn-up-back").onclick = () => {
  if (fromGameOver) showPanel("gameover");
  else {
    setupMenuScene();
    showPanel("menu");
  }
};
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

  if (gasHintTimer > 0) {
    gasHintTimer -= dt;
    if (gasHintTimer <= 0) hideGasHint();
  }

  const atPump = !!(gasVisit && alive);
  const driving = !!(running && alive && !gasVisit);

  if (atPump) {
    updateGasVisit(dt);
  } else if (driving) {
    // Sticky brake: stays on until swipe up / W. No timed auto-release.
    let targetSpeed = 18 * topSpeedFactor(save) * (boostTimer > 0 ? boostMul : 1);
    if (braking) targetSpeed *= BRAKE_SPEED_MUL;
    if (gas <= 0) {
      gas = 0;
      targetSpeed *= GAS_EMPTY_SPEED_MUL;
    }
    speed = THREE.MathUtils.damp(speed, targetSpeed, (braking ? 6 : 3) * accelFactor(save), dt);
    playerZ += speed * dt;
    distance = playerZ;

    // Drain gas while moving; boost burns more, brake burns less
    if (speed > 0.5 && gas > 0) {
      let drain = GAS_DRAIN_PER_SEC * (speed / 18) * dt;
      if (boostTimer > 0) drain *= GAS_DRAIN_BOOST_MUL;
      if (braking) drain *= GAS_DRAIN_BRAKE_MUL;
      gas = Math.max(0, gas - drain);
    }
    updateGasUI();

    if (speed < HEAT_SLOW_THRESHOLD || braking || gas <= 0) {
      slowTimer += dt;
      if (slowTimer > HEAT_GRACE) heat = Math.min(100, heat + HEAT_RISE * dt);
    } else {
      slowTimer = 0;
      heat = Math.max(0, heat - HEAT_DECAY * dt);
    }
    if (heat >= 100 && !bustPending) spawnPursuit();
    updateHeatUI();

    const { seg: playerSeg, layout, usable } = playerControlLayout();
    adoptBiomeFromSegment(playerSeg);
    // If current lane closed under us, soft-push to nearest open lane
    if (!usable.includes(lane)) {
      lane = nearestUsableLane(layout, laneX, usable, true);
    }
    const smooth = THREE.MathUtils.lerp(0.18, 0.08, Math.min(1, (handlingFactor(save) - 1) / 0.5));
    const targetX = layout.xs[Math.min(Math.max(0, lane), layout.count - 1)];
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
    camera.position.copy(gameplayCamPos(laneX, playerZ));
    const look = gameplayCamLook(laneX, playerZ);
    setCameraLook(look.x, look.y, look.z);
  }

  // World keeps simulating while driving OR stopped at a pump (NPCs still move)
  if (alive && (running || gasVisit)) {
    while (nextSpawnZ < playerZ + 8 * SEG_LEN) spawnSegment();

    for (let i = activeSegments.length - 1; i >= 0; i--) {
      const seg = activeSegments[i];
      if (seg.position.z + SEG_LEN < playerZ - 2 * SEG_LEN) {
        activeSegments.splice(i, 1);
        recycleSegment(seg);
        continue;
      }

      if (!gasVisit && seg.userData.turnOffer && !seg.userData.turnResolved) {
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

      if (seg.userData.gasStation && !seg.userData.gasResolved && !gasVisit) {
        const aheadDz = seg.position.z - playerZ;
        if (aheadDz < -8) {
          seg.userData.gasResolved = true;
        }
      }

      if (seg.userData.intersection && seg.userData.lightGroup) {
        seg.userData.lightTimer -= dt;
        if (seg.userData.lightTimer <= 0) {
          const order = ["green", "yellow", "red"];
          const idx = order.indexOf(seg.userData.lightState);
          seg.userData.lightState = order[(idx + 1) % 3];
          seg.userData.lightTimer = lightDuration(seg.userData.lightState);
          updateLightVisual(seg);
        }
        pulseLightGlow(seg, now / 1000);
        if (!gasVisit) {
          const dz = Math.abs(playerZ - seg.position.z);
          const aheadDz = seg.position.z - playerZ;
          if (aheadDz > 0 && aheadDz < LIGHT_HUD_AHEAD && !seg.userData.resolved) {
            const state = seg.userData.lightState;
            hudLight.textContent = state === "red" ? "● RED" : state === "yellow" ? "● YELLOW" : "● GREEN";
            hudLight.style.color = state === "red" ? "#ff004d" : state === "yellow" ? "#ffec27" : "#00e436";
            hudLight.classList.remove("hidden");
          }
          if (!seg.userData.resolved && dz < 4) {
            seg.userData.resolved = true;
            const state = seg.userData.lightState;
            const goingFast = speed > 12 && !braking;
            if (state === "red") {
              if (goingFast) {
                boostTimer = 2.5;
                boostMul = 1.35;
                heat = Math.min(100, heat + 22);
                spawnCrossVehicle(seg, { hazard: true, fromLeft: Math.random() < 0.5 });
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
    }

    crossSpawnTimer -= dt;
    if (crossSpawnTimer <= 0) {
      crossSpawnTimer = CROSS_SPAWN_INTERVAL;
      const redSeg = findNearbyRedIntersection();
      if (redSeg && activeCross.length < CROSS_MAX) {
        spawnCrossVehicle(redSeg, { hazard: false });
      }
    }

    trafficTimer -= dt;
    if (trafficTimer <= 0) {
      trafficTimer = Math.max(0.55, 1.35 - distance / 2000);
      spawnTrafficCar();
    }

    for (let i = activeTraffic.length - 1; i >= 0; i--) {
      const t = activeTraffic[i];
      if (t.userData.gasThreat) {
        // Threat cop is driven by updateGasVisit; just cull if orphaned
        if (!gasVisit) {
          activeTraffic.splice(i, 1);
          policePool.return(t);
        }
        continue;
      }
      if (t.userData.pursuit) {
        if (gasVisit) {
          // Hold pursuit behind the lot while pumping
          t.position.z = Math.min(t.position.z, playerZ - 10);
          continue;
        }
        t.userData.speed = speed + 2.5;
        const lx = currentLayout().xs[Math.min(lane, currentLayout().count - 1)];
        t.position.x = THREE.MathUtils.damp(t.position.x, lx, 4, dt);
        t.position.z += t.userData.speed * dt;
        if (t.position.z >= playerZ - 2.5) { bust(); break; }
        continue;
      }
      const dir = t.userData.dir || 1;
      if (dir === 1) {
        const cruise = t.userData.cruiseSpeed || t.userData.speed || 8;
        const ix = findAheadIntersection(t.position.z - 1, 28);
        if (ix && (ix.userData.lightState === "red" || ix.userData.lightState === "yellow")) {
          const stopZ = ix.position.z - NPC_STOP_OFFSET;
          const distToStop = stopZ - t.position.z;
          if (distToStop > -1.5 && distToStop < 22) {
            const target = distToStop < 1.2 ? 0 : Math.min(cruise, Math.max(0, distToStop * 1.8));
            t.userData.speed = THREE.MathUtils.damp(t.userData.speed, target, 6, dt);
            t.userData.stopped = t.userData.speed < 0.4;
          }
        } else if (t.userData.stopped || t.userData.speed < cruise * 0.95) {
          t.userData.speed = THREE.MathUtils.damp(t.userData.speed, cruise, 3, dt);
          if (t.userData.speed > cruise * 0.85) t.userData.stopped = false;
        }
      }
      t.position.z += (dir === -1 ? -t.userData.speed : t.userData.speed) * dt;
      if (t.position.z < playerZ - 25 || t.position.z > playerZ + 100) {
        activeTraffic.splice(i, 1);
        (t.userData.police ? policePool : carPool).return(t);
        continue;
      }
      if (!gasVisit && Math.abs(t.position.z - playerZ) < 2.2 && Math.abs(t.position.x - laneX) < 1.35) {
        crash();
        break;
      }
    }

    for (let i = activeCross.length - 1; i >= 0; i--) {
      const t = activeCross[i];
      t.position.x += t.userData.vx * dt;
      if (Math.abs(t.position.x) > CROSS_SPAWN_X + 4) {
        activeCross.splice(i, 1);
        returnCross(t);
        continue;
      }
      if (!gasVisit && Math.abs(t.position.z - playerZ) < 2.5 && Math.abs(t.position.x - laneX) < 2.0) {
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
      if (!gasVisit && Math.abs(c.position.z - playerZ) < 1.2 && Math.abs(c.position.x - laneX) < 1.2) {
        activeCoins.splice(i, 1);
        coinPool.return(c);
        runCoins += 1;
        save.coins += 1;
        writeSave(save);
      }
    }

    for (let i = activeObstacles.length - 1; i >= 0; i--) {
      const o = activeObstacles[i];
      if (o.position.z < playerZ - 25) {
        activeObstacles.splice(i, 1);
        returnObstacle(o);
        continue;
      }
      if (gasVisit) continue;
      const hx = o.userData.hitHalfX || 0.5;
      const hz = o.userData.hitHalfZ || 0.5;
      if (Math.abs(o.position.z - playerZ) < hz + 1.1 && Math.abs(o.position.x - laneX) < hx + 0.7) {
        crash();
        break;
      }
    }

    hudDistance.textContent = `${Math.floor(distance)} m`;
    hudCoins.textContent = `$${save.coins}`;
    if (hudSpeed) {
      const showSpeed = gasVisit?.phase === "pumping" ? 0 : Math.round(speed * 4);
      hudSpeed.textContent = `${showSpeed}`;
    }
    if (braking && boostTimer <= 0 && !gasVisit) {
      hudBoost.textContent = "BRAKE";
      hudBoost.classList.remove("hidden");
    } else {
      hudBoost.textContent = "BOOST";
      hudBoost.classList.toggle("hidden", boostTimer <= 0 || !!gasVisit);
    }

    if (!gasVisit) {
      const station = findInteractableStation();
      nearbyStation = station || null;
      if (nearbyStation && Math.abs(nearbyStation.position.z - playerZ) <= GAS_INTERACT_RANGE) {
        updateStationFloat(nearbyStation);
      } else {
        hideStationFloat();
      }
    } else {
      hideStationFloat();
    }
  } else if (intro) {
    updateIntro(dt);
  } else if (!running) {
    menuTime += dt;
    // Idle curb pose — tiny sway, no spin
    player.position.set(MENU_PARK.x, 0, MENU_PARK.z);
    player.rotation.y = MENU_PARK.yaw + Math.sin(menuTime * 0.7) * 0.04;
    applyMenuCamera();
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

setupMenuScene();
showPanel("menu");
requestAnimationFrame(tick);

window.__endlessChase = {
  startRun,
  setupMenuScene,
  getSave: () => ({ ...save }),
  getState: () => ({
    running, alive, intro: !!intro, distance, lane, biome: activeBiome, heat, gas, braking, coins: save.coins,
    nearbyStation: !!nearbyStation,
    gasVisit: gasVisit ? { phase: gasVisit.phase, holding: gasVisit.holding, requiredLane: gasVisit.requiredLane } : null,
    transitioning, transitionQueue: transitionQueue.length,
    playerX: +player.position.x.toFixed(2),
    playerZ: +player.position.z.toFixed(2),
    playerYaw: +player.rotation.y.toFixed(3),
  }),
  getSegmentAt,
  buildTransitionPlan,
  getCross: () => activeCross.map((c) => ({
    x: +c.position.x.toFixed(2),
    z: +c.position.z.toFixed(2),
    vx: c.userData.vx,
    kind: c.userData.crossKind,
  })),
  getIntersections: () => activeSegments
    .filter((s) => s.userData.intersection)
    .map((s) => ({
      z: +s.position.z.toFixed(1),
      light: s.userData.lightState,
      dz: +(s.position.z - playerZ).toFixed(1),
    })),
  debugSpawnCross: (hazard = false) => {
    let seg = findAheadIntersection(playerZ - 5, 100);
    if (!seg) seg = activeSegments.find((s) => s.userData.intersection);
    if (!seg) return { ok: false, reason: "no-intersection" };
    seg.userData.lightState = "red";
    updateLightVisual(seg);
    const car = spawnCrossVehicle(seg, { hazard, fromLeft: true });
    return {
      ok: !!car,
      segZ: seg.position.z,
      cross: car ? { x: car.position.x, vx: car.userData.vx } : null,
    };
  },
};
