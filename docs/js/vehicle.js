/**
 * GLTF vehicle pipeline — preload prototypes, normalize footprint, clone + tint.
 *
 * Flow: preloadVehicles() → createVehicle(id) clones a prototype → optional
 * NPC body tint / blinkers. Paths via glbUrl() → CARS_ASSET.
 * Invariant: headlights face +Z after YAW_OFFSET; MeshBasic (unlit) materials.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CARS, glbUrl, NPC_TINTS } from "./cars.js?v=23";

/** Slightly larger than the old NES footprint for readable 3D meshes. */
const TARGET_LEN = 3.7;
const TARGET_WIDTH = 1.95;

/**
 * Per-model yaw so headlights face +Z. Only list ids that need a non-zero offset.
 * @type {Record<string, number>}
 */
export const YAW_OFFSET = {};

/** @type {Record<string, THREE.Group>} */
const prototypes = {};
let ready = false;

function toUnlitMaterials(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const srcList = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = srcList.map((src) => {
      if (!src) return new THREE.MeshBasicMaterial({ color: 0x888888 });
      const mat = new THREE.MeshBasicMaterial({
        color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
        map: src.map || null,
        transparent: !!src.transparent,
        opacity: src.opacity != null ? src.opacity : 1,
        side: src.side != null ? src.side : THREE.FrontSide,
        alphaTest: src.alphaTest || 0,
      });
      if (src.emissive && src.emissive.getHex() > 0) {
        mat.color.lerp(src.emissive, 0.35);
      }
      return mat;
    });
    obj.material = Array.isArray(obj.material) ? next : next[0];
    obj.castShadow = false;
    obj.receiveShadow = false;
  });
}

function cloneMaterials(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    if (Array.isArray(obj.material)) {
      obj.material = obj.material.map((m) => m.clone());
    } else if (obj.material) {
      obj.material = obj.material.clone();
    }
  });
}

/**
 * Tint likely body materials. Skips glass, wheels, trim, and emissive lights.
 */
export function applyNpcTint(root, hex) {
  const tint = new THREE.Color(hex);
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat || !mat.color) continue;
      if (mat.emissive && mat.emissive.getHex() > 0x111111) continue;
      const c = mat.color;
      const max = Math.max(c.r, c.g, c.b);
      const min = Math.min(c.r, c.g, c.b);
      const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      const sat = max - min;
      if (lum < 0.08 || lum > 0.85) continue;
      if (sat < 0.04 && lum > 0.35) continue;
      if (lum < 0.22 && sat < 0.08) continue;
      mat.color.copy(tint);
    }
  });
}

function normalizeModel(scene, carId) {
  const wrap = new THREE.Group();
  wrap.name = `car_${carId}`;

  const model = scene.clone(true);
  toUnlitMaterials(model);
  wrap.add(model);

  const yaw = YAW_OFFSET[carId] ?? 0;
  model.rotation.y = yaw;
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(wrap);
  const size = new THREE.Vector3();
  box.getSize(size);

  let scale = TARGET_LEN / Math.max(0.001, size.z);
  const widthAfter = size.x * scale;
  if (widthAfter > TARGET_WIDTH * 1.15) {
    scale *= (TARGET_WIDTH * 1.15) / widthAfter;
  }
  wrap.scale.setScalar(scale);

  wrap.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(wrap);
  const c2 = new THREE.Vector3();
  box2.getCenter(c2);
  model.position.x -= c2.x / scale;
  model.position.z -= c2.z / scale;
  model.position.y -= box2.min.y / scale;

  wrap.userData.carId = carId;
  wrap.userData.kind = "car";
  wrap.userData.yawOffset = yaw;
  return wrap;
}

/** @returns {Promise<void>} */
export async function preloadVehicles() {
  if (ready) return;
  const loader = new GLTFLoader();
  await Promise.all(
    CARS.map(
      (c) =>
        new Promise((resolve, reject) => {
          loader.load(
            glbUrl(c.id),
            (gltf) => {
              prototypes[c.id] = normalizeModel(gltf.scene, c.id);
              resolve();
            },
            undefined,
            (err) => reject(err || new Error(`Failed to load ${c.id}`))
          );
        })
    )
  );
  ready = true;
}

