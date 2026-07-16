/**
 * NES visual layer — nearest-filter textures, unlit meshes, road segment factory.
 *
 * Purpose: build biome tiles (road, curbs, buildings, lights, gas props) and
 * atmosphere overlays without PBR. Textures load from ASSET (constants.js).
 * Invariants: NearestFilter + no mipmaps; segment length = SEG_LEN.
 */
import * as THREE from "three";
import { ASSET, SEG_LEN, NES, BIOME_ATMOS, MARK_STYLES, layoutFor } from "./constants.js?v=34";
import { pickTurnBiomes } from "./worldgen.js?v=26";

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
  const buildings = [
    loadTex("building_a.png"),
    loadTex("building_b.png"),
    loadTex("building_c.png"),
    loadTex("building_d.png"),
  ];
  return {
    road: loadTex("road.png", { repeatX: 1, repeatY: 2 }),
    /** @deprecated prefer buildings[] — kept for mix overlays / callers */
    building: buildings[0],
    buildings,
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

/** Silhouette + facade presets for the 4 city building variants. */
const BUILDING_VARIANTS = [
  { w: 3.6, d: 5.5, hMin: 5, hSpan: 4 }, // A brick mid-rise
  { w: 3.0, d: 4.2, hMin: 7, hSpan: 5 }, // B tall concrete office
  { w: 4.2, d: 5.0, hMin: 3, hSpan: 3 }, // C wide stucco storefront
  { w: 3.2, d: 4.0, hMin: 6, hSpan: 4 }, // D slate tower
];

/**
 * Pick one of the 4 building textures + silhouette using seeded rnd.
 * @param {{buildings?: THREE.Texture[], building?: THREE.Texture}} tex
 * @param {() => number} rnd
 */
function pickBuildingVariant(tex, rnd) {
  const list = tex.buildings?.length ? tex.buildings : [tex.building];
  const i = Math.min(list.length - 1, (rnd() * list.length) | 0);
  const preset = BUILDING_VARIANTS[i] || BUILDING_VARIANTS[0];
  return { map: list[i], preset, index: i };
}

/** Opaque textured material — buildings/roads must stay opaque so depth sorts correctly. */
export function basic(map, color = 0xffffff) {
  return new THREE.MeshBasicMaterial({ map, color });
}

export function basicColor(color) {
  return new THREE.MeshBasicMaterial({ color });
}

const ROOF_COLOR = 0x2a2a38;

/**
 * Box with facade map on sides and a dark roof/floor so tops don't read as
 * floating grey slabs against the sky (BoxGeometry UV-maps the atlas onto +Y).
 */
export function makeBuildingBox(w, h, d, map) {
  const side = basic(map);
  const roof = basicColor(ROOF_COLOR);
  // BoxGeometry groups: +x, -x, +y, -y, +z, -z
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roof, roof, side, side]);
}

/**
 * Title-street bank landmark — columns, ajar door glow, big BANK marquee, $ crest.
 * Place on the left sidewalk so the getaway car parks at the doors.
 * @param {{buildings?: THREE.Texture[], building?: THREE.Texture}} tex
 * @returns {THREE.Group}
 */
export function makeBankLandmark(tex) {
  const root = new THREE.Group();
  root.name = "bankLandmark";
  const facade = tex.buildings?.[2] || tex.building;
  const body = makeBuildingBox(5.6, 4.6, 4.8, facade);
  body.position.set(0, 2.3, 0);
  root.add(body);

  // Stone columns flanking the entrance
  for (const z of [-1.35, 1.35]) {
    const col = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 2.6, 0.45),
      basicColor(0xfff1e8)
    );
    col.position.set(2.45, 1.3, z);
    root.add(col);
  }

  // Awning over the doors
  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.12, 3.2),
    basicColor(NES.red)
  );
  awning.position.set(2.9, 2.35, 0);
  root.add(awning);

  // Ajar door (hinged open toward +Z) + warm interior spill
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 2.0, 0.95),
    basicColor(0x1a1020)
  );
  door.position.set(2.55, 1.05, -0.55);
  door.rotation.y = -0.85;
  door.name = "bankDoor";
  root.add(door);

  const spill = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.05, 1.6),
    new THREE.MeshBasicMaterial({ color: NES.yellow, transparent: true, opacity: 0.55 })
  );
  spill.position.set(3.2, 0.04, 0.15);
  spill.name = "doorSpill";
  root.add(spill);

  const foyer = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 1.6, 1.1),
    new THREE.MeshBasicMaterial({ color: NES.yellow, transparent: true, opacity: 0.7 })
  );
  foyer.position.set(2.4, 1.1, 0.2);
  foyer.name = "foyerGlow";
  root.add(foyer);

  // Steps
  const steps = new THREE.Mesh(
    new THREE.BoxGeometry(0.85, 0.22, 2.2),
    basicColor(NES.curb)
  );
  steps.position.set(2.95, 0.11, 0);
  root.add(steps);

  // Big street-facing BANK marquee (chunky box + canvas so it reads at menu distance)
  const signCanvas = document.createElement("canvas");
  signCanvas.width = 128;
  signCanvas.height = 40;
  const ctx = signCanvas.getContext("2d");
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 128, 40);
  ctx.fillStyle = "#1d2b53";
  ctx.fillRect(4, 4, 120, 32);
  ctx.strokeStyle = "#ffec27";
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, 116, 28);
  ctx.fillStyle = "#ffec27";
  ctx.font = "bold 22px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("BANK", 64, 21);
  const signMap = new THREE.CanvasTexture(signCanvas);
  signMap.magFilter = THREE.NearestFilter;
  signMap.minFilter = THREE.NearestFilter;
  signMap.generateMipmaps = false;
  signMap.colorSpace = THREE.SRGBColorSpace;
  const signMat = new THREE.MeshBasicMaterial({ map: signMap, transparent: true });

  // Thick marquee board facing the street (+X)
  const marquee = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 1.15, 3.6),
    [
      signMat, // +x street face
      basicColor(0x0a1020),
      basicColor(NES.yellow),
      basicColor(0x0a1020),
      basicColor(0x0a1020),
      basicColor(0x0a1020),
    ]
  );
  marquee.position.set(2.9, 3.55, 0);
  root.add(marquee);

  // Flat neon outline plane slightly in front for extra punch
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 1.05), signMat);
  sign.position.set(3.1, 3.55, 0);
  sign.rotation.y = Math.PI / 2;
  root.add(sign);

  // Gold "$" crest above the door — instant bank read
  const dollarCanvas = document.createElement("canvas");
  dollarCanvas.width = 32;
  dollarCanvas.height = 32;
  const dctx = dollarCanvas.getContext("2d");
  dctx.fillStyle = "#ffa300";
  dctx.beginPath();
  dctx.arc(16, 16, 14, 0, Math.PI * 2);
  dctx.fill();
  dctx.fillStyle = "#000000";
  dctx.font = "bold 22px monospace";
  dctx.textAlign = "center";
  dctx.textBaseline = "middle";
  dctx.fillText("$", 16, 17);
  const dollarMap = new THREE.CanvasTexture(dollarCanvas);
  dollarMap.magFilter = THREE.NearestFilter;
  dollarMap.minFilter = THREE.NearestFilter;
  dollarMap.generateMipmaps = false;
  dollarMap.colorSpace = THREE.SRGBColorSpace;
  const dollar = new THREE.Mesh(
    new THREE.PlaneGeometry(0.85, 0.85),
    new THREE.MeshBasicMaterial({ map: dollarMap, transparent: true })
  );
  dollar.position.set(3.05, 2.85, 0);
  dollar.rotation.y = Math.PI / 2;
  root.add(dollar);

  // Pediment bar under the marquee
  const pediment = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.2, 4.0),
    basicColor(NES.yellow)
  );
  pediment.position.set(2.85, 2.95, 0);
  root.add(pediment);

  // Roof alarm beacon (red/blue blink driven by game loop)
  const alarmPole = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.55, 0.12),
    basicColor(NES.black)
  );
  alarmPole.position.set(0.2, 4.85, 0);
  root.add(alarmPole);
  const alarm = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.28, 0.35),
    new THREE.MeshBasicMaterial({ color: NES.red })
  );
  alarm.position.set(0.2, 5.2, 0);
  alarm.name = "alarmBeacon";
  root.add(alarm);

  root.userData.bank = true;
  root.userData.signMat = signMat;
  root.userData.alarm = alarm;
  root.userData.doorSpill = spill;
  root.userData.foyerGlow = foyer;
  root.userData.doorWorld = new THREE.Vector3(3.2, 0, 0.2);
  return root;
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
  paintSkyCanvas(ctx, w, h, BIOME_ATMOS.city);

  const map = new THREE.CanvasTexture(canvas);
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.NearestFilter;
  map.generateMipmaps = false;
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.needsUpdate = true;

  const skyGeo = new THREE.SphereGeometry(90, 24, 12);
  // Drop the bottom cap so the sphere never stamps a flat gray disc on the horizon
  skyGeo.scale(1, 1, 1);
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
  // Put the sphere UV seam behind the camera so it never bisects the view
  sky.rotation.y = Math.PI;
  sky.userData.canvas = canvas;
  sky.userData.ctx = ctx;
  sky.userData.map = map;
  sky.userData.biome = "city";
  camera.add(sky);
  return sky;
}

