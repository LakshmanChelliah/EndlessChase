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
  TURN_COOLDOWN_SEGS, TURN_WINDOW, TURN_YAW, MIN_SWIPE, TAP_MAX_MS, TOUCH_MOUSE_GUARD_MS,
  INTERSECTION_COOLDOWN_SEGS,
  LIGHT_GREEN, LIGHT_YELLOW, LIGHT_RED, LIGHT_HUD_AHEAD, NPC_STOP_OFFSET,
  CROSS_SPAWN_X, CROSS_SPEED, CROSS_HAZARD_SPEED, CROSS_MAX, CROSS_SPAWN_INTERVAL,
  GAS_START_MIN, GAS_START_MAX, GAS_DRAIN_PER_SEC, GAS_DRAIN_BOOST_MUL, GAS_DRAIN_BRAKE_MUL,
  GAS_EMPTY_SPEED_MUL, GAS_STATION_COOLDOWN_SEGS, GAS_HUD_AHEAD, GAS_INTERACT_RANGE,
  GAS_COLOR_OK, GAS_COLOR_LOW,
  GAS_HOLD_FILL_PER_SEC, GAS_VISIT_HEAT_PER_SEC, GAS_MERGE_HEAT_PER_SEC, GAS_HOLD_HEAT_PER_SEC, GAS_PULL_DURATION, GAS_CAM_PAN,
  GAS_COP_Z_FAR, GAS_COP_Z_NEAR,
  SIREN_ONSET, SIREN_VOL_NEAR, SIREN_VOL_ONSET, SIREN_OPENING, SIREN_OPENING_FADE,
  layoutFor, biomeLabel, poolKey,
} from "./js/constants.js?v=27";
import {
  loadSave, writeSave, topSpeedFactor, accelFactor, handlingFactor, costFor, tryUpgrade,
  tryBuyCar, selectCar, isUnlocked,
} from "./js/save.js?v=21";
import { BUYABLE_CARS, getCar, pickDistinctMenuDecoIds, previewUrl } from "./js/cars.js?v=22";
import { preloadVehicles, createVehicle, replacePlayerVehicle } from "./js/vehicle.js?v=22";
import {
  rentCivilian, returnTrafficCar, rentPolice, rentCross, returnCross,
} from "./js/carPool.js?v=23";
import { Pool } from "./js/pool.js?v=21";
import {
  createTextures, addSky, makeCoin, makeSegment, updateLightVisual, pulseLightGlow,
  makeCone, makeBarricade, applyRoadTaper, resetRoadTaper, addGasStationVisuals,
  applyMixBiomeOverlay, clearMixBiomeOverlay, applyBiomeAtmosphere, makeDustMote,
} from "./js/nes.js?v=23";
import {
  mulberry32, hash2, pickTurnBiomes, decideSegment, buildTransitionPlan,
  nearestUsableLane, getTransitionDef,
} from "./js/worldgen.js?v=22";
import {
  unlockSirenAudio, resumeSirenAudio, startSiren, stopSiren, setSirenVolume,
  sirenLevelFromProximity, getSirenDebug,
} from "./js/siren.js?v=7";

/** How far ahead NPCs scan for closed lanes; actual merge trigger is jittered per car. */
const MERGE_LOOKAHEAD = 28;
const MERGE_DIST_MIN = 18;
const MERGE_DIST_MAX = 26;
const MERGE_DELAY_MIN = 0.4;
const MERGE_DELAY_MAX = 2.2;
const ZIPPER_GAP = 7;
const HEADWAY_GAP = 5.5;
const CAR_HALF_LEN = 2.0;

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
const hudMergeBtn = document.getElementById("hud-merge-btn");
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
const upCarName = document.getElementById("up-car-name");
const carListEl = document.getElementById("car-list");
const btnCarAction = document.getElementById("btn-car-action");
const upSpeedLabel = document.getElementById("up-speed-label");
const upAccelLabel = document.getElementById("up-accel-label");
const upHandlingLabel = document.getElementById("up-handling-label");
const btnUpSpeed = document.getElementById("btn-up-speed");
const btnUpAccel = document.getElementById("btn-up-accel");
const btnUpHandling = document.getElementById("btn-up-handling");
const fxFlash = document.getElementById("fx-flash");
const fxHeatVignette = document.getElementById("fx-heat-vignette");
const fxSpeedlines = document.getElementById("fx-speedlines");
const pumpShell = document.getElementById("pump-shell");
const btnRetry = document.getElementById("btn-retry");
const upSpeedPips = document.getElementById("up-speed-pips");
const upAccelPips = document.getElementById("up-accel-pips");
const upHandlingPips = document.getElementById("up-handling-pips");

/** Garage browse highlight (may differ from equipped selectedCar while shopping). */
let garageFocusId = save.selectedCar;
let activePanelName = "menu";
let goScoreTarget = 0;
let goScoreDisplay = 0;
let goRetryTimer = 0;
let shakeAmp = 0;
let shakeTime = 0;
let camFovTarget = 72;
let exhaustFlicker = null;
let prevBoostActive = false;

function triggerShake(amp, duration = 0.22) {
  shakeAmp = Math.max(shakeAmp, amp);
  shakeTime = Math.max(shakeTime, duration);
}

function triggerFlash(kind = "wreck") {
  if (!fxFlash) return;
  fxFlash.className = `fx-flash flash-${kind}`;
  // Restart CSS animation
  void fxFlash.offsetWidth;
  fxFlash.classList.add("active");
}

function updateHeatVignette() {
  if (!fxHeatVignette) return;
  const t = Math.max(0, (heat - 45) / 55);
  // Stepped NES opacity
  const stepped = Math.round(t * 5) / 5;
  fxHeatVignette.style.opacity = String(stepped * 0.85);
}

function setSpeedlines(on) {
  if (!fxSpeedlines) return;
  fxSpeedlines.classList.toggle("hidden", !on);
}

function applyCameraShake(dt) {
  if (shakeTime <= 0) {
    shakeAmp = 0;
    return;
  }
  shakeTime -= dt;
  const falloff = Math.max(0, shakeTime);
  const a = shakeAmp * Math.min(1, falloff * 4);
  // Stepped jitter — not smooth noise
  const sx = ((Math.random() * 2 - 1) * a);
  const sy = ((Math.random() * 2 - 1) * a * 0.55);
  camera.position.x += sx;
  camera.position.y += sy;
}

function ensureExhaustFlicker() {
  if (exhaustFlicker || !player) return;
  exhaustFlicker = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.18, 0.18),
    new THREE.MeshBasicMaterial({ color: NES.orange })
  );
  exhaustFlicker.position.set(0, 0.35, -1.55);
  exhaustFlicker.name = "exhaustFlicker";
  player.add(exhaustFlicker);
}

function renderUpgradePips(el, level) {
  if (!el) return;
  el.innerHTML = "";
  for (let i = 0; i < MAX_UPGRADE; i++) {
    const pip = document.createElement("span");
    pip.className = "pip" + (i < level ? " on" : "");
    el.appendChild(pip);
  }
}

function showPanel(name) {
  for (const k of Object.keys(panels)) {
    if (!panels[k]) continue;
    // Pump overlays HUD — don't force-hide via this helper when opening pump
    if (k === "pump") continue;
    const el = panels[k];
    const show = k === name;
    if (show) {
      el.classList.remove("hidden");
      el.classList.remove("panel-enter");
      void el.offsetWidth;
      el.classList.add("panel-enter");
    } else {
      el.classList.add("hidden");
      el.classList.remove("panel-enter");
    }
  }
  activePanelName = name;
  if (name !== "gameover" && panels.gameover) {
    panels.gameover.classList.remove("go-wreck", "go-bust");
  }
}

function showPumpPanel(show) {
  if (!panels.pump) return;
  if (show) {
    panels.pump.classList.remove("hidden");
    panels.pump.classList.remove("panel-enter");
    void panels.pump.offsetWidth;
    panels.pump.classList.add("panel-enter");
  } else {
    panels.pump.classList.add("hidden");
    panels.pump.classList.remove("panel-enter");
    if (pumpShell) pumpShell.classList.remove("threat-mid", "threat-high");
  }
}

