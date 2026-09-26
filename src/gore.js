// ---------------------------------------------------------------------------
// gore.js — this is a very gory game (human request, 2026-09-26).
//
// A shotgun blast at someone should paint your screen, the walls around them and the floor, and the
// victim should come apart. Four pieces, all pooled and capped so a long night never grows the scene:
//
//   screen(k)            blood on the lens: splats that drip down the glass and fade over ~6 s (CSS)
//   hit(pos, dir, opts)  every bullet that lands: spray, a splat on the floor and on the nearest walls,
//                        more of everything for a shotgun, blood on the lens when it is close
//   explode(pos, dir)    the body goes off: skin, meat, bone and cloth chunks with a head and limbs thrown
//                        out on ballistic arcs, bouncing, each leaving a splat where it lands
//   update(dt)           steps the chunks and fades the old decals
//
// Walls: the world's solid things are circles in the collision grid (buildings are chains of them), so a
// wall splat goes on the surface of a nearby circle, facing the victim, at a random height. That is a
// close enough wall without raycasting a static-batched scene.
// ---------------------------------------------------------------------------

import * as THREE from "three";

const rand = (a, b) => a + Math.random() * (b - a);

/** One irregular blood splat, drawn with a centre blob, radiating streaks with drips, and droplets. */
function splatTexture(seed) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const r = (i) => { const x = Math.sin(seed * 999 + i * 78.233) * 43758.5453; return x - Math.floor(x); };
  g.clearRect(0, 0, 256, 256);
  const blob = (x, y, rad, a) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(150,8,10,${a})`); gr.addColorStop(0.65, `rgba(112,5,8,${a * 0.9})`); gr.addColorStop(1, "rgba(90,3,6,0)");
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  };
  blob(128, 128, 46 + r(1) * 20, 0.98);
  for (let i = 0; i < 9; i++) {                                // lobes round the centre
    const a = r(i + 3) * Math.PI * 2, d = 30 + r(i + 9) * 34;
    blob(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 12 + r(i + 20) * 22, 0.92);
  }
  g.lineCap = "round";
  for (let i = 0; i < 14; i++) {                               // streaks flung outward, ending in a drop
    const a = r(i + 40) * Math.PI * 2, len = 60 + r(i + 60) * 62, w = 2 + r(i + 80) * 6;
    g.strokeStyle = "rgba(122,5,8,0.94)"; g.lineWidth = w;
    g.beginPath(); g.moveTo(128 + Math.cos(a) * 30, 128 + Math.sin(a) * 30);
    g.lineTo(128 + Math.cos(a) * len, 128 + Math.sin(a) * len); g.stroke();
    blob(128 + Math.cos(a) * len, 128 + Math.sin(a) * len, w * 1.3 + 1, 0.95);
  }
  for (let i = 0; i < 26; i++) {                               // spatter
    const a = r(i + 100) * Math.PI * 2, d = 50 + r(i + 130) * 76;
    blob(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 1.5 + r(i + 160) * 4, 0.9);
  }
  return c;
}

export function createGore({ scene, camera, blockerGrid, spray = null, pool = null, host = document.body }) {
  // ---- decals: one shared geometry, six texture variants, a ring buffer of meshes
  const variants = [];
  const canvases = [];
  for (let i = 0; i < 6; i++) {
    const cv = splatTexture(i + 1);
    canvases.push(cv);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    m.userData.gtbRealized = true;
    variants.push(m);
  }
  const decalGeo = new THREE.PlaneGeometry(1, 1);
  const MAX_DECALS = 240;
  const decals = [];
  let decalAt = 0;
  function decal() {
    if (decals.length < MAX_DECALS) {
      const m = new THREE.Mesh(decalGeo, variants[0]);
      m.frustumCulled = true; m.renderOrder = 2;
      scene.add(m); decals.push(m);
      return m;
    }
    const m = decals[decalAt]; decalAt = (decalAt + 1) % MAX_DECALS;
    return m;
  }
  function floorSplat(x, z, size) {
    const m = decal();
    m.material = variants[(Math.random() * variants.length) | 0];
    m.position.set(x, 0.02 + Math.random() * 0.01, z);
    m.rotation.set(-Math.PI / 2, 0, rand(0, Math.PI * 2));
    m.scale.setScalar(size * 1.35);
    m.visible = true;
  }
  const _n = new THREE.Vector3();
  function wallSplats(px, pz, dx, dz, count, size, reach) {
    const cands = [];
    blockerGrid.near(px, pz, reach + 4, (b) => {
      if (b._grid !== "static" || b.r < 0.6) return false;
      const vx = px - b.x, vz = pz - b.z, d = Math.hypot(vx, vz);
      if (d < b.r * 0.5 || d > b.r + reach) return false;
      const align = ((-vx) * dx + (-vz) * dz) / d;            // 1 = the wall the blast is flying at
      cands.push({ b, vx, vz, d, w: 0.35 + Math.max(0, align) * 1.6 + (b.r >= 1.4 ? 0.6 : 0) });
      return false;
    });
    if (!cands.length) return;
    const total = cands.reduce((s, c) => s + c.w, 0);
    for (let i = 0; i < count; i++) {
      let r = Math.random() * total, c = cands[0];
      for (const k of cands) { if ((r -= k.w) < 0) { c = k; break; } }
      const nx = c.vx / c.d, nz = c.vz / c.d;
      const jitter = rand(-0.9, 0.9) * Math.min(c.b.r, 2.5);          // slide the splat sideways along the wall
      const y = rand(0.3, 2.5);
      const m = decal();
      m.material = variants[(Math.random() * variants.length) | 0];
      m.position.set(c.b.x + nx * (c.b.r + 0.05) - nz * jitter, y, c.b.z + nz * (c.b.r + 0.05) + nx * jitter);
      m.lookAt(m.position.x + nx, y, m.position.z + nz);
      m.rotateZ(rand(0, Math.PI * 2));
      m.scale.setScalar(size * rand(0.7, 1.3));
      m.visible = true;
    }
  }

  // ---- blood on the lens
  const screenBox = document.createElement("div");
  screenBox.id = "goreScreen";
  screenBox.style.cssText = "position:fixed;inset:0;z-index:8;pointer-events:none;overflow:hidden;";
  host.appendChild(screenBox);
  const urls = canvases.map((c) => c.toDataURL());
  let live = 0;
  function screen(k = 1) {
    const n = Math.max(1, Math.round(k * (2 + Math.random() * 2)));
    for (let i = 0; i < n && live < 18; i++) {
      const el = document.createElement("div");
      const size = rand(200, 520) * (0.7 + k * 0.4), x = rand(-0.05, 0.95) * innerWidth - size / 2, y = rand(0.02, 0.85) * innerHeight - size / 2;
      el.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size}px;background:url(${urls[(Math.random() * urls.length) | 0]}) center/contain no-repeat;` +
        `transform:rotate(${rand(0, 360)}deg);opacity:0.96;filter:drop-shadow(0 0 3px rgba(60,0,0,.6));transition:opacity 6.5s ease-in, top 6.5s ease-in;`;
      screenBox.appendChild(el);
      live++;
      requestAnimationFrame(() => requestAnimationFrame(() => { el.style.opacity = "0"; el.style.top = (y + rand(60, 220)) + "px"; }));   // fade and run down the glass
      setTimeout(() => { el.remove(); live--; }, 6800);
    }
  }

  // ---- chunks
  const chunkGeo = new THREE.BoxGeometry(1, 1, 1);
  const chunkMats = {
    meat: new THREE.MeshStandardMaterial({ color: 0x8a1416, roughness: 0.55, name: "gib meat" }),
    dark: new THREE.MeshStandardMaterial({ color: 0x4a0a0c, roughness: 0.6, name: "gib gore" }),
    bone: new THREE.MeshStandardMaterial({ color: 0xe6dcc4, roughness: 0.7, name: "gib bone" }),
  };
  for (const m of Object.values(chunkMats)) m.userData.gtbRealized = true;
  const MAX_CHUNKS = 150;
  const chunks = [];
  let chunkAt = 0;
  function chunk() {
    if (chunks.length < MAX_CHUNKS) {
      const m = new THREE.Mesh(chunkGeo, chunkMats.meat);
      m.userData.vel = new THREE.Vector3(); m.userData.spin = new THREE.Vector3();
      m.castShadow = false;
      scene.add(m); chunks.push(m);
      return m;
    }
    const m = chunks[chunkAt]; chunkAt = (chunkAt + 1) % MAX_CHUNKS;
    return m;
  }
  const skinMats = new Map(), clothMats = new Map();
  const tone = (map, hex, name) => { let m = map.get(hex); if (!m) { m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.75, name }); m.userData.gtbRealized = true; map.set(hex, m); } return m; };

  function fling(pos, dir, { material, size, speed, up = 4, life = 24 }) {
    const m = chunk();
    m.material = material;
    m.position.set(pos.x + rand(-0.25, 0.25), pos.y + rand(-0.4, 0.4), pos.z + rand(-0.25, 0.25));
    m.scale.set(size * rand(0.7, 1.4), size * rand(0.6, 1.2), size * rand(0.7, 1.5));
    m.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
    m.userData.vel.set(dir.x * speed * rand(0.4, 1.2) + rand(-2.5, 2.5), up * rand(0.5, 1.4), dir.z * speed * rand(0.4, 1.2) + rand(-2.5, 2.5));
    m.userData.spin.set(rand(-9, 9), rand(-9, 9), rand(-9, 9));
    m.userData.life = life; m.userData.bounces = 0; m.userData.rest = false;
    m.visible = true;
    return m;
  }

  return {
    screen,

    /** A bullet lands: spray, floor and wall splats, and blood on the lens when it is close. */
    hit(pos, dir, { shotgun = false, dist = 99, killed = false, rifle = false } = {}) {
      const k = shotgun ? 1.7 : rifle ? 1.1 : 0.7;
      if (spray) spray(pos, dir, Math.round((shotgun ? 26 : 9) * (killed ? 1.4 : 1)));
      const n = Math.round((shotgun ? 6 : 2) * (killed ? 1.5 : 1));
      for (let i = 0; i < n; i++) {
        const d = rand(0.3, shotgun ? 4.2 : 2.4);
        floorSplat(pos.x + dir.x * d + rand(-1.2, 1.2), pos.z + dir.z * d + rand(-1.2, 1.2), rand(0.7, 1.6) * k);
      }
      wallSplats(pos.x, pos.z, dir.x, dir.z, shotgun ? 7 : 2, 1.25 * k, shotgun ? 7 : 4);
      if (dist < (shotgun ? 11 : 3.2)) screen(shotgun ? (dist < 5 ? 1.6 : 1) : 0.5);
    },

    /** The body goes off. `look`: { skin, cloth, hog } tints the chunks. */
    explode(pos, dir, look = {}) {
      const skin = tone(skinMats, look.skin ?? 0xb98a6a, "gib skin"), cloth = tone(clothMats, look.cloth ?? 0x3a3a44, "gib cloth");
      const base = new THREE.Vector3(pos.x, Math.max(0.5, pos.y), pos.z);
      for (let i = 0; i < 12; i++) fling(base, dir, { material: [chunkMats.meat, chunkMats.dark, chunkMats.meat][i % 3], size: rand(0.12, 0.3), speed: rand(4, 11), up: rand(3, 8) });
      for (let i = 0; i < 4; i++) fling(base, dir, { material: chunkMats.bone, size: rand(0.08, 0.14), speed: rand(5, 12), up: rand(3, 7) });
      for (let i = 0; i < 4; i++) fling(base, dir, { material: cloth, size: rand(0.18, 0.34), speed: rand(4, 9), up: rand(3, 6) });
      for (let i = 0; i < 3; i++) { const m = fling(base, dir, { material: skin, size: 0.2, speed: rand(4, 9), up: rand(3, 7) }); m.scale.set(0.14, 0.14, rand(0.5, 0.75)); }   // limbs
      const head = fling(base.clone().setY(base.y + 0.5), dir, { material: skin, size: 0.26, speed: rand(3, 8), up: rand(6, 9) });
      head.scale.setScalar(0.28);
      if (spray) spray(base, dir, 48);
      if (pool) pool(pos.x, pos.z, 1.7);
      for (let i = 0; i < 14; i++) floorSplat(pos.x + rand(-3.4, 3.4), pos.z + rand(-3.4, 3.4), rand(0.8, 2.2));
      wallSplats(pos.x, pos.z, dir.x, dir.z, 10, 1.7, 8);
      wallSplats(pos.x, pos.z, -dir.x, -dir.z, 4, 1.4, 6);
      screen(2);
    },

    update(dt) {
      for (const m of chunks) {
        if (!m.visible) continue;
        const u = m.userData;
        u.life -= dt;
        if (u.life <= 0) { m.visible = false; continue; }
        if (u.rest) { if (u.life < 2) m.scale.multiplyScalar(1 - dt * 0.5); continue; }
        u.vel.y -= 16 * dt;
        m.position.addScaledVector(u.vel, dt);
        m.rotation.x += u.spin.x * dt; m.rotation.y += u.spin.y * dt; m.rotation.z += u.spin.z * dt;
        const floor = Math.max(m.scale.x, m.scale.y, m.scale.z) * 0.4;
        if (m.position.y <= floor) {
          m.position.y = floor;
          if (u.vel.y < -1.2 && u.bounces < 2) {
            u.vel.y *= -0.32; u.vel.x *= 0.6; u.vel.z *= 0.6; u.spin.multiplyScalar(0.5); u.bounces++;
            if (Math.random() < 0.6) floorSplat(m.position.x, m.position.z, rand(0.35, 0.9));      // it lands, it leaves a mark
          } else { u.vel.set(0, 0, 0); u.rest = true; }
        }
      }
    },
  };
}