function paintSkyCanvas(ctx, w, h, atmos) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  const stops = atmos.sky;
  g.addColorStop(0, stops[0]);
  g.addColorStop(0.45, stops[1]);
  g.addColorStop(0.82, stops[2]);
  // Keep the horizon stop close to fog so sphere poles never read as a bright slab
  g.addColorStop(1, stops[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = atmos.stars || "#fff1e8";
  for (const [x, y] of [[1, 2], [3, 5], [0, 8], [2, 11], [1, 14], [3, 17], [0, 20]]) {
    ctx.fillRect(x, y, 1, 1);
  }
}

function hexLerp(a, b, t) {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

function mixHexStrings(a, b, t) {
  const pa = parseInt(String(a).replace("#", ""), 16);
  const pb = parseInt(String(b).replace("#", ""), 16);
  const m = hexLerp(pa, pb, t);
  return `#${m.toString(16).padStart(6, "0")}`;
}

/**
 * Swap fog / clear / sky / ground colors when the active biome changes.
 * @param {THREE.Scene} scene
 * @param {THREE.Mesh} sky
 * @param {THREE.Mesh} ground
 * @param {string} biome
 * @param {THREE.WebGLRenderer} [renderer]
 */
export function applyBiomeAtmosphere(scene, sky, ground, biome, renderer) {
  const atmos = BIOME_ATMOS[biome] || BIOME_ATMOS.city;
  if (scene.fog) {
    scene.fog.color.setHex(atmos.fog);
    scene.fog.near = atmos.fogNear;
    scene.fog.far = atmos.fogFar;
  }
  if (scene.background) scene.background.setHex(atmos.clear);
  if (renderer) renderer.setClearColor(atmos.clear);
  if (ground?.material) ground.material.color.setHex(atmos.ground);
  if (sky?.userData?.ctx && sky.userData.biome !== biome) {
    paintSkyCanvas(sky.userData.ctx, sky.userData.canvas.width, sky.userData.canvas.height, atmos);
    sky.userData.map.needsUpdate = true;
    sky.userData.biome = biome;
  }
}

/**
 * Soft-lerp atmosphere between two biomes during a transition corridor.
 * @param {number} t 0 = from, 1 = to
 */
export function lerpBiomeAtmosphere(scene, sky, ground, fromBiome, toBiome, t, renderer) {
  const a = BIOME_ATMOS[fromBiome] || BIOME_ATMOS.city;
  const b = BIOME_ATMOS[toBiome] || BIOME_ATMOS.city;
  const u = Math.min(1, Math.max(0, t));
  const fog = hexLerp(a.fog, b.fog, u);
  const clear = hexLerp(a.clear, b.clear, u);
  const groundC = hexLerp(a.ground, b.ground, u);
  if (scene.fog) {
    scene.fog.color.setHex(fog);
    scene.fog.near = a.fogNear + (b.fogNear - a.fogNear) * u;
    scene.fog.far = a.fogFar + (b.fogFar - a.fogFar) * u;
  }
  if (scene.background) scene.background.setHex(clear);
  if (renderer) renderer.setClearColor(clear);
  if (ground?.material) ground.material.color.setHex(groundC);
  if (sky?.userData?.ctx) {
    const key = `${fromBiome}>${toBiome}@${u.toFixed(2)}`;
    if (sky.userData.lerpKey !== key) {
      const blended = {
        sky: a.sky.map((c, i) => mixHexStrings(c, b.sky[i] || c, u)),
        stars: mixHexStrings(a.stars || "#fff1e8", b.stars || "#fff1e8", u),
      };
      paintSkyCanvas(sky.userData.ctx, sky.userData.canvas.width, sky.userData.canvas.height, blended);
      sky.userData.map.needsUpdate = true;
      sky.userData.lerpKey = key;
      sky.userData.biome = u >= 0.95 ? toBiome : fromBiome;
    }
  }
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

/** Low-poly unlit construction cone (pooled obstacle). */
export function makeCone() {
  const root = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.55), basicColor(NES.curb));
  base.position.y = 0.04;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.55, 0.32), basicColor(NES.orange));
  body.position.y = 0.35;
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.28, 0.18), basicColor(NES.orange));
  tip.position.y = 0.72;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.34), basicColor(NES.white));
  band.position.y = 0.42;
  root.add(base, body, tip, band);
  root.userData.kind = "cone";
  root.userData.hitHalfX = 0.45;
  root.userData.hitHalfZ = 0.45;
  return root;
}

/** Low-poly unlit striped barricade (pooled obstacle). */
export function makeBarricade() {
  const root = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 0.18), basicColor(NES.orange));
  board.position.y = 0.55;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.2), basicColor(NES.white));
  stripe.position.y = 0.55;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.12), basicColor(NES.curb));
  legL.position.set(-0.55, 0.35, 0);
  const legR = legL.clone();
  legR.position.x = 0.55;
  root.add(board, stripe, legL, legR);
  root.userData.kind = "barricade";
  root.userData.hitHalfX = 0.9;
  root.userData.hitHalfZ = 0.35;
  return root;
}

