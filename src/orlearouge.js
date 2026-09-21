// ---------------------------------------------------------------------------
// orlearouge.js — the south of the map: the bayou causeway and OrleaRouge.
//
// "A metropolis of French balconies, glass skyscrapers, neon nightlife,
//  historic neighborhoods, universities, casinos, music halls and sprawling
//  suburbs. It is simultaneously gorgeous and wounded."
//
//   z 136 … 192   the causeway: US-167 over open swamp, an overpass with a camp
//                 under it, a refinery burning orange to the east
//   z 196 … 382   OrleaRouge, on a street grid around the boulevard (US-167):
//                 the French District (west), downtown towers (east), the public
//                 hospital, a cemetery, a construction site, and the riverfront
//                 with a casino riverboat
//
// Everything is static except the neon flicker, so main.js's batchStatic
// merges the city per material and chunk. Buildings share materials; their
// UVs are scaled to their size, so one window texture tiles correctly on every
// tower without per-building materials.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { placeOfficeClutter, placeCityBuilding, placeParkedCar } from "./landmarks.js";
import { createCemetery } from "./cemetery.js";

export const CAUSEWAY = { minZ: 136, maxZ: 192 };
// The nightlife core now continues east into a denser modern district. Keep the
// western boundary stable (the parish transition and French District depend on
// it), but give the skyline and casino lots room to grow on the east side.
export const CITY = { minX: -136, maxX: 176, minZ: 196, maxZ: 382 };

// the grid: US-167 is the boulevard at x = ROAD_X (-6)
const AVENUES = [-86, -46, 34, 74, 114, 154];    // north–south streets
const STREETS = [210, 250, 290, 330, 370];        // east–west streets
const STREET_W = 9;

function basic(color) {
  const m = new THREE.MeshBasicMaterial({ color });
  m.userData.gtbRealized = true;
  return m;
}
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
/** A box whose side UVs repeat once per `unit` metres, so shared textures tile to size. */
function tiledBox(w, h, d, unitX = 6, unitY = 4) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const side = Math.abs(n.getX(i)) > 0.5 ? d : w;   // faces along x use the depth
    if (Math.abs(n.getY(i)) > 0.5) continue;           // leave roofs / floors alone
    uv.setXY(i, uv.getX(i) * side / unitX, uv.getY(i) * h / unitY);
  }
  return g;
}

/**
 * @param {object} ctx from main.js: scene, surface(kind, size), addBlocker(x, z, r),
 *   addLitSpot(spot), poolLight(color, power, range, x, y, z),
 *   makeBillboard(x, z, ry, headline, sub, graffiti), makeNeonSign(text, ink, bg),
 *   getSheriffProto(), cine, state, playerPos, ROAD_X, ROAD_HALF
 */
