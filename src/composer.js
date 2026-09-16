// ---------------------------------------------------------------------------
// composer.js — build a district in the order a real place grows, so it reads
// as designed rather than scattered:
//
//   1 road          the main road, plus site() plans for everything that
//                   comes later (side streets, lots, the landmark)
//   2 buildings     frontage along the main road, facing it
//   3 side streets  the side streets, and the buildings along them
//   4 open areas    parking, a ball field, a market, water: planned gaps,
//                   not leftovers
//   5 vegetation    trees fill only what is still empty
//   6 landmark      the focal point at the end of the view
//
// Everything lands on an occupancy grid (a cell counts when its centre is inside
// a footprint). A building only goes where nothing is; a planned site() holds its
// ground until its own stage; trees keep clear of roads, lots and walls. Calling
// a stage out of order warns (and still runs), so a district spec reads top to
// bottom in the order above. Roads are straight, axis-aligned segments.
//
// Built groups are culling clusters, hidden beyond DRAW_DISTANCE (as in
// westparish.js). For the rest of the game: pois, props (keep them out of static
// batching), minimap shapes, zoneAt(x, z) for spawnzones.js, report() for QA.
// ---------------------------------------------------------------------------

import * as THREE from "three";

export const STAGES = Object.freeze(["road", "buildings", "sideStreets", "openAreas", "vegetation", "landmark"]);
const FREE = 0, ROAD = 1, BUILDING = 2, OPEN = 3, SITE = 4, TREE = 5, WATER = 6;
const DRAW_DISTANCE = 300;

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const inRect = (r, x, z) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1;

/**
 * @param {object} ctx     from main.js: scene, surface(kind, size), roadMaterial(),
 *                         addBlocker(x, z, r), addLitSpot(spot)
 * @param {object} o
 * @param {string} o.name
 * @param {object} o.bounds  { x0, x1, z0, z1 } the grid covers
 * @param {object} o.zones   { core, wild } rects: "town" inside core, "forest" inside wild
 * @param {number} o.cell    grid cell size in metres
 * @param {number} o.seed
 */