/**
 * Trapezoid the road plane: near edge (−Z local, player approach) = widthStart,
 * far edge (+Z local) = widthEnd. PlaneGeometry is in XY before rotation.x = -π/2,
 * so after rotation local ±X is still position.x and geometry Y maps to world Z.
 */
function clearTaperMarkGroup(seg) {
  const g = seg.userData.taperMarkGroup;
  if (!g) return;
  seg.remove(g);
  g.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    }
  });
  seg.userData.taperMarkGroup = null;
}

function clearTaperGround(seg) {
  const g = seg.userData.taperGround;
  if (!g) return;
  seg.remove(g);
  if (g.geometry) g.geometry.dispose();
  if (g.material) g.material.dispose();
  seg.userData.taperGround = null;
}

function setTaperDecorVisible(seg, visible) {
  for (const child of seg.children) {
    if (!child.userData) continue;
    if (child.userData.isLaneMark || child.userData.isCurb) {
      child.visible = visible;
    }
  }
}

/**
 * Wide berm underlay so narrowing asphalt doesn't open a void to the clear color.
 * Uses vertex-colored Z gradient so corridor ground never hard-cuts between biomes.
 * @param {number} [colorNear] approach-edge hex
 * @param {number} [colorFar] exit-edge hex
 */
function addTaperGround(seg, widthStart, widthEnd, colorNear = null, colorFar = null) {
  clearTaperGround(seg);
  const base = seg.userData.baseWidth || layoutFor(seg.userData.biome).width;
  const span = Math.max(widthStart, widthEnd, base) + 18;
  const c0 = colorNear != null ? colorNear : roadsideGroundColor(seg.userData.biome);
  const c1 = colorFar != null ? colorFar : c0;
  const ground = makeZGradientPlane(span, SEG_LEN + 1.2, c0, c1);
  ground.position.y = 0.002;
  ground.userData.isTaperGround = true;
  ground.renderOrder = -1;
  seg.add(ground);
  seg.userData.taperGround = ground;
}

/** Roadside berm / verge color per biome (matches sidewalks/berms, not neon worldGround). */
export function roadsideGroundColor(biome) {
  if (biome === "rural") return 0x0a5a30;
  if (biome === "highway") return 0x2a3a28;
  // city: muted green-gray under sidewalks so fading walks don't reveal neon green
  return 0x2f3a38;
}

export function lerpRoadsideGround(fromBiome, toBiome, t) {
  return hexLerp(roadsideGroundColor(fromBiome), roadsideGroundColor(toBiome), t);
}

/**
 * Plane with vertex colors lerping along local Z (approach → exit).
 * After rot.x=-π/2, geo +Y maps to world −Z (player approach).
 */
function makeZGradientPlane(width, length, colorNear, colorFar) {
  const geo = new THREE.PlaneGeometry(width, length, 1, 10);
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const cN = new THREE.Color(colorNear);
  const cF = new THREE.Color(colorFar);
  for (let i = 0; i < pos.count; i++) {
    const gy = pos.getY(i);
    // +geoY → approach (−Z) → colorNear; −geoY → exit (+Z) → colorFar
    const t = Math.min(1, Math.max(0, 0.5 - gy / length));
    const r = cN.r + (cF.r - cN.r) * t;
    const g = cN.g + (cF.g - cN.g) * t;
    const b = cN.b + (cF.b - cN.b) * t;
    cols[i * 3] = r;
    cols[i * 3 + 1] = g;
    cols[i * 3 + 2] = b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function clearTransitionGround(seg) {
  const g = seg.userData.transitionGround;
  if (!g) return;
  seg.remove(g);
  g.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    }
  });
  seg.userData.transitionGround = null;
}

/**
 * Always-on corridor verge: wide Z-gradient berm so ground color blends tile-to-tile
 * (real-world rural-fringe / layered landscape — no hard land-use cut).
 */
export function paintTransitionGround(seg, step) {
  clearTransitionGround(seg);
  if (!step) return;
  const from = step.sceneryFrom || step.fromBiome || seg.userData.biome;
  const to = step.sceneryTo || step.toBiome || from;
  const t0 = Math.min(1, Math.max(0, (step.atmosT ?? 0) - 0.08));
  const t1 = Math.min(1, Math.max(0, (step.atmosT ?? 0) + 0.08));
  const cNear = lerpRoadsideGround(from, to, t0);
  const cFar = lerpRoadsideGround(from, to, Math.max(t0, t1));
  const half =
    Math.max(step.widthStart || 0, step.widthEnd || 0, seg.userData.baseWidth || 10) / 2;
  const group = new THREE.Group();
  group.userData.isTransitionGround = true;
  // Full-width carpet under road + verges (sits above worldGround, below sidewalks)
  const carpet = makeZGradientPlane(half * 2 + 28, SEG_LEN + 0.6, cNear, cFar);
  carpet.position.y = 0.004;
  carpet.renderOrder = -1;
  group.add(carpet);
  seg.add(group);
  seg.userData.transitionGround = group;
  // Stash colors for taperGround / mix berms
  seg.userData.groundColorNear = cNear;
  seg.userData.groundColorFar = cFar;
}

function morphCurbsToWidth(seg, widthStart, widthEnd) {
  const curbHalf = (widthStart + widthEnd) / 2 / 2;
  for (const child of seg.children) {
    if (!child.userData?.isCurb) continue;
    const side = child.userData.curbSide || Math.sign(child.position.x || 1);
    child.position.x = side * (curbHalf + 0.2);
    child.visible = true;
  }
}

function addCenterMarks(group, markStyle, halfAvg) {
  const ox = Math.min(0.18, Math.max(0.1, halfAvg * 0.035));
  const useYellow =
    markStyle === MARK_STYLES.CITY_DIVIDED ||
    markStyle === MARK_STYLES.RURAL_TWO_WAY ||
    markStyle === MARK_STYLES.BLEND_CITY_RURAL ||
    markStyle === MARK_STYLES.BLEND_CITY_HIGHWAY;
  const useWhiteDash =
    markStyle === MARK_STYLES.HIGHWAY_ONE_WAY ||
    markStyle === MARK_STYLES.BLEND_RURAL_HIGHWAY ||
    markStyle === MARK_STYLES.BLEND_CITY_HIGHWAY;

  if (useYellow && markStyle !== MARK_STYLES.BLEND_CITY_HIGHWAY) {
    for (const side of [-ox, ox]) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.04, SEG_LEN - 1),
        basicColor(NES.yellow)
      );
      line.position.set(side, 0.045, 0);
      line.userData.isTaperTempMark = true;
      group.add(line);
    }
  } else if (markStyle === MARK_STYLES.BLEND_CITY_HIGHWAY) {
    // Short yellow fading into white dashes
    for (const side of [-ox, ox]) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.04, SEG_LEN * 0.35),
        basicColor(NES.yellow)
      );
      line.position.set(side, 0.045, -SEG_LEN * 0.25);
      line.userData.isTaperTempMark = true;
      group.add(line);
    }
  }

  if (useWhiteDash) {
    const z0 = markStyle === MARK_STYLES.BLEND_CITY_HIGHWAY ? 0 : -SEG_LEN / 2 + 2;
    for (let z = z0; z < SEG_LEN / 2; z += 4) {
      const dash = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.04, 1.4),
        basicColor(NES.white)
      );
      dash.position.set(0, 0.045, z);
      dash.userData.isTaperTempMark = true;
      group.add(dash);
    }
  }
}

