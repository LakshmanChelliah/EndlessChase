/**
 * NES pixel meshes + road segment factory.
 */
import * as THREE from "three";
import { ASSET, SEG_LEN, NES, layoutFor } from "./constants.js";
import { pickTurnBiomes } from "./worldgen.js";

export function createTextures(loader = new THREE.TextureLoader()) {
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
  return {
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
}

export function basic(map, color = 0xffffff) {
  return new THREE.MeshBasicMaterial({ map, color, transparent: !!map, alphaTest: map ? 0.1 : 0 });
}

export function basicColor(color) {
  return new THREE.MeshBasicMaterial({ color });
}

/**
 * Screen-locked NES sky (parented to the camera).
 * Must NOT be a world-space sphere — the player drives past z≈120 and
 * would clip through a fixed dome (that read as a yellow wall).
 */
export function addSky(camera) {
  const w = 4;
  const h = 32;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, h);
  // Pure night/navy → muted purple. No orange/yellow horizon band.
  g.addColorStop(0, "#0f1730");
  g.addColorStop(0.45, "#1d2b53");
  g.addColorStop(0.82, "#3a4570");
  g.addColorStop(1, "#5a6588");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#fff1e8";
  for (const [x, y] of [[1, 2], [3, 5], [0, 8], [2, 11], [1, 14]]) {
    ctx.fillRect(x, y, 1, 1);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.NearestFilter;
  map.generateMipmaps = false;
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;

  const skyGeo = new THREE.SphereGeometry(40, 16, 10);
  const skyMat = new THREE.MeshBasicMaterial({
    map,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.name = "sky";
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  camera.add(sky);
  return sky;
}

export function makeCar(spriteTex) {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 2.8), basicColor(0x1a1c2c));
  body.position.y = 0.4;
  root.add(body);
  const card = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 2.7),
    new THREE.MeshBasicMaterial({ map: spriteTex, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide })
  );
  card.rotation.x = -Math.PI / 2;
  card.position.y = 0.72;
  root.add(card);
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

export function makeTruck(tex) {
  return makeCar(tex.truck);
}

export function makeCoin(tex) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.9),
    new THREE.MeshBasicMaterial({ map: tex.coin, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide })
  );
  mesh.userData.kind = "coin";
  return mesh;
}

function addLaneMarkings(root, layout, biome, { intersection = false } = {}) {
  const half = layout.width / 2;
  const gap = intersection ? CROSS_GAP : 0;
  const markLen = intersection ? SEG_LEN / 2 - gap : SEG_LEN;
  const markCenters = intersection
    ? [-(gap + markLen / 2), gap + markLen / 2]
    : [0];

  if (biome === "highway") {
    const mid = (layout.xs[0] + layout.xs[1]) / 2;
    for (const zc of markCenters) {
      const z0 = zc - markLen / 2 + 2;
      const z1 = zc + markLen / 2;
      for (let z = z0; z < z1; z += 4) {
        const dash = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 1.4), basicColor(NES.white));
        dash.position.set(mid, 0.04, z);
        root.add(dash);
      }
    }
  } else {
    // Double yellow center divider (gapped at intersection)
    for (const zc of markCenters) {
      for (const ox of [-0.18, 0.18]) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, Math.max(0.5, markLen - 1)), basicColor(NES.yellow));
        line.position.set(ox, 0.04, zc);
        root.add(line);
      }
    }
    if (biome === "city") {
      for (const x of [-4.0, 4.0]) {
        for (const zc of markCenters) {
          const z0 = zc - markLen / 2 + 2;
          const z1 = zc + markLen / 2;
          for (let z = z0; z < z1; z += 4) {
            const dash = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 1.4), basicColor(NES.white));
            dash.position.set(x, 0.04, z);
            root.add(dash);
          }
        }
      }
    }
  }
  for (const x of [-(half + 0.2), half + 0.2]) {
    for (const zc of markCenters) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, markLen), basicColor(NES.curb));
      c.position.set(x, 0.15, zc);
      root.add(c);
    }
  }
}

