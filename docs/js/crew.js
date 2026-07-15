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
    new THREE.BoxGeometry(0.42, 0.72, 0.28),
    new THREE.MeshBasicMaterial({ color: coat })
  );
  body.position.y = 0.56;
  root.add(body);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.28, 0.28),
    new THREE.MeshBasicMaterial({ color: 0xc4a484 })
  );
  head.position.y = 1.08;
  root.add(head);

  const mask = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.12, 0.08),
    new THREE.MeshBasicMaterial({ color: NES.black })
  );
  mask.position.set(0, 1.06, 0.14);
  root.add(mask);

  const cash = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.18, 0.28),
    new THREE.MeshBasicMaterial({ color: bag })
  );
  cash.position.set(0.28, 0.42, 0.02);
  root.add(cash);

  root.userData.crew = true;
  return root;
}

/**
 * World-space passenger seat targets relative to a parked getaway car.
 * @param {number} parkX
 * @param {number} parkZ
 * @param {number} index 0 = near-side rear, 1 = far-side rear
 */
export function crewSeatWorld(parkX, parkZ, index) {
  const side = index === 0 ? 0.38 : -0.22;
  return {
    x: parkX + side,
    y: 0,
    z: parkZ - 0.15,
  };
}