function refreshUpgradesUI() {
  upCoins.textContent = `CASH $${save.coins}`;
  if (!garageFocusId) garageFocusId = save.selectedCar;
  const focus = getCar(garageFocusId);
  if (upCarName) upCarName.textContent = focus.name;

  if (carListEl && !carListEl.dataset.built) {
    carListEl.innerHTML = "";
    for (const c of BUYABLE_CARS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "car-card";
      btn.dataset.carId = c.id;
      btn.setAttribute("role", "listitem");
      btn.innerHTML = `<img src="${previewUrl(c.id)}" alt="${c.name}" loading="lazy" /><span class="car-card-label">${c.name}</span>`;
      btn.onclick = () => {
        garageFocusId = c.id;
        refreshUpgradesUI();
      };
      carListEl.appendChild(btn);
    }
    carListEl.dataset.built = "1";
  }

  if (carListEl) {
    for (const btn of carListEl.querySelectorAll(".car-card")) {
      const id = btn.dataset.carId;
      const unlocked = isUnlocked(save, id);
      const def = getCar(id);
      btn.classList.toggle("selected", id === garageFocusId);
      btn.classList.toggle("equipped", id === save.selectedCar);
      btn.classList.toggle("locked", !unlocked);
      const label = btn.querySelector(".car-card-label");
      if (label) {
        if (!unlocked) {
          label.innerHTML = `${def.name}<br><span class="car-card-cost">$${def.cost}</span>`;
        } else if (id === save.selectedCar) {
          label.textContent = `${def.name} ★`;
        } else {
          label.textContent = def.name;
        }
      }
    }
  }

  const unlockedFocus = isUnlocked(save, garageFocusId);
  if (btnCarAction) {
    if (!unlockedFocus) {
      const cost = focus.cost;
      btnCarAction.textContent = save.coins >= cost ? `Buy $${cost}` : `Need $${cost}`;
      btnCarAction.disabled = save.coins < cost;
    } else if (garageFocusId === save.selectedCar) {
      btnCarAction.textContent = "Equipped";
      btnCarAction.disabled = true;
    } else {
      btnCarAction.textContent = "Select";
      btnCarAction.disabled = false;
    }
  }

  const levels = save.cars[garageFocusId] || { topSpeedLevel: 0, accelerationLevel: 0, handlingLevel: 0 };
  const bind = (labelEl, btn, title, key, pipsEl) => {
    const level = levels[key] | 0;
    const cost = costFor(level);
    labelEl.textContent = `${title}` + (cost < 0 ? " MAX" : ` $${cost}`);
    btn.disabled = !unlockedFocus || cost < 0 || save.coins < cost;
    renderUpgradePips(pipsEl, level);
  };
  bind(upSpeedLabel, btnUpSpeed, "SPEED", "topSpeedLevel", upSpeedPips);
  bind(upAccelLabel, btnUpAccel, "ACCEL", "accelerationLevel", upAccelPips);
  bind(upHandlingLabel, btnUpHandling, "HANDL", "handlingLevel", upHandlingPips);
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
const sky = addSky(camera);

// Permanent berm under the road so the navy void never reads as bare ground
const worldGround = new THREE.Mesh(
  new THREE.PlaneGeometry(90, 500),
  new THREE.MeshBasicMaterial({ color: NES.forest })
);
worldGround.rotation.x = -Math.PI / 2;
worldGround.position.set(0, -0.04, 80);
worldGround.renderOrder = -2;
scene.add(worldGround);
applyBiomeAtmosphere(scene, sky, worldGround, "city", renderer);

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
/** Camera panned toward a roadside gas station (side: -1 left, +1 right). */
function stationCamPos(lx, pz, side, out = _tmpV) {
  return out.set(lx * 0.08 + side * GAS_CAM_PAN, 7.6, pz - 11);
}
function stationCamLook(lotX, pz, out = _tmpV2) {
  return out.set(lotX * 0.72, 1.4, pz + 5);
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
 * Gas visit state machine: pullIn → pumping → waitClear → pullOut (or bust).
 * @type {null | {
 *   phase: "pullIn"|"pumping"|"waitClear"|"pullOut",
 *   seg: object,
 *   side: 1|-1,
 *   requiredLane: number,
 *   fromX: number, fromZ: number, fromYaw: number,
 *   lotX: number, lotZ: number,
 *   outX: number, outZ: number,
 *   t: number, duration: number,
 *   holding: boolean,
 *   cop: object|null,
 *   camPan: number,
 * }}
 */
let gasVisit = null;
let gasHintTimer = 0;
let turnYaw = 0;
let turnYawVel = 0;
let onRampPending = false;
let pursuit = null;
let bustPending = false;
/** Seconds remaining for the opening chase siren boost (0 = faded) */
let sirenOpeningT = 0;
/** Smoothed siren level so volume tracks distance without frame jitter */
let sirenSmoothVol = 0;
let keysBrake = false;
/** Active pointer gesture: { x, y, t, id } or null */
let touchStart = null;
/** True once this gesture already fired a swipe (threshold-on-move). */
let swipeConsumed = false;
/** Last real touch timestamp — suppresses ghost mouse events on mobile. */
let lastTouchAt = 0;
/** One buffered swipe while intro is playing (applied when driving starts). */
let pendingSwipe = null;
let last = performance.now();
let worldSeed = 1;
let transitionQueue = [];
let transitionFrom = null;
let transitionTo = null;
let transitioning = false;
/** Closing lane indices for the active corridor (kept after queue drains). */
let transitionCloseLanes = [];
let menuTime = 0;
let crossSpawnTimer = 0;

const activeSegments = [];
const activeTraffic = [];
const activeCoins = [];
const activeCross = [];
const activeObstacles = [];

await preloadVehicles();

/** @type {THREE.Group} */
let player = createVehicle(save.selectedCar, { tint: false });
scene.add(player);

function syncPlayerCar() {
  exhaustFlicker = null;
  player = replacePlayerVehicle(scene, player, save.selectedCar);
  ensureExhaustFlicker();
}

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

const coinPool = new Pool(() => { const c = makeCoin(tex); scene.add(c); return c; }, 10);
const conePool = new Pool(() => { const o = makeCone(); scene.add(o); return o; }, 24);
const barricadePool = new Pool(() => { const o = makeBarricade(); scene.add(o); return o; }, 12);
const dustPool = new Pool(() => { const o = makeDustMote(); scene.add(o); return o; }, 16);

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
  else if (o.userData.kind === "dust") dustPool.return(o);
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
      cone.userData.wobblePhase = Math.random() * Math.PI * 2;
      activeObstacles.push(cone);
    }
    // Sparse dust motes so closed lanes feel hazardous
    for (let d = 0; d < 2; d++) {
      const dust = dustPool.rent();
      dust.position.set(
        x + (Math.random() - 0.5) * 1.2,
        0.08 + Math.random() * 0.15,
        zBase - SEG_LEN * 0.1 + d * 4.5 + Math.random() * 2
      );
      dust.userData.wobblePhase = Math.random() * Math.PI * 2;
      activeObstacles.push(dust);
    }
  }
}

function remapLaneToLayout() {
  const { layout, usable } = playerControlLayout();
  lane = nearestUsableLane(layout, laneX, usable, true);
  laneX = layout.xs[lane];
  laneVel = 0;
}

function adoptBiomeFromSegment(seg) {
  if (!seg || !seg.userData.adoptBiome) return;
  const next = seg.userData.biome;
  if (!next || next === activeBiome) return;
  activeBiome = next;
  applyBiomeAtmosphere(scene, sky, worldGround, activeBiome, renderer);
  // Do not auto-merge the player — only sync lane index if already on a valid center
  syncPlayerLaneIndexIfAligned();
  if (!transitionQueue.length && transitioning && transitionTo === next) {
    transitioning = false;
    transitionFrom = null;
    transitionTo = null;
    transitionCloseLanes = [];
  }
}

/** Sync `lane` to a usable index only when laneX is already on that center (no auto-steer). */
function syncPlayerLaneIndexIfAligned() {
  const { layout, usable } = playerControlLayout();
  if (usable.includes(lane) && lane < layout.count) return;
  for (const i of usable) {
    if (Math.abs(laneX - layout.xs[i]) < 0.75) {
      lane = i;
      return;
    }
  }
}

function clearAheadTrafficSoft() {
  // Only cull traffic far ahead so the corridor isn't jammed with wrong-biome cars
  for (let i = activeTraffic.length - 1; i >= 0; i--) {
    const t = activeTraffic[i];
    if (t.userData.pursuit) continue;
    if (t.position.z > playerZ + 55) {
      activeTraffic.splice(i, 1);
      returnTrafficCar(t);
    }
  }
}

function roadHalfForSegment(seg) {
  if (!seg) return layoutFor(activeBiome).width / 2;
  const wStart = seg.userData.widthStart;
  const wEnd = seg.userData.widthEnd;
  if (wStart != null && wEnd != null) return Math.min(wStart, wEnd) / 2;
  if (seg.userData.layoutWidth) return seg.userData.layoutWidth / 2;
  return layoutForSegment(seg).width / 2;
}

function clampTrafficX(x, seg) {
  const half = Math.max(1.2, roadHalfForSegment(seg) - 0.6);
  return THREE.MathUtils.clamp(x, -half, half);
}

/** Most restrictive usable-lane set along [fromZ, fromZ+range]. */
function restrictiveUsableAhead(fromZ, range = 40) {
  let best = null;
  let bestCount = Infinity;
  let bestSeg = getSegmentAt(fromZ);
  for (let z = fromZ; z <= fromZ + range; z += SEG_LEN * 0.5) {
    const seg = getSegmentAt(z);
    if (!seg) continue;
    const u = usableLanesForSegment(seg);
    if (u.length < bestCount) {
      bestCount = u.length;
      best = u;
      bestSeg = seg;
    }
  }
  return { usable: best, seg: bestSeg };
}

