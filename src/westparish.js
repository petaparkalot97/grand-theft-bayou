// ---------------------------------------------------------------------------
// westparish.js — the rural west: Parish Highway 9 and Bayou Noir.
//
// The map grows west from x = −136 to PARISH_MIN_X. Parish Highway 9 is a
// four-lane road built for driving fast: it leaves US-167 just south of the
// strip's middle (z ≈ 8), curves south-west through the pines, runs a long
// straight past a rest stop, swings south, and bends east into OrleaRouge on
// street 330, a second way into the city besides the causeway.
//
// Road hierarchy: US-167 (major road) → Parish Highway 9 (highway) → the dirt
// road to Bayou Noir (rural road) → OrleaRouge's street grid (local streets).
//
// Off the highway: forest (chunked instanced pines, so frustum culling still
// works), Bayou Noir (a church and general store from Buildings.glb, shacks, a
// barn, the water tower) and fenced sugar-cane fields, a rest stop with the
// gas-station asset, and swamp water in the bayou band.
//
// The route is plain data sampled at import, so keepouts (no trees on the road)
// work before anything is built. Orientation follows world.js.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { headingFromVector } from "./world.js";
import { makeChurch } from "./church.js";
import { makeDecorativeFence } from "./landmarks.js";

export const PARISH_MIN_X = -440;
const REGION_EAST_X = -150;        // west of this is the parish proper
export const HWY_WIDTH = 14;       // two 3.5 m lanes each way

// the highway's centreline, US-167 → OrleaRouge street 330
const CONTROL = [
  [-9, 8], [-60, 8], [-110, 14], [-150, 30], [-190, 58],
  [-260, 120], [-320, 175], [-352, 215], [-366, 260], [-362, 300],
  [-340, 328], [-300, 334], [-220, 331], [-138, 330],
];
const STEP = 4;                    // metres between samples

const toCurve = (pts) => new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal");
const curve = toCurve(CONTROL);
export const HWY_LENGTH = curve.getLength();
const PTS = curve.getSpacedPoints(Math.ceil(HWY_LENGTH / STEP));

/** Unit tangents and right-hand vectors (world.js: right = (−fz, 0, fx)) for a sampled polyline. */
function frames(points) {
  const tan = [], right = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const t = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
    tan.push(t);
    right.push(new THREE.Vector3(-t.z, 0, t.x));
  }
  return { tan, right };
}
const HWY = frames(PTS);

/** Nearest-sample distance for a polyline, through a coarse grid (good to ~STEP/2). */
function distanceField(points, cell = 24) {
  const buckets = new Map();
  points.forEach((p, i) => {
    const k = Math.floor(p.x / cell) + "," + Math.floor(p.z / cell);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(i);
  });
  return (x, z) => {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    let best = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = buckets.get((cx + dx) + "," + (cz + dz));
        if (!list) continue;
        for (const i of list) best = Math.min(best, Math.hypot(points[i].x - x, points[i].z - z));
      }
    }
    return best;
  };
}
const hwyDistance = distanceField(PTS);
export const distanceToHighway = hwyDistance;
/** True on the carriageway (plus `pad` metres either side). */
export const onParishHighway = (x, z, pad = 0) => hwyDistance(x, z) < HWY_WIDTH / 2 + pad;

// the dirt road from the highway up to Bayou Noir and on past the fields
const DIRT_WIDTH = 6;
const DIRT_PTS = (() => {
  const c = toCurve([[-176, 47], [-205, 20], [-238, -8], [-262, -22], [-300, -38], [-334, -44]]);
  return c.getSpacedPoints(Math.ceil(c.getLength() / STEP));
})();
const DIRT = frames(DIRT_PTS);
const dirtDistance = distanceField(DIRT_PTS);