export function createComposer(ctx, { name, bounds, zones = {}, cell = 2, seed = 1 }) {
  const { scene } = ctx;
  const cols = Math.ceil((bounds.x1 - bounds.x0) / cell), rows = Math.ceil((bounds.z1 - bounds.z0) / cell);
  const grid = new Uint8Array(cols * rows);
  const rng = mulberry32(seed);
  const rand = (lo, hi) => lo + (hi - lo) * rng();
  const roads = new Map(), sites = new Map();
  const pois = [], props = [], clusters = [];
  const minimap = { roads: [], buildings: [], areas: [], water: [] };
  const log = [];
  let stage = -1, built = 0, rejected = 0, trees = 0, focal = null, cullTimer = 0;

  function enter(s) {
    const i = STAGES.indexOf(s);
    if (i < 0) throw new Error(`[composer] ${name}: unknown stage "${s}"`);
    if (i < stage) console.warn(`[composer] ${name}: "${s}" after "${STAGES[stage]}"; compose in order ${STAGES.join(" → ")}`);
    stage = Math.max(stage, i);
    let entry = log[log.length - 1];
    if (!entry || entry.stage !== s) log.push(entry = { stage: s, items: 0, rejected: 0 });
    return entry;
  }

  // ---------------------------------------------------------------- occupancy grid
  function eachCell(r, fn) {
    const i0 = Math.max(0, Math.ceil((r.x0 - bounds.x0) / cell - 0.5)), i1 = Math.min(cols - 1, Math.ceil((r.x1 - bounds.x0) / cell - 0.5) - 1);
    const j0 = Math.max(0, Math.ceil((r.z0 - bounds.z0) / cell - 0.5)), j1 = Math.min(rows - 1, Math.ceil((r.z1 - bounds.z0) / cell - 0.5) - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (fn(j * cols + i) === false) return false;
    return true;
  }
  const isFree = (r) => eachCell(r, (k) => grid[k] === FREE);
  const fill = (r, v) => eachCell(r, (k) => { grid[k] = v; });
  const zoneRects = [];                     // named zones an openArea() claimed
  function valueAt(x, z) {
    const i = Math.floor((x - bounds.x0) / cell), j = Math.floor((z - bounds.z0) / cell);
    return i < 0 || j < 0 || i >= cols || j >= rows ? -1 : grid[j * cols + i];
  }

  // ---------------------------------------------------------------- helpers
  /** Run `build`, gather what it added to the scene into one group, and cull that group by distance. */
  function cluster(label, build) {
    const before = new Set(scene.children);
    build();
    const group = new THREE.Group();
    group.name = `${name}:${label}`;
    for (const o of [...scene.children]) if (!before.has(o)) group.add(o);   // scene is at the origin: transforms keep
    if (!group.children.length) return group;
    scene.add(group);
    props.push(group);
    const sphere = new THREE.Box3().setFromObject(group).getBoundingSphere(new THREE.Sphere());
    clusters.push({ group, x: sphere.center.x, z: sphere.center.z, r: sphere.radius });
    return group;
  }
  function tiled(material, w, d, size) {
    for (const k of ["map", "normalMap", "roughnessMap"]) {
      if (material[k]) { material[k] = material[k].clone(); material[k].repeat.set(Math.max(1, w / size), Math.max(1, d / size)); material[k].needsUpdate = true; }
    }
    return material;
  }
  function plane(w, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }
  const paint = (hex) => {
    const m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.7, name: "road paint" });
    m.userData.gtbRealized = true;
    return m;
  };
  function segments(points) {
    const out = [];
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i], [bx, bz] = points[i + 1];
      if (ax !== bx && az !== bz) throw new Error(`[composer] ${name}: road segments must be axis-aligned`);
      const len = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / len, tz = (bz - az) / len;
      out.push({ ax, az, bx, bz, len, tx, tz, rx: -tz, rz: tx, alongX: tz === 0 });   // right = (−tz, tx), world.js
    }
    return out;
  }
  const corridor = (sg, half) => sg.alongX
    ? { x0: Math.min(sg.ax, sg.bx), x1: Math.max(sg.ax, sg.bx), z0: sg.az - half, z1: sg.az + half }
    : { x0: sg.ax - half, x1: sg.ax + half, z0: Math.min(sg.az, sg.bz), z1: Math.max(sg.az, sg.bz) };
  const centre = (r) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, w: r.x1 - r.x0, d: r.z1 - r.z0 });

  return {
    STAGES,
    tiled, plane, rand, rng,

    /** Hold ground for something built in a later stage (a side street, a lot, the landmark). */
    site(siteName, rect) {
      if (!isFree(rect)) console.warn(`[composer] ${name}: site "${siteName}" overlaps something already placed`);
      fill(rect, SITE);
      sites.set(siteName, rect);
      return rect;
    },

    /**
     * A road (stage "road", or "sideStreets" for side streets): surface, sidewalks, centre line, lamps.
     * `material` overrides the asphalt (a material or a factory) for dirt tracks and trails;
     * `sidewalk: 0` leaves the verges bare; `paved: false` lays no surface at all, for a
     * stretch something else already paves (US-167 runs the length of the map as one plane).
     */
    road(roadName, points, { width = 8, sidewalk = 1.6, stage: st = "road", centreLine = width >= 8, lampEvery = 0, y = 0.022, material = null, paved = true } = {}) {
      const entry = enter(st);
      const segs = segments(points);
      const half = width / 2 + sidewalk;
      const concrete = () => ctx.surface("concrete", 512).material(1, { color: 0xb8b2a8 });
      for (const sg of segs) {
        eachCell(corridor(sg, half), (k) => {
          if (grid[k] === BUILDING || grid[k] === OPEN) entry.conflicts = (entry.conflicts || 0) + 1;
          grid[k] = ROAD;
        });
        const mx = (sg.ax + sg.bx) / 2, mz = (sg.az + sg.bz) / 2;
        const w = sg.alongX ? sg.len : width, d = sg.alongX ? width : sg.len;
        if (paved) {
          const surf = typeof material === "function" ? material() : (material || ctx.roadMaterial());
          plane(w, d, tiled(surf, w, d, 9), mx, y, mz);
        }
        for (const s of [-1, 1]) {
          if (sidewalk <= 0) break;
          const off = s * (width / 2 + sidewalk / 2);
          const sw = sg.alongX ? sg.len : sidewalk, sd = sg.alongX ? sidewalk : sg.len;
          plane(sw, sd, tiled(concrete(), sw, sd, 6), mx + sg.rx * off, y + 0.004, mz + sg.rz * off);
        }
        if (centreLine) {
          const n = Math.floor(sg.len / 6);
          const dash = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), paint(0xd9b93a), n);
          const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
          const sc = new THREE.Vector3(sg.alongX ? 3 : 0.22, sg.alongX ? 0.22 : 3, 1), p = new THREE.Vector3();
          for (let i = 0; i < n; i++) {
            const s = 3 + i * 6;
            dash.setMatrixAt(i, m.compose(p.set(sg.ax + sg.tx * s, y + 0.008, sg.az + sg.tz * s), q, sc));
          }
          dash.receiveShadow = true;
          scene.add(dash);
        }
        if (lampEvery > 0) {
          for (let s = lampEvery / 2; s < sg.len; s += lampEvery) {
            const off = width / 2 + sidewalk * 0.6;
            ctx.addLitSpot({ x: sg.ax + sg.tx * s + sg.rx * off, y: 6, z: sg.az + sg.tz * s + sg.rz * off, warm: 0xffd6a0, power: 95, range: 24, pole: true });
          }
        }
      }
      roads.set(roadName, { segs, width, sidewalk, half });
      minimap.roads.push({ points, width });
      entry.items++;
      return roads.get(roadName);
    },

    /**
     * Buildings along a road, facing it. `build(slot)` places one ({ x, z, rot,
     * side, index, rect }) and returns false to leave the slot empty. A slot is
     * skipped when its footprint isn't free (a road, a planned site, a building).
     */
    frontage(roadName, { stage: st = "buildings", sides = [1, -1], setback = 12, spacing = 20, footprint = { w: 14, d: 14 }, startAt = 0, endAt = 0, label = roadName, build }) {
      const entry = enter(st);
      const road = roads.get(roadName);
      if (!road) throw new Error(`[composer] ${name}: frontage on unknown road "${roadName}"`);
      cluster(label, () => {
        for (const sg of road.segs) {
          for (let s = startAt + spacing / 2; s <= sg.len - endAt - spacing / 2 + 1e-6; s += spacing) {
            const px = sg.ax + sg.tx * s, pz = sg.az + sg.tz * s;
            for (const side of sides) {
              const nx = sg.rx * side, nz = sg.rz * side;
              const x = px + nx * setback, z = pz + nz * setback;
              const hw = (sg.alongX ? footprint.w : footprint.d) / 2, hd = (sg.alongX ? footprint.d : footprint.w) / 2;
              const rect = { x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd };
              if (!isFree(rect)) { rejected++; entry.rejected++; continue; }
              const slot = { x, z, rot: Math.atan2(-nx, -nz), side, s, index: entry.items, road: roadName, rect };
              if (build(slot) === false) continue;
              fill(rect, BUILDING);
              minimap.buildings.push(rect);
              const front = road.width / 2 + road.sidewalk + 1;
              pois.push({ x: px + nx * front, z: pz + nz * front, r: 4 });
              entry.items++;
              built++;
            }
          }
        }
      });
    },

    /** Build into a planned site as an open area (lot, park, market). `zoneName` claims the area as its own spawn zone. */
    openArea(siteName, { color = "#5a5a52", build, zoneName = null }) {
      const entry = enter("openAreas");
      const rect = sites.get(siteName);
      if (!rect) throw new Error(`[composer] ${name}: no site "${siteName}"`);
      fill(rect, OPEN);
      if (zoneName) zoneRects.push([zoneName, rect]);
      const c = centre(rect);
      cluster(siteName, () => build(rect, c));
      minimap.areas.push({ ...rect, color });
      pois.push({ x: c.x, z: c.z, r: Math.min(c.w, c.d) / 3 });
      entry.items++;
    },

    /** Standing water: a surface, shore blockers so nobody drives in, and the minimap. */
    water(rect, material, { shoreEvery = 3, shoreRadius = 1.6 } = {}) {
      const entry = enter("openAreas");
      fill(rect, WATER);
      const c = centre(rect);
      cluster("water", () => plane(c.w, c.d, material, c.x, 0.035, c.z));
      for (let x = rect.x0; x <= rect.x1; x += shoreEvery) {
        ctx.addBlocker(x, rect.z0, shoreRadius);
        ctx.addBlocker(x, rect.z1, shoreRadius);
      }
      minimap.water.push(rect);
      entry.items++;
    },

    /** Trees on whatever is still empty inside `rect`, instanced per chunk so each chunk culls. */
    vegetation(rect, { spacing = 9, jitter = 3, clearance = 3, chunk = 96, trunk, foliage }) {
      const entry = enter("vegetation");
      const chunks = new Map();
      for (let z = rect.z0 + spacing / 2; z < rect.z1; z += spacing) {
        for (let x = rect.x0 + spacing / 2; x < rect.x1; x += spacing) {
          const tx = x + rand(-jitter, jitter), tz = z + rand(-jitter, jitter);
          if (!inRect(bounds, tx, tz)) continue;
          if (!isFree({ x0: tx - clearance, x1: tx + clearance, z0: tz - clearance, z1: tz + clearance })) continue;
          fill({ x0: tx - 1, x1: tx + 1, z0: tz - 1, z1: tz + 1 }, TREE);
          const key = Math.floor(tx / chunk) + "," + Math.floor(tz / chunk);
          if (!chunks.has(key)) chunks.set(key, []);
          chunks.get(key).push([tx, tz, rand(0.85, 1.45), rand(0, 6)]);
        }
      }
      const trunkGeo = new THREE.CylinderGeometry(0.18, 0.32, 3.4, 8);
      const leafGeo = new THREE.ConeGeometry(1.9, 4.6, 10);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      for (const [key, list] of chunks) {
        const tr = new THREE.InstancedMesh(trunkGeo, trunk, list.length);
        const lf = new THREE.InstancedMesh(leafGeo, foliage, list.length);
        tr.castShadow = lf.castShadow = true;
        list.forEach(([x, z, h, a], i) => {
          q.setFromAxisAngle(up, a);
          sc.set(h, h, h);
          tr.setMatrixAt(i, m.compose(p.set(x, 1.7 * h, z), q, sc));
          lf.setMatrixAt(i, m.compose(p.set(x, 4.6 * h, z), q, sc));
          ctx.addBlocker(x, z, 0.7 * h);
        });
        tr.computeBoundingSphere();
        lf.computeBoundingSphere();
        cluster("trees " + key, () => scene.add(tr, lf));
        trees += list.length;
        entry.items += list.length;
      }
    },

    /** The focal point, built into its planned site last. */
    landmark(siteName, build) {
      const entry = enter("landmark");
      const rect = sites.get(siteName);
      if (!rect) throw new Error(`[composer] ${name}: no site "${siteName}"`);
      fill(rect, BUILDING);
      const c = centre(rect);
      cluster(siteName, () => build(rect, c));
      minimap.buildings.push(rect);
      focal = { name: siteName, x: c.x, z: c.z };
      entry.items++;
    },

    /** Spawn zone for spawnzones.js, or null outside this district. "building" is no spawn zone: nobody appears inside walls. An open area can name its own zone (eastbank.js's market). */
    zoneAt(x, z) {
      const v = valueAt(x, z);
      if (v < 0) return null;
      if (v === ROAD) return "highway";
      if (v === WATER) return "water";
      if (v === BUILDING) return "building";
      for (const [zoneName, rect] of zoneRects) if (inRect(rect, x, z)) return zoneName;
      if (zones.core && inRect(zones.core, x, z)) return "town";
      if (zones.wild && inRect(zones.wild, x, z)) return "forest";
      return null;
    },

    /** The named zones an open area claimed, for QA (see eastbank_test-style checks). */
    get zoneRects() { return zoneRects; },

    get pois() { return pois; },
    get props() { return props; },
    get minimap() { return minimap; },
    get drawn() { return clusters.filter((c) => c.group.visible).length + " / " + clusters.length; },

    report() {
      return { name, stages: log.map((e) => ({ ...e })), built, rejected, trees, clusters: clusters.length, focal };
    },

    update(dt, eye) {
      cullTimer -= dt;
      if (cullTimer > 0) return;
      cullTimer = 0.4;
      for (const c of clusters) {
        const show = Math.hypot(c.x - eye.x, c.z - eye.z) - c.r < DRAW_DISTANCE;
        if (c.group.visible !== show) c.group.visible = show;
      }
    },
  };
}