function effectiveCloseLanes() {
  if (transitionCloseLanes.length) return transitionCloseLanes;
  if (transitionFrom && transitionTo) {
    return getTransitionDef(transitionFrom, transitionTo).closeLaneIndices || [];
  }
  return [];
}

function trafficLaneOf(t) {
  if (t.userData.mergeActive && t.userData.mergeLane != null) return t.userData.mergeLane;
  return t.userData.lane;
}

/** Nearest same-dir car ahead in the same lane (or merging into it). */
function findLeadCar(t) {
  const dir = t.userData.dir || 1;
  const myLane = trafficLaneOf(t);
  let best = null;
  let bestDist = Infinity;
  for (const o of activeTraffic) {
    if (o === t || o.userData.pursuit || o.userData.gasThreat) continue;
    if ((o.userData.dir || 1) !== dir) continue;
    if (trafficLaneOf(o) !== myLane) continue;
    const dz = (o.position.z - t.position.z) * dir;
    if (dz <= 0.4) continue;
    if (dz < bestDist) {
      bestDist = dz;
      best = o;
    }
  }
  return best ? { car: best, dist: bestDist } : null;
}

function laneWindowClear(laneIdx, z, dir, exclude, behind = 3, ahead = 7) {
  for (const o of activeTraffic) {
    if (o === exclude || o.userData.pursuit || o.userData.gasThreat) continue;
    if ((o.userData.dir || 1) !== dir) continue;
    if (trafficLaneOf(o) !== laneIdx) continue;
    const dz = (o.position.z - z) * dir;
    if (dz > -behind && dz < ahead) return false;
  }
  return true;
}

function applyHeadway(t, dt) {
  const dir = t.userData.dir || 1;
  if (dir !== 1 && dir !== -1) return;
  const lead = findLeadCar(t);
  const cruise = t.userData.cruiseSpeed || t.userData.speed || 8;
  let target = cruise;
  if (lead) {
    const gap = lead.dist - CAR_HALF_LEN * 2;
    if (gap < HEADWAY_GAP) {
      const leadSp = lead.car.userData.speed || 0;
      target = gap < 1.2 ? Math.min(leadSp * 0.5, 1.5) : Math.min(cruise, Math.max(0, leadSp + (gap - HEADWAY_GAP) * 1.6));
    }
  }
  t.userData.speed = THREE.MathUtils.damp(t.userData.speed, target, 5, dt);
}

function pickMergeTarget(t, layout, openLanes) {
  const dir = t.userData.dir || 1;
  const sameDir = openLanes.filter((i) => layout.dirs[i] === dir);
  const pool = sameDir.length ? sameDir : openLanes;
  if (!pool.length) return null;
  return nearestUsableLane(layout, t.position.x, pool, dir === 1);
}

/** Schedule a staggered merge (delay only — does not start slide yet). */
function scheduleMerge(t, targetLane, layout) {
  if (t.userData.mergeScheduled || t.userData.mergeActive) return;
  t.userData.mergeScheduled = true;
  t.userData.mergeTargetLane = targetLane;
  t.userData.mergeTargetX = layout.xs[targetLane];
  t.userData.mergeDelay = MERGE_DELAY_MIN + Math.random() * (MERGE_DELAY_MAX - MERGE_DELAY_MIN);
  t.userData.mergeDist = MERGE_DIST_MIN + Math.random() * (MERGE_DIST_MAX - MERGE_DIST_MIN);
  t.userData.mergeActive = false;
  t.userData.mergeX = null;
  t.userData.mergeLane = null;
}

function zipperAllowsStart(t) {
  const dir = t.userData.dir || 1;
  const target = t.userData.mergeTargetLane;
  if (target == null) return false;
  // Among cars ready to start (delay done), only the farthest-ahead may go
  let best = t;
  let bestKey = dir === 1 ? t.position.z : -t.position.z;
  for (const o of activeTraffic) {
    if (o === t || o.userData.pursuit || o.userData.gasThreat) continue;
    if ((o.userData.dir || 1) !== dir) continue;
    if (!o.userData.mergeScheduled || o.userData.mergeActive) continue;
    if (o.userData.mergeTargetLane !== target) continue;
    if ((o.userData.mergeDelay || 0) > 0) continue;
    const key = dir === 1 ? o.position.z : -o.position.z;
    if (key > bestKey) {
      best = o;
      bestKey = key;
    }
  }
  if (best !== t) return false;
  // Another car currently sliding into the same target must clear zipper gap first
  for (const o of activeTraffic) {
    if (o === t || o.userData.pursuit || o.userData.gasThreat) continue;
    if ((o.userData.dir || 1) !== dir) continue;
    if (o.userData.mergeActive && o.userData.mergeTargetLane === target) {
      if (Math.abs(o.position.z - t.position.z) < ZIPPER_GAP) return false;
    }
  }
  return true;
}

function setNpcBlinkers(t, side /* -1 left, 1 right, 0 off */) {
  const L = t.userData.blinkerL;
  const R = t.userData.blinkerR;
  if (!L || !R) return;
  if (side === 0) {
    L.visible = false;
    R.visible = false;
    return;
  }
  const on = Math.floor(performance.now() / 140) % 2 === 0;
  L.visible = side < 0 && on;
  R.visible = side > 0 && on;
}

function clearMergeState(t) {
  t.userData.mergeScheduled = false;
  t.userData.mergeActive = false;
  t.userData.mergeDelay = 0;
  t.userData.mergeX = null;
  t.userData.mergeLane = null;
  t.userData.mergeTargetLane = null;
  t.userData.mergeTargetX = null;
  t.userData.needsCloseMerge = false;
  setNpcBlinkers(t, 0);
}

/**
 * Seed staggered merge schedules on nearby NPCs in closing lanes.
 * Slide starts after random delay + zipper/gap checks (not instantly).
 */
function kickClosingLaneMerges(fromBiome, toBiome) {
  const def = getTransitionDef(fromBiome, toBiome);
  const closeOrder = def.closeLaneIndices || [];
  if (!closeOrder.length) return;
  const closeSet = new Set(closeOrder);
  const fromLayout = layoutFor(fromBiome);
  const openLanes = [...Array(fromLayout.count).keys()].filter((i) => !closeSet.has(i));
  if (!openLanes.length) return;
  for (const t of activeTraffic) {
    if (t.userData.pursuit || t.userData.gasThreat) continue;
    if (!closeSet.has(t.userData.lane)) continue;
    if (t.position.z < playerZ - 5 || t.position.z > playerZ + 90) continue;
    const target = pickMergeTarget(t, fromLayout, openLanes);
    if (target == null || target === t.userData.lane) continue;
    scheduleMerge(t, target, fromLayout);
  }
}

function distToLaneClosure(t) {
  const dir = t.userData.dir || 1;
  const laneIdx = t.userData.lane;

  // Already on a closed / invalid lane
  const curr = getSegmentAt(t.position.z);
  if (curr) {
    const usable = usableLanesForSegment(curr);
    const layout = layoutForSegment(curr);
    if (laneIdx == null || laneIdx < 0 || laneIdx >= layout.count || !usable.includes(laneIdx)) {
      return 0;
    }
  }

  for (let d = 4; d <= MERGE_LOOKAHEAD + 8; d += 4) {
    const seg = getSegmentAt(t.position.z + dir * d);
    if (!seg) continue;
    const usable = usableLanesForSegment(seg);
    const layout = layoutForSegment(seg);
    if (laneIdx == null || laneIdx < 0 || laneIdx >= layout.count || !usable.includes(laneIdx)) {
      return d;
    }
  }
  return Infinity;
}

/**
 * Soft-merge NPC out of a closing lane: schedule → delay → zipper → gap check → slide.
 */
