/**
 * Generic rent/return object pool for non-vehicle scene objects (coins, FX).
 * Prefer carPool.js for GLB traffic — it resets role flags on recycle.
 */
export class Pool {
  constructor(factory, prewarm = 0) {
    this.factory = factory;
    this.free = [];
    for (let i = 0; i < prewarm; i++) {
      const o = factory();
      o.visible = false;
      this.free.push(o);
    }
  }
  rent() {
    const o = this.free.length ? this.free.pop() : this.factory();
    o.visible = true;
    return o;
  }
  return(o) {
    o.visible = false;
    this.free.push(o);
  }
}