function addTurnOfferVisuals(root, layout) {
  const half = layout.width / 2;
  const stubL = new THREE.Mesh(new THREE.PlaneGeometry(6, 8), basicColor(NES.asphalt));
  stubL.rotation.x = -Math.PI / 2;
  stubL.position.set(-(half + 3), 0.005, 0);
  const stubR = stubL.clone();
  stubR.position.x = half + 3;
  root.add(stubL, stubR);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const chev = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 1.2), basicColor(NES.yellow));
      chev.position.set(side * (half - 1.2 - i * 0.4), 0.05, -2 + i * 1.5);
      chev.rotation.y = side * 0.35;
      root.add(chev);
    }
  }
}

/** Cross-street gap half-length (local Z) — no buildings through the junction. */
const CROSS_GAP = 5;

function addCrossStreet(root, half, width) {
  const armLen = 12;
  const armW = Math.max(8, width * 0.7);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.PlaneGeometry(armLen, armW), basicColor(NES.asphalt));
    arm.rotation.x = -Math.PI / 2;
    arm.position.set(side * (half + armLen / 2), 0.012, 0);
    root.add(arm);
    // Sidewalk strips along the cross-street arms
    for (const zSide of [-1, 1]) {
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(armLen * 0.85, 2.2), basicColor(0x3a3d48));
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(side * (half + armLen / 2), 0.018, zSide * (armW / 2 + 1.1));
      root.add(walk);
    }
  }
  // Stop line just south of the zebra
  const stop = new THREE.Mesh(new THREE.BoxGeometry(width - 1.5, 0.05, 0.35), basicColor(NES.white));
  stop.position.set(0, 0.05, -2.4);
  root.add(stop);
}

function addThreeLampSignal(root, half, tex) {
  const lightGroup = new THREE.Group();
  const poleX = -(half - 0.5);
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.6, 0.25), basicColor(0xc2c3c7));
  pole.position.set(poleX, 1.8, 2.2);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.1, 0.45), basicColor(0x1a1c2c));
  housing.position.set(poleX, 3.4, 2.35);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, 2.0),
    new THREE.MeshBasicMaterial({ map: tex.light, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide })
  );
  sign.position.set(poleX - 0.55, 3.4, 2.35);
  const mkBulb = (name, y, color) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.22), basicColor(color));
    b.position.set(poleX, y, 2.55);
    b.name = name;
    return b;
  };
  const bulbRed = mkBulb("bulbRed", 4.0, NES.asphalt);
  const bulbYellow = mkBulb("bulbYellow", 3.4, NES.asphalt);
  const bulbGreen = mkBulb("bulbGreen", 2.8, NES.green);
  lightGroup.add(pole, housing, sign, bulbRed, bulbYellow, bulbGreen);
  root.add(lightGroup);
  return lightGroup;
}

/**
 * @param {object} tex texture atlas
 * @param {string} biome
 * @param {{intersection?:boolean,turnOffer?:boolean,onRamp?:boolean,distance?:number,widthOverride?:number,mixBiome?:string|null,seed?:number,transition?:boolean}} opts
 */