function addEdgeLines(group, widthStart, widthEnd) {
  // Approximate tapered edge as two segments (approach half / exit half)
  const halfS = widthStart / 2;
  const halfE = widthEnd / 2;
  for (const side of [-1, 1]) {
    // Approach half (−Z)
    const edgeA = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.05, SEG_LEN / 2 - 0.3),
      basicColor(NES.white)
    );
    edgeA.position.set(side * (halfS - 0.15), 0.05, -SEG_LEN / 4);
    edgeA.userData.isTaperTempMark = true;
    group.add(edgeA);
    // Exit half (+Z)
    const edgeB = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.05, SEG_LEN / 2 - 0.3),
      basicColor(NES.white)
    );
    edgeB.position.set(side * (halfE - 0.15), 0.05, SEG_LEN / 4);
    edgeB.userData.isTaperTempMark = true;
    group.add(edgeB);
  }
}

function addLaneEndArrow(group, x, mode) {
  // Drawing-F style: chevron pointing toward centerline (merge) or outward (open)
  const towardCenter = mode === "lane_ends";
  const dir = towardCenter ? (x > 0 ? -1 : 1) : x > 0 ? 1 : -1;
  for (let i = 0; i < 3; i++) {
    const z = -SEG_LEN / 2 + 4 + i * 3.2;
    const shaft = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.05, 1.6),
      basicColor(NES.white)
    );
    shaft.position.set(x + dir * i * 0.15, 0.055, z);
    shaft.userData.isTaperTempMark = true;
    group.add(shaft);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.05, 0.35),
      basicColor(NES.white)
    );
    head.position.set(x + dir * (0.4 + i * 0.15), 0.055, z + 0.7);
    head.userData.isTaperTempMark = true;
    group.add(head);
  }
}

function addGoreWedge(group, goreX, widthStart, widthEnd) {
  // Painted gore: series of chevrons from closing lane toward surviving ±2
  const targetX = goreX > 0 ? 2.0 : -2.0;
  const steps = 5;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const z = -SEG_LEN / 2 + 2 + t * (SEG_LEN - 4);
    const x = goreX + (targetX - goreX) * t * 0.55;
    const w = 1.1 - t * 0.55;
    const chev = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.04, 0.9),
      basicColor(NES.yellow)
    );
    chev.position.set(x, 0.048, z);
    chev.userData.isTaperTempMark = true;
    group.add(chev);
  }
  void widthStart;
  void widthEnd;
}

/**
 * MUTCD-inspired transition paint: edge lines, center style, gore, lane-end arrows.
 * @param {THREE.Object3D} seg
 * @param {object} step transition plan step
 */
export function paintTransitionMarkings(seg, step) {
  clearTaperMarkGroup(seg);
  if (!step) return;
  const widthStart = step.widthStart ?? seg.userData.baseWidth ?? 10;
  const widthEnd = step.widthEnd ?? widthStart;
  const markStyle = step.markStyle || MARK_STYLES.CITY_DIVIDED;
  const group = new THREE.Group();
  group.userData.isTaperMarkGroup = true;
  const halfAvg = (widthStart + widthEnd) / 4;

  addCenterMarks(group, markStyle, halfAvg);

  // City ±4 dashes only early in corridor while still "city_divided"
  if (
    (markStyle === MARK_STYLES.CITY_DIVIDED || markStyle === MARK_STYLES.BLEND_CITY_RURAL) &&
    (step.atmosT ?? 0) < 0.45 &&
    Math.max(widthStart, widthEnd) > 12
  ) {
    for (const side of [-1, 1]) {
      for (let z = -SEG_LEN / 2 + 2; z < SEG_LEN / 2; z += 4) {
        const dash = new THREE.Mesh(
          new THREE.BoxGeometry(0.14, 0.04, 1.2),
          basicColor(NES.white)
        );
        dash.position.set(side * 4.0, 0.045, z);
        dash.userData.isTaperTempMark = true;
        group.add(dash);
      }
    }
  }

  if (step.edgeMode === "solid_follow_taper" || Math.abs(widthStart - widthEnd) > 0.05) {
    addEdgeLines(group, widthStart, widthEnd);
  }

  const goreXs = step.goreXs || [];
  // Gore wedges only for lane endings (narrowing). Lane openings use arrows alone —
  // drawing gores on widen creates jumbled diagonal paint.
  if (step.arrowMode === "lane_ends") {
    for (const gx of goreXs) {
      addGoreWedge(group, gx, widthStart, widthEnd);
    }
  }

  if (step.arrowMode === "lane_ends" || step.arrowMode === "lane_opens") {
    const xs =
      step.newlyClosedXs?.length
        ? step.newlyClosedXs
        : goreXs.length
          ? goreXs
          : [];
    for (const ax of xs) {
      addLaneEndArrow(group, ax, step.arrowMode);
    }
  }

  seg.add(group);
  seg.userData.taperMarkGroup = group;
}

/**
 * Trapezoid road + berm + curb morph. Paint is applied separately via paintTransitionMarkings.
 */
export function applyRoadTaper(seg, widthStart, widthEnd, markT = null) {
  const road = seg.userData.roadMesh;
  if (!road || !road.geometry) return;
  const pos = road.geometry.attributes.position;
  const halfStart = widthStart / 2;
  const halfEnd = widthEnd / 2;
  for (let i = 0; i < pos.count; i++) {
    const gy = pos.getY(i);
    const half = gy >= 0 ? halfStart : halfEnd;
    const sx = Math.sign(pos.getX(i) || 1);
    pos.setX(i, sx * half);
  }
  pos.needsUpdate = true;
  road.geometry.computeBoundingSphere();
  seg.userData.layoutWidth = Math.max(widthStart, widthEnd);
  seg.userData.tapered = true;

  addTaperGround(
    seg,
    widthStart,
    widthEnd,
    seg.userData.groundColorNear ?? null,
    seg.userData.groundColorFar ?? null
  );
  // Hide baked lane marks; keep curbs but morph them to the tapered half-width
  for (const child of seg.children) {
    if (!child.userData) continue;
    if (child.userData.isLaneMark) child.visible = false;
  }
  morphCurbsToWidth(seg, widthStart, widthEnd);
  void markT;
}

