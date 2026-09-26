// ---------------------------------------------------------------------------
// louisianakit.js — the things you would put on a postcard of Louisiana (TASK-084, phase 8).
//
// townkit.js builds a generic Gulf-coast town; this is what makes it THIS state: live oaks
// hung with Spanish moss, French Quarter galleries with cast-iron lace, a three-spired
// cathedral on a square with a general on a rearing horse, a café that only sells beignets,
// a paddle-wheel steamboat, Mardi Gras floats, the Greek Revival plantation at the end of an
// avenue of oaks, a hot-sauce works, the state pen with its rodeo, refinery flares along the
// river. Every builder is plain boxes and cylinders with named, shared materials (batched by
// batchStatic) exactly like townkit's, and takes the townkit `kit` for its helpers.
//
//   const L = createLouisianaKit(kit, ctx);
//   L.liveOaks(group, [[x, z, scale], ...])   L.cathedral(slot)   L.gallery()   L.statue(g, x, z)
//   L.cafe(slot)  L.steamboat(g, x, z, len)   L.floatDen(...)   L.bigHouse(slot)   L.pepperWorks(...) ...
// ---------------------------------------------------------------------------

import * as THREE from "three";

export function createLouisianaKit(kit, ctx) {
  const { mat, box, cyl, gable, sign, at, group, block, hash, pick } = kit;
  const { scene, addBlocker } = ctx;
  const glowMat = (hex, name = "neon tube", k = 1.3) => {
    const m = new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: k, roughness: 0.4, name });
    m.userData.gtbRealized = true;
    return m;
  };

  // ------------------------------------------------------------ live oaks + Spanish moss
  /**
   * Live oaks: a fat short trunk, three limbs reaching out low and wide, a broad flat crown,
   * and — the whole point — Spanish moss: a hundred grey strands hanging off the rim, one
   * InstancedMesh for every tree in the call. `list`: [[x, z, scale], ...] in `parent`'s frame.
   */
  function liveOaks(parent, list, { moss = 46 } = {}) {
    const bark = mat(0x3f3428, "oak trunk bark", 0.95), leaf = mat(0x2c4a2a, "oak crown leaves foliage", 0.9);
    const strands = [];
    list.forEach(([x, z, s = 1]) => {
      const r = hash(x, z, 5);
      cyl(parent, 0.85 * s, 3.4 * s, bark, x, 1.7 * s, z, 8);
      for (let k = 0; k < 3; k++) {
        const a = r * 6 + k * 2.1, len = 5.2 * s;
        const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.34 * s, 0.6 * s, len, 6), bark);
        limb.position.set(x + Math.cos(a) * len * 0.36, 4.3 * s, z + Math.sin(a) * len * 0.36);
        limb.rotation.set(Math.sin(a) * 1.05, 0, -Math.cos(a) * 1.05);
        limb.castShadow = true; parent.add(limb);
      }
      for (const [ox, oy, oz, rad] of [[0, 6.4, 0, 4.6], [3.6, 5.7, 1.2, 3.6], [-3.4, 5.6, -1.6, 3.8], [1.2, 5.6, -3.6, 3.4], [-1.2, 5.8, 3.4, 3.4]]) {
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(rad * s, 1), leaf);
        crown.scale.y = 0.55; crown.position.set(x + ox * s, oy * s, z + oz * s); crown.castShadow = true; parent.add(crown);
      }
      for (let i = 0; i < moss; i++) {
        const a = hash(x + i, z, 6) * Math.PI * 2, rad = (2.6 + hash(x, z + i, 7) * 4.4) * s;
        strands.push([x + Math.cos(a) * rad, (4.6 + hash(x + i, z + i, 8) * 1.4) * s, z + Math.sin(a) * rad, (0.9 + hash(x, i, 9) * 1.6) * s, a]);
      }
      addBlocker(x, z, 1.3 * s);
    });
    if (strands.length) {
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 1, 0.05), mat(0x8f9c86, "spanish moss foliage", 1), strands.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
      strands.forEach(([x, y, z, len, a], i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
        im.setMatrixAt(i, m.compose(p.set(x, y - len / 2, z), q, sc.set(1, len, 1)));
      });
      im.computeBoundingSphere();
      parent.add(im);
    }
  }

  // ------------------------------------------------------------ the French Quarter gallery house
  const PASTELS = [0xe8c9a0, 0xd9a0a0, 0xa8c8d8, 0xe6dc9a, 0xb8d4a8, 0xd8b0d8, 0xf0d0a8, 0x9ec0b8];
  /** A two-storey Creole townhouse: pastel stucco, arched shuttered doors below, a gallery with cast-iron lace above. */
  function gallery() {
    return (slot) => {
      const g = group(slot), wall = mat(pick(PASTELS, hash(slot.x, slot.z, 1)), "stucco wall", 0.9);
      const iron = mat(0x1a1a1c, "cast iron lace", 0.5, { metalness: 0.6 }), shut = mat(pick([0x2a4a3a, 0x3a2a4a, 0x1e2a3a], hash(slot.x, slot.z, 2)), "painted wood shutter", 0.8);
      const roof = mat(0x4a4f55, "slate roof", 0.7), w = 12, d = 12, h = 8.8;
      box(g, w, h, d, wall, 0, h / 2, 0);
      gable(g, d + 1, 2.2, w + 0.8, roof, 0, h, 0, Math.PI / 2);
      for (let i = 0; i < 3; i++) {                                     // ground floor: tall shuttered doors
        const x = -3.6 + i * 3.6;
        box(g, 1.7, 3.3, 0.14, kit.windowMat(hash(slot.x + i, slot.z, 3) * 0.7), x, 1.75, d / 2 + 0.05);
        for (const sd of [-1, 1]) box(g, 0.5, 3.3, 0.1, shut, x + sd * 1.1, 1.75, d / 2 + 0.06);
      }
      for (let i = 0; i < 3; i++) {                                     // upper floor: long windows onto the gallery
        const x = -3.6 + i * 3.6;
        box(g, 1.5, 3, 0.14, kit.windowMat(hash(slot.x + i, slot.z, 4) * 0.5), x, 6.2, d / 2 + 0.05);
        for (const sd of [-1, 1]) box(g, 0.45, 3, 0.1, shut, x + sd * 1.05, 6.2, d / 2 + 0.06);
      }
      box(g, w + 1, 0.22, 2.4, mat(0x8a8a86, "gallery deck", 0.9), 0, 4.15, d / 2 + 1.1);      // the gallery
      for (let i = 0; i <= 12; i++) box(g, 0.05, 1.05, 0.05, iron, -w / 2 - 0.4 + i * ((w + 0.8) / 12), 4.8, d / 2 + 2.2);
      box(g, w + 0.9, 0.07, 0.07, iron, 0, 5.35, d / 2 + 2.2);
      for (const sx of [-1, 1]) box(g, 0.07, 1.05, 2.2, iron, sx * (w / 2 + 0.4), 4.8, d / 2 + 1.1);
      for (const px of [-w / 2 - 0.3, -2, 2, w / 2 + 0.3]) box(g, 0.14, 4.1, 0.14, iron, px, 2.05, d / 2 + 2.2);   // posts down to the kerb
      box(g, w + 1, 0.3, 2.6, mat(0xe8e2d0, "painted trim", 0.8), 0, 8.5, d / 2 + 1.2);        // the overhang above
      const fern = mat(0x3a6a34, "hanging fern foliage", 0.9);
      for (const x of [-4.4, 0.6, 4.4]) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 5), fern); f.position.set(x, 3.7, d / 2 + 2.2); g.add(f); }
      const lamp = kit.lamp();
      box(g, 0.3, 0.55, 0.3, lamp, w / 2 - 0.4, 3.4, d / 2 + 0.25);                            // a gas lamp by the door
      scene.add(g);
      block(slot, w, d);
      return true;
    };
  }

  // ------------------------------------------------------------ the cathedral
  /** A three-spired cathedral on a stepped porch (an arcaded front, a clock, slate cones), facing local +z. */
  function cathedral(slot, { name = "Cathedral" } = {}) {
    const g = group(slot), cream = mat(0xe6dcc0, "plaster wall", 0.9), trim = mat(0xf4efe0, "painted trim", 0.8);
    const slate = mat(0x3a3f4a, "slate roof", 0.6), dark = mat(0x18181c, "arch void", 0.9);
    box(g, 22, 12, 22, cream, 0, 6, -3);                                            // the nave
    gable(g, 23, 5, 22, slate, 0, 12, -3, 0);
    box(g, 22.5, 6.5, 2.2, cream, 0, 3.25, 8.2);                                   // the front block
    for (const x of [-7.5, 0, 7.5]) {
      box(g, 2.6, 4.2, 0.2, dark, x, 2.2, 9.4);                                     // three arched doors
      cyl(g, 1.3, 0.2, dark, x, 4.3, 9.4, 14).rotation.x = Math.PI / 2;
    }
    box(g, 22.5, 0.5, 2.6, trim, 0, 6.6, 8.3);
    for (const x of [-3.7, 3.7]) for (const y of [2.5]) box(g, 0.9, 5, 0.9, trim, x, y + 0.2, 9.2);   // pilasters between the doors
    box(g, 24, 0.5, 6, mat(0xb8b2a8, "concrete steps", 0.95), 0, 0.25, 12);        // the steps
    // the three towers: the middle one taller, with the clock
    const tower = (x, w, h, cone) => {
      box(g, w, h, w, cream, x, h / 2 + 6, 8.4);
      box(g, w + 0.6, 0.5, w + 0.6, trim, x, h + 6.2, 8.4);
      const c = new THREE.Mesh(new THREE.ConeGeometry(w * 0.72, cone, 4), slate);
      c.rotation.y = Math.PI / 4; c.position.set(x, h + 6.5 + cone / 2, 8.4); c.castShadow = true; g.add(c);
      box(g, 0.14, 2.2, 0.14, mat(0xd4af37, "gilded cross", 0.35, { metalness: 0.9 }), x, h + 6.5 + cone + 1, 8.4);
    };
    tower(0, 7, 12, 14); tower(-9, 5, 8, 9); tower(9, 5, 8, 9);
    const clock = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.2, 16), mat(0xf4efe0, "clock face", 0.6));
    clock.rotation.x = Math.PI / 2; clock.position.set(0, 14, 12.05); g.add(clock);
    scene.add(g);
    block(slot, 24, 24, -1);
    return true;
  }

  // ------------------------------------------------------------ the general on his horse
  /** An equestrian statue on a stone plinth: the horse rears, the rider lifts his hat. Patinated bronze. */
  function statue(parent, x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g);
    const stone = mat(0xb8b2a4, "stone plinth", 0.95), bronze = mat(0x4f6a5a, "patina bronze", 0.5, { metalness: 0.6 });
    box(g, 4.6, 0.6, 3.2, stone, 0, 0.3, 0); box(g, 3.6, 2.4, 2.4, stone, 0, 1.8, 0); box(g, 4, 0.4, 2.8, stone, 0, 3.2, 0);
    const b = (w, h, d, px, py, pz, rx = 0, rz = 0) => { const m = box(g, w, h, d, bronze, px, py, pz); m.rotation.set(rx, 0, rz); return m; };
    b(0.9, 0.9, 2.2, 0, 4.9, -0.4, -0.55);                 // the horse's body, reared
    b(0.5, 1.6, 0.6, 0, 5.8, 0.75, -0.2);                  // neck
    b(0.5, 0.5, 1, 0, 6.6, 1.25);                          // head
    for (const s of [-1, 1]) { b(0.24, 1.5, 0.24, s * 0.3, 5.5, 1.5, 0.8); b(0.26, 1.7, 0.26, s * 0.3, 3.9, -1.1, -0.15); }   // forelegs up, hind legs planted
    b(0.5, 1, 0.5, 0, 6, -0.3);                            // the rider
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), bronze); head.position.set(0, 6.7, -0.3); g.add(head);
    b(0.9, 0.06, 0.9, 0, 6.95, -0.3); b(0.5, 0.3, 0.5, 0, 7.1, -0.3);   // the hat
    addBlocker(x, z, 2.6);
  }

  // ------------------------------------------------------------ the café that only sells beignets
  /** An open-air café: striped awning, wrought-iron tables under it, string lights, a sign. */
  function cafe(slot, { name = "CAFÉ DU MATIN", sub = "BEIGNETS · CAFÉ AU LAIT · 24 HRS" } = {}) {
    const g = group(slot), w = 13, d = 8;
    const wall = mat(0xf0ead8, "stucco wall", 0.9), green = mat(0x1f6a4a, "awning canvas green", 0.85), white = mat(0xf4f2ea, "awning canvas white", 0.85);
    box(g, w, 3.6, d, wall, 0, 1.8, -1);
    box(g, w + 0.6, 0.3, d + 0.6, mat(0x26282c, "roof plate", 0.8), 0, 3.75, -1);
    for (let i = 0; i < 13; i++) box(g, w / 13, 0.14, 4.6, i % 2 ? white : green, -w / 2 + (i + 0.5) * (w / 13), 3.3 - 0.0, d / 2 + 1.7).rotation.x = 0.16;   // the stripes
    for (const px of [-w / 2 + 0.4, 0, w / 2 - 0.4]) box(g, 0.1, 3, 0.1, mat(0x1a1a1c, "cast iron post", 0.5, { metalness: 0.6 }), px, 1.5, d / 2 + 3.9);
    const table = mat(0x1a1a1c, "cast iron table", 0.5, { metalness: 0.6 }), top = mat(0xe8e6de, "marble tabletop", 0.4);
    for (let i = 0; i < 5; i++) {
      const x = -5 + i * 2.5, z = d / 2 + 2.4;
      cyl(g, 0.5, 0.06, top, x, 0.78, z, 10); cyl(g, 0.06, 0.78, table, x, 0.39, z, 6);
      for (const s of [-1, 1]) box(g, 0.4, 0.5, 0.4, table, x + s * 0.8, 0.28, z);
    }
    box(g, 9, 1.2, 0.2, mat(0x0c0c10, "sign board back", 0.7), 0, 4.6, d / 2 - 0.9);
    sign(g, 8.6, 1.05, name, 0, 4.6, d / 2 - 0.78, "#f4f2ea", "#1f6a4a");
    sign(g, 5, 0.6, sub, 0, 3.3, d / 2 + 0.05, "#f4f2ea", "#1f6a4a");
    box(g, w + 2, 0.04, 0.04, glowMat(0xffd6a0, "string lights", 1), 0, 3.9, d / 2 + 4.2);        // a line of bulbs along the eave
    scene.add(g);
    block(slot, w, d, -1);
    return true;
  }

  // ------------------------------------------------------------ the paddle-wheel steamboat
  /**
   * A three-deck sternwheeler alongside a quay running along x: white hull and decks with rails, a
   * red paddlewheel at the stern, two black stacks crowned with filigree, a pilothouse and the name.
   */
  function steamboat(parent, x, z, { len = 46, name = "BELLE OF THE BAYOU" } = {}) {
    const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g);
    const white = mat(0xf4f2ea, "steamboat painted hull", 0.7), red = mat(0xb0281c, "paddle wheel paint", 0.6), black = mat(0x1a1a1c, "stack steel", 0.6), rail = mat(0xe8e6de, "deck rail", 0.7);
    const w = 11;
    box(g, len, 3.2, w, white, 0, 0.6, 0);                                       // the hull
    box(g, len - 6, 3.2, w - 1, white, -1, 3.6, 0);                              // main deck
    box(g, len - 14, 3, w - 3, white, -3, 6.7, 0);                               // boiler deck
    box(g, len - 24, 2.6, w - 5, white, -4, 9.6, 0);                             // texas deck
    box(g, 6, 2.6, w - 6, white, 4, 12.1, 0);                                    // the pilothouse
    box(g, 6.4, 0.3, w - 5.6, red, 4, 13.6, 0);
    for (const s of [-1, 1]) for (const [dy, dl] of [[5.35, len - 6], [8.4, len - 14], [11.3, len - 24]]) {   // the rails along every deck
      box(g, dl, 0.08, 0.08, rail, -1, dy, s * (w / 2 - 0.4));
      box(g, dl, 0.08, 0.08, rail, -1, dy - 0.5, s * (w / 2 - 0.4));
    }
    for (let i = 0; i < 14; i++) for (const s of [-1, 1]) box(g, 0.16, 1.5, 0.16, white, -len / 2 + 5 + i * ((len - 12) / 13), 4.6, s * (w / 2 - 0.5));   // the main-deck columns
    // the stern wheel: two discs of paddles
    const wheel = new THREE.Group(); wheel.position.set(-len / 2 - 1.2, 3.4, 0); g.add(wheel);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const p = box(wheel, 0.3, 2.2, w - 1.4, red, 0, 0, 0);
      p.position.set(0, Math.sin(a) * 3.4, Math.cos(a) * 0); p.position.set(Math.cos(a) * 3.4, Math.sin(a) * 3.4, 0);
      p.rotation.z = a;
    }
    cyl(wheel, 0.5, w - 1, black, 0, 0, 0, 8).rotation.x = Math.PI / 2;
    // the twin stacks
    for (const s of [-1, 1]) {
      cyl(g, 0.8, 12, black, len / 2 - 12, 15, s * 2.2, 10);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 0.9, 2, 10), black); crown.position.set(len / 2 - 12, 21.6, s * 2.2); g.add(crown);
    }
    box(g, 10, 1.4, 0.2, mat(0x0c0c10, "sign board back", 0.7), -3, 7.2, w / 2 - 1.4 + 0.15);
    sign(g, 9.6, 1.2, name, -3, 7.2, w / 2 - 1.4 + 0.3, "#f4f2ea", "#b0281c");
    for (let x0 = -len / 2 + 3; x0 < len / 2 - 2; x0 += 3) addBlocker(x + x0, z, 3.2);
    return g;
  }

  // ------------------------------------------------------------ Mardi Gras
  /** A parade float on a flatbed: a themed centrepiece in the krewe's colours, beads hanging off the rail. */
  function float(parent, x, z, ry, kind, colours = [0x6a2a8a, 0x2a8a4a, 0xd4af37]) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g);
    const [pu, gr, go] = colours, deck = mat(pu, "float flatbed paint", 0.7), skirt = mat(go, "float gold trim", 0.4, { metalness: 0.5 });
    box(g, 12, 0.5, 4.2, deck, 0, 1.2, 0); box(g, 12.2, 0.5, 4.4, skirt, 0, 0.7, 0);
    for (const px of [-4, 4]) for (const pz of [-1.9, 1.9]) cyl(g, 0.6, 0.5, mat(0x18181c, "tyre rubber", 0.9), px, 0.6, pz, 10).rotation.x = Math.PI / 2;
    const gm = mat(gr, "float papier mache green", 0.6), gm2 = mat(go, "float papier mache gold", 0.4, { metalness: 0.5 }), pm = mat(pu, "float papier mache purple", 0.6);
    if (kind === "gator") {
      box(g, 8, 1.6, 2, gm, 0, 2.5, 0); box(g, 3.6, 0.7, 1.7, gm, 5.6, 2.3, 0); box(g, 3.6, 0.5, 1.7, gm, 5.6, 3.1, 0).rotation.z = 0.25;   // the body, the jaws
      for (let i = 0; i < 6; i++) box(g, 0.4, 0.5, 0.4, gm2, -3 + i * 1.4, 3.6, 0);                                                      // spines
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), mat(0xf4f2ea, "float eye", 0.5)); e.position.set(4.2, 3.4, s * 0.6); g.add(e); }
    } else if (kind === "crown") {
      box(g, 4.4, 1.6, 4.4, gm2, 0, 2.5, 0);
      for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.6, 2.2, 4), gm2); c.position.set(-1.8 + i * 0.9, 4.4, 0); g.add(c); const j = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), pm); j.position.set(-1.8 + i * 0.9, 5.6, 0); g.add(j); }
    } else if (kind === "mask") {
      box(g, 3.6, 4.4, 0.6, pm, 0, 3.7, 0);
      for (const s of [-1, 1]) { box(g, 0.9, 0.5, 0.7, gm2, s * 0.9, 4.4, 0.05); const f = new THREE.Mesh(new THREE.ConeGeometry(0.4, 2.6, 4), gm); f.position.set(s * 2.4, 5.4, 0); f.rotation.z = -s * 0.5; g.add(f); }
    } else {                                                                              // fleur-de-lis on a tower
      box(g, 1.4, 4, 1.4, gm2, 0, 3.4, 0);
      for (const [dx, dy, rz] of [[0, 6.2, 0], [-1.1, 5.5, 0.9], [1.1, 5.5, -0.9]]) { const p = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.4, 4), pm); p.position.set(dx, dy, 0); p.rotation.z = rz; g.add(p); }
    }
    const beads = [0x6a2a8a, 0x2a8a4a, 0xd4af37];
    for (let i = 0; i < 18; i++) box(g, 0.08, 0.9 + hash(x + i, z, 2) * 0.7, 0.08, mat(beads[i % 3], "mardi gras beads", 0.4), -5.5 + i * 0.65, 1.0, 2.25);   // strings of beads over the front rail
    addBlocker(x, z, 3.4);
    return g;
  }

  // ------------------------------------------------------------ Cajun roadside
  /** A dance hall: long low barn, tin roof, a porch strung with lights, a neon name, the parking out front. */
  function danceHall({ name = "WHISKEY RIVER DANCE HALL" } = {}) {
    return (slot) => {
      const g = group(slot), w = 24, d = 13;
      const wall = mat(pick([0x8a5a3a, 0x6a7a8a, 0x9a3a2a], hash(slot.x, slot.z, 1)), "painted wood siding", 0.85), tin = mat(0x8a8f96, "tin roof", 0.6);
      box(g, w, 5, d, wall, 0, 2.5, 0);
      gable(g, d + 1.4, 3.2, w + 1, tin, 0, 5, 0, Math.PI / 2);
      box(g, w, 0.2, 3.4, mat(0x6a4a30, "wood plank deck", 0.9), 0, 0.5, d / 2 + 1.7);
      box(g, w, 0.16, 3.6, tin, 0, 3.4, d / 2 + 1.8);
      for (let i = 0; i <= 8; i++) box(g, 0.16, 2.9, 0.16, mat(0x4a3826, "wood post", 0.9), -w / 2 + i * (w / 8), 1.9, d / 2 + 3.3);
      box(g, w, 0.05, 0.05, glowMat(0xffd6a0, "string lights", 1), 0, 3.0, d / 2 + 3.4);
      for (let i = 0; i < 4; i++) box(g, 1.4, 1.5, 0.1, kit.windowMat(0.2), -8 + i * 5.4, 2.6, d / 2 + 0.05);
      box(g, 1.6, 2.6, 0.1, mat(0x2a1a10, "wood door", 0.8), 0, 1.5, d / 2 + 0.06);
      box(g, 10.4, 1.7, 0.3, mat(0x0c0c10, "sign board back", 0.7), 0, 7.6, d / 2 - 0.1);
      sign(g, 10, 1.4, name, 0, 7.6, d / 2 + 0.07, "#ffd27a", "#3a1208");
      scene.add(g);
      block(slot, w, d);
      return true;
    };
  }
  /** A daiquiri drive-thru: a pastel kiosk with a drive lane through it and a giant cup on the roof. */
  function daiquiri({ name = "DAIQUIRI DRIVE-THRU" } = {}) {
    return (slot) => {
      const g = group(slot), pink = mat(pick([0xf0a0c8, 0xa0e0d8, 0xf0d070], hash(slot.x, slot.z, 1)), "stucco wall", 0.85);
      box(g, 9, 4.2, 6, pink, -3, 2.1, 0);
      box(g, 9.6, 0.3, 6.6, mat(0xf4f2ea, "painted trim", 0.8), -3, 4.35, 0);
      box(g, 6.4, 0.2, 7, mat(0xf4f2ea, "painted trim", 0.8), 4.5, 3.6, 0);                      // the drive-through canopy
      for (const s of [-1, 1]) box(g, 0.2, 3.5, 0.2, mat(0xf4f2ea, "painted post", 0.8), 7.4, 1.75, s * 3.1);
      box(g, 1.6, 1.1, 0.12, kit.lamp(), 1.5, 1.9, 3.06);                                          // the serving window
      box(g, 6.4, 0.04, 6.6, mat(0x55575a, "asphalt drive lane", 0.95), 4.5, 0.03, 0);
      // the cup: a cone, a lid, a straw, in neon
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.1, 2.8, 12), glowMat(0xff4fb3, "neon cup", 0.9)); cup.position.set(-3, 6, 0); g.add(cup);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.3, 12), mat(0xf4f2ea, "cup lid plastic", 0.4)); lid.position.set(-3, 7.5, 0); g.add(lid);
      box(g, 0.14, 2, 0.14, glowMat(0x5ae0ff, "neon straw", 1), -2.5, 8.6, 0).rotation.z = -0.3;
      box(g, 8, 1, 0.2, mat(0x0c0c10, "sign board back", 0.7), -3, 3.4, 3.15);
      sign(g, 7.8, 0.9, name, -3, 3.4, 3.28, "#ff9ad5", "#180a12");
      scene.add(g);
      block(slot, 9, 6, 0);
      return true;
    };
  }

  return { liveOaks, gallery, cathedral, statue, cafe, steamboat, float, danceHall, daiquiri, glowMat };
}
