/**
 * Pooled rent/return for civilian, police, and cross-traffic vehicles.
 */
import { pickCivilianCarId } from "./cars.js?v=22";
import { createVehicle, ensureBlinkers } from "./vehicle.js?v=22";

/** @type {Record<string, import("three").Object3D[]>} */
const civFree = Object.create(null);
/** @type {import("three").Object3D[]} */
const policeFree = [];
/** @type {import("three").Object3D[]} */
const crossFree = [];

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
  ensureBlinkers(car);
  return car;
}

export function returnCivilian(car) {
  car.visible = false;
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
  ensureBlinkers(car);
  return car;
}

export function returnPolice(car) {
  car.visible = false;
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
  return car;
}

export function returnCross(car) {
  car.visible = false;
  crossFree.push(car);
}

export function returnTrafficCar(t) {
  if (t.userData.police) returnPolice(t);
  else returnCivilian(t);
}