const FIELDS = [
  { x0: -405, x1: -330, z0: -112, z1: -58 },
  { x0: -300, x1: -228, z0: -112, z1: -66 },
  { x0: -405, x1: -345, z0: -26, z1: 24 },
];
const HAMLET = { x: -268, z: -20, r: 44 };
const WATER = [
  { x: -400, z: 152, w: 44, d: 30 }, { x: -372, z: 184, w: 30, d: 18 },
  { x: -236, z: 150, w: 44, d: 26 }, { x: -196, z: 178, w: 30, d: 22 },
];
// the rest stop sits 26 m off the long straight, on its south-east side
const REST = (() => {
  let best = 0, bd = Infinity;
  PTS.forEach((p, i) => { const d = Math.hypot(p.x + 226, p.z - 92); if (d < bd) { bd = d; best = i; } });
  const p = PTS[best], r = HWY.right[best];
  const a = { x: p.x + r.x * 26, z: p.z + r.z * 26 }, b = { x: p.x - r.x * 26, z: p.z - r.z * 26 };
  const s = a.x > b.x ? a : b;
  return { x: s.x, z: s.z, road: { x: p.x, z: p.z }, index: best };
})();

const inRect = (r, x, z, pad = 0) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {object} ctx from main.js: scene, surface(kind, size), roadMaterial(),
 *   addBlocker(x, z, r), addLitSpot(spot), flashObjective(text), shopParts
 *   (Buildings.glb children), makeShed, makeFence, makeBarrel, makePallet,
 *   makeWaterTower, makeBillboard, makeGasStation, placeGlbLandmark
 */