function updateNpcLaneMerge(t, dt) {
  if (t.userData.pursuit || t.userData.gasThreat) return;
  const dir = t.userData.dir || 1;

  // Look-ahead: schedule when a closed lane is within jittered merge distance
  if (!t.userData.mergeScheduled && !t.userData.mergeActive) {
    const dist = distToLaneClosure(t);
    const trigger =
      t.userData.mergeDist ||
      MERGE_DIST_MIN + Math.random() * (MERGE_DIST_MAX - MERGE_DIST_MIN);
    t.userData.mergeDist = trigger;
    if (dist <= trigger) {
      const aheadSeg =
        getSegmentAt(t.position.z + dir * Math.min(Math.max(dist, 4), MERGE_LOOKAHEAD)) ||
        getSegmentAt(t.position.z);
      const layout = aheadSeg
        ? layoutForSegment(aheadSeg)
        : transitionFrom
          ? layoutFor(transitionFrom)
          : currentLayout();
      let usable = aheadSeg
        ? usableLanesForSegment(aheadSeg)
        : [...Array(layout.count).keys()];
      const close = effectiveCloseLanes();
      if (close.length) {
        const open = usable.filter((i) => !close.includes(i));
        if (open.length) usable = open;
      } else {
        // Prefer lanes that remain usable at the closed tile ahead
        const closedSeg = getSegmentAt(t.position.z + dir * Math.max(dist, 4));
        if (closedSeg) usable = usableLanesForSegment(closedSeg);
      }
      const target = pickMergeTarget(t, layout, usable);
      if (target != null && target !== t.userData.lane) {
        scheduleMerge(t, target, layout);
      }
    }
  }

  if (t.userData.mergeScheduled && !t.userData.mergeActive) {
    const side = (t.userData.mergeTargetX ?? t.position.x) >= t.position.x ? 1 : -1;
    setNpcBlinkers(t, side);
    t.userData.mergeDelay = Math.max(0, (t.userData.mergeDelay || 0) - dt);
    if (t.userData.mergeDelay <= 0 && zipperAllowsStart(t)) {
      const target = t.userData.mergeTargetLane;
      if (target != null && laneWindowClear(target, t.position.z, dir, t, 3, 7)) {
        t.userData.mergeActive = true;
        t.userData.mergeLane = target;
        t.userData.mergeX = t.userData.mergeTargetX;
      } else {
        // Hold / slight slow while waiting for a hole
        t.userData.speed = THREE.MathUtils.damp(
          t.userData.speed,
          Math.max(2, (t.userData.cruiseSpeed || 8) * 0.55),
          4,
          dt
        );
      }
    }
  }

  if (!t.userData.mergeActive || t.userData.mergeX == null) return;

  const side = t.userData.mergeX >= t.position.x ? 1 : -1;
  setNpcBlinkers(t, side);
  // Abort slide if target became blocked mid-merge and we're still mostly in old lane
  if (!laneWindowClear(t.userData.mergeLane, t.position.z, dir, t, 2, 5)) {
    if (Math.abs(t.position.x - t.userData.mergeX) > 1.2) {
      t.userData.mergeActive = false;
      t.userData.mergeX = null;
      t.userData.mergeScheduled = true;
      t.userData.mergeDelay = 0.35 + Math.random() * 0.5;
      return;
    }
  }

  t.position.x = THREE.MathUtils.damp(t.position.x, t.userData.mergeX, 4.2, dt);
  const seg = getSegmentAt(t.position.z);
  t.position.x = clampTrafficX(t.position.x, seg);

  if (Math.abs(t.position.x - t.userData.mergeX) < 0.2) {
    t.position.x = t.userData.mergeX;
    if (t.userData.mergeLane != null) t.userData.lane = t.userData.mergeLane;
    clearMergeState(t);
  }
}

function beginBiomeTransition(toBiome) {
  if (transitioning && transitionTo === toBiome) return;
  const from = activeBiome;
  transitionFrom = from;
  transitionTo = toBiome;
  transitionQueue = buildTransitionPlan(from, toBiome);
  transitioning = true;
  const def = getTransitionDef(from, toBiome);
  transitionCloseLanes = (def.closeLaneIndices || []).slice();
  turnCooldown = TURN_COOLDOWN_SEGS + transitionQueue.length + 2;
  intersectionCooldown = Math.max(intersectionCooldown, INTERSECTION_COOLDOWN_SEGS + 1);
  gasCooldown = Math.max(gasCooldown, 4);
  turnActive = null;
  nearbyStation = null;
  hideStationFloat();
  clearAheadTrafficSoft();
  kickClosingLaneMerges(from, toBiome);
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
  clearMixBiomeOverlay(seg);
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

  if (
    plan.widthStart != null &&
    plan.widthEnd != null &&
    (plan.phase === "taper" || Math.abs(plan.widthStart - plan.widthEnd) > 0.01)
  ) {
    applyRoadTaper(seg, plan.widthStart, plan.widthEnd, plan.markT);
  }
  if (plan.mixBiome) {
    applyMixBiomeOverlay(seg, plan.mixBiome, tex);
  } else {
    clearMixBiomeOverlay(seg);
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
    // Keep transitionFrom / transitionCloseLanes until player adopts enter tile
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
    returnTrafficCar(t);
  }
  while (activeCross.length) returnCross(activeCross.pop());
  while (activeCoins.length) coinPool.return(activeCoins.pop());
  while (activeObstacles.length) returnObstacle(activeObstacles.pop());
  pursuit = null;
  transitionQueue = [];
  transitioning = false;
  transitionFrom = null;
  transitionTo = null;
  transitionCloseLanes = [];
  nearbyStation = null;
  endGasVisit({ resume: false, busted: false });
  hideStationFloat();
  hideGasHint();
}

function updateHeatUI() {
  if (!hudHeatFill) return;
  hudHeatFill.style.width = `${Math.min(100, heat)}%`;
  if (hudHeat) hudHeat.classList.toggle("hot", heat >= 70);
  updateHeatVignette();
}

/**
 * Siren volume tracks the HUD police distance bar immediately:
 * silent below 60% fill, on at 60%, louder as the bar climbs.
 * Opening cue still plays at run start.
 * @param {number} dt
 */
function updateSirenAudio(dt) {
  if (!alive || (!running && !gasVisit && !intro)) {
    stopSiren();
    sirenSmoothVol = 0;
    return;
  }
  if (sirenOpeningT > 0) sirenOpeningT = Math.max(0, sirenOpeningT - dt);
  const opening = sirenOpeningT > 0
    ? SIREN_OPENING * (sirenOpeningT / SIREN_OPENING_FADE)
    : 0;

  resumeSirenAudio();
  startSiren();

  // Exact same value that drives the police distance bar width
  const bar = Math.max(0, Math.min(1, heat / 100));
  const target = sirenLevelFromProximity(
    { bar, opening },
    {
      onset: SIREN_ONSET,
      volNear: SIREN_VOL_NEAR,
      volOnset: SIREN_VOL_ONSET,
    },
  );
  // Fast attack when the bar crosses 60% so sirens kick in right away
  const damp = target > sirenSmoothVol ? 14 : 6;
  sirenSmoothVol = THREE.MathUtils.damp(sirenSmoothVol, target, damp, dt);
  setSirenVolume(sirenSmoothVol);
}

/** Begin chase audio — called when gameplay (or intro) starts. */
function beginChaseSiren() {
  unlockSirenAudio();
  resumeSirenAudio();
  sirenOpeningT = SIREN_OPENING_FADE;
  sirenSmoothVol = SIREN_OPENING;
  startSiren();
  setSirenVolume(SIREN_OPENING);
}

/**
 * Spawn a trailing police car behind the player (visual chase presence).
 */
function spawnOpeningChaseCop() {
  const layout = currentLayout();
  const car = rentPolice(scene);
  const tLane = Math.min(Math.max(0, lane), layout.count - 1);
  const behind = 34;
  car.position.set(layout.xs[tLane], 0, playerZ - behind);
  car.rotation.y = 0;
  car.userData.police = true;
  car.userData.pursuit = false;
  car.userData.gasThreat = false;
  car.userData.curbParked = false;
  car.userData.openingChase = true;
  car.userData.dir = 1;
  car.userData.speed = Math.max(8, speed * 0.92);
  car.userData.cruiseSpeed = car.userData.speed;
  car.userData.lane = tLane;
  car.userData.stopped = false;
  activeTraffic.push(car);
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
  if (hudStationFloat) {
    hudStationFloat.classList.add("hidden");
    hudStationFloat.style.left = "";
    hudStationFloat.style.top = "";
  }
}

function hideMergeBtn() {
  if (hudMergeBtn) hudMergeBtn.classList.add("hidden");
}

