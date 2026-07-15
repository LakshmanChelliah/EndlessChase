/**
 * Traffic vehicle pools — rent/return civilians, police, and cross-traffic.
 *
 * Critical: resetTrafficRoleFlags() on every return/reuse so chase, gas-threat,
 * curb-parked, and cross roles never leak into the next life (frozen / no collide).
 */
import { pickCivilianCarId } from "./cars.js?v=23";
import { createVehicle, ensureBlinkers } from "./vehicle.js?v=24";

/** @type {Record<string, import("three").Object3D[]>} */
const civFree = Object.create(null);
/** @type {import("three").Object3D[]} */
const policeFree = [];
/** @type {import("three").Object3D[]} */
const crossFree = [];

/**
 * Clear role/behavior flags left over from a previous life in the pool.
 * Without this, recycled curb deco / chase / gas-threat cars stay frozen
 * (and skip collision) when reused as normal traffic.
 * @param {import("three").Object3D} car
 */
export function resetTrafficRoleFlags(car) {
  const u = car.userData;
  u.curbParked = false;
  u.openingChase = false;
  u.gasThreat = false;
  u.pursuit = false;
  u.stopped = false;
  u.police = false;
  u.hazard = false;
  u.crossKind = null;
  u.vx = 0;
  u.dir = 1;
  u.lane = 0;
  u.speed = 0;
  u.cruiseSpeed = 0;
}

/**
 * @param {import("three").Scene} scene
 * @param {string} [carId]
 */
export function rentCivilian(scene, carId = pickCivilianCarId()) {
  const list = civFree[carId] || (civFree[carId] = []);
  let car = list.pop();
  if (!car) {
    car = createVehicle(carId, { tint: true });
    scene.add(car);
  }
  car.visible = true;
  resetTrafficRoleFlags(car);
  ensureBlinkers(car);
  return car;
}

export function returnCivilian(car) {
  car.visible = false;
  resetTrafficRoleFlags(car);
  const id = car.userData.carId || "coupe";
  (civFree[id] || (civFree[id] = [])).push(car);
}

/** @param {import("three").Scene} scene */
export function rentPolice(scene) {
  let car = policeFree.pop();
  if (!car) {
    car = createVehicle("police", { tint: false });
    scene.add(car);
  }
  car.visible = true;
  resetTrafficRoleFlags(car);
  // Police pool cars are always police-skinned; role flags still start clean.
  car.userData.police = true;
  ensureBlinkers(car);
  return car;
}

export function returnPolice(car) {
  car.visible = false;
  resetTrafficRoleFlags(car);
  car.userData.police = true;
  policeFree.push(car);
}

/** @param {import("three").Scene} scene */
export function rentCross(scene) {
  let car = crossFree.pop();
  if (!car) {
    car = createVehicle("van", { tint: true });
    scene.add(car);
  }
  car.visible = true;
  resetTrafficRoleFlags(car);
  return car;
}

export function returnCross(car) {
  car.visible = false;
  resetTrafficRoleFlags(car);
  crossFree.push(car);
}

export function returnTrafficCar(t) {
  // Prefer carId so routing stays correct even if role flags were cleared.
  if (t.userData.carId === "police" || t.userData.police) returnPolice(t);
  else returnCivilian(t);
}