/** Restore rectangular road after pool return. */
export function resetRoadTaper(seg) {
  const road = seg.userData.roadMesh;
  if (!road || !road.geometry) return;
  const base = seg.userData.baseWidth || layoutFor(seg.userData.biome).width;
  const half = base / 2;
  const pos = road.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const sx = Math.sign(pos.getX(i) || 1);
    pos.setX(i, sx * half);
  }
  pos.needsUpdate = true;
  road.geometry.computeBoundingSphere();
  seg.userData.layoutWidth = base;
  seg.userData.tapered = false;
  clearTaperMarkGroup(seg);
  clearTaperGround(seg);
  clearTransitionGround(seg);
  setTaperDecorVisible(seg, true);
  restoreBakedRoadside(seg);
  for (const child of seg.children) {
    if (child.userData && child.userData.isCurb) {
      const side = child.userData.curbSide || Math.sign(child.position.x || 1);
      child.position.x = side * (half + 0.2);
      child.visible = true;
    }
  }
}

/** Clear runtime mix scenery attached during transition spawn. */
export function clearMixBiomeOverlay(seg) {
  const g = seg.userData.mixGroup;
  if (!g) return;
  seg.remove(g);
  g.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    }
  });
  seg.userData.mixGroup = null;
}

function restoreBakedRoadside(seg) {
  for (const child of seg.children) {
    if (
      child.userData?.isMixGroup ||
      child.userData?.isTaperMarkGroup ||
      child.userData?.isTaperGround ||
      child.userData?.isTransitionGround
    ) {
      continue;
    }
    if (child.userData?._origGroundColor != null && child.material?.color) {
      child.material.color.setHex(child.userData._origGroundColor);
      child.userData._origGroundColor = null;
    }
    if (child.userData?.roadsideHidden) {
      child.visible = true;
      child.userData.roadsideHidden = false;
    }
  }
}

/**
 * Feather roadside props (rural-fringe):
 * - Ground planes (sidewalks/berms/grass) are recolored toward the blend — never hidden,
 *   so we never expose a hard green/gray seam.
 * - Vertical props (buildings/houses) thin from the far end of the tile first.
 */
function fadeBakedRoadside(seg, keepFrac, blendColor = null) {
  const half =
    (seg.userData.layoutWidth || seg.userData.baseWidth || layoutFor(seg.userData.biome).width) / 2;
  const props = [];
  for (const child of seg.children) {
    if (!child.userData) continue;
    if (
      child.userData.isRoad ||
      child.userData.isLaneMark ||
      child.userData.isCurb ||
      child.userData.isTaperMarkGroup ||
      child.userData.isTaperGround ||
      child.userData.isTransitionGround ||
      child.userData.isMixGroup ||
      child.userData.isGantry ||
      child.name === "gantry"
    ) {
      continue;
    }
    if (Math.abs(child.position.x) <= half + 0.35) continue;

    // Horizontal ground-ish planes: recolor in place
    const isGroundPlane =
      child.isMesh &&
      child.rotation &&
      Math.abs(Math.abs(child.rotation.x) - Math.PI / 2) < 0.2 &&
      child.geometry &&
      child.geometry.type === "PlaneGeometry";
    if (isGroundPlane && blendColor != null && child.material && child.material.color) {
      if (child.userData._origGroundColor == null) {
        child.userData._origGroundColor = child.material.color.getHex();
      }
      child.material.color.setHex(blendColor);
      child.visible = true;
      child.userData.roadsideHidden = false;
      continue;
    }
    props.push(child);
  }
  props.sort((a, b) => b.position.z - a.position.z);
  const keep = Math.max(0, Math.min(1, keepFrac));
  const keepCount = Math.ceil(props.length * keep);
  props.forEach((child, i) => {
    const show = i >= props.length - keepCount;
    child.visible = show;
    child.userData.roadsideHidden = !show;
  });
}

function addSceneryForBiome(group, biome, half, side, density, tex, groundColor = null) {
  if (density < 0.08) return;
  const bermColor = groundColor != null ? groundColor : roadsideGroundColor(biome);
  if (biome === "rural") {
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(9, SEG_LEN * 0.95),
      basicColor(bermColor)
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(side * (half + 5.2), 0.026, 0);
    group.add(grass);
    if (density > 0.28) {
      const house = makeBuildingBox(2.8, 2.2, 3.2, tex.house);
      const zOff = (1 - density) * -4 + (side > 0 ? 1 : -1) * 1.5;
      house.position.set(side * (half + 5.5), 1.1, zOff);
      group.add(house);
    }
    if (density > 0.45) {
      for (let f = 0; f < 3; f++) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.12), basicColor(0x5a4030));
        post.position.set(side * (half + 1.8), 0.35, -5 + f * 3.2);
        group.add(post);
      }
    }
    if (density > 0.65) {
      const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.3), basicColor(0x3a2a18));
      trunk.position.set(side * (half + 7), 0.6, 3);
      group.add(trunk);
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 1.4), basicColor(0x006038));
      canopy.position.set(trunk.position.x, 1.7, trunk.position.z);
      group.add(canopy);
    }
  } else if (biome === "highway") {
    const berm = new THREE.Mesh(
      new THREE.PlaneGeometry(6, SEG_LEN * 0.9),
      basicColor(bermColor)
    );
    berm.rotation.x = -Math.PI / 2;
    berm.position.set(side * (half + 3.2), 0.022, 0);
    group.add(berm);
    if (density > 0.25) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.55, SEG_LEN * 0.8),
        basicColor(0xc2c3c7)
      );
      rail.position.set(side * (half + 0.55), 0.35, 0);
      group.add(rail);
    }
    if (density > 0.5) {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.6, 0.18), basicColor(NES.curb));
      pole.position.set(side * (half + 1.5), 1.8, density > 0.75 ? 2 : -2);
      group.add(pole);
    }
  } else if (biome === "city") {
    const walk = new THREE.Mesh(
      new THREE.PlaneGeometry(8, SEG_LEN * 0.9),
      basicColor(0x3a3d48)
    );
    walk.rotation.x = -Math.PI / 2;
    walk.position.set(side * (half + 4.5), 0.021, 0);
    group.add(walk);
    const verge = new THREE.Mesh(
      new THREE.PlaneGeometry(4, SEG_LEN * 0.9),
      basicColor(bermColor)
    );
    verge.rotation.x = -Math.PI / 2;
    verge.position.set(side * (half + 10), 0.02, 0);
    group.add(verge);
    if (density > 0.25) {
      const { map, preset } = pickBuildingVariant(tex, Math.random);
      const h = preset.hMin + density * 2.2;
      const b = makeBuildingBox(preset.w * 0.8, h, preset.d * 0.8, map);
      const zOff = (1 - density) * -3.5 + (side > 0 ? -1 : 1) * 1.2;
      b.position.set(side * (half + 4.5), h / 2, zOff);
      group.add(b);
    }
  }
}

/**
 * Dual-side scenery crossfade for transition corridor tiles.
 * Overlaps from/to props with Z-feathered density (rural-fringe layered landscape).
 */