function showMergeBtn() {
  if (hudMergeBtn) hudMergeBtn.classList.remove("hidden");
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

/** Static FILL UP TANK CTA — only in the curb lane while alongside an open station. */
function updateStationFloat(seg) {
  if (!hudStationFloat || !seg || gasVisit || seg.userData.gasResolved) {
    hideStationFloat();
    return;
  }
  const dz = seg.position.z - playerZ;
  // Hide once past the lot or still too far ahead
  if (dz < -2 || Math.abs(dz) > GAS_INTERACT_RANGE) {
    hideStationFloat();
    return;
  }
  if (!playerInStationLane(seg)) {
    hideStationFloat();
    return;
  }
  hudStationFloat.textContent = "FILL UP TANK";
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

function applyStationCamera(side, lotX, pz, blend = 1) {
  const panSide = side < 0 ? -1 : 1;
  const defPos = gameplayCamPos(laneX, pz, new THREE.Vector3());
  const stPos = stationCamPos(laneX, pz, panSide, new THREE.Vector3());
  const defLook = gameplayCamLook(laneX, pz, new THREE.Vector3());
  const stLook = stationCamLook(lotX, pz, new THREE.Vector3());
  camera.position.lerpVectors(defPos, stPos, blend);
  _camLook.lerpVectors(defLook, stLook, blend);
  camera.lookAt(_camLook);
}

function spawnGasThreatCop() {
  if (!gasVisit || gasVisit.cop) return;
  const car = rentPolice(scene);
  car.position.set(gasVisit.lotX * 0.35, 0, playerZ - GAS_COP_Z_FAR);
  car.rotation.y = 0;
  car.userData.police = true;
  car.userData.pursuit = false;
  car.userData.openingChase = false;
  car.userData.curbParked = false;
  car.userData.gasThreat = true;
  car.userData.dir = 1;
  car.userData.speed = 0;
  activeTraffic.push(car);
  gasVisit.cop = car;
}

/** Heat + threat cop keep advancing for the whole stop (enter → merge wait). */
function tickGasVisitThreat(dt) {
  if (!gasVisit) return false;
  const holding = gasVisit.phase === "pumping" && gasVisit.holding;
  const waiting = gasVisit.phase === "waitClear";
  let rate = GAS_VISIT_HEAT_PER_SEC;
  if (holding) rate = GAS_HOLD_HEAT_PER_SEC;
  else if (waiting) rate = GAS_MERGE_HEAT_PER_SEC;
  heat = Math.min(100, heat + rate * dt);

  const threat = heat / 100;
  const zOff = THREE.MathUtils.lerp(GAS_COP_Z_FAR, GAS_COP_Z_NEAR, threat);
  if (gasVisit.cop) {
    const targetZ = playerZ - zOff;
    // Creep slower while waiting to merge so the player can find a gap
    const catchUp = holding ? 5 : waiting ? 1.1 : 2.4;
    gasVisit.cop.position.z = THREE.MathUtils.damp(
      gasVisit.cop.position.z,
      targetZ,
      catchUp,
      dt
    );
    gasVisit.cop.position.x = THREE.MathUtils.damp(gasVisit.cop.position.x, laneX, waiting ? 1.6 : 3, dt);
  }

  updateHeatUI();
  if (pumpHeatFill) pumpHeatFill.style.width = `${Math.min(100, heat)}%`;
  if (pumpShell) {
    pumpShell.classList.toggle("threat-mid", heat >= 40 && heat < 70);
    pumpShell.classList.toggle("threat-high", heat >= 70);
  }
  if (heat >= 100) {
    bustAtPump();
    return true;
  }
  return false;
}

function beginGasVisit(seg) {
  if (gasVisit || !seg || !alive) return;
  nearbyStation = null;
  hideStationFloat();
  hideMergeBtn();
  hideGasHint();
  seg.userData.gasResolved = true;

  const requiredLane = requiredLaneForStation(seg);
  const layout = layoutForSegment(seg);
  const lotX = stationLotX(seg);
  const lotZ = seg.position.z;
  const side = seg.userData.gasSide < 0 ? -1 : 1;

  gasVisit = {
    phase: "pullIn",
    seg,
    side,
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
    camPan: 0,
  };
  speed = 0;
  braking = true;
  running = false;
  showPumpPanel(false);
  // Cops close in as soon as you pull in — heat bar keeps moving
  spawnGasThreatCop();
  updateHeatUI();
}

function startPumpingPhase() {
  if (!gasVisit) return;
  gasVisit.phase = "pumping";
  gasVisit.holding = false;
  gasVisit.t = 0;
  spawnGasThreatCop();
  showPumpPanel(true);
  hideMergeBtn();
  updatePumpHoldUI();
}

/** After pumping: wait for player to choose when traffic is clear. */
function enterWaitClear() {
  if (!gasVisit || gasVisit.phase === "waitClear" || gasVisit.phase === "pullOut") return;
  setPumpHolding(false);
  showPumpPanel(false);
  // Keep threat cop — heat / distance bar still climb while waiting to merge
  gasVisit.phase = "waitClear";
  gasVisit.holding = false;
  showMergeBtn();
  updatePumpHoldUI();
  updateHeatUI();
}

function beginPullOut() {
  if (!gasVisit || gasVisit.phase === "pullOut") return;
  setPumpHolding(false);
  showPumpPanel(false);
  hideMergeBtn();
  if (gasVisit.cop) {
    const idx = activeTraffic.indexOf(gasVisit.cop);
    if (idx >= 0) activeTraffic.splice(idx, 1);
    returnTrafficCar(gasVisit.cop);
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
    returnTrafficCar(gasVisit.cop);
  }
  const was = !!gasVisit;
  gasVisit = null;
  showPumpPanel(false);
  hideMergeBtn();
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
    if (heat >= 85) pumpPreview.textContent = "COPS CLOSING IN — RELEASE & MERGE!";
    else if (gasVisit?.holding) pumpPreview.textContent = "FILLING… DANGER RISING";
    else pumpPreview.textContent = "HOLD TO FILL · COPS CLOSING IN";
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
    gasVisit.camPan = u;
    applyStationCamera(gasVisit.side, gasVisit.lotX, playerZ, u);
    if (tickGasVisitThreat(dt)) return;
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
    gasVisit.camPan = 1;
    applyStationCamera(gasVisit.side, gasVisit.lotX, playerZ, 1);

    if (gasVisit.holding) {
      gas = Math.min(100, gas + GAS_HOLD_FILL_PER_SEC * dt);
    }

    if (tickGasVisitThreat(dt)) return;
    updatePumpHoldUI();

    if (gas >= 100) {
      gas = 100;
      enterWaitClear();
      return;
    }
    return;
  }

  if (gasVisit.phase === "waitClear") {
    // Parked at the pump — heat / cops still close in while waiting for a gap
    player.position.set(laneX, 0, playerZ);
    player.rotation.set(0, 0, 0);
    gasVisit.camPan = 1;
    applyStationCamera(gasVisit.side, gasVisit.lotX, playerZ, 1);
    tickGasVisitThreat(dt);
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
    gasVisit.camPan = 1 - u;
    applyStationCamera(gasVisit.side, gasVisit.lotX, playerZ, 1 - u);
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
  const car = rentPolice(scene);
  const tLane = Math.min(lane, layout.count - 1);
  car.position.set(layout.xs[tLane], 0, playerZ - 18);
  car.rotation.y = 0;
  car.userData.police = true;
  car.userData.openingChase = false;
  car.userData.gasThreat = false;
  car.userData.curbParked = false;
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
  const car = rentCross(scene);
  const speed = hazard ? CROSS_HAZARD_SPEED : CROSS_SPEED * (0.85 + Math.random() * 0.3);
  const laneZ = seg.position.z + (Math.random() - 0.5) * 3.2;
  const startX = fromLeft ? -CROSS_SPAWN_X : CROSS_SPAWN_X;
  car.position.set(startX, 0, laneZ);
  car.rotation.y = fromLeft ? Math.PI / 2 : -Math.PI / 2;
  car.userData.vx = fromLeft ? speed : -speed;
  car.userData.crossKind = "van";
  car.userData.hazard = hazard;
  car.userData.police = false;
  car.userData.pursuit = false;
  activeCross.push(car);
  return car;
}

function spawnTrafficCar() {
  // Prefer layout of the segment where the car will spawn (~40–70m ahead)
  const spawnZ = playerZ + 45;
  const { usable: restrictive, seg: restrictSeg } = restrictiveUsableAhead(spawnZ, 40);
  const aheadSeg = restrictSeg || getSegmentAt(spawnZ) || getSegmentAt(playerZ);
  const layout = aheadSeg ? layoutForSegment(aheadSeg) : currentLayout();
  let usable = restrictive && restrictive.length
    ? restrictive.slice()
    : aheadSeg
      ? usableLanesForSegment(aheadSeg)
      : [...Array(layout.count).keys()];

  // During biome corridor, never spawn into lanes that are closing ahead
  const close = effectiveCloseLanes();
  if (close.length) {
    const open = usable.filter((i) => !close.includes(i));
    if (open.length) usable = open;
  }

  const oncomingIdx = [];
  const sameIdx = [];
  for (const i of usable) {
    if (i < 0 || i >= layout.count) continue;
    // Also reject lanes whose X sits outside the tapered asphalt
    const half = roadHalfForSegment(aheadSeg);
    if (Math.abs(layout.xs[i]) > half - 0.4) continue;
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
  let zTry;
  if (!wantOncoming) {
    const ahead = findAheadIntersection(playerZ + 35, 55);
    zTry = playerZ + 40 + Math.random() * 30;
    if (ahead && (ahead.userData.lightState === "red" || ahead.userData.lightState === "yellow")) {
      const stopZ = ahead.position.z - NPC_STOP_OFFSET;
      if (Math.abs(zTry - stopZ) < 8) return;
    }
  } else {
    zTry = playerZ + 50 + Math.random() * 40;
  }

  // Headway: don't spawn on top of same-lane traffic
  for (const o of activeTraffic) {
    if (o.userData.pursuit || o.userData.gasThreat) continue;
    if (trafficLaneOf(o) !== tLane) continue;
    if (Math.abs(o.position.z - zTry) < HEADWAY_GAP + 1.5) return;
  }

  const police = !wantOncoming && Math.random() < 0.12;
  const car = police ? rentPolice(scene) : rentCivilian(scene);
  const dir = layout.dirs[tLane];
  let x = clampTrafficX(layout.xs[tLane], aheadSeg);
  car.position.set(x, 0, zTry);
  car.rotation.y = dir === -1 ? Math.PI : 0;
  if (dir === -1) {
    car.userData.speed = 14 + Math.random() * 8;
  } else {
    car.userData.speed = police ? speed * 0.9 : 6 + Math.random() * 6;
  }
  car.userData.cruiseSpeed = car.userData.speed;
  car.userData.police = police;
  // Role flags must be cleared — pool reuse can leave curbParked / chase /
  // gasThreat set, which freezes the car and skips player collision.
  car.userData.pursuit = false;
  car.userData.curbParked = false;
  car.userData.openingChase = false;
  car.userData.gasThreat = false;
  car.userData.dir = dir;
  car.userData.lane = tLane;
  car.userData.stopped = false;
  clearMergeState(car);
  car.userData.mergeDist = MERGE_DIST_MIN + Math.random() * (MERGE_DIST_MAX - MERGE_DIST_MIN);
  car.userData.nearMissed = false;
  activeTraffic.push(car);
}

function endRun(reason) {
  if (!alive) return;
  alive = false;
  running = false;
  intro = null;
  sirenOpeningT = 0;
  stopSiren();
  sirenSmoothVol = 0;
  setSpeedlines(false);
  if (reason === "bust") {
    triggerFlash("bust");
    triggerShake(0.55, 0.45);
  } else {
    triggerFlash("wreck");
    triggerShake(0.7, 0.4);
  }
  if (gasVisit?.cop) {
    const idx = activeTraffic.indexOf(gasVisit.cop);
    if (idx >= 0) activeTraffic.splice(idx, 1);
    returnTrafficCar(gasVisit.cop);
  }
  gasVisit = null;
  showPumpPanel(false);
  hideMergeBtn();
  nearbyStation = null;
  hideStationFloat();
  hideGasHint();
  if (goTitle) goTitle.textContent = reason === "bust" ? "Busted!" : "Wrecked!";
  goScoreTarget = Math.floor(distance);
  goScoreDisplay = 0;
  if (goScore) goScore.textContent = `0 m`;
  goCoins.textContent = `+$${runCoins}`;
  writeSave(save);
  fromGameOver = true;
  setupMenuScene(); // rebuild city title street under game-over UI
  if (panels.gameover) {
    panels.gameover.classList.toggle("go-bust", reason === "bust");
    panels.gameover.classList.toggle("go-wreck", reason !== "bust");
  }
  if (btnRetry) {
    btnRetry.disabled = true;
    goRetryTimer = 0.45;
  }
  showPanel("gameover");
  updateHeatVignette();
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
  stopSiren();
  sirenOpeningT = 0;
  sirenSmoothVol = 0;
  running = false;
  alive = false;
  intro = null;
  activeBiome = "city";
  applyBiomeAtmosphere(scene, sky, worldGround, "city", renderer);
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

  spawnCurbDecoCars();
  syncPlayerCar();
  parkPlayerCurbside();
  applyMenuCamera();
  menuTime = 0;
  ensureExhaustFlicker();
  updateHeatVignette();
  setSpeedlines(false);
}

/** Parked curb cars on the title street — kept through intro until they scroll out of view. */
function spawnCurbDecoCars() {
  const decoZs = [15, 27];
  const decoIds = pickDistinctMenuDecoIds(decoZs.length, [save.selectedCar]);
  for (let i = 0; i < decoZs.length; i++) {
    const deco = rentCivilian(scene, decoIds[i] || "coupe");
    deco.position.set(MENU_PARK.x - 0.15 * i, 0, decoZs[i]);
    deco.rotation.y = i === 0 ? 0.04 : -0.03;
    deco.userData.police = false;
    deco.userData.pursuit = false;
    deco.userData.dir = 1;
    deco.userData.speed = 0;
    deco.userData.cruiseSpeed = 0;
    deco.userData.lane = -1;
    deco.userData.curbParked = true;
    clearMergeState(deco);
    activeTraffic.push(deco);
  }
}

function resetRunState() {
  activeBiome = "city";
  applyBiomeAtmosphere(scene, sky, worldGround, "city", renderer);
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
  nextSpawnZ = -2 * SEG_LEN;
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
  pendingSwipe = null;
  touchStart = null;
  swipeConsumed = false;
  crossSpawnTimer = 0.4;
  worldSeed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
  transitionQueue = [];
  transitioning = false;
  transitionFrom = null;
  transitionTo = null;
  transitionCloseLanes = [];
  sirenOpeningT = 0;
  sirenSmoothVol = 0;
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
  syncPlayerCar();
  for (let i = 0; i < 10; i++) spawnSegment();
  // Keep title-street curb cars through the pull-out until the camera leaves them behind
  spawnCurbDecoCars();

  showPanel("hud");
  showPumpPanel(false);
  hudCoins.textContent = `$${save.coins}`;
  if (hudTurn) hudTurn.classList.add("hidden");
  hideStationFloat();
  hideGasHint();
  if (hudLaneWarn) hudLaneWarn.classList.add("hidden");
  prevBoostActive = false;
  setSpeedlines(false);
  shakeAmp = 0;
  shakeTime = 0;
  camFovTarget = 72;
  ensureExhaustFlicker();
  updateHeatUI();
  updateGasUI();
  trafficTimer = 0.8;

  const toCam = gameplayCamPos(laneX, 0).clone();
  const toLook = gameplayCamLook(laneX, 0).clone();

  // Unlock + start chase sirens immediately so the pull-out feels like a pursuit
  beginChaseSiren();

  if (instant) {
    intro = null;
    running = true;
    alive = true;
    player.position.set(laneX, 0, 0);
    player.rotation.set(0, 0, 0);
    camera.position.copy(toCam);
    setCameraLook(toLook.x, toLook.y, toLook.z);
    spawnOpeningChaseCop();
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
  spawnOpeningChaseCop();
  if (pendingSwipe) {
    const dir = pendingSwipe;
    pendingSwipe = null;
    onSwipe(dir);
  }
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
  if (!running) {
    // Intro ignores live control — keep the latest gesture so it isn't lost
    if (intro) pendingSwipe = dir;
    return;
  }
  pendingSwipe = null;
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
    if (next >= 0 && next < layout.count && usable.includes(next) && next !== lane) {
      lane = next;
      // Stronger yaw kick into the lane change
      turnYawVel = -delta * TURN_YAW * 3.4;
      triggerShake(0.08, 0.1);
    }
  }
  if (dir === "down") startBrake();
  if (dir === "up") resumeThrottle();
}

function emitSwipeFromDelta(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) onSwipe(dx > 0 ? "right" : "left");
  else onSwipe(dy > 0 ? "down" : "up");
}

function pointerDown(x, y, id = 0) {
  touchStart = { x, y, t: performance.now(), id };
  swipeConsumed = false;
}

function pointerMove(x, y, id = 0) {
  if (!touchStart || swipeConsumed) return;
  if (id !== touchStart.id) return;
  const dx = x - touchStart.x;
  const dy = y - touchStart.y;
  if (Math.hypot(dx, dy) < MIN_SWIPE) return;
  // Fire as soon as the swipe crosses the threshold — no time cutoff.
  // Slow deliberate swipes used to miss when only resolved on release within 450ms.
  swipeConsumed = true;
  if (gasVisit) return;
  emitSwipeFromDelta(dx, dy);
}

function pointerUp(x, y, id = 0) {
  if (!touchStart) return;
  if (id !== touchStart.id) return;
  const start = touchStart;
  touchStart = null;
  if (swipeConsumed) {
    swipeConsumed = false;
    return;
  }
  if (gasVisit) return;
  const dx = x - start.x;
  const dy = y - start.y;
  const dt = performance.now() - start.t;
  const dist = Math.hypot(dx, dy);
  // Tap (not swipe) — try gas station interact
  if (dist < MIN_SWIPE) {
    if (dt < TAP_MAX_MS) tryTapGasStation(x, y);
    return;
  }
  // Swipe completed on release (threshold not hit during move, e.g. very fast flick)
  emitSwipeFromDelta(dx, dy);
}

function pointerCancel(id = 0) {
  if (!touchStart) return;
  if (id !== touchStart.id) return;
  touchStart = null;
  swipeConsumed = false;
}

function isGhostMouse() {
  return performance.now() - lastTouchAt < TOUCH_MOUSE_GUARD_MS;
}

function touchPoint(e, preferId = null) {
  const list = e.changedTouches || e.touches;
  if (!list || !list.length) return null;
  if (preferId != null) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].identifier === preferId) {
        return { x: list[i].clientX, y: list[i].clientY, id: list[i].identifier };
      }
    }
  }
  const t = list[0];
  return { x: t.clientX, y: t.clientY, id: t.identifier };
}

