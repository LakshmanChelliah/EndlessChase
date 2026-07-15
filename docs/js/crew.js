/**
 * NES getaway crew props — chunky box figures for the bank boarding intro.
 * Motion (run bob / fidget) is driven by game.js; meshes stay unlit MeshBasic.
 */
import * as THREE from "three";
import { NES } from "./constants.js?v=32";

/**
 * Trench-coat robber with mask, hat, legs, and bouncing cash bag.
 * @param {{ coat?: number, bag?: number, hat?: number }} [opts]
 * @returns {THREE.Group}
 */
export function makeCrewMember(opts = {}) {
  const coat = opts.coat ?? NES.black;
  const bag = opts.bag ?? NES.yellow;
  const hat = opts.hat ?? NES.red;
  const root = new THREE.Group();
  root.name = "crew";

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.58, 0.9, 0.38),
    new THREE.MeshBasicMaterial({ color: coat })
  );
  body.position.y = 0.95;
  root.add(body);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.38, 0.38),
    new THREE.MeshBasicMaterial({ color: 0xe8c4a0 })
  );
  head.position.y = 1.62;
  root.add(head);

  const mask = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.16, 0.12),
    new THREE.MeshBasicMaterial({ color: NES.black })
  );
  mask.position.set(0, 1.58, 0.2);
  root.add(mask);

  const brim = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.08, 0.48),
    new THREE.MeshBasicMaterial({ color: hat })
  );
  brim.position.y = 1.84;
  root.add(brim);
  const crown = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.18, 0.32),
    new THREE.MeshBasicMaterial({ color: hat })
  );
  crown.position.y = 1.96;
  root.add(crown);

  const legL = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.42, 0.22),
    new THREE.MeshBasicMaterial({ color: coat })
  );
  legL.position.set(-0.14, 0.28, 0);
  legL.name = "legL";
  root.add(legL);
  const legR = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.42, 0.22),
    new THREE.MeshBasicMaterial({ color: coat })
  );
  legR.position.set(0.14, 0.28, 0);
  legR.name = "legR";
  root.add(legR);

  const cash = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.28, 0.4),
    new THREE.MeshBasicMaterial({ color: bag })
  );
  cash.position.set(0.42, 0.7, 0.06);
  cash.name = "cashBag";
  root.add(cash);

  // Dollar stripe on the bag
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.08, 0.08),
    new THREE.MeshBasicMaterial({ color: NES.green })
  );
  stripe.position.set(0.42, 0.7, 0.28);
  root.add(stripe);

  root.userData.crew = true;
  root.userData.legL = legL;
  root.userData.legR = legR;
  root.userData.cashBag = cash;
  return root;
}

/** Dropped loot prop near the bank doors (idle / boarding accent). */
export function makeLootBag(color = NES.yellow) {
  const g = new THREE.Group();
  g.name = "lootBag";
  const bag = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.32, 0.48),
    new THREE.MeshBasicMaterial({ color })
  );
  bag.position.y = 0.18;
  g.add(bag);
  const mark = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.1, 0.1),
    new THREE.MeshBasicMaterial({ color: NES.green })
  );
  mark.position.set(0, 0.18, 0.26);
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
  if (mode === "run") {
    const swing = Math.sin(t * 18) * 0.55 * intensity;
    if (legL) legL.rotation.x = swing;
    if (legR) legR.rotation.x = -swing;
    if (bag) {
      bag.position.y = 0.7 + Math.abs(Math.sin(t * 16)) * 0.12;
      bag.rotation.z = Math.sin(t * 14) * 0.25;
    }
    mesh.rotation.z = Math.sin(t * 16) * 0.06;
  } else {
    // Idle: weight shift (yaw base left to caller)
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
  const side = index === 0 ? 0.62 : 0.28;
  return {
    x: parkX + side,
    y: 0,
    z: parkZ + (index === 0 ? 0.45 : -0.2),
  };
}