export function blendTransitionScenery(seg, step, tex) {
  clearMixBiomeOverlay(seg);
  restoreBakedRoadside(seg);
  if (!step) return;

  const blend = Math.min(1, Math.max(0, step.sceneryBlend ?? 0));
  const toBiome = step.sceneryTo || step.toBiome || step.mixBiome;
  const fromBiome = step.sceneryFrom || step.fromBiome || seg.userData.biome;
  const half =
    (seg.userData.layoutWidth ||
      Math.max(step.widthStart || 0, step.widthEnd || 0) ||
      seg.userData.baseWidth ||
      layoutFor(seg.userData.biome).width) / 2;
  const gNear = seg.userData.groundColorNear ?? lerpRoadsideGround(fromBiome, toBiome, blend);
  const gFar = seg.userData.groundColorFar ?? gNear;

  if (step.phase === "settle" || step.adopt) {
    if (step.phase === "enter" && fromBiome && fromBiome !== toBiome && blend < 0.99) {
      const group = new THREE.Group();
      group.userData.isMixGroup = true;
      const remnant = Math.max(0, 1 - blend) * 0.55;
      for (const side of [-1, 1]) {
        addSceneryForBiome(group, fromBiome, half, side, remnant, tex, gNear);
      }
      if (group.children.length) {
        seg.add(group);
        seg.userData.mixGroup = group;
      }
    }
    return;
  }

  const keepFrom = Math.max(0.18, 1 - blend * 0.72);
  fadeBakedRoadside(seg, keepFrom, gNear);

  if (!toBiome || blend < 0.06) return;

  const group = new THREE.Group();
  group.userData.isMixGroup = true;
  for (const side of [-1, 1]) {
    addSceneryForBiome(group, toBiome, half, side, blend, tex, gFar);
  }
  seg.add(group);
  seg.userData.mixGroup = group;
}

/**
 * @deprecated Prefer blendTransitionScenery — kept for callers that only pass a mix biome.
 */
export function applyMixBiomeOverlay(seg, mixBiome, tex) {
  blendTransitionScenery(
    seg,
    {
      mixBiome,
      sceneryTo: mixBiome,
      sceneryBlend: mixBiome ? 0.55 : 0,
      widthStart: seg.userData.layoutWidth,
      widthEnd: seg.userData.layoutWidth,
      phase: "taper",
    },
    tex
  );
}

/**
 * Full transition tile decorate: ground carpet → paint → scenery.
 */
export function decorateTransitionTile(seg, step, tex) {
  if (!step) return;
  paintTransitionGround(seg, step);
  if (step.phase === "exit" || step.phase === "taper") {
    paintTransitionMarkings(seg, step);
  } else {
    clearTaperMarkGroup(seg);
  }
  blendTransitionScenery(seg, step, tex);
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
        dash.userData.isLaneMark = true;
        root.add(dash);
      }
    }
  } else {
    // Double yellow center divider (gapped at intersection)
    for (const zc of markCenters) {
      for (const ox of [-0.18, 0.18]) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, Math.max(0.5, markLen - 1)), basicColor(NES.yellow));
        line.position.set(ox, 0.04, zc);
        line.userData.isLaneMark = true;
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
            dash.userData.isLaneMark = true;
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
      c.userData.isCurb = true;
      c.userData.curbSide = Math.sign(x);
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

function addStopBar(root, len, x, z, alongX) {
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(alongX ? 0.35 : len, 0.05, alongX ? len : 0.35),
    basicColor(NES.white)
  );
  bar.position.set(x, 0.05, z);
  root.add(bar);
}

function addMainZebra(root, roadWidth, z) {
  const stripeW = 0.55;
  const count = Math.max(5, Math.floor(roadWidth / 1.1));
  for (let i = 0; i < count; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(stripeW, 0.04, 1.8), basicColor(NES.white));
    stripe.position.set(-roadWidth / 2 + 0.8 + i * stripeW * 1.55, 0.05, z);
    root.add(stripe);
  }
}

function addCrossZebra(root, armW, x) {
  const stripeW = 0.5;
  const count = Math.max(5, Math.floor(armW / 1.2));
  for (let i = 0; i < count; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, stripeW), basicColor(NES.white));
    stripe.position.set(x, 0.05, -armW / 2 + 0.9 + i * stripeW * 1.55);
    root.add(stripe);
  }
}

/**
 * Reference-style junction: asphalt arms, paint, stop bars, zebras, curb corners.
 * City gets 4-lane cross; rural/highway get 2-lane cross.
 */
function addCrossStreet(root, half, width, biome = "city") {
  const fourLane = biome === "city";
  const armLen = 15;
  const armW = fourLane ? Math.max(12, width * 0.85) : Math.max(8, width * 0.75);
  const armHalf = armW / 2;

  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.PlaneGeometry(armLen, armW), basicColor(NES.asphalt));
    arm.rotation.x = -Math.PI / 2;
    arm.position.set(side * (half + armLen / 2), 0.012, 0);
    root.add(arm);
    for (const zSide of [-1, 1]) {
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(armLen * 0.9, 2.0), basicColor(0x3a3d48));
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(side * (half + armLen / 2), 0.018, zSide * (armHalf + 1.05));
      root.add(walk);
    }
  }

  for (const side of [-1, 1]) {
    const xMid = side * (half + armLen / 2);
    for (const oz of [-0.18, 0.18]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(armLen - 1, 0.04, 0.12), basicColor(NES.yellow));
      line.position.set(xMid, 0.04, oz);
      root.add(line);
    }
    for (const oz of [-(armHalf - 0.25), armHalf - 0.25]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(armLen - 0.5, 0.04, 0.14), basicColor(NES.white));
      edge.position.set(xMid, 0.04, oz);
      root.add(edge);
    }
    if (fourLane) {
      for (const oz of [-2.0, 2.0]) {
        for (let xi = 0; xi < 4; xi++) {
          const dash = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.16), basicColor(NES.white));
          dash.position.set(xMid - armLen / 2 + 2 + xi * 3.5, 0.04, oz);
          root.add(dash);
        }
      }
    }
  }

  addStopBar(root, width - 1.2, 0, -(armHalf + 0.55), false);
  addStopBar(root, width - 1.2, 0, armHalf + 0.55, false);
  addMainZebra(root, width - 1.5, -(armHalf - 0.95));
  addMainZebra(root, width - 1.5, armHalf - 0.95);

  for (const side of [-1, 1]) {
    addStopBar(root, armW - 1.0, side * (half + 0.5), 0, true);
    addCrossZebra(root, armW, side * (half + 1.55));
  }

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const curb = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 0.55), basicColor(NES.curb));
        curb.position.set(
          sx * (half + 0.3 + k * 0.4),
          0.14,
          sz * (armHalf + 0.3 + (2 - k) * 0.4)
        );
        root.add(curb);
      }
    }
  }
}