function activeTouchPoint(e, preferId) {
  let pt = touchPoint(e, preferId);
  if (pt || preferId == null || !e.touches) return pt;
  for (let i = 0; i < e.touches.length; i++) {
    if (e.touches[i].identifier === preferId) {
      return { x: e.touches[i].clientX, y: e.touches[i].clientY, id: e.touches[i].identifier };
    }
  }
  return null;
}

canvas.addEventListener("touchstart", (e) => {
  if (e.cancelable) e.preventDefault();
  lastTouchAt = performance.now();
  // Start a new gesture only when idle — ignore extra fingers mid-swipe
  if (touchStart) return;
  const p = touchPoint(e);
  if (p) pointerDown(p.x, p.y, p.id);
}, { passive: false });
canvas.addEventListener("touchmove", (e) => {
  if (e.cancelable) e.preventDefault();
  lastTouchAt = performance.now();
  if (!touchStart) return;
  const pt = activeTouchPoint(e, touchStart.id);
  if (pt) pointerMove(pt.x, pt.y, pt.id);
}, { passive: false });
canvas.addEventListener("touchend", (e) => {
  if (e.cancelable) e.preventDefault();
  lastTouchAt = performance.now();
  const p = touchPoint(e, touchStart?.id);
  if (p) pointerUp(p.x, p.y, p.id);
}, { passive: false });
canvas.addEventListener("touchcancel", (e) => {
  lastTouchAt = performance.now();
  const p = touchPoint(e, touchStart?.id);
  pointerCancel(p ? p.id : touchStart?.id ?? 0);
}, { passive: true });

