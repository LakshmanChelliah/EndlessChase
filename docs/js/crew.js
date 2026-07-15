/**
 * NES getaway crew props — small box figures scaled to the car (~door-handle tall).
 * Motion (run bob / fidget) is driven by game.js; meshes stay unlit MeshBasic.
 */
import * as THREE from "three";
import { NES } from "./constants.js?v=32";

/**
 * Compact trench-coat robber — about half a car-height so they read as passengers.
 * @param {{ coat?: number, bag?: number, hat?: number }} [opts]
 * @returns {THREE.Group}
 */
export function makeCrewMember(opts = {}) {
  const coat = opts.coat ?? NES.black;
  const bag = opts.bag ?? NES.yellow;
  const hat = opts.hat ?? NES.red;
  const root = new THREE.Group();
  root.name = "crew";

  // Total height ~0.72 (car body ~1.2+) — clearly smaller than the getaway car
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.34, 0.15),
    new THREE.MeshBasicMaterial({ color: coat })
  );
  body.position.y = 0.36;
  root.add(body);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.15, 0.15),
    new THREE.MeshBasicMaterial({ color: 0xe8c4a0 })
  );
  head.position.y = 0.61;
  root.add(head);

  const mask = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.06, 0.05),
    new THREE.MeshBasicMaterial({ color: NES.black })
  );
  mask.position.set(0, 0.6, 0.08);
  root.add(mask);

  const brim = new THREE.Mesh(
    new THREE.BoxGeometry(0.19, 0.035, 0.19),
    new THREE.MeshBasicMaterial({ color: hat })
  );
  brim.position.y = 0.7;
  root.add(brim);
  const crown = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.07, 0.12),
    new THREE.MeshBasicMaterial({ color: hat })
  );
  crown.position.y = 0.75;
  root.add(crown);

  const legL = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.16, 0.08),
    new THREE.MeshBasicMaterial({ color: coat })
  );
  legL.position.set(-0.055, 0.1, 0);
  legL.name = "legL";
  root.add(legL);
  const legR = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.16, 0.08),
    new THREE.MeshBasicMaterial({ color: coat })
  );
  legR.position.set(0.055, 0.1, 0);
  legR.name = "legR";
  root.add(legR);

  const cash = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.11, 0.16),
    new THREE.MeshBasicMaterial({ color: bag })
  );
  cash.position.set(0.16, 0.28, 0.03);
  cash.name = "cashBag";
  root.add(cash);

  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.035, 0.035),
    new THREE.MeshBasicMaterial({ color: NES.green })
  );
  stripe.position.set(0.16, 0.28, 0.11);
  root.add(stripe);

  root.userData.crew = true;
  root.userData.legL = legL;
  root.userData.legR = legR;
  root.userData.cashBag = cash;
  root.userData.bagBaseY = 0.28;
  return root;
}

/** Dropped loot prop near the bank doors (idle / boarding accent). */
export function makeLootBag(color = NES.yellow) {
  const g = new THREE.Group();
  g.name = "lootBag";
  const bag = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.12, 0.2),
    new THREE.MeshBasicMaterial({ color })
  );
  bag.position.y = 0.07;
  g.add(bag);
  const mark = new THREE.Mesh(
    new THREE.BoxGeometry(0.17, 0.04, 0.04),
    new THREE.MeshBasicMaterial({ color: NES.green })
  );
  mark.position.set(0, 0.07, 0.11);
  g.add(mark);
  return g;
}

/**
 * Animate run cycle / idle fidget on a crew mesh.
 * @param {THREE.Object3D} mesh
 * @param {number} t
 * @param {"idle"|"run"} mode
 * @param {number} [intensity]
 */
export function animateCrew(mesh, t, mode, intensity = 1) {
  const legL = mesh.userData.legL;
  const legR = mesh.userData.legR;
  const bag = mesh.userData.cashBag;
  const bagY = mesh.userData.bagBaseY ?? 0.28;
  if (mode === "run") {
    const swing = Math.sin(t * 18) * 0.55 * intensity;
    if (legL) legL.rotation.x = swing;
    if (legR) legR.rotation.x = -swing;
    if (bag) {
      bag.position.y = bagY + Math.abs(Math.sin(t * 16)) * 0.05;
      bag.rotation.z = Math.sin(t * 14) * 0.25;
    }
    mesh.rotation.z = Math.sin(t * 16) * 0.06;
  } else {
    if (legL) legL.rotation.x = Math.sin(t * 1.3) * 0.08;
    if (legR) legR.rotation.x = Math.sin(t * 1.3 + 1) * 0.08;
    mesh.rotation.z = Math.sin(t * 1.1) * 0.04;
    if (bag) bag.rotation.z = Math.sin(t * 2.2) * 0.1;
  }
}

/**
 * World-space passenger seat targets — street-side so the menu cam reads the dive-in.
 * @param {number} parkX
 * @param {number} parkZ
 * @param {number} index
 */
export function crewSeatWorld(parkX, parkZ, index) {
  const side = index === 0 ? 0.42 : 0.18;
  return {
    x: parkX + side,
    y: 0,
    z: parkZ + (index === 0 ? 0.3 : -0.12),
  };
}