function makeSignalHead(poleX, poleZ, facing) {
  const head = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.32, 4.4, 0.32), basicColor(0xc2c3c7));
  pole.position.set(poleX, 2.2, poleZ);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(1.05, 3.0, 0.65), basicColor(0x0a0a12));
  housing.position.set(poleX, 4.0, poleZ + facing * 0.15);
  head.add(pole, housing);

  const mk = (name, y) => {
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 0.38), basicColor(NES.asphalt));
    bulb.position.set(poleX, y, poleZ + facing * 0.48);
    bulb.name = name;
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 2.8),
      new THREE.MeshBasicMaterial({
        color: NES.white,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    glow.position.set(poleX, y, poleZ + facing * 0.75);
    glow.name = name + "Glow";
    head.add(bulb, glow);
  };
  mk("bulbRed", 5.05);
  mk("bulbYellow", 4.05);
  mk("bulbGreen", 3.05);
  return head;
}

function addThreeLampSignal(root, half, tex) {
  const lightGroup = new THREE.Group();
  const left = makeSignalHead(-(half - 0.35), 2.4, 1);
  const right = makeSignalHead(half - 0.35, 2.4, 1);
  right.traverse((o) => {
    if (!o.name) return;
    if (o.name === "bulbRed") o.name = "bulbRedB";
    else if (o.name === "bulbYellow") o.name = "bulbYellowB";
    else if (o.name === "bulbGreen") o.name = "bulbGreenB";
    else if (o.name === "bulbRedGlow") o.name = "bulbRedBGlow";
    else if (o.name === "bulbYellowGlow") o.name = "bulbYellowBGlow";
    else if (o.name === "bulbGreenGlow") o.name = "bulbGreenBGlow";
  });
  lightGroup.add(left, right);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 2.4),
    new THREE.MeshBasicMaterial({ map: tex.light, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide })
  );
  sign.position.set(-(half - 0.35) - 0.75, 4.0, 2.4);
  lightGroup.add(sign);
  root.add(lightGroup);
  return lightGroup;
}

/**
 * Roadside NES gas station — canopy, pumps, price board.
 * @param {1|-1} side 1 = right of road, -1 = left
 */
export function addGasStationVisuals(root, half, biome, side = 1) {
  const group = new THREE.Group();
  group.name = "gasStation";
  group.userData.gasSide = side;
  const padX = half + (biome === "city" ? 6.2 : 5.4);
  // Anchor used for screen-space "Tap to fill up!" projection
  const anchor = new THREE.Object3D();
  anchor.name = "gasAnchor";
  anchor.position.set(side * padX, 4.2, 0);
  group.add(anchor);

  const lot = new THREE.Mesh(
    new THREE.PlaneGeometry(7.5, 11),
    basicColor(0x3a3d48)
  );
  lot.rotation.x = -Math.PI / 2;
  lot.position.set(side * padX, 0.03, 0);
  lot.userData.gasHit = true;
  group.add(lot);

  // Canopy posts + roof
  const postH = 3.2;
  for (const ox of [-2.4, 2.4]) {
    for (const oz of [-3.2, 3.2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, postH, 0.28), basicColor(NES.curb));
      post.position.set(side * (padX) + side * ox, postH / 2, oz);
      post.userData.gasHit = true;
      group.add(post);
    }
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.45, 9.2), basicColor(NES.red));
  roof.position.set(side * padX, postH + 0.15, 0);
  roof.userData.gasHit = true;
  group.add(roof);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.22, 9.6), basicColor(NES.yellow));
  trim.position.set(side * padX, postH - 0.05, 0);
  trim.userData.gasHit = true;
  group.add(trim);
  // Bright canopy edge so stations read from chase-cam distance
  const lip = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.12, 9.8), basicColor(NES.white));
  lip.position.set(side * padX, postH + 0.4, 0);
  lip.userData.gasHit = true;
  group.add(lip);

  // Pumps — sit toward the road curb from the lot center
  for (const oz of [-2.2, 0.4, 2.8]) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.4, 0.55), basicColor(0xc2c3c7));
    body.position.set(side * padX - side * 0.6, 0.7, oz);
    body.userData.gasHit = true;
    group.add(body);
    const hose = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), basicColor(NES.black));
    hose.position.set(side * padX - side * 1.05, 0.55, oz);
    hose.userData.gasHit = true;
    group.add(hose);
    const nozzle = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.18), basicColor(NES.orange));
    nozzle.position.set(side * padX - side * 1.25, 0.95, oz);
    nozzle.userData.gasHit = true;
    group.add(nozzle);
  }

  // Store booth farther from the road
  const booth = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.4, 3.2), basicColor(NES.navy));
  booth.position.set(side * padX + side * 2.2, 1.2, -1.5);
  booth.userData.gasHit = true;
  group.add(booth);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 0.22), basicColor(NES.green));
  sign.position.set(side * padX + side * 2.2, 3.05, -1.5);
  sign.userData.gasHit = true;
  group.add(sign);
  const signGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 1.6),
    new THREE.MeshBasicMaterial({
      color: NES.green,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  signGlow.position.set(side * padX + side * 2.2, 3.05, -1.35);
  signGlow.userData.gasHit = true;
  group.add(signGlow);

  // Price board pole near curb
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.6, 0.2), basicColor(NES.curb));
  pole.position.set(side * (half + 1.1), 1.8, 4.5);
  pole.userData.gasHit = true;
  group.add(pole);
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.3, 0.15), basicColor(NES.white));
  board.position.set(side * (half + 1.1), 3.4, 4.5);
  board.userData.gasHit = true;
  group.add(board);
  const digit = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 0.08), basicColor(NES.red));
  digit.position.set(side * (half + 1.1), 3.55, side > 0 ? 4.58 : 4.42);
  digit.userData.gasHit = true;
  group.add(digit);

  root.add(group);
  return group;
}

/**
 * @param {object} tex texture atlas
 * @param {string} biome
 * @param {{intersection?:boolean,turnOffer?:boolean,onRamp?:boolean,gasStation?:boolean,distance?:number,widthOverride?:number,mixBiome?:string|null,seed?:number,transition?:boolean}} opts
 */