export function createWestParish(ctx) {
  const { scene } = ctx;
  const pois = [];
  const props = [];                // kept out of static batching: instanced meshes, culled clusters
  const clusters = [];             // { group, x, z, r }: hidden beyond DRAW_DISTANCE
  // The fog swallows everything past ~260 m, but the renderer would still draw
  // it: from the strip the whole parish sits in the view frustum. Past this
  // distance a cluster (the hamlet, the rest stop, a forest chunk) is hidden.
  const DRAW_DISTANCE = 300;
  const rng = mulberry32(90210);
  const rand = (lo, hi) => lo + (hi - lo) * rng();
  let announced = false;

  // ---------------------------------------------------------------- geometry helpers
  function upNormals(count) {
    const n = new Float32Array(count * 3);
    for (let i = 1; i < n.length; i += 3) n[i] = 1;
    return new THREE.BufferAttribute(n, 3);
  }
  /** A flat strip `width` wide, `offset` metres to the right of a sampled polyline. */
  function ribbon(points, right, offset, width, y, vPerMeter = 1 / 12) {
    const n = points.length;
    const pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), idx = [];
    let s = 0;
    for (let i = 0; i < n; i++) {
      if (i) s += points[i].distanceTo(points[i - 1]);
      const p = points[i], r = right[i];
      const cx = p.x + r.x * offset, cz = p.z + r.z * offset;
      const hx = (r.x * width) / 2, hz = (r.z * width) / 2;
      pos.set([cx - hx, y, cz - hz, cx + hx, y, cz + hz], i * 6);
      uv.set([0, s * vPerMeter, 1, s * vPerMeter], i * 4);
      if (i < n - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }   // faces up
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setAttribute("normal", upNormals(n * 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }
  /** Dashed strip: `on` metres painted, `off` metres gap. */
  function dashes(points, right, offset, width, y, on = 3, off = 6) {
    const pos = [], uv = [], idx = [];
    const period = Math.max(1, Math.round((on + off) / STEP)), len = Math.max(1, Math.round(on / STEP));
    for (let i = 0; i + len < points.length; i += period) {
      const base = pos.length / 3;
      for (const j of [i, i + len]) {
        const p = points[j], r = right[j];
        const cx = p.x + r.x * offset, cz = p.z + r.z * offset, hx = (r.x * width) / 2, hz = (r.z * width) / 2;
        pos.push(cx - hx, y, cz - hz, cx + hx, y, cz + hz);
        uv.push(0, j === i ? 0 : 1, 1, j === i ? 0 : 1);
      }
      idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("normal", upNormals(pos.length / 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }
  function add(geo, mat, { cast = false } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    m.castShadow = cast;
    scene.add(m);
    return m;
  }
  const paint = (hex) => {
    const m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.75, name: "road paint" });
    m.userData.gtbRealized = true;
    return m;
  };
  function tiledSurface(kind, tiles) {
    const m = ctx.surface(kind, 512).material(tiles);
    for (const k of ["map", "normalMap", "roughnessMap"]) {
      if (m[k]) { m[k] = m[k].clone(); m[k].repeat.set(1, 1); m[k].needsUpdate = true; }
    }
    return m;
  }

  /** Run `build`, gather everything it added to the scene into one group, and cull that group by distance. */
  function cluster(name, build) {
    const before = new Set(scene.children);
    build();
    const group = new THREE.Group();
    group.name = "parish:" + name;
    for (const o of [...scene.children]) if (!before.has(o)) group.add(o);   // scene is at the origin: transforms keep
    scene.add(group);
    props.push(group);
    const sphere = new THREE.Box3().setFromObject(group).getBoundingSphere(new THREE.Sphere());
    clusters.push({ group, x: sphere.center.x, z: sphere.center.z, r: sphere.radius });
  }

  // ---------------------------------------------------------------- Parish Highway 9
  function buildHighway() {
    const road = ctx.roadMaterial();
    for (const k of ["map", "normalMap", "roughnessMap"]) {
      if (road[k]) { road[k] = road[k].clone(); road[k].repeat.set(1, 1); road[k].needsUpdate = true; }
    }
    const half = HWY_WIDTH / 2;
    add(ribbon(PTS, HWY.right, 0, HWY_WIDTH, 0.032, 1 / HWY_WIDTH), road);
    const shoulder = tiledSurface("dirt", 1);
    for (const side of [-1, 1]) add(ribbon(PTS, HWY.right, side * (half + 1.5), 3, 0.024, 1 / 3), shoulder);

    // double yellow down the middle, dashed white between lanes, solid white edges
    const yellow = paint(0xd9b545), white = paint(0xe8e6de);
    for (const o of [-0.22, 0.22]) add(ribbon(PTS, HWY.right, o, 0.15, 0.045), yellow);
    for (const o of [-half / 2, half / 2]) add(dashes(PTS, HWY.right, o, 0.16, 0.045), white);
    for (const o of [-(half - 0.35), half - 0.35]) add(ribbon(PTS, HWY.right, o, 0.2, 0.045), white);

    // guardrails where the road bends (outside the junction and the city end)
    const n = PTS.length;
    const curved = [];
    for (let i = 0; i < n; i++) {
      const a = HWY.tan[Math.max(0, i - 5)], b = HWY.tan[Math.min(n - 1, i + 5)];
      curved.push(i > 25 && i < n - 18 && Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1)) > 0.1);
    }
    const steel = new THREE.MeshStandardMaterial({ name: "steel guardrail", color: 0xa4a9ae, metalness: 0.8, roughness: 0.4, side: THREE.DoubleSide });
    const postGeo = new THREE.BoxGeometry(0.16, 0.9, 0.16);
    const postSpots = [];
    for (const side of [-1, 1]) {
      const pos = [], idx = [];
      for (let i = 0; i < n - 1; i++) {
        if (!curved[i] || !curved[i + 1]) continue;
        const base = pos.length / 3;
        for (const j of [i, i + 1]) {
          const p = PTS[j], r = HWY.right[j], off = side * (half + 0.9);
          pos.push(p.x + r.x * off, 0.42, p.z + r.z * off, p.x + r.x * off, 0.82, p.z + r.z * off);
        }
        idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
        const p = PTS[i], r = HWY.right[i], off = side * (half + 0.9);
        if (i % 2 === 0) postSpots.push([p.x + r.x * off, p.z + r.z * off]);
        ctx.addBlocker(p.x + r.x * (off + side * 0.6), p.z + r.z * (off + side * 0.6), 1.0);
      }
      if (!idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      add(g, steel, { cast: true });
    }
    if (postSpots.length) {
      const posts = new THREE.InstancedMesh(postGeo, steel, postSpots.length);
      const m = new THREE.Matrix4();
      postSpots.forEach(([x, z], i) => posts.setMatrixAt(i, m.makeTranslation(x, 0.45, z)));
      posts.castShadow = true;
      posts.computeBoundingSphere();
      scene.add(posts);
      props.push(posts);
    }

    // sodium lights every ~70 m, alternating sides (through the light pool)
    for (let i = 12, k = 0; i < n - 6; i += 18, k++) {
      const side = k % 2 ? 1 : -1, p = PTS[i], r = HWY.right[i], off = side * (half + 2.2);
      ctx.addLitSpot({ x: p.x + r.x * off, y: 7.5, z: p.z + r.z * off, warm: 0xffbf74, power: 120, range: 26, pole: true });
    }

    // signs
    greenSign(["PARISH HWY 9  ◄ WEST", "BAYOU NOIR · ORLEAROUGE (SCENIC)"], 3.5, 18, 0);           // for northbound US-167
    greenSign(["PARISH HWY 9  WEST ►", "BAYOU NOIR · ORLEAROUGE (SCENIC)"], -15, -3, Math.PI);     // for southbound US-167
    const exitAt = nearestIndex(PTS, -176, 47) - 12;
    signBeside(exitAt, 1, ["BAYOU NOIR", "EXIT ►  POP. 212"]);
    signBeside(n - 45, -1, ["ORLEAROUGE", "CITY LIMITS  1/4 MI"], true);
    const bb = 70, bp = PTS[bb], br = HWY.right[bb];
    ctx.makeBillboard(bp.x + br.x * (half + 12), bp.z + br.z * (half + 12), headingFromVector(HWY.tan[bb].x, HWY.tan[bb].z) + Math.PI,
      "SUGAR CANE FESTIVAL", "BAYOU NOIR · NEXT EXIT", "THE CANE REMEMBERS");
  }

  function nearestIndex(points, x, z) {
    let best = 0, bd = Infinity;
    points.forEach((p, i) => { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  /** A sign on the shoulder at sample i, facing traffic that drives along (+1) or against (−1) the route. */
  function signBeside(i, dir, lines) {
    const p = PTS[i] || { x: 0, z: 0 }, t = HWY.tan[i] || new THREE.Vector3(0, 0, 1), r = HWY.right[i] || new THREE.Vector3(1, 0, 0);
    const off = dir * (HWY_WIDTH / 2 + 3.5);                  // the driver's right-hand shoulder
    const facing = headingFromVector(t.x * dir, t.z * dir) + Math.PI;   // back toward the oncoming driver
    greenSign(lines, p.x + r.x * off, p.z + r.z * off, facing);
  }
  function greenSign(lines, x, z, ry, w = 7, h = 3.2) {
    const c = document.createElement("canvas");
    c.width = 768; c.height = Math.round((768 * h) / w);
    const g = c.getContext("2d");
    g.fillStyle = "#1c6b3c"; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = "#f4f4ee"; g.lineWidth = 10; g.strokeRect(14, 14, c.width - 28, c.height - 28);
    g.fillStyle = "#f4f4ee"; g.textAlign = "center"; g.textBaseline = "middle";
    const lh = (c.height - 40) / lines.length;
    lines.forEach((t, i) => {
      g.font = `bold ${Math.round(lh * (i ? 0.5 : 0.66))}px Arial, sans-serif`;
      g.fillText(t, c.width / 2, 20 + lh * (i + 0.5));
    });
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25, roughness: 0.6, name: "signboard" });
    face.userData.gtbRealized = true;
    const back = new THREE.MeshStandardMaterial({ color: 0x5a5f63, roughness: 0.7, name: "steel sign back" });
    const grp = new THREE.Group();
    grp.position.set(x, 0, z);
    grp.rotation.y = ry;
    const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), [back, back, back, back, face, back]);
    board.position.y = 5.2;
    board.castShadow = true;
    grp.add(board);
    for (const px of [-w / 2 + 0.6, w / 2 - 0.6]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6.8, 8), back);
      post.position.set(px, 3.4, -0.1);
      grp.add(post);
      ctx.addBlocker(x + Math.cos(ry) * px, z - Math.sin(ry) * px, 0.35);
    }
    scene.add(grp);
  }

  // ---------------------------------------------------------------- Bayou Noir
  function buildHamlet() {
    // the dirt road
    add(ribbon(DIRT_PTS, DIRT.right, 0, DIRT_WIDTH, 0.026, 1 / DIRT_WIDTH), tiledSurface("dirt", 1));

    const parts = ctx.shopParts || [];
    // the general store, south of the road, facing it (north)
    if (ctx.placeGlbLandmark(parts[8 % Math.max(1, parts.length)], -272, -2, Math.PI, 16, "Bayou Noir General Store", 0xffd9a0)) {
      for (const [ox, oz] of [[-4, -3], [4, -3], [-4, 3], [4, 3]]) ctx.addBlocker(-272 + ox, -2 + oz, 3.5);
    }
    pois.push({ x: -272, z: -13, r: 6 });
    // the church, north of the road, facing it (south): built by church.js, since Buildings.glb's
    // part 9 (used here before) is an apartment block with shops
    makeChurch(ctx, { x: -246, z: -40, rot: 0, length: 13, stainedGlass: false, name: "Bayou Noir Baptist" });
    pois.push({ x: -246, z: -34, r: 7 });
    // shacks, a barn and the junk that collects around them
    for (const [x, z, ry, w, d] of [[-300, -12, 0.2, 9, 7], [-226, 6, -0.3, 8, 6], [-318, -60, 1.4, 8, 6]]) {
      ctx.makeShed(x, z, ry, w, d);
      pois.push({ x: x + 5, z: z + 5, r: 5 });
    }
    ctx.makeShed(-314, -92, Math.PI / 2, 16, 11);
    ctx.makeBarrel(-305, -80); ctx.makeBarrel(-304, -77.8);
    ctx.makePallet(-322, -80, 0.4); ctx.makePallet(-320, -78, 1.2);
    ctx.makeWaterTower(-292, -52, "BAYOU NOIR", ["POP. 212", "SUGAR CANE CAPITAL"], "PELICAN CROWN WANTS YOUR LAND");
    ctx.addLitSpot({ x: -260, y: 7, z: -14, warm: 0xffc890, power: 90, range: 24, pole: true });
    ctx.addLitSpot({ x: -236, y: 7, z: -30, warm: 0xffc890, power: 90, range: 24, pole: true });

    for (const f of FIELDS) caneField(f);
  }

  function caneField(f) {
    const w = f.x1 - f.x0, d = f.z1 - f.z0;
    const soil = tiledSurface("dirt", 1);
    for (const k of ["map", "normalMap", "roughnessMap"]) if (soil[k]) soil[k].repeat.set(w / 10, d / 10);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(w, d), soil);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((f.x0 + f.x1) / 2, 0.02, (f.z0 + f.z1) / 2);
    ground.receiveShadow = true;
    scene.add(ground);

    // rows of cane, a little ragged
    const spots = [];
    for (let z = f.z0 + 2; z < f.z1 - 1; z += 2.6) {
      for (let x = f.x0 + 1.5; x < f.x1 - 1; x += 1.6) {
        if (rng() < 0.12) continue;
        spots.push([x + rand(-0.3, 0.3), z + rand(-0.25, 0.25), rand(1.7, 2.8), rand(0, 6)]);
      }
    }
    const geo = new THREE.BoxGeometry(0.32, 1, 0.32);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x6f8f35, roughness: 0.9, name: "sugar cane" });
    mat.userData.gtbRealized = true;
    const cane = new THREE.InstancedMesh(geo, mat, spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    spots.forEach(([x, z, h, r], i) => cane.setMatrixAt(i, m.compose(v.set(x, 0, z), q.setFromAxisAngle(up, r), s.set(1, h, 1))));
    cane.receiveShadow = true;
    cane.computeBoundingSphere();
    scene.add(cane);
    props.push(cane);

    // fence on three sides, open toward the hamlet
    makeDecorativeFence(ctx, f.x0, f.z0, f.x1, f.z0);
    ctx.makeFence(f.x0, f.z0, f.x0, f.z1);
    ctx.makeFence(f.x1, f.z0, f.x1, f.z1);
    pois.push({ x: f.x1 + 2, z: (f.z0 + f.z1) / 2, r: 6 });   // someone always leaning on the fence
  }

  // ---------------------------------------------------------------- rest stop
  function buildRestStop() {
    const rot = headingFromVector(REST.road.x - REST.x, REST.road.z - REST.z);   // front faces the highway
    ctx.makeGasStation(REST.x, REST.z, rot, { name: "BAYOU NOIR FUEL", wall: 0xe3ddcf, trim: 0x2f7a4a, bg: "#f4efe2", band: "#2f7a4a", ink: "#b3261e" });
    // an apron from the highway's edge to the pumps
    const dirX = REST.x - REST.road.x, dirZ = REST.z - REST.road.z, len = Math.hypot(dirX, dirZ);
    const a = new THREE.Vector3(REST.road.x + (dirX / len) * (HWY_WIDTH / 2 - 0.5), 0, REST.road.z + (dirZ / len) * (HWY_WIDTH / 2 - 0.5));
    const b = new THREE.Vector3(REST.x - (dirX / len) * 6, 0, REST.z - (dirZ / len) * 6);
    const pts = [a, b], r = new THREE.Vector3(-dirZ / len, 0, dirX / len);
    const apron = ctx.roadMaterial();
    for (const k of ["map", "normalMap", "roughnessMap"]) {
      if (apron[k]) { apron[k] = apron[k].clone(); apron[k].repeat.set(1, 1); apron[k].needsUpdate = true; }
    }
    add(ribbon(pts, [r, r], 0, 16, 0.028, 1 / 16), apron);
    pois.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, r: 6 });
  }

  // ---------------------------------------------------------------- forest + swamp
  function clearOfTrees(x, z) {
    if (onParishHighway(x, z, 7)) return false;
    if (dirtDistance(x, z) < DIRT_WIDTH / 2 + 4) return false;
    if (FIELDS.some((f) => inRect(f, x, z, 6))) return false;
    if (Math.hypot(x - HAMLET.x, z - HAMLET.z) < HAMLET.r + 6) return false;
    if (Math.hypot(x - REST.x, z - REST.z) < 34) return false;
    if (WATER.some((wt) => Math.abs(x - wt.x) < wt.w / 2 + 2 && Math.abs(z - wt.z) < wt.d / 2 + 2)) return false;
    return true;
  }

  function buildForest() {
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.32, 3.4, 8);
    const foliageGeo = new THREE.ConeGeometry(1.9, 4.6, 10);
    const trunkMat = ctx.surface("dirt", 512).material(2, { color: 0xc9b49a, envMapIntensity: 0.7 });
    const foliageMat = ctx.surface("grass", 512).material(3, { color: 0xb9d69a, envMapIntensity: 0.8 });
    const CH = 110, CELL = 9.5;
    const chunks = new Map();
    for (let x = PARISH_MIN_X + 2; x < -140; x += CELL) {
      for (let z = -134; z < 378; z += CELL) {
        const px = x + rand(0, CELL), pz = z + rand(0, CELL);
        const edge = px < PARISH_MIN_X + 28;
        if (!edge && rng() < 0.3) continue;              // clearings
        if (px > -140 || !clearOfTrees(px, pz)) continue;
        const k = Math.floor(px / CH) + "," + Math.floor(pz / CH);
        if (!chunks.has(k)) chunks.set(k, []);
        const h = rand(0.8, 1.6);
        chunks.get(k).push([px, pz, h, rand(0, 6)]);
        ctx.addBlocker(px, pz, 0.7 * h);
      }
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let trees = 0;
    for (const list of chunks.values()) {
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
      const leaves = new THREE.InstancedMesh(foliageGeo, foliageMat, list.length);
      list.forEach(([x, z, h, r], i) => {
        q.setFromAxisAngle(up, r);
        s.set(h, h, h);
        trunks.setMatrixAt(i, m.compose(v.set(x, 1.7 * h, z), q, s));
        leaves.setMatrixAt(i, m.compose(v.set(x, 4.6 * h, z), q, s));
      });
      for (const im of [trunks, leaves]) {
        im.castShadow = true;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        scene.add(im);
        props.push(im);
      }
      // one culling cluster per chunk (the leaves' sphere covers the trunks)
      const sphere = leaves.boundingSphere;
      clusters.push({ group: trunks, x: sphere.center.x, z: sphere.center.z, r: sphere.radius });
      clusters.push({ group: leaves, x: sphere.center.x, z: sphere.center.z, r: sphere.radius });
      trees += list.length;
    }

    const water = new THREE.MeshPhysicalMaterial({
      color: 0x06110e, roughness: 0.18, metalness: 0, envMapIntensity: 1.0,
      clearcoat: 1, clearcoatRoughness: 0.12, name: "swamp water",
    });
    water.userData.gtbRealized = true;
    for (const wt of WATER) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(wt.w, wt.d), water);
      p.rotation.x = -Math.PI / 2;
      p.position.set(wt.x, 0.035, wt.z);
      p.receiveShadow = true;
      scene.add(p);
    }
    return trees;
  }

  // ---------------------------------------------------------------- traffic lanes
  function lane(reverse) {
    const src = curve.getSpacedPoints(Math.ceil(HWY_LENGTH / 12));
    const pts = reverse ? src.slice().reverse() : src;
    return pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
      return [p.x + (-tz / l) * 3.5, p.z + (tx / l) * 3.5];   // right-hand lane
    });
  }
  const lanes = [
    { name: "Hwy 9 westbound", points: lane(false), cruise: [18, 26] },
    { name: "Hwy 9 eastbound", points: lane(true), cruise: [18, 26] },
  ];

  let treeCount = 0;
  let cullTimer = 0;
  return {
    PARISH_MIN_X,
    lanes,
    length: HWY_LENGTH,
    hamlet: HAMLET,
    fields: FIELDS,
    restStop: REST,
    get pois() { return pois; },
    get props() { return props; },
    get trees() { return treeCount; },
    /** Sampled centreline, for QA and the minimap: [{x, z}], every STEP metres. */
    samples: PTS.map((p) => ({ x: p.x, z: p.z })),
    width: HWY_WIDTH,
    /** The dirt road to Bayou Noir, sampled like `samples`. */
    dirtSamples: DIRT_PTS.map((p) => ({ x: p.x, z: p.z })),
    dirtWidth: DIRT_WIDTH,
    /** Swamp water patches: [{ x, z, w, d }] (centre and size). */
    water: WATER,

    buildSet() {
      buildHighway();                        // never culled: you see the road from afar
      cluster("bayou-noir", buildHamlet);    // the hamlet, its dirt road and the cane fields
      cluster("rest-stop", buildRestStop);
      treeCount = buildForest();
    },

    /** Clusters currently drawn / total, for QA and the perf overlay. */
    get drawn() { return clusters.filter((c) => c.group.visible).length + " / " + clusters.length; },

    /** Spawn-zone override for this region (spawnzones.js), or null to fall through. */
    zoneAt(x, z) {
      if (onParishHighway(x, z, 4)) return "highway";
      if (x > REGION_EAST_X) return null;
      if (dirtDistance(x, z) < DIRT_WIDTH / 2 + 2) return "rural";
      if (FIELDS.some((f) => inRect(f, x, z))) return "rural";
      if (Math.hypot(x - HAMLET.x, z - HAMLET.z) < HAMLET.r) return "rural";
      if (Math.hypot(x - REST.x, z - REST.z) < 30) return "rural";
      return "forest";
    },

    inRegion: (x) => x < REGION_EAST_X,

    update(dt, playerPos) {
      if (!announced && playerPos.x < -170) {
        announced = true;
        ctx.flashObjective("PARISH HIGHWAY 9 · Bayou Noir, pop. 212. Cane fields as far as the eye can see.");
      }
      // distance culling, a few times a second, from wherever the camera is (cutscenes included)
      cullTimer -= dt;
      if (cullTimer > 0) return;
      cullTimer = 0.4;
      const eye = ctx.camera ? ctx.camera.position : playerPos;
      for (const c of clusters) {
        const show = Math.hypot(c.x - eye.x, c.z - eye.z) - c.r < DRAW_DISTANCE;
        if (c.group.visible !== show) c.group.visible = show;
      }
    },
  };
}
