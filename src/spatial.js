// ---------------------------------------------------------------------------
// spatial.js — a uniform grid over the level's circular collision blockers.
//
// Every walker and car used to test itself against every blocker in the level
// each frame (~600, mostly trees), which for ~35 NPCs is ~20k distance checks a
// frame. The grid answers "what is near (x, z)" from a handful of cells instead.
//
// Static blockers (trees, buildings, props) are bucketed once. Moving ones
// (vehicle blockers, whose x/z are rewritten every frame) live in a short
// dynamic list that is scanned linearly — there are only a few dozen.
// ---------------------------------------------------------------------------

export class BlockerGrid {
  constructor(cell = 8) {
    this.cell = cell;
    this.cells = new Map();
    this.dynamic = [];
    this._stamp = 0;
  }

  _key(ix, iz) {
    // cells are small signed integers; pack both into one number key
    return (ix + 32768) * 65536 + (iz + 32768);
  }

  addStatic(b) {
    const c = this.cell;
    const x0 = Math.floor((b.x - b.r) / c), x1 = Math.floor((b.x + b.r) / c);
    const z0 = Math.floor((b.z - b.r) / c), z1 = Math.floor((b.z + b.r) / c);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = this._key(ix, iz);
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(b);
      }
    }
    b._grid = "static";
    b._stamp = 0;
  }

  addDynamic(b) {
    b._grid = "dynamic";
    b._stamp = 0;
    this.dynamic.push(b);
  }

  remove(b) {
    if (b._grid === "dynamic") {
      const i = this.dynamic.indexOf(b);
      if (i >= 0) this.dynamic.splice(i, 1);
    } else if (b._grid === "static") {
      for (const list of this.cells.values()) {
        const i = list.indexOf(b);
        if (i >= 0) list.splice(i, 1);
      }
    }
    b._grid = null;
  }

  /**
   * Call `fn(b)` once for every blocker that could touch a circle of `radius`
   * at (x, z). Returns early if `fn` returns true.
   */
  near(x, z, radius, fn) {
    const stamp = ++this._stamp;
    const c = this.cell;
    const x0 = Math.floor((x - radius) / c), x1 = Math.floor((x + radius) / c);
    const z0 = Math.floor((z - radius) / c), z1 = Math.floor((z + radius) / c);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const list = this.cells.get(this._key(ix, iz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          if (b._stamp === stamp) continue;   // spans several cells
          b._stamp = stamp;
          if (fn(b)) return;
        }
      }
    }
    for (let i = 0; i < this.dynamic.length; i++) {
      if (fn(this.dynamic[i])) return;
    }
  }

  /**
   * Push the point `next` out of every blocker it overlaps, sliding along them.
   * Writes the result into `out` (may be the same object as `next`). `skip` is
   * one blocker to ignore — a vehicle's own. Returns true if anything was hit.
   */
  resolve(next, radius, out, skip) {
    let nx = next.x, nz = next.z, hit = false;
    // the widest static blockers are ~5 m; search that far around the mover
    this.near(nx, nz, radius + 6, (b) => {
      if (b === skip) return false;
      const dx = nx - b.x, dz = nz - b.z;
      const min = b.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const push = (min - d) / d;
        nx += dx * push;
        nz += dz * push;
        hit = true;
      }
      return false;
    });
    out.x = nx;
    out.z = nz;
    return hit;
  }
}
