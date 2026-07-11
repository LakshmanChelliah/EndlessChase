/**
 * NES pixel meshes + road segment factory.
 */
import * as THREE from "three";
import { ASSET, SEG_LEN, NES, layoutFor, pickTurnBiomes } from "./constants.js";

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

export function addSky(scene, tex) {
  const skyGeo = new THREE.SphereGeometry(90, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const skyMat = new THREE.MeshBasicMaterial({ map: tex.sky, side: THREE.BackSide });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.position.y = -2;
  scene.add(sky);
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

function addLaneMarkings(root, layout, biome) {
  const half = layout.width / 2;
  if (biome === "highway") {
    const mid = (layout.xs[0] + layout.xs[1]) / 2;
    for (let z = -SEG_LEN / 2 + 2; z < SEG_LEN / 2; z += 4) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 1.4), basicColor(NES.white));
      dash.position.set(mid, 0.04, z);
      root.add(dash);
    }
  } else {
    for (const ox of [-0.18, 0.18]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, SEG_LEN - 1), basicColor(NES.yellow));
      line.position.set(ox, 0.04, 0);
      root.add(line);
    }
    if (biome === "city") {
      for (const x of [-4.0, 4.0]) {
        for (let z = -SEG_LEN / 2 + 2; z < SEG_LEN / 2; z += 4) {
          const dash = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 1.4), basicColor(NES.white));
          dash.position.set(x, 0.04, z);
          root.add(dash);
        }
      }
    }
  }
  for (const x of [-(half + 0.2), half + 0.2]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, SEG_LEN), basicColor(NES.curb));
    c.position.set(x, 0.15, 0);
    root.add(c);
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

/**
 * @param {object} tex texture atlas
 * @param {string} biome
 * @param {{intersection?:boolean,turnOffer?:boolean,onRamp?:boolean,distance?:number}} opts
 */
export function makeSegment(tex, biome, opts = {}) {
  const { intersection = false, turnOffer = false, onRamp = false, distance = 0 } = opts;
  const layout = layoutFor(biome);
  const root = new THREE.Group();
  const half = layout.width / 2;

  const roadMat = basic(tex.road);
  roadMat.map = tex.road.clone();
  roadMat.map.needsUpdate = true;
  roadMat.map.wrapS = roadMat.map.wrapT = THREE.RepeatWrapping;
  roadMat.map.repeat.set(layout.width / 12, 2);
  roadMat.map.magFilter = THREE.NearestFilter;
  roadMat.map.minFilter = THREE.NearestFilter;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(layout.width, SEG_LEN), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.01;
  root.add(road);

  addLaneMarkings(root, layout, biome);

  if (biome === "rural") {
    for (const side of [-1, 1]) {
      const grass = new THREE.Mesh(new THREE.PlaneGeometry(4, SEG_LEN), basicColor(NES.forest));
      grass.rotation.x = -Math.PI / 2;
      grass.position.set(side * (half + 2.5), 0.02, 0);
      root.add(grass);
      const house = new THREE.Mesh(new THREE.BoxGeometry(3.5, 2.8, 4), basic(tex.house));
      house.position.set(side * (half + 4.5), 1.4, 0);
      root.add(house);
    }
  } else if (biome === "highway") {
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, SEG_LEN), basicColor(0xc2c3c7));
      rail.position.set(side * (half + 0.5), 0.4, 0);
      root.add(rail);
    }
    const gantry = new THREE.Mesh(new THREE.BoxGeometry(layout.width + 4, 0.4, 0.4), basicColor(NES.forest));
    gantry.position.set(0, 4, 0);
    root.add(gantry);
    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), basicColor(NES.curb));
    postL.position.set(-(half + 0.5), 2, 0);
    const postR = postL.clone();
    postR.position.x = half + 0.5;
    root.add(postL, postR);
  } else {
    for (const side of [-1, 1]) {
      const h1 = 5 + (Math.random() * 4) | 0;
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(3.8, h1, 6), basic(tex.building));
      b1.position.set(side * (half + 4.2), h1 / 2, -2);
      const h2 = 4 + (Math.random() * 3) | 0;
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(3.2, h2, 5), basic(tex.building));
      b2.position.set(side * (half + 4.8), h2 / 2, 5);
      root.add(b1, b2);
    }
  }

  if (onRamp) {
    const ramp = new THREE.Mesh(new THREE.PlaneGeometry(4, 12), basicColor(NES.asphalt));
    ramp.rotation.x = -Math.PI / 2;
    ramp.position.set(half * 0.55, 0.015, -2);
    ramp.rotation.z = -0.25;
    root.add(ramp);
    for (let i = 0; i < 4; i++) {
      const arrow = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.04, 1.0), basicColor(NES.white));
      arrow.position.set(half * 0.4 - i * 0.15, 0.05, -4 + i * 2);
      root.add(arrow);
    }
  }

  let lightGroup = null;
  if (intersection) {
    const zebra = new THREE.Mesh(new THREE.PlaneGeometry(layout.width - 2, 2.2), basicColor(NES.white));
    zebra.rotation.x = -Math.PI / 2;
    zebra.position.y = 0.03;
    root.add(zebra);
    lightGroup = new THREE.Group();
    const poleX = -(half - 0.5);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.2, 0.2), basicColor(0xc2c3c7));
    pole.position.set(poleX, 1.6, 2);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 2.4),
      new THREE.MeshBasicMaterial({ map: tex.light, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide })
    );
    sign.position.set(poleX, 3.2, 2);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.2), basicColor(NES.green));
    bulb.position.set(poleX, 3.5, 2.15);
    bulb.name = "bulb";
    lightGroup.add(pole, sign, bulb);
    root.add(lightGroup);
  }

  let turnLeftBiome = null;
  let turnRightBiome = null;
  if (turnOffer) {
    const pair = pickTurnBiomes(biome, distance);
    turnLeftBiome = pair.left;
    turnRightBiome = pair.right;
    addTurnOfferVisuals(root, layout);
  }

  root.userData = {
    biome,
    intersection,
    turnOffer,
    onRamp,
    lightGroup,
    lightState: "green",
    lightTimer: 1.5 + Math.random(),
    resolved: false,
    turnResolved: false,
    turnLeftBiome,
    turnRightBiome,
  };
  return root;
}

export function updateLightVisual(seg) {
  const bulb = seg.userData.lightGroup?.getObjectByName("bulb");
  if (!bulb) return;
  const s = seg.userData.lightState;
  bulb.material.color.setHex(s === "red" ? NES.red : s === "yellow" ? NES.yellow : NES.green);
}