export function vehiclesReady() {
  return ready;
}

/**
 * @param {string} carId
 * @param {{ tint?: boolean|number }} [opts]
 */
export function createVehicle(carId, opts = {}) {
  const proto = prototypes[carId] || prototypes.mobil;
  let root;
  if (!proto) {
    root = new THREE.Group();
    root.userData.carId = carId;
    root.userData.kind = "car";
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.55, 2.8),
      new THREE.MeshBasicMaterial({ color: 0x888888 })
    );
    box.position.y = 0.35;
    root.add(box);
  } else {
    root = proto.clone(true);
    cloneMaterials(root);
    root.userData.carId = carId;
    root.userData.kind = "car";
  }

  const doTint = opts.tint === true || typeof opts.tint === "number";
  if (doTint && carId !== "police") {
    const hex = typeof opts.tint === "number"
      ? opts.tint
      : NPC_TINTS[(Math.random() * NPC_TINTS.length) | 0];
    applyNpcTint(root, hex);
    root.userData.tint = hex;
  }

  attachBlinkers(root);
  return root;
}

/** Hot amber used for merge blinkers — brighter than NES orange so it reads at chase distance. */
const BLINKER_AMBER = 0xfff066;
const BLINKER_CORE = 0xffffff;

/** Soft radial disc for sprite glow (generated once). */
let blinkerSpriteMap = null;
function getBlinkerSpriteMap() {
  if (blinkerSpriteMap) return blinkerSpriteMap;
  const s = 64;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,240,100,0.95)");
  g.addColorStop(0.55, "rgba(255,180,40,0.55)");
  g.addColorStop(1, "rgba(255,120,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  blinkerSpriteMap = new THREE.CanvasTexture(c);
  blinkerSpriteMap.magFilter = THREE.NearestFilter;
  blinkerSpriteMap.minFilter = THREE.LinearFilter;
  return blinkerSpriteMap;
}

/**
 * Rear blinkers for NPC lane-merge signaling.
 * Bright bulbs + camera-facing additive sprites (chase cam is high; flat Z-planes read edge-on).
 */
export function ensureBlinkers(root) {
  if (root.userData.blinkerL) return;
  const map = getBlinkerSpriteMap();
  const mk = (x) => {
    const group = new THREE.Group();
    // Sit proud of the rear bumper so the glow clears the body mesh
    group.position.set(x, 0.75, -1.78);
    group.visible = false;

    // Solid amber shell + white core — readable even without the bloom
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.5, 0.35),
      new THREE.MeshBasicMaterial({ color: BLINKER_AMBER, fog: false })
    );
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.3, 0.4),
      new THREE.MeshBasicMaterial({ color: BLINKER_CORE, fog: false })
    );

    // Camera-facing bloom (Sprite) — stays round from the high chase cam
    const glowMat = new THREE.SpriteMaterial({
      map,
      color: BLINKER_AMBER,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(2.8, 2.8, 1);
    glow.position.set(0, 0.15, -0.15);
    glow.renderOrder = 10;

    const bloomMat = new THREE.SpriteMaterial({
      map,
      color: 0xffcc44,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const bloom = new THREE.Sprite(bloomMat);
    bloom.scale.set(5.0, 5.0, 1);
    bloom.position.set(0, 0.2, -0.25);
    bloom.renderOrder = 9;

    group.add(shell, core, glow, bloom);
    group.userData.blinkerGlow = glow;
    group.userData.blinkerBloom = bloom;
    root.add(group);
    return group;
  };
  root.userData.blinkerL = mk(-0.85);
  root.userData.blinkerR = mk(0.85);
}

function attachBlinkers(root) {
  ensureBlinkers(root);
}

export function replacePlayerVehicle(scene, oldPlayer, carId) {
  const next = createVehicle(carId, { tint: false });
  if (oldPlayer) {
    next.position.copy(oldPlayer.position);
    next.rotation.copy(oldPlayer.rotation);
    scene.remove(oldPlayer);
  }
  scene.add(next);
  return next;
}
