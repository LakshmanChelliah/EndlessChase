/**
 * NES getaway crew props — box/billboard figures for the bank boarding intro.
 * No skeletal animation; stepped motion is driven by game.js boarding phase.
 */
import * as THREE from "three";
import { NES } from "./constants.js?v=32";

/**
 * Tiny trench-coat robber with a cash bag accent.
 * @param {{ coat?: number, bag?: number }} [opts]
 * @returns {THREE.Group}
 */
export function makeCrewMember(opts = {}) {
  const coat = opts.coat ?? NES.black;
  const bag = opts.bag ?? NES.yellow;
  const root = new THREE.Group();
  root.name = "crew";

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.95, 0.36),
    new THREE.MeshBasicMaterial({ color: coat })
  );
  body.position.y = 0.72;
  root.add(body);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.36, 0.36),
    new THREE.MeshBasicMaterial({ color: 0xe8c4a0 })
  );
  head.position.y = 1.38;
  root.add(head);

  const mask = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.14, 0.1),
    new THREE.MeshBasicMaterial({ color: NES.black })
  );
  mask.position.set(0, 1.36, 0.18);
  root.add(mask);

  const cash = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.24, 0.34),
    new THREE.MeshBasicMaterial({ color: bag })
  );
  cash.position.set(0.36, 0.55, 0.04);
  root.add(cash);

  root.userData.crew = true;
  return root;
}

/**
 * World-space passenger seat targets relative to a parked getaway car.
 * Approach from the street side (+X) so the menu camera can read the run-in.
 * @param {number} parkX
 * @param {number} parkZ
 * @param {number} index 0 = near-side rear, 1 = far-side rear
 */
export function crewSeatWorld(parkX, parkZ, index) {
  const side = index === 0 ? 0.55 : 0.2;
  return {
    x: parkX + side,
    y: 0,
    z: parkZ + (index === 0 ? 0.35 : -0.25),
  };
}