canvas.addEventListener("mousedown", (e) => {
  if (isGhostMouse()) return;
  if (e.button !== 0) return;
  pointerDown(e.clientX, e.clientY, -1);
});
window.addEventListener("mousemove", (e) => {
  if (!touchStart || touchStart.id !== -1) return;
  pointerMove(e.clientX, e.clientY, -1);
});
window.addEventListener("mouseup", (e) => {
  if (e.button !== 0) return;
  if (!touchStart || touchStart.id !== -1) return;
  pointerUp(e.clientX, e.clientY, -1);
});
window.addEventListener("blur", () => pointerCancel(touchStart?.id ?? 0));

function gameKey(e) {
  if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") return e.key;
  if (e.key === " ") return " ";
  if (e.key === "Enter") return "Enter";
  if (e.key.length === 1) return e.key.toLowerCase();
  return e.key;
}

window.addEventListener("keydown", (e) => {
  const key = gameKey(e);
  if (gasVisit?.phase === "pumping") {
    if (key === " " || key === "f") {
      e.preventDefault();
      setPumpHolding(true);
    }
    return;
  }
  if (gasVisit?.phase === "waitClear") {
    if (key === " " || key === "Enter" || key === "w" || key === "ArrowUp") {
      e.preventDefault();
      beginPullOut();
    }
    return;
  }
  if (gasVisit) return;
  // Ignore OS key-repeat so held A/D does not skip lanes
  if (e.repeat) return;
  if (key === "a" || key === "ArrowLeft") {
    e.preventDefault();
    onSwipe("left");
  } else if (key === "d" || key === "ArrowRight") {
    e.preventDefault();
    onSwipe("right");
  } else if (key === "s" || key === "ArrowDown") {
    e.preventDefault();
    startBrake();
  } else if (key === "w" || key === "ArrowUp" || key === " ") {
    e.preventDefault();
    resumeThrottle();
  }
});

window.addEventListener("keyup", (e) => {
  const key = gameKey(e);
  if (gasVisit?.phase === "pumping" && (key === " " || key === "f")) {
    if (gasVisit.holding) {
      setPumpHolding(false);
      enterWaitClear();
    }
    return;
  }
  // Sticky brake: release of S does not resume — only swipe up / W / Space
  if (key === "s" || key === "ArrowDown") keysBrake = false;
});

if (hudStationFloat) {
  hudStationFloat.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (nearbyStation) tryBeginGasVisit(nearbyStation);
  });
}