export function createOrleaRouge(ctx) {
  const { scene } = ctx;
  const neon = [];          // { mat, base, speed, phase } — flickered in update()
  const pois = [];
  const occluders = [];     // overhead boxes the camera must not look through
  let graveyard = null;     // cemetery.js — holds the ghost, so it has an update and props
  let entered = false;

  // ---------------------------------------------------------------- helpers
  function mesh(geo, mat, x, y, z, { cast = true, parent = scene, ry = 0 } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  const matCache = new Map();
  function std(name, color, extra = {}) {
    const key = name + ":" + color + JSON.stringify(extra);
    if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ name, color, ...extra }));
    return matCache.get(key);
  }
  function neonSign(text, ink, bg, w, h, x, y, z, ry, flicker = 0) {
    const mat = ctx.makeNeonSign(text, ink, bg);
    mat.userData.gtbRealized = true;
    mat.emissiveIntensity = 1.2;
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    mesh(new THREE.BoxGeometry(w, h, 0.25), mat, 0, 0, 0, { parent: g, cast: false });
    scene.add(g);
    if (flicker) neon.push({ mat, base: 1.2, speed: 6 + Math.random() * 10, phase: Math.random() * 9, flicker });
    return g;
  }
  function plane(w, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }

  // ---------------------------------------------------------------- the causeway
  function buildCauseway() {
    const water = new THREE.MeshPhysicalMaterial({
      // see eastbank.js: no clearcoat, so it reads as water, not a grey-white sheet
      color: 0x06110e, roughness: 0.18, metalness: 0, envMapIntensity: 0.35,
      transparent: true, opacity: 0.6, name: "swamp water",
    });
    water.userData.gtbRealized = true;
    const x0 = ctx.ROAD_X - ctx.ROAD_HALF, x1 = ctx.ROAD_X + ctx.ROAD_HALF;
    const len = CAUSEWAY.maxZ - CAUSEWAY.minZ + 8;
    const zc = (CAUSEWAY.minZ + CAUSEWAY.maxZ) / 2;
    plane(x0 - 2 + 140, len, water, (x0 - 2 - 140) / 2, 0.035, zc);
    plane(140 - x1 - 2, len, water, (x1 + 2 + 140) / 2, 0.035, zc);

    // guardrails the whole way across, solid for walkers and cars
    const rail = std("steel guardrail", 0x9aa0a6, { metalness: 0.8, roughness: 0.4 });
    for (const x of [x0 - 0.6, x1 + 0.6]) {
      mesh(new THREE.BoxGeometry(0.25, 0.7, len), rail, x, 0.6, zc);
      for (let z = CAUSEWAY.minZ; z <= CAUSEWAY.maxZ; z += 3) ctx.addBlocker(x, z, 0.55);
    }

    // an overpass crossing high above, with a camp underneath
    const concrete = std("concrete overpass", 0x8f8c86);
    mesh(new THREE.BoxGeometry(150, 1.2, 9), concrete, 0, 8, 172);
    occluders.push({ minX: -75, maxX: 75, minY: 7.4, maxY: 8.6, minZ: 167.5, maxZ: 176.5 });
    for (const px of [-40, -18, 6, 30, 55]) {
      mesh(new THREE.BoxGeometry(1.6, 8, 1.6), concrete, px, 4, 172);
      ctx.addBlocker(px, 172, 1.3);
    }
    const tarp = [std("canvas tarp", 0x3b5a7a), std("canvas tarp", 0x7a5a3b), std("canvas tarp", 0x5a6b3b)];
    for (let i = 0; i < 6; i++) {
      const t = mesh(new THREE.ConeGeometry(1.3, 1.5, 4), tarp[i % 3], -34 + i * 2.6, 0.75, 170 + (i % 2) * 3.5);
      t.rotation.y = Math.PI / 4;
      ctx.addBlocker(-34 + i * 2.6, 170 + (i % 2) * 3.5, 1.1);
    }
    mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.9, 10), std("steel barrel", 0x4a3a2a), -24, 0.45, 175.5);
    mesh(new THREE.SphereGeometry(0.35, 8, 6), basic(new THREE.Color(0xff8a2a).multiplyScalar(3)), -24, 1.05, 175.5, { cast: false });
    ctx.poolLight(0xff8a3a, 26, 16, -24, 1.6, 175.5);
    pois.push({ x: -28, z: 176, r: 7 });

    // the refinery, burning orange against the horizon
    const tank = std("steel tank", 0xb8bdc2, { metalness: 0.6, roughness: 0.45 });
    plane(40, 44, std("concrete pad", 0x6f6c66), 116, 0.02, 164);
    for (const [x, z, r, h] of [[104, 150, 5, 7], [104, 164, 5, 7], [120, 178, 4, 6], [128, 152, 3, 18], [112, 182, 2, 26]]) {
      mesh(new THREE.CylinderGeometry(r, r, h, 20), tank, x, h / 2, z);
      ctx.addBlocker(x, z, r + 0.3);
    }
    for (const [x, z] of [[126, 168], [132, 146]]) {
      mesh(new THREE.CylinderGeometry(0.5, 0.7, 34, 10), tank, x, 17, z);
      const flame = mesh(new THREE.ConeGeometry(0.9, 3.4, 10), basic(new THREE.Color(0xff7a1a).multiplyScalar(4)), x, 35.6, z, { cast: false });
      neon.push({ mat: flame.material, base: 4, speed: 14, phase: x, flicker: 0.35, color: new THREE.Color(0xff7a1a) });
      ctx.poolLight(0xff7a2a, 70, 60, x, 30, z);
    }
  }

  // ---------------------------------------------------------------- streets
  function buildStreets() {
    const concrete = ctx.surface("concrete", 1024);
    const side = concrete.material(1, { color: 0xb8b2a8 });
    const cw = CITY.maxX - CITY.minX, cd = CITY.maxZ - CITY.minZ + 4;
    for (const t of [side.map, side.normalMap, side.roughnessMap]) if (t) t.repeat.set(cw / 12, cd / 12);
    plane(cw, cd, side, 0, 0.012, (CITY.minZ + CITY.maxZ) / 2);

    const asphalt = ctx.surface("asphalt", 1024);
    const street = (w, d, x, z) => {
      const m = asphalt.material(1);
      for (const t of [m.map, m.normalMap, m.roughnessMap]) if (t) t.repeat.set(Math.max(1, w / 9), Math.max(1, d / 9));
      plane(w, d, m, x, 0.022, z);
    };
    for (const x of AVENUES) street(STREET_W, CITY.maxZ - CITY.minZ, x, (CITY.minZ + CITY.maxZ) / 2);
    for (const z of STREETS) street(CITY.maxX - CITY.minX, STREET_W, 0, z);

    // lamps: down the boulevard, along two French District streets, the promenade
    for (let z = 204; z < 376; z += 40) {
      ctx.addLitSpot({ x: ctx.ROAD_X + ctx.ROAD_HALF + 2, y: 6, z, warm: 0xffd9a0, power: 110, range: 26, pole: true });
    }
    for (const z of [250, 290]) {
      for (let x = -120; x < -10; x += 40) ctx.addLitSpot({ x, y: 5, z: z - STREET_W / 2 - 1.5, warm: 0xffc890, power: 90, range: 22, pole: true });
    }
    for (let x = -80; x <= 80; x += 40) ctx.addLitSpot({ x, y: 5, z: 378, warm: 0xffe0b0, power: 90, range: 22, pole: true });

    // the welcome, with a reply from Keseme's own narration
    ctx.makeBillboard(ctx.ROAD_X + ctx.ROAD_HALF + 7, 199, Math.PI, "ORLEAROUGE", "Life Is Beautiful", "BEAUTY DON'T MAKE YOU SAFE");
  }

  /** Blocks between streets: [x0, x1, z0, z1] with a sidewalk margin. */
  function blocks() {
    const xs = [CITY.minX, ...AVENUES.slice(0, 2), ctx.ROAD_X, ...AVENUES.slice(2), CITY.maxX];
    const zs = [CITY.minZ, ...STREETS, CITY.maxZ];
    const out = [];
    for (let i = 0; i < xs.length - 1; i++) {
      for (let j = 0; j < zs.length - 1; j++) {
        const pad = (edge) => (edge === CITY.minX || edge === CITY.maxX || edge === CITY.minZ || edge === CITY.maxZ ? 1 : STREET_W / 2 + 2.5);
        const x0 = xs[i] + pad(xs[i]) + (xs[i] === ctx.ROAD_X ? 1 : 0), x1 = xs[i + 1] - pad(xs[i + 1]) - (xs[i + 1] === ctx.ROAD_X ? 1 : 0);
        const z0 = zs[j] + pad(zs[j]), z1 = zs[j + 1] - pad(zs[j + 1]);
        if (x1 - x0 > 8 && z1 - z0 > 6) out.push({ x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- French District
  const PASTELS = [0xd98e73, 0xe8c98a, 0x9cc7b4, 0xc9a0c7, 0xe6b0a0, 0x8fb3d9, 0xefe4cf];
  function rowhouse(x, z, w, faceZ, floors) {
    const h = floors * 3.3 + 0.6, d = 9;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = faceZ < 0 ? Math.PI : 0;              // front faces the street
    scene.add(g);
    const wall = std("stucco wall", PASTELS[(Math.abs(Math.round(x * 7 + z * 3))) % PASTELS.length]);
    const trim = std("trim wood", 0xf2eee4);
    const iron = std("wrought iron railing", 0x1c1f22, { metalness: 0.6, roughness: 0.5 });
    const shutter = std("shutter wood", 0x2f5a44);
    mesh(new THREE.BoxGeometry(w, h, d), wall, 0, h / 2, 0, { parent: g });
    mesh(new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4), trim, 0, h + 0.25, 0, { parent: g });
    const lit = basic(new THREE.Color(0xffc27a).multiplyScalar(1.5));
    const dark = basic(0x17202a);
    for (let f = 0; f < floors; f++) {
      const y = 1.9 + f * 3.3;
      for (const wx of [-w * 0.28, w * 0.28]) {
        mesh(new THREE.BoxGeometry(1.2, 2.0, 0.1), (x + z + f + wx) % 3 > 1 ? dark : lit, wx, y, d / 2 + 0.02, { parent: g, cast: false });
        mesh(new THREE.BoxGeometry(0.45, 2.1, 0.08), shutter, wx - 0.85, y, d / 2 + 0.05, { parent: g, cast: false });
        mesh(new THREE.BoxGeometry(0.45, 2.1, 0.08), shutter, wx + 0.85, y, d / 2 + 0.05, { parent: g, cast: false });
      }
      if (f > 0) {
        // the balcony: slab, top rail and a row of balusters
        mesh(new THREE.BoxGeometry(w - 0.4, 0.18, 1.3), trim, 0, y - 1.15, d / 2 + 0.65, { parent: g });
        mesh(new THREE.BoxGeometry(w - 0.4, 0.07, 0.07), iron, 0, y - 0.1, d / 2 + 1.25, { parent: g, cast: false });
        const balusters = Math.max(4, Math.round(w / 0.9));
        for (let b = 0; b <= balusters; b++) {
          mesh(new THREE.BoxGeometry(0.05, 1.0, 0.05), iron, -w / 2 + 0.3 + b * (w - 0.6) / balusters, y - 0.6, d / 2 + 1.25, { parent: g, cast: false });
        }
      }
    }
    occluders.push({ minX: x - w / 2, maxX: x + w / 2, minY: 0, maxY: h + 0.5, minZ: z - d / 2 - 1.3, maxZ: z + d / 2 + 1.3 });
    ctx.addBlocker(x - w / 4, z, Math.min(w / 2, d / 2));
    ctx.addBlocker(x + w / 4, z, Math.min(w / 2, d / 2));
    return g;
  }

  const CLUBS = [
    ["ROUGE ROYALE JAZZ", "#2ee6ff", "#1a0f24"], ["24 HR DAIQUIRIS", "#ff4fb3", "#1a0f1a"],
    ["BRASS & BOURBON", "#ffc23a", "#1a1408"], ["LE CRAWFISH CLUB", "#ff5a3c", "#140a08"],
    ["MUSIC HALL", "#9dff6a", "#0c140a"], ["PO-BOYS · BEIGNETS", "#ffe07a", "#1a1408"],
  ];
  function outskirts(bl) {
    let outRng = 0;
    for (const b of bl) {
      if (!((b.cz >= 370) || (b.cx < ctx.ROAD_X && b.cz >= 330) || (b.cx > ctx.ROAD_X && b.cz > 206 && b.cz <= 250))) continue;
      
      const w = b.x1 - b.x0;
      const d = b.z1 - b.z0;
      outRng++;
      
      if (outRng % 3 === 0) {
        // Run-down warehouse
        mesh(new THREE.BoxGeometry(w - 2, 8, d - 4), std("warehouse metal", 0x4a4e54, { metalness: 0.5, roughness: 0.8 }), b.cx, 4, b.cz);
        mesh(new THREE.BoxGeometry(w, 1, d - 2), std("warehouse roof", 0x222222), b.cx, 8.5, b.cz);
        ctx.addBlocker(b.cx, b.cz, Math.min(w, d) / 2 - 1);
        if (ctx.makePallet) {
          ctx.makePallet(b.x0 + 4, b.z0 + 2, 0);
          ctx.makePallet(b.x0 + 4, b.z0 + 4, 0);
        }
        if (ctx.makeBarrel) {
          ctx.makeBarrel(b.x1 - 3, b.z0 + 2);
          ctx.makeBarrel(b.x1 - 4, b.z0 + 2.5);
        }
      } else if (outRng % 3 === 1) {
        // Cheap Motel
        mesh(new THREE.BoxGeometry(w - 4, 5, 8), std("motel plaster", 0xc8c3b5), b.cx, 2.5, b.cz - d/4);
        mesh(new THREE.BoxGeometry(w - 4, 5, 8), std("motel plaster", 0xc8c3b5), b.cx, 2.5, b.cz + d/4);
        ctx.addBlocker(b.cx, b.cz - d/4, 4);
        ctx.addBlocker(b.cx, b.cz + d/4, 4);
        
        neonSign("VACANCY", "#ff3333", "#220000", 6, 1.2, b.cx, 6, b.cz, 0, 0.2);
        
        if (ctx.makeFence) {
          ctx.makeFence(b.x0, b.z0, b.x0, b.z1);
          ctx.makeFence(b.x1, b.z0, b.x1, b.z1);
        }
      } else {
        // Row of shotgun houses
        const num = Math.max(1, Math.floor(w / 8));
        const houseW = 5;
        const houseD = 14;
        const step = w / num;
        const roofGeo = new THREE.CylinderGeometry(houseW / 1.5, houseW / 1.5, houseD + 1, 3).rotateX(-Math.PI / 2).translate(0, 0.5, 0);
        for (let i = 0; i < num; i++) {
          const hx = b.x0 + step * (i + 0.5);
          const color = [0x556655, 0x775555, 0x444466, 0x666655][(outRng + i) % 4];
          mesh(new THREE.BoxGeometry(houseW, 4, houseD), std("shotgun wood", color), hx, 2, b.cz);
          mesh(roofGeo, std("shingle", 0x2a2a2a), hx, 4, b.cz);
          ctx.addBlocker(hx, b.cz, houseW / 1.5);
        }
      }
    }
  }

  function frenchDistrict(bl) {
    let club = 0;
    for (const b of bl) {
      if (!(b.cx < ctx.ROAD_X && b.cz < 330)) continue;
      for (const faceZ of [-1, 1]) {
        const zEdge = faceZ < 0 ? b.z0 + 4.5 : b.z1 - 4.5;
        const n = Math.max(1, Math.floor((b.x1 - b.x0) / 9));
        const w = (b.x1 - b.x0) / n;
        for (let i = 0; i < n; i++) {
          const x = b.x0 + w * (i + 0.5);
          rowhouse(x, zEdge, w - 0.3, faceZ, 2 + ((i + Math.round(b.cz)) % 2));
          if ((i + club) % 3 === 0) {
            const [text, ink, bg] = CLUBS[club++ % CLUBS.length];
            neonSign(text, ink, bg, Math.min(w - 1, 7), 1.4, x, 3.4, zEdge + faceZ * 5.2, faceZ < 0 ? Math.PI : 0, 0.12);
            pois.push({ x, z: zEdge + faceZ * 7, r: 5 });
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- downtown
  const windowTex = [0, 1, 2].map((v) => canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = ["#1b2530", "#22303a", "#1d2228"][v]; x.fillRect(0, 0, w, h);
    const rnd = () => Math.random();
    for (let cy = 0; cy < 4; cy++) {
      for (let cx = 0; cx < 4; cx++) {
        const on = rnd() < [0.45, 0.3, 0.6][v];
        x.fillStyle = on ? ["#ffd89a", "#bfe6ff", "#fff1c8"][v] : "#0c1218";
        x.fillRect(cx * 32 + 5, cy * 32 + 7, 22, 18);
      }
    }
  }));
  const towerMats = windowTex.map((t, i) => {
    const m = new THREE.MeshStandardMaterial({
      name: "glass tower facade", map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.9,
      roughness: 0.3, metalness: 0.4,
    });
    m.userData.gtbRealized = true;          // keep the lit windows as authored
    return m;
  });
  function tower(x, z, w, d, h, v) {
    mesh(tiledBox(w, h, d, 4, 4), towerMats[v % towerMats.length], x, h / 2, z);
    mesh(new THREE.BoxGeometry(w + 0.6, 1.2, d + 0.6), std("concrete roof", 0x3a3d40), x, h + 0.6, z);
    mesh(new THREE.SphereGeometry(0.35, 8, 6), basic(new THREE.Color(0xff2a1a).multiplyScalar(3)), x, h + 2, z, { cast: false });
    for (const [bx, bz] of [[-w / 4, -d / 4], [w / 4, -d / 4], [-w / 4, d / 4], [w / 4, d / 4]]) ctx.addBlocker(x + bx, z + bz, Math.min(w, d) / 3);
    occluders.push({ minX: x - w / 2, maxX: x + w / 2, minY: 0, maxY: h + 1.2, minZ: z - d / 2, maxZ: z + d / 2 });
  }
  function downtown(bl) {
    let v = 0;
    for (const b of bl) {
      if (!(b.cx > ctx.ROAD_X && b.cz > 250 && b.cz < 370)) continue;
      const bw = b.x1 - b.x0, bd = b.z1 - b.z0;
      if (bw > 26) {
        tower(b.cx - bw / 4, b.cz, bw / 2 - 2, bd - 4, 26 + ((v * 17) % 44), v++);
        tower(b.cx + bw / 4, b.cz, bw / 2 - 2, bd - 4, 22 + ((v * 23) % 50), v++);
      } else {
        tower(b.cx, b.cz, bw - 3, bd - 4, 24 + ((v * 19) % 46), v++);
      }
      pois.push({ x: b.cx, z: b.z0 - 4, r: 6 });
    }
  }

  // ---------------------------------------------------------------- landmarks
  function shops(bl) {
    // the north edge of the city: pawn shops, check cashing, a daiquiri shop
    const signs = [["PAWN", "#ffd23a", "#101010"], ["CHECK CASHING", "#3aff9a", "#0c1410"],
      ["24 HR DAIQUIRI", "#ff4fb3", "#1a0f1a"], ["LIQUOR", "#ff5a3c", "#140a08"]];
    let s = 0;
    for (const b of bl) {
      if (b.cz > 206 || b.x1 - b.x0 < 10) continue;
      const w = Math.min(b.x1 - b.x0 - 2, 16);
      mesh(new THREE.BoxGeometry(w, 4.2, 6), std("brick wall", 0x7a4a3a), b.cx, 2.1, b.cz + 1);
      const [t, ink, bg] = signs[s++ % signs.length];
      neonSign(t, ink, bg, Math.min(w - 1, 8), 1.3, b.cx, 4.7, b.cz - 2.2, Math.PI, 0.2);
      ctx.addBlocker(b.cx, b.cz + 1, Math.min(w, 6) / 2);
      if (t === "PAWN" && ctx.addService) ctx.addService({ kind: "gun", name: "OrleaRouge Pawn & Guns", x: b.cx, z: b.cz - 3.8, face: Math.PI });
      if (t === "24 HR DAIQUIRI") {
        // "Police cruisers parked outside a twenty-four-hour daiquiri shop."
        const proto = ctx.getSheriffProto && ctx.getSheriffProto();
        if (proto) {
          const car = proto.clone(true);
          car.position.set(b.cx + 3, proto.position.y, b.z0 - 3.2);
          car.rotation.y = Math.PI / 2;
          scene.add(car);
          ctx.addBlocker(b.cx + 3, b.z0 - 3.2, 2);
        }
      }
      pois.push({ x: b.cx, z: b.z0 - 3, r: 6 });
    }
  }

  function hospital(b) {
    mesh(new THREE.BoxGeometry(b.x1 - b.x0 - 2, 11, b.z1 - b.z0 - 4), std("plaster wall", 0xd8d6cf), b.cx, 5.5, b.cz);
    placeOfficeClutter(ctx, b.cx - 6, b.z0 + 3);
    // the sign has lost a few letters
    const sign = canvasTex(1024, 128, (x, w, h) => {
      x.fillStyle = "#f4f2ea"; x.fillRect(0, 0, w, h);
      x.fillStyle = "#1f4f8a"; x.font = "bold 70px Arial"; x.textAlign = "center"; x.textBaseline = "middle";
      x.fillText("ORLEAR UGE  PUB IC  HOSP TAL", w / 2, h / 2 + 4);
    }, false);
    const m = new THREE.MeshStandardMaterial({ map: sign, emissive: 0xffffff, emissiveMap: sign, emissiveIntensity: 0.5, name: "signboard" });
    m.userData.gtbRealized = true;
    mesh(new THREE.BoxGeometry(18, 2.2, 0.3), m, b.cx, 9, b.z0 - 0.2, { cast: false });
    for (const [bx, bz] of [[-8, 0], [0, 0], [8, 0]]) ctx.addBlocker(b.cx + bx, b.cz + bz, (b.z1 - b.z0) / 2 - 2);
    occluders.push({ minX: b.x0 + 1, maxX: b.x1 - 1, minY: 0, maxY: 11, minZ: b.z0 + 2, maxZ: b.z1 - 2 });
    if (ctx.addService) ctx.addService({ kind: "hospital", name: "OrleaRouge Public Hospital", x: b.cx, z: b.z0 - 1.8, face: Math.PI });
    pois.push({ x: b.cx, z: b.z0 - 4, r: 7 });
  }

  // St. Louis No. 1: oven vaults, above-ground family tombs in narrow alleys,
  // the Glapion tomb, and Marie Laveau's ghost keeping the place after dark.
  // It used to be fifteen boxes with pyramid lids on a lawn. See cemetery.js.
  function cemetery(b) {
    graveyard = createCemetery(ctx, b);
    pois.push({ x: b.cx, z: b.z0 - 3, r: 6 });     // mourners and tour groups outside the gate
  }

  function construction(b) {
    const steel = std("steel beam", 0xc98a2a, { metalness: 0.5, roughness: 0.5 });
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    placeOfficeClutter(ctx, b.cx + 5, b.z0 + 4);
    // an unfinished tower frame
    for (const [cx, cz] of [[-6, -5], [6, -5], [-6, 5], [6, 5]]) {
      mesh(new THREE.BoxGeometry(0.6, 22, 0.6), steel, b.cx + cx - 4, 11, b.cz + cz);
      ctx.addBlocker(b.cx + cx - 4, b.cz + cz, 0.6);
    }
    for (let y = 5; y < 22; y += 5.5) mesh(new THREE.BoxGeometry(13, 0.4, 11), std("concrete slab", 0x9a968e), b.cx - 4, y, b.cz);
    // the crane
    mesh(new THREE.BoxGeometry(1.4, 38, 1.4), steel, b.cx + 9, 19, b.cz + 6);
    mesh(new THREE.BoxGeometry(30, 1, 1), steel, b.cx + 1, 38, b.cz + 6);
    mesh(new THREE.BoxGeometry(3, 2.2, 2.2), std("concrete block", 0x6a6a6a), b.cx + 13, 36.9, b.cz + 6);
    mesh(new THREE.SphereGeometry(0.35, 8, 6), basic(new THREE.Color(0xff2a1a).multiplyScalar(3)), b.cx - 14, 38.8, b.cz + 6, { cast: false });
    ctx.addBlocker(b.cx + 9, b.cz + 6, 1.2);
    // hoarding along the street
    const hoard = canvasTex(512, 128, (x, cw, ch) => {
      x.fillStyle = "#1f3a5a"; x.fillRect(0, 0, cw, ch);
      x.fillStyle = "#f4efe4"; x.font = "bold 44px Georgia"; x.textAlign = "center";
      x.fillText("PELICAN CROWN", cw / 2, 58); x.font = "italic 30px Georgia"; x.fillText("Luxury Riverfront Living", cw / 2, 102);
    }, false);
    const hm = new THREE.MeshStandardMaterial({ map: hoard, name: "signboard" });
    hm.userData.gtbRealized = true;
    mesh(new THREE.BoxGeometry(w - 2, 2.4, 0.2), hm, b.cx, 1.2, b.z0);
    for (let x = b.x0 + 2; x < b.x1 - 1; x += 3) ctx.addBlocker(x, b.z0, 0.8);
    pois.push({ x: b.cx, z: b.z0 - 3, r: 5 });
  }

  function riverfront() {
    const river = new THREE.MeshPhysicalMaterial({
      color: 0x0a1a22, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.2, name: "river water",
    });
    river.userData.gtbRealized = true;
    plane(360, 80, river, 0, -0.25, CITY.maxZ + 42);
    // promenade railing, solid
    const rail = std("wrought iron railing", 0x1c1f22, { metalness: 0.6, roughness: 0.5 });
    mesh(new THREE.BoxGeometry(CITY.maxX - CITY.minX, 0.08, 0.08), rail, 0, 1.0, CITY.maxZ + 1.2, { cast: false });
    for (let x = CITY.minX + 2; x < CITY.maxX; x += 2.5) {
      mesh(new THREE.BoxGeometry(0.06, 1.0, 0.06), rail, x, 0.5, CITY.maxZ + 1.2, { cast: false });
    }

    // the casino riverboat
    const white = std("painted hull", 0xf2efe6), red = std("painted trim", 0xb3261e);
    const bx = 48, bz = CITY.maxZ + 16;
    mesh(new THREE.BoxGeometry(34, 3, 11), white, bx, 1.2, bz);
    mesh(new THREE.BoxGeometry(28, 2.6, 9), white, bx, 4.0, bz);
    mesh(new THREE.BoxGeometry(18, 2.4, 7), white, bx, 6.5, bz);
    for (const y of [2.8, 5.3]) mesh(new THREE.BoxGeometry(34.4, 0.3, 11.4), red, bx, y, bz, { cast: false });
    const wheel = mesh(new THREE.CylinderGeometry(3.6, 3.6, 2.4, 16), red, bx + 19, 2.6, bz);
    wheel.rotation.z = Math.PI / 2;
    for (const sx of [-4, 4]) mesh(new THREE.CylinderGeometry(0.6, 0.7, 6, 10), std("steel stack", 0x1c1c1c), bx + sx, 10.5, bz);
    const bulb = basic(new THREE.Color(0xffe6a8).multiplyScalar(2.5));
    for (let i = 0; i < 16; i++) mesh(new THREE.SphereGeometry(0.16, 6, 5), bulb, bx - 16 + i * 2.1, 5.45, bz - 5.5, { cast: false });
    neonSign("GRAND CRESCENT CASINO", "#ffd23a", "#2a0808", 16, 2.2, bx, 9.2, bz - 3.6, Math.PI, 0.08);
    ctx.poolLight(0xffd9a0, 60, 34, bx, 8, bz - 6);
    pois.push({ x: bx, z: CITY.maxZ - 3, r: 10 });
    pois.push({ x: -40, z: CITY.maxZ - 3, r: 10 });
  }

  // ---------------------------------------------------------------- build
  function buildSet() {
    buildCauseway();
    buildStreets();
    const bl = blocks();
    const pick = (x, z) => bl.find((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1);
    const special = new Set();
    const hosp = pick(-26, 350), cem = pick(-110, 350), site = pick(94, 230);
    if (hosp) { hospital(hosp); special.add(hosp); }
    if (cem) { cemetery(cem); special.add(cem); }
    if (site) { construction(site); special.add(site); }
    // blocks other modules build on (main.js passes them: the Pay 'n' Spray lot, the clubs)
    for (const lot of ctx.lots || []) {
      const b = pick(lot.at[0], lot.at[1]);
      if (b && !special.has(b)) { special.add(b); lot.build(b); }
    }
    const rest = bl.filter((b) => !special.has(b));
    outskirts(rest);
    frenchDistrict(rest);
    downtown(rest);
    shops(rest);
    riverfront();
    // street corners along the boulevard are where people hang out
    for (const z of STREETS) pois.push({ x: ctx.ROAD_X + 10, z: z + 7, r: 5 }, { x: ctx.ROAD_X - 10, z: z - 7, r: 5 });

    // Add parked cars to some streets
    const cars = ["beatall", "doclorean", "landyroamer", "toyoyo", "tristar"];
    let c = 0;
    for (const z of STREETS) {
      if (z > 210) { // Don't park on the causeway boundary
        placeParkedCar(ctx, cars[c++ % cars.length], ctx.ROAD_X + 20, z - 4.5, -Math.PI / 2);
        placeParkedCar(ctx, cars[c++ % cars.length], ctx.ROAD_X - 30, z + 4.5, Math.PI / 2);
      }
    }
  }

  return {
    buildSet,
    /** The street grid, for the minimap: north–south avenues at x, east–west streets at z. */
    grid: { avenues: AVENUES, streets: STREETS, width: STREET_W, city: CITY, causeway: CAUSEWAY },
    get pois() { return pois; },
    get occluders() { return occluders; },
    /** Anything in the city that moves — main.js keeps these out of batchStatic. */
    get props() { return graveyard ? graveyard.props : []; },
    /** F at Marie Laveau's tomb. main.js tries this in its interact chain. */
    interact() { return graveyard ? graveyard.interact() : false; },
    get cemetery() { return graveyard; },
    get entered() { return entered; },
    /** Keep trees and scattered decor out. */
    contains(x, z) { return z > CAUSEWAY.minZ; },
    inCity(x, z) { return z > CITY.minZ && x >= CITY.minX - 2; },   // the rural parish lies west of the city

    /** Traffic lanes for two cross streets (both directions), for createTraffic. */
    lanes: [
      { name: "250 eastbound", points: [[CITY.minX + 4, 247.6], [CITY.maxX - 4, 247.6]], cruise: [9, 14] },
      { name: "250 westbound", points: [[CITY.maxX - 4, 252.4], [CITY.minX + 4, 252.4]], cruise: [9, 14] },
      { name: "330 eastbound", points: [[CITY.minX + 4, 327.6], [CITY.maxX - 4, 327.6]], cruise: [9, 14] },
      { name: "330 westbound", points: [[CITY.maxX - 4, 332.4], [CITY.minX + 4, 332.4]], cruise: [9, 14] },
      { name: "210 eastbound", points: [[CITY.minX + 4, 207.6], [CITY.maxX - 4, 207.6]], cruise: [8, 13] },
      { name: "210 westbound", points: [[CITY.maxX - 4, 212.4], [CITY.minX + 4, 212.4]], cruise: [8, 13] },
      { name: "370 eastbound", points: [[CITY.minX + 4, 367.6], [CITY.maxX - 4, 367.6]], cruise: [8, 13] },
      { name: "370 westbound", points: [[CITY.maxX - 4, 372.4], [CITY.minX + 4, 372.4]], cruise: [8, 13] },
    ],

    update(dt) {
      if (graveyard) graveyard.update(dt);
      const t = performance.now() / 1000;
      for (const n of neon) {
        // mostly steady, with the occasional sputter
        const s = Math.sin(t * n.speed + n.phase);
        const dip = s > 0.97 ? n.flicker * 3 : Math.max(0, s) * n.flicker;
        if (n.color) n.mat.color.copy(n.color).multiplyScalar(n.base * (1 - dip));
        else n.mat.emissiveIntensity = n.base * (1 - dip);
      }
      if (!entered && ctx.playerPos.z > CITY.minZ + 6 && ctx.playerPos.x > CITY.minX - 2 && !ctx.state.cinematic) {
        entered = true;
        ctx.cine.scene(async (c) => {
          c.card("EXT.", "ORLEAROUGE", "Gorgeous and wounded");
          await c.wait(1.2);
          await c.say("KESEME (V.O.)", "OrleaRouge teaches you two things.");
          await c.say("KESEME (V.O.)", "Life can be beautiful.");
          c.sfx("gunshot", 0.5);
          await c.say("KESEME (V.O.)", "And beauty doesn't make you safe.");
        });
      }
    },
  };
}