export function makeSegment(tex, biome, opts = {}) {
  const {
    intersection = false,
    turnOffer = false,
    onRamp = false,
    gasStation = false,
    gasSide: gasSideOpt = null,
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
  /** @type {1|-1} */
  const gasSide = gasStation
    ? (gasSideOpt === -1 || gasSideOpt === 1 ? gasSideOpt : (rnd() < 0.5 ? -1 : 1))
    : 1;

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
  road.userData.isRoad = true;
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
        if (gasStation || patchLen < 3) continue;
        const pad = new THREE.Mesh(new THREE.PlaneGeometry(5, Math.min(5.5, patchLen - 0.5)), basicColor(0x4a5a38));
        pad.rotation.x = -Math.PI / 2;
        const houseX = side * (bermCenter + 0.5);
        pad.position.set(houseX, 0.03, zc + (rnd() - 0.5) * Math.min(2, patchLen * 0.3));
        root.add(pad);
        if (rnd() > 0.2) {
          const house = makeBuildingBox(3.2, 2.6, Math.min(4, patchLen - 0.4), tex.house);
          house.position.set(houseX, 1.3, pad.position.z);
          root.add(house);
        }
        // Fence posts + tree silhouettes for rural read
        if (rnd() > 0.35) {
          for (let f = 0; f < 3; f++) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.12), basicColor(0x5a4030));
            post.position.set(side * (half + 1.6), 0.35, zc - patchLen * 0.3 + f * 2.2);
            root.add(post);
          }
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 5.2), basicColor(0x6a5040));
          rail.position.set(side * (half + 1.6), 0.55, zc);
          root.add(rail);
        }
        if (rnd() > 0.4) {
          const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.4, 0.35), basicColor(0x3a2a18));
          trunk.position.set(side * (bermCenter + 3.2), 0.7, zc + (rnd() - 0.5) * 3);
          root.add(trunk);
          const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.6), basicColor(0x006038));
          canopy.position.set(trunk.position.x, 1.9, trunk.position.z);
          root.add(canopy);
        }
      }
    }
  } else if (propBiome === "highway") {
    for (const side of [-1, 1]) {
      if (gasStation) continue;
      for (const zc of patchCenters) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, patchLen), basicColor(0xc2c3c7));
        rail.position.set(side * (half + 0.5), 0.4, zc);
        root.add(rail);
        // Light poles along the berm
        if (rnd() > 0.25) {
          const pole = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.2, 0.18), basicColor(NES.curb));
          pole.position.set(side * (half + 1.4), 2.1, zc);
          root.add(pole);
          const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.12), basicColor(NES.curb));
          arm.position.set(side * (half + 0.85), 4.05, zc);
          root.add(arm);
          const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.35), basicColor(NES.yellow));
          lamp.position.set(side * (half + 0.35), 3.95, zc);
          root.add(lamp);
        }
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
        if (gasStation || patchLen < 3.5) continue;
        // Pack 2–3 random facade variants along each curb (left & right)
        const slots = patchLen >= 14 ? 3 : patchLen >= 8 ? 2 : 1;
        const slotSpan = patchLen / slots;
        for (let slot = 0; slot < slots; slot++) {
          const v = pickBuildingVariant(tex, rnd);
          const h = v.preset.hMin + ((rnd() * v.preset.hSpan) | 0);
          const depth = Math.min(v.preset.d, slotSpan - 0.6);
          const zOff = zc - patchLen / 2 + slotSpan * (slot + 0.5);
          const b = makeBuildingBox(v.preset.w, h, depth, v.map);
          b.position.set(side * (walkCenter - 0.5), h / 2, zOff);
          root.add(b);
          // Lit window strips — neon NES blocks on the street-facing facade
          const winRows = Math.max(2, (h / 1.6) | 0);
          const winW = Math.min(2.4, v.preset.w * 0.65);
          for (let r = 0; r < winRows; r++) {
            if (rnd() < 0.35) continue;
            const lit = rnd() > 0.45;
            const win = new THREE.Mesh(
              new THREE.BoxGeometry(winW, 0.35, 0.08),
              basicColor(lit ? NES.yellow : 0x2a2a38)
            );
            win.position.set(
              side * (walkCenter - 0.5) - side * (v.preset.w * 0.5 + 0.05),
              1.1 + r * 1.45,
              zOff
            );
            root.add(win);
          }
          // Occasional back-row building for denser skyline (independent variant)
          if (!intersection && rnd() > 0.45) {
            const v2 = pickBuildingVariant(tex, rnd);
            const h2 = v2.preset.hMin + ((rnd() * v2.preset.hSpan) | 0);
            const b2 = makeBuildingBox(
              v2.preset.w * 0.9,
              h2,
              Math.min(v2.preset.d, depth),
              v2.map
            );
            b2.position.set(side * (walkCenter + 1.5), h2 / 2, zOff + (rnd() - 0.5));
            root.add(b2);
          }
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
      const { map, preset } = pickBuildingVariant(tex, rnd);
      const h = preset.hMin + ((rnd() * preset.hSpan) | 0);
      const b = makeBuildingBox(preset.w * 0.85, h, preset.d * 0.85, map);
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
    addCrossStreet(root, half, width, biome);
    lightGroup = addThreeLampSignal(root, half, tex);
  }

  let gasGroup = null;
  // Visuals added at place-time so L/R can be chosen per spawn
  if (gasStation && !intersection && !turnOffer) {
    gasGroup = addGasStationVisuals(root, half, biome, gasSide);
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
    gasStation,
    gasSide,
    transition,
    lightGroup,
    gasGroup,
    gantryGroup,
    lightState: "green",
    lightTimer: 1.5 + rnd(),
    resolved: false,
    turnResolved: false,
    gasResolved: false,
    turnLeftBiome,
    turnRightBiome,
    layoutWidth: width,
    baseWidth: width,
    roadMesh: road,
    tapered: false,
    usableLanes: [...Array(layout.count).keys()],
    adoptBiome: false,
    layoutBiome: biome,
    closedLaneXs: [],
    transitionPhase: null,
  };
  return root;
}

export function updateLightVisual(seg) {
  const g = seg.userData.lightGroup;
  if (!g) return;
  const s = seg.userData.lightState;
  const dim = 0x1a1a22;
  const lit = { red: NES.red, yellow: NES.yellow, green: NES.green };
  const pairs = [
    ["bulbRed", "bulbRedB", "red"],
    ["bulbYellow", "bulbYellowB", "yellow"],
    ["bulbGreen", "bulbGreenB", "green"],
  ];
  for (const [a, b, key] of pairs) {
    const on = s === key;
    const hex = on ? lit[key] : dim;
    for (const name of [a, b]) {
      const bulb = g.getObjectByName(name);
      if (bulb) bulb.material.color.setHex(hex);
      const glow = g.getObjectByName(name + "Glow");
      if (glow) {
        glow.material.color.setHex(on ? lit[key] : dim);
        glow.material.opacity = on ? 0.7 : 0;
        glow.visible = on;
        if (on) glow.scale.set(1.15, 1.15, 1);
      }
    }
  }
  // Legacy single-bulb fallback
  const legacy = g.getObjectByName("bulb");
  if (legacy) {
    legacy.material.color.setHex(s === "red" ? NES.red : s === "yellow" ? NES.yellow : NES.green);
  }
}

/** Pulse active glow quads so the phase reads at chase-cam distance. */
export function pulseLightGlow(seg, timeSec) {
  const g = seg.userData.lightGroup;
  if (!g) return;
  const s = seg.userData.lightState;
  const pulse = 1.15 + 0.22 * Math.sin(timeSec * 10);
  const names =
    s === "red" ? ["bulbRedGlow", "bulbRedBGlow"]
      : s === "yellow" ? ["bulbYellowGlow", "bulbYellowBGlow"]
        : ["bulbGreenGlow", "bulbGreenBGlow"];
  for (const name of names) {
    const glow = g.getObjectByName(name);
    if (!glow) continue;
    glow.scale.set(pulse, pulse, 1);
    glow.material.opacity = 0.55 + 0.28 * Math.sin(timeSec * 10);
  }
}

/** Sparse dust quads near closed-lane cones during taper merges. */
export function makeDustMote() {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 0.55),
    new THREE.MeshBasicMaterial({
      color: 0x83769c,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.userData.kind = "dust";
  mesh.userData.hitHalfX = 0;
  mesh.userData.hitHalfZ = 0;
  return mesh;
}