if (hudMergeBtn) {
  hudMergeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (gasVisit?.phase === "waitClear") beginPullOut();
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
      enterWaitClear();
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

document.getElementById("btn-play").onclick = () => {
  unlockSirenAudio();
  startRun();
};
document.getElementById("btn-retry").onclick = () => {
  unlockSirenAudio();
  if (btnRetry) btnRetry.disabled = false;
  startRun({ instant: true });
};
// pointerdown unlocks earlier than click — critical for mobile Safari audio
for (const id of ["btn-play", "btn-retry"]) {
  const el = document.getElementById(id);
  if (!el) continue;
  el.addEventListener("pointerdown", () => unlockSirenAudio(), { passive: true });
  el.addEventListener("touchstart", () => unlockSirenAudio(), { passive: true });
}
document.getElementById("btn-menu").onclick = () => {
  fromGameOver = false;
  setupMenuScene();
  showPanel("menu");
};
document.getElementById("btn-upgrades-menu").onclick = () => {
  fromGameOver = false;
  garageFocusId = save.selectedCar;
  refreshUpgradesUI();
  showPanel("upgrades");
};
document.getElementById("btn-upgrades-go").onclick = () => {
  fromGameOver = true;
  garageFocusId = save.selectedCar;
  refreshUpgradesUI();
  showPanel("upgrades");
};
document.getElementById("btn-up-back").onclick = () => {
  if (fromGameOver) showPanel("gameover");
  else {
    setupMenuScene();
    showPanel("menu");
  }
};
btnUpSpeed.onclick = () => {
  if (tryUpgrade(save, "topSpeedLevel", garageFocusId)) refreshUpgradesUI();
};
btnUpAccel.onclick = () => {
  if (tryUpgrade(save, "accelerationLevel", garageFocusId)) refreshUpgradesUI();
};
btnUpHandling.onclick = () => {
  if (tryUpgrade(save, "handlingLevel", garageFocusId)) refreshUpgradesUI();
};
if (btnCarAction) {
  btnCarAction.onclick = () => {
    if (!isUnlocked(save, garageFocusId)) {
      if (tryBuyCar(save, garageFocusId)) {
        syncPlayerCar();
        refreshUpgradesUI();
      }
    } else if (selectCar(save, garageFocusId)) {
      syncPlayerCar();
      refreshUpgradesUI();
    }
  };
}

function layoutCanvas() {
  // Always render as portrait (9:16). If the phone is landscape, letterbox
  // the portrait stage inside the landscape window.
  const vw = Math.max(1, window.innerWidth);
  const vh = Math.max(1, window.innerHeight);
  const isPortrait = vh >= vw;

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
    if (heat >= 85 && Math.random() < 0.22) triggerShake(0.04, 0.06);

    const { seg: playerSeg, layout, usable } = playerControlLayout();
    adoptBiomeFromSegment(playerSeg);
    // Player never auto-merges. Closed lanes keep their X so pylons can wreck them.
    // Swipe is the only way onto an open lane.
    let targetX = laneX;
    if (lane >= 0 && lane < layout.count) {
      targetX = layout.xs[lane];
    }
    const smooth = THREE.MathUtils.lerp(0.22, 0.11, Math.min(1, (handlingFactor(save) - 1) / 0.5));
    const omega = 2 / Math.max(0.05, smooth);
    const x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = laneX - targetX;
    const temp = (laneVel + omega * change) * dt;
    laneVel = (laneVel - omega * temp) * exp;
    laneX = targetX + (change + temp) * exp;

    // Subtle steer yaw with lateral motion, then settle straight — amplified for juice
    const laneYawTarget = THREE.MathUtils.clamp(laneVel * 0.035, -TURN_YAW * 0.55, TURN_YAW * 0.55);
    turnYaw += turnYawVel * dt;
    turnYaw = THREE.MathUtils.damp(turnYaw, laneYawTarget, 9, dt);
    turnYawVel = THREE.MathUtils.damp(turnYawVel, 0, 8, dt);

    // Weightier bank into lane changes
    const laneRoll = THREE.MathUtils.clamp(-laneVel * 0.038, -0.16, 0.16);

    player.position.set(laneX, 0, playerZ);
    player.rotation.set(laneRoll * 0.35, turnYaw, laneRoll);

    if (hudLaneWarn) {
      const oncoming = lane >= 0 && lane < layout.count && layout.dirs[lane] === -1;
      const closed = !usable.includes(lane);
      const warn = oncoming || closed;
      if (hudLaneWarn.classList.contains("hidden") && warn) {
        hudLaneWarn.classList.remove("hidden");
        // retrigger pop animation
        hudLaneWarn.classList.remove("cue-replay");
        void hudLaneWarn.offsetWidth;
      } else {
        hudLaneWarn.classList.toggle("hidden", !warn);
      }
    }

    const boostActive = boostTimer > 0;
    if (boostActive && !prevBoostActive) {
      triggerFlash("boost");
      triggerShake(0.2, 0.18);
    }
    prevBoostActive = boostActive;
    if (boostTimer > 0) {
      boostTimer -= dt;
      if (boostTimer <= 0) { boostTimer = 0; boostMul = 1; }
    }
    setSpeedlines(boostActive && !gasVisit);

    // Portrait chase cam + brake dive / boost FOV
    const camPos = gameplayCamPos(laneX, playerZ);
    if (braking) camPos.y -= 0.55;
    if (boostActive) camPos.z += 0.6;
    camera.position.copy(camPos);
    const look = gameplayCamLook(laneX, playerZ);
    if (braking) look.y -= 0.35;
    setCameraLook(look.x, look.y, look.z);
    camFovTarget = 72 + (boostActive ? 5 : 0) - (braking ? 3.5 : 0);
    worldGround.position.z = playerZ + 80;
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
        // Passed the station without stopping — dismiss prompt and lock it out
        if (aheadDz < -2) {
          seg.userData.gasResolved = true;
          if (nearbyStation === seg) {
            nearbyStation = null;
            hideStationFloat();
          }
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
          returnTrafficCar(t);
        }
        continue;
      }
      if (t.userData.curbParked) {
        // Stay put on the curb until behind the chase cam
        if (t.position.z < playerZ - 25) {
          activeTraffic.splice(i, 1);
          returnTrafficCar(t);
        }
        continue;
      }
      if (t.userData.openingChase) {
        // Visual trailing cop only — does not drive siren audio.
        // Hold a steady far gap so braking / speed never yank volume.
        if (pursuit) {
          activeTraffic.splice(i, 1);
          returnTrafficCar(t);
          continue;
        }
        if (gasVisit) {
          t.position.z = Math.min(t.position.z, playerZ - 14);
          continue;
        }
        const zOff = 34;
        const targetZ = playerZ - zOff;
        t.position.z = THREE.MathUtils.damp(t.position.z, targetZ, 2.2, dt);
        const lx = currentLayout().xs[Math.min(lane, currentLayout().count - 1)];
        t.position.x = THREE.MathUtils.damp(t.position.x, lx, 2.2, dt);
        t.userData.lane = Math.min(lane, currentLayout().count - 1);
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
      let lightControlled = false;
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
            lightControlled = true;
          }
        } else if (t.userData.stopped || t.userData.speed < cruise * 0.95) {
          t.userData.speed = THREE.MathUtils.damp(t.userData.speed, cruise, 3, dt);
          if (t.userData.speed > cruise * 0.85) t.userData.stopped = false;
        }
      }
      if (!lightControlled) applyHeadway(t, dt);
      updateNpcLaneMerge(t, dt);
      t.position.z += (dir === -1 ? -t.userData.speed : t.userData.speed) * dt;
      // Keep on asphalt if road narrowed under the car
      t.position.x = clampTrafficX(t.position.x, getSegmentAt(t.position.z));
      if (t.position.z < playerZ - 25 || t.position.z > playerZ + 100) {
        activeTraffic.splice(i, 1);
        returnTrafficCar(t);
        continue;
      }
      if (!gasVisit && Math.abs(t.position.z - playerZ) < 2.2 && Math.abs(t.position.x - laneX) < 1.35) {
        crash();
        break;
      }
      // Near-miss juice
      if (
        !gasVisit &&
        !t.userData.nearMissed &&
        Math.abs(t.position.z - playerZ) < 3.8 &&
        Math.abs(t.position.x - laneX) > 1.35 &&
        Math.abs(t.position.x - laneX) < 2.4
      ) {
        t.userData.nearMissed = true;
        triggerShake(0.14, 0.16);
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
      if (o.userData.kind === "cone" || o.userData.kind === "dust") {
        const phase = (o.userData.wobblePhase || 0) + now / 1000;
        if (o.userData.kind === "cone") {
          o.rotation.z = Math.sin(phase * 6) * 0.08;
        } else {
          o.position.y = 0.1 + Math.abs(Math.sin(phase * 4)) * 0.25;
          o.material.opacity = 0.3 + 0.25 * Math.abs(Math.sin(phase * 5));
        }
      }
      if (gasVisit) continue;
      if (o.userData.kind === "dust") continue;
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
      hudBoost.classList.add("brake-mode");
      hudBoost.classList.remove("hidden");
    } else {
      hudBoost.textContent = "BOOST";
      hudBoost.classList.remove("brake-mode");
      hudBoost.classList.toggle("hidden", boostTimer <= 0 || !!gasVisit);
    }

    if (!gasVisit) {
      const station = findInteractableStation();
      nearbyStation = station || null;
      if (nearbyStation) updateStationFloat(nearbyStation);
      else hideStationFloat();
    } else {
      hideStationFloat();
    }
  } else if (intro) {
    updateIntro(dt);
    worldGround.position.z = playerZ + 80;
  } else if (!running) {
    menuTime += dt;
    // Idle curb pose — stronger sway + exhaust flicker
    ensureExhaustFlicker();
    player.position.set(MENU_PARK.x, 0, MENU_PARK.z);
    player.rotation.y = MENU_PARK.yaw + Math.sin(menuTime * 0.85) * 0.07;
    player.rotation.z = Math.sin(menuTime * 1.1) * 0.025;
    if (exhaustFlicker) {
      exhaustFlicker.visible = Math.sin(menuTime * 18) > 0.15;
      exhaustFlicker.material.color.setHex(Math.sin(menuTime * 22) > 0 ? NES.orange : NES.yellow);
    }
    applyMenuCamera();
    worldGround.position.z = 80;
    setSpeedlines(false);
  }

  // Game-over score count-up + delayed retry
  if (activePanelName === "gameover" && goRetryTimer > 0) {
    goRetryTimer -= dt;
    if (goRetryTimer <= 0 && btnRetry) btnRetry.disabled = false;
  }
  if (activePanelName === "gameover" && goScoreDisplay < goScoreTarget) {
    goScoreDisplay = Math.min(goScoreTarget, goScoreDisplay + Math.max(3, goScoreTarget * dt * 2.8));
    if (goScore) goScore.textContent = `${Math.floor(goScoreDisplay)} m`;
  }

  // Damped FOV for boost / brake (layoutCanvas resets base aspect)
  if (!driving) camFovTarget = 72;
  if (Math.abs(camera.fov - camFovTarget) > 0.05) {
    camera.fov = THREE.MathUtils.damp(camera.fov, camFovTarget, 8, dt);
    camera.updateProjectionMatrix();
  }

  applyCameraShake(dt);
  updateSirenAudio(dt);

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

setupMenuScene();
showPanel("menu");
requestAnimationFrame(tick);

window.__endlessChase = {
  startRun,
  setupMenuScene,
  beginBiomeTransition,
  getSave: () => ({ ...save, unlocked: [...save.unlocked], cars: { ...save.cars } }),
  getPlayer: () => player,
  getState: () => ({
    running, alive, intro: !!intro, distance, lane, biome: activeBiome, heat, gas, braking, coins: save.coins,
    nearbyStation: !!nearbyStation,
    gasVisit: gasVisit ? { phase: gasVisit.phase, holding: gasVisit.holding, requiredLane: gasVisit.requiredLane } : null,
    transitioning, transitionQueue: transitionQueue.length,
    policeBar: +heat.toFixed(1),
    sirenOpeningT: +sirenOpeningT.toFixed(2),
    sirenVol: +sirenSmoothVol.toFixed(3),
    siren: getSirenDebug(),
    playerX: +player.position.x.toFixed(2),
    playerZ: +player.position.z.toFixed(2),
    playerYaw: +player.rotation.y.toFixed(3),
    carId: player.userData.carId,
  }),
  getSegmentAt,
  buildTransitionPlan,
  getTraffic: () => activeTraffic.map((t) => ({
    x: +t.position.x.toFixed(2),
    z: +t.position.z.toFixed(1),
    lane: t.userData.lane,
    mergeX: t.userData.mergeX ?? null,
    mergeLane: t.userData.mergeLane ?? null,
    mergeScheduled: !!t.userData.mergeScheduled,
    mergeActive: !!t.userData.mergeActive,
    mergeDelay: t.userData.mergeDelay ?? null,
    dir: t.userData.dir,
    pursuit: !!t.userData.pursuit,
  })),
  /** Debug: shove non-pursuit traffic into a lane, then optionally kick merges. */
  debugPutTrafficInLane: (laneIndex) => {
    const layout = currentLayout();
    const x = layout.xs[Math.min(Math.max(0, laneIndex), layout.count - 1)];
    let n = 0;
    for (const t of activeTraffic) {
      if (t.userData.pursuit || t.userData.gasThreat) continue;
      clearMergeState(t);
      t.userData.lane = laneIndex;
      t.userData.dir = layout.dirs[laneIndex] || 1;
      t.position.x = x;
      n++;
    }
    return n;
  },
  getTransitionSegments: () => activeSegments
    .filter((s) => s.userData.transitionPhase)
    .map((s) => ({
      phase: s.userData.transitionPhase,
      biome: s.userData.biome,
      usable: s.userData.usableLanes,
      closed: s.userData.closedLaneXs,
      tapered: !!s.userData.tapered,
      mix: !!s.userData.mixGroup,
      taperMarks: !!s.userData.taperMarkGroup,
      ground: !!s.userData.taperGround,
      z: +s.position.z.toFixed(1),
    })),
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