export function makeSegment(tex, biome, opts = {}) {
  const {
    intersection = false,
    turnOffer = false,
    onRamp = false,
    distance = 0,
    widthOverride = null,
    mixBiome = null,
    seed = 1,
    transition = false,
  } = opts;
  const layout = layoutFor(biome);
  const width = widthOverride != null ? widthOverride : layout.width;
  const root = new THREE.Group();
  const half = width / 2;
  // Tiny seeded variance for prop placement (same seed → same look)
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };

  const roadMat = basic(tex.road);
  roadMat.map = tex.road.clone();
  roadMat.map.needsUpdate = true;
  roadMat.map.wrapS = roadMat.map.wrapT = THREE.RepeatWrapping;
  roadMat.map.repeat.set(width / 12, 2);
  roadMat.map.magFilter = THREE.NearestFilter;
  roadMat.map.minFilter = THREE.NearestFilter;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(width, SEG_LEN), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.01;
  root.add(road);

  // Markings use layout xs when width matches; otherwise scale X
  const markLayout = widthOverride != null
    ? { ...layout, width, xs: layout.xs.map((x) => x * (width / layout.width)) }
    : layout;
  addLaneMarkings(root, markLayout, biome, { intersection });

  const propBiome = biome;
  let gantryGroup = null;
  // Intersection: leave a building-free gap and split roadside props N/S of the cross street
  const gap = intersection ? CROSS_GAP : 0;
  const patchLen = intersection ? (SEG_LEN / 2 - gap) : SEG_LEN;
  const patchCenters = intersection
    ? [-(gap + patchLen / 2), gap + patchLen / 2]
    : [0];

  if (propBiome === "rural") {
    // Wide berm so houses sit fully on grass, not half in the void
    const bermW = 12;
    const bermCenter = half + 1.2 + bermW / 2;
    for (const side of [-1, 1]) {
      for (const zc of patchCenters) {
        const grass = new THREE.Mesh(new THREE.PlaneGeometry(bermW, patchLen), basicColor(NES.forest));
        grass.rotation.x = -Math.PI / 2;
        grass.position.set(side * bermCenter, 0.02, zc);
        root.add(grass);
        if (patchLen < 3) continue;
        const pad = new THREE.Mesh(new THREE.PlaneGeometry(5, Math.min(5.5, patchLen - 0.5)), basicColor(0x4a5a38));
        pad.rotation.x = -Math.PI / 2;
        const houseX = side * (bermCenter + 0.5);
        pad.position.set(houseX, 0.03, zc + (rnd() - 0.5) * Math.min(2, patchLen * 0.3));
        root.add(pad);
        if (rnd() > 0.2) {
          const house = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, Math.min(4, patchLen - 0.4)), basic(tex.house));
          house.position.set(houseX, 1.3, pad.position.z);
          root.add(house);
        }
      }
    }
  } else if (propBiome === "highway") {
    for (const side of [-1, 1]) {
      for (const zc of patchCenters) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, patchLen), basicColor(0xc2c3c7));
        rail.position.set(side * (half + 0.5), 0.4, zc);
        root.add(rail);
      }
    }
    // Larger rectangular overhead sign — shown sparsely via spawnIndex
    gantryGroup = new THREE.Group();
    gantryGroup.name = "gantry";
    const postH = 5.2;
    const boardW = width + 3;
    const boardH = 1.35;
    const boardD = 0.28;
    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.35, postH, 0.35), basicColor(NES.curb));
    postL.position.set(-(half + 0.3), postH / 2, 0);
    const postR = postL.clone();
    postR.position.x = half + 0.3;
    const board = new THREE.Mesh(new THREE.BoxGeometry(boardW, boardH, boardD), basicColor(NES.forest));
    board.position.set(0, postH - 0.15, 0);
    const face = new THREE.Mesh(new THREE.BoxGeometry(boardW - 0.6, boardH - 0.35, 0.06), basicColor(0xc2c3c7));
    face.position.set(0, postH - 0.15, boardD * 0.55);
    gantryGroup.add(postL, postR, board, face);
    gantryGroup.visible = false;
    root.add(gantryGroup);
  } else {
    // City sidewalk under buildings so they don't hang in the void
    const walkW = 10;
    const walkCenter = half + 0.8 + walkW / 2;
    for (const side of [-1, 1]) {
      for (const zc of patchCenters) {
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(walkW, patchLen), basicColor(0x3a3d48));
        walk.rotation.x = -Math.PI / 2;
        walk.position.set(side * walkCenter, 0.015, zc);
        root.add(walk);
        if (patchLen < 3.5) continue;
        const h1 = 5 + (rnd() * 4) | 0;
        const b1 = new THREE.Mesh(new THREE.BoxGeometry(3.6, h1, Math.min(5.5, patchLen - 0.5)), basic(tex.building));
        b1.position.set(side * (walkCenter - 0.5), h1 / 2, zc);
        root.add(b1);
        if (!intersection && rnd() > 0.3) {
          const h2 = 4 + (rnd() * 3) | 0;
          const b2 = new THREE.Mesh(new THREE.BoxGeometry(3.0, h2, 4.5), basic(tex.building));
          b2.position.set(side * (walkCenter + 1.5), h2 / 2, 5);
          root.add(b2);
        }
      }
    }
  }

  // Mixed scenery during mid-transition (skip on intersection gap center)
  if (mixBiome && mixBiome !== biome && !intersection) {
    const side = rnd() > 0.5 ? 1 : -1;
    if (mixBiome === "rural") {
      const grass = new THREE.Mesh(new THREE.PlaneGeometry(8, SEG_LEN * 0.7), basicColor(NES.forest));
      grass.rotation.x = -Math.PI / 2;
      grass.position.set(side * (half + 5), 0.025, 0);
      root.add(grass);
    } else if (mixBiome === "city") {
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(6, SEG_LEN * 0.6), basicColor(0x3a3d48));
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(side * (half + 4), 0.02, 0);
      root.add(walk);
      const h = 4 + (rnd() * 3) | 0;
      const b = new THREE.Mesh(new THREE.BoxGeometry(3, h, 4), basic(tex.building));
      b.position.set(side * (half + 4), h / 2, 0);
      root.add(b);
    }
  }

  if (onRamp || transition) {
    const rampSide = -0.45; // left / forward side merge
    const ramp = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 12), basicColor(NES.asphalt));
    ramp.rotation.x = -Math.PI / 2;
    ramp.position.set(half * rampSide, 0.015, -2);
    ramp.rotation.z = 0.2;
    root.add(ramp);
    for (let i = 0; i < 4; i++) {
      const arrow = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.04, 1.0), basicColor(NES.white));
      arrow.position.set(half * rampSide - i * 0.1, 0.05, -4 + i * 2);
      root.add(arrow);
    }
  }

  let lightGroup = null;
  if (intersection) {
    addCrossStreet(root, half, width);
    const zebra = new THREE.Mesh(new THREE.PlaneGeometry(width - 2, 2.2), basicColor(NES.white));
    zebra.rotation.x = -Math.PI / 2;
    zebra.position.set(0, 0.03, 0);
    root.add(zebra);
    lightGroup = addThreeLampSignal(root, half, tex);
  }

  let turnLeftBiome = null;
  let turnRightBiome = null;
  if (turnOffer) {
    const pair = pickTurnBiomes(biome, distance);
    turnLeftBiome = pair.left;
    turnRightBiome = pair.right;
    addTurnOfferVisuals(root, { ...layout, width });
  }

  root.userData = {
    biome,
    intersection,
    turnOffer,
    onRamp,
    transition,
    lightGroup,
    gantryGroup,
    lightState: "green",
    lightTimer: 1.5 + rnd(),
    resolved: false,
    turnResolved: false,
    turnLeftBiome,
    turnRightBiome,
    layoutWidth: width,
  };
  return root;
}

export function updateLightVisual(seg) {
  const g = seg.userData.lightGroup;
  if (!g) return;
  const s = seg.userData.lightState;
  const dim = NES.asphalt;
  const set = (name, onHex) => {
    const b = g.getObjectByName(name);
    if (b) b.material.color.setHex(onHex);
  };
  set("bulbRed", s === "red" ? NES.red : dim);
  set("bulbYellow", s === "yellow" ? NES.yellow : dim);
  set("bulbGreen", s === "green" ? NES.green : dim);
  // Legacy single-bulb fallback
  const legacy = g.getObjectByName("bulb");
  if (legacy) {
    legacy.material.color.setHex(s === "red" ? NES.red : s === "yellow" ? NES.yellow : NES.green);
  }
}
