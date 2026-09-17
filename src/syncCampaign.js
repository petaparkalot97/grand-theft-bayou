// ---------------------------------------------------------------------------
// syncCampaign.js — Sync's own campaign: "THE TRIALS".
//
// Source: the human's brief (2026-09-17, extended 2026-09-17). Sync sits his
// crew down with a confession: he has to have children or his Uncle Roscoe
// is going to be angry. Why? "You wouldn't understand." Nobody understands.
// Nobody argues either — that's what family's for. They pile into a van and
// the night's work begins.
//
//   Mission 1 — KESEME'S AWAKENING (added later the same day): before Sync
//   can start a family, Keseme has one thing of her own to settle. Drive her
//   to Dr. Amara Veaux's clinic across the causeway. When she walks out,
//   she walks out Keseme Nadia for good. (The male voice the manifest
//   generated for her lines is canon now: Roscoe paid for the operation.
//   Nobody asks. It's family business.)
//
//   Mission 2 — FAMILY TREE: a proper GTA-III-style loop. Cruise the night
//   strip, HONK at the girls, let one climb in, and drive her somewhere
//   secluded. Every drop is a potential Sync Jr. Roscoe's tally board fills.
//
// The clinic interior is a sealed set under the map (y = -40, like the
// campaign porch sets) so it never fights real-world placement; the trip
// itself is a real drive on real roads. Mission 2 runs on the existing
// prostitute solicit flow (main.js honkHorn → npc.js approaching_car),
// extended with a secluded-drop detection so the joke pays off mechanically.
// ---------------------------------------------------------------------------

import * as THREE from "three";

const CLINIC = { x: -200, y: -40, z: 300 };   // sealed clinic set, clear of every other sealed room

// The crew car spawns beside Sync's yard, and Dr. Veaux's clinic fronts a
// real corner in OrleaRouge (the hospital block, x≈-26 z≈350) — a real drive
// down US-167 and the causeway, not a teleport.
const VAN_SPOT = { x: 20, z: 118 };
const CLINIC_FRONT = { x: -26, z: 342, r: 12 };   // kerbside in front of the hospital block
const CREW = ["chimi", "dixon", "gr33do", "peta"];

// Secluded drop spots: the old gas-station lot, Bayou Noir's church steps,
// the causeway camp under the overpass, the cemetery gates. All far from
// the strip's crowd sinks, all reachable by road.
const SECLUDED = [
  { name: "the old gas-station lot",  x: -11, z: -142, r: 24 },
  { name: "Bayou Noir church steps",  x: -246, z: -30,  r: 26 },
  { name: "the causeway overpass camp", x: -28, z: 176, r: 22 },
  { name: "the OrleaRouge cemetery gate", x: -110, z: 344, r: 24 },
];

export function createSyncCampaign(ctx) {
  const { scene, cine, state, playerPos, getPlayer, makeActor, flashObjective, setObjective } = ctx;
  const makeHoodrat = ctx.makeHoodrat || (() => null);
  const props = [];
  const room = new THREE.Group();
  const actors = {};
  let openingRunning = false, openingPlayed = false;
  let phase = "idle";      // idle | opening | driveKeseme | awakening | hunt | done
  let passengers = 0;      // girls currently in the van
  let conceptionCount = 0; // Roscoe's tally: completed secluded visits
  let dropFlash = 0;       // objective flash cooldown
  let van = null;          // the crew van (a main.js-registered vehicle)
  let swapTimer = 0;       // the awakening model-swap glitch

  function add(mesh) { room.add(mesh); props.push(mesh); return mesh; }
  function box(w, h, d, color, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return add(m);
  }

  function buildSet() {
    props.push(room);
    room.position.set(CLINIC.x, CLINIC.y, CLINIC.z);
    // A clean little waiting room: floor, back wall, reception desk, two
    // chairs, a pot plant, and a door-shaped dark gap between wall panels.
    add(box(16, 0.3, 10, 0xd8d4c8, 0, -0.15, 0));
    add(box(16, 5, 0.4, 0xe4e0d4, 0, 2.5, -5));
    add(box(16, 5, 0.4, 0xe4e0d4, -8 + 0.4, 2.5, 0));     // left wall
    add(box(0.4, 5, 10, 0xe4e0d4, 8 - 0.4, 2.5, 0));      // right wall
    add(box(4.4, 1.1, 1.2, 0x8f9a94, -3, 0.55, -3.4));    // reception desk
    add(box(1.1, 0.5, 1.1, 0x4a4f4c, -3, 0.3, -2.6));     // chair, the doctor's side
    add(box(1.1, 0.5, 1.1, 0x6a5a7a, 2.5, 0.25, -3.6));   // waiting chair
    add(box(1.1, 0.5, 1.1, 0x6a5a7a, 4.2, 0.25, -3.6));   // waiting chair
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.6, 8), new THREE.MeshStandardMaterial({ color: 0x9a6a4a, roughness: 0.9 }));
    pot.position.set(6.4, 0.3, -4.2); add(pot);
    const fern = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 6), new THREE.MeshStandardMaterial({ color: 0x3a6a3a, roughness: 0.9 }));
    fern.position.set(6.4, 1.1, -4.2); add(fern);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff2cc }));
    lamp.position.set(0, 4.6, -4.5); add(lamp);
    // the door: a dark recess between the back wall and the right wall
    add(box(1.8, 3.2, 0.3, 0x14161a, 6.9, 1.6, -4.4));

    actors.sync = makeActor ? makeActor("sync") : makeHoodrat({ sex: "m", seed: 5511, height: 1.85 });
    actors.keseme = makeActor ? makeActor("keseme") : null;
    actors.dr = makeHoodrat({ sex: "f", seed: 1201, height: 1.72, skin: 0xe0c0a0, top: 0xf0f0ee, hair: 0x6a4a30, headwear: "none", crew: { cloth: 0xf0f0ee, chain: 0xcccccc, shoe: 0xdddddd } });
    actors.chimi = makeActor ? makeActor("chimi") : null;
    actors.dixon = makeActor ? makeActor("dixon") : null;
    actors.gr33do = makeActor ? makeActor("gr33do") : null;
    actors.peta = makeActor ? makeActor("peta") : null;

    // Sync and the doctor start inside; Keseme enters during the scene.
    actors.sync.position.set(-2.5, 0, 1.5); actors.sync.rotation.y = Math.PI * 0.85;
    actors.dr.position.set(-3, 0, -2.6); actors.dr.rotation.y = 0.4;
    room.add(actors.sync, actors.dr);
    for (const k of ["keseme", "chimi", "dixon", "gr33do", "peta"]) if (actors[k]) room.add(actors[k]);
    for (const a of Object.values(actors)) if (a) a.visible = false;
    scene.add(room);
    room.visible = false;
  }

  function local(v) { return [CLINIC.x + v[0], CLINIC.y + v[1], CLINIC.z + v[2]]; }
  function showActors(names) {
    for (const [k, a] of Object.entries(actors)) if (a) a.visible = names.includes(k);
  }

  // ------------------------------------------------------------- the opening
  // The crew gathers at Sync's yard (the strip, by the spawn). Keseme is NOT
  // here — Sync mentions her; the van picks her up as Mission 1.
  function start() {
    if (openingRunning || openingPlayed) return;
    openingRunning = true; openingPlayed = true;
    room.visible = false;
    state.cinematic = true; if (getPlayer()) getPlayer().visible = false;
    const run = cine.scene(async (c) => {
      c.letterbox(true);
      // Sync addresses the crew around the van, under the streetlights.
      await c.caption("Dusk. Sync's yard, behind the lots on US-167. The whole crew is here, and nobody knows why.", 3.0);
      await c.caption("SYNC: He called them all together. Nobody argues with a man who talks like that.", 2.6);
      await c.say("SYNC", "I'm gonna say this once, and I need y'all to hear it.", 3.4);
      await c.say("SYNC", "I have to have children. That's just how it is.", 3.2);
      await c.say("CHIMI", "Run that by me again, fam. Children? YOU?", 2.8);
      await c.say("DIXON", "The Uncle.", 1.6);
      await c.say("SYNC", "The Uncle. If I show up to the next reunion without kids, he's gonna be angry. And you do NOT want my Uncle angry.", 4.4);
      await c.say("PETA", "Why would he be angry though? Like, what does he even—", 2.6);
      await c.say("SYNC", "You wouldn't understand.", 2.2);
      await c.caption("Nobody understands. Everybody drops it. That's how the Uncle's name works in this family.", 2.8);
      await c.say("SYNC", "That's why I called y'all. This is a family thing. I need my family tonight.", 3.6);
      await c.say("GR33DO", "Say less. What are we doing?", 2.0);
      await c.say("SYNC", "First — we collect Keseme. There's something she needs done before any of this. It's her night, not mine.", 4.2);
      await c.say("SYNC", "Then... we handle my side of it. And Roscoe's watching. Roscoe's ALWAYS watching.", 3.6);
      await c.title("KESEME'S AWAKENING", 2.2);
      await c.card("MISSION 1", "KESEME'S AWAKENING", "Get Keseme to Dr. Veaux's clinic in OrleaRouge before sundown. The van's out front.", { center: true, hold: 3.0 });
    });
    run.then(beginDriveToClinic, beginDriveToClinic).finally(() => { openingRunning = false; });
  }

  function replay() { if (openingRunning) return; openingPlayed = false; start(); }

  // ------------------------------------------------------- Mission 1: drive
  function beginDriveToClinic() {
    room.visible = false; showActors([]);
    if (getPlayer()) getPlayer().visible = true;
    state.cinematic = false; cine.releaseCamera();
    phase = "driveKeseme";
    ensureVan();
    flashObjective("KESEME'S AWAKENING — get the van and get Keseme to the clinic");
    // Keseme waits by the road; walk to her to pick her up.
    if (!actors.kesemeMarker) {
      actors.kesemeMarker = new THREE.Mesh(
        new THREE.ConeGeometry(0.7, 1.6, 4),
        new THREE.MeshBasicMaterial({ color: 0x7ee87e })
      );
      actors.kesemeMarker.position.set(-6, 5.5, 132);
      scene.add(actors.kesemeMarker);
      props.push(actors.kesemeMarker);
    }
    actors.kesemeMarker.visible = true;
  }

  // Mission-1 legs: "toKeseme" (on foot / any car) → "toClinic" (in the van,
  // with Keseme aboard) → the clinic scene.
  let leg = "toKeseme";

  function ensureVan() {
    if (van && typeof ctx.respawnVan === "function") { ctx.respawnVan(van); return; }
    if (van || !ctx.spawnCrewVan) return;
    van = ctx.spawnCrewVan(VAN_SPOT.x, VAN_SPOT.z);
    if (van) van.userData.syncCampaign = true;
  }

  function mission1Update() {
    ensureVan();
    const p = getPlayer() ? getPlayer().position : playerPos;
    if (leg === "toKeseme") {
      setObjective("KESEME'S AWAKENING — pick up Keseme at the county road");
      const kx = -6, kz = 132;
      if (Math.hypot(p.x - kx, p.z - kz) < 6 && !state.cinematic) {
        leg = "toClinic";
        actors.kesemeMarker.visible = false;
        flashObjective("Keseme's aboard. The clinic is in OrleaRouge, past the causeway.");
        if (!state.veh) flashObjective("Get the van out front — or any car. Keseme doesn't care. Keseme needs this.");
      }
    } else if (leg === "toClinic") {
      setObjective("KESEME'S AWAKENING — drive Keseme to Dr. Veaux's clinic in OrleaRouge");
      const d = Math.hypot(p.x - CLINIC_FRONT.x, p.z - CLINIC_FRONT.z);
      if (d < CLINIC_FRONT.r && !state.cinematic) {
        leg = "arrived";
        awakeningScene();
      }
    }
  }

  // The clinic scene: Keseme goes in. What happens inside stays inside.
  // She walks out Keseme Nadia — for the first time.
  function awakeningScene() {
    room.visible = true; state.cinematic = true;
    showActors(["sync", "keseme", "dr"]);
    if (getPlayer()) getPlayer().visible = false;
    if (state.veh) { state.veh.speed = 0; state.veh = null; }
    return cine.scene(async (c) => {
      c.letterbox(true);
      await c.black(true, 0.6);
      await c.shot({ from: local([4, 2.2, 6]), to: local([1.5, 1.9, 3.5]), look: local([-2.5, 1.3, 1]), dur: 1.6 });
      await c.caption("Dr. Amara Veaux's clinic. The waiting room smells like bleach and orchids.", 2.8);
      await c.say("KESEME", "Sync. You didn't have to come in with me.", 2.6);
      await c.say("SYNC", "Family rides together. Even into the weird little clinics.", 3.0);
      await c.say("DR. VEAUX", "Keseme? We're ready for you. The paperwork's... already done.", 3.2);
      await c.caption("Keseme looks at Sync. Sync looks at the floor. Somewhere, a phone buzzes: ROSCOE.", 2.8);
      await c.say("SYNC", "It's not from me. He just... knows these things. Go on, Kes. I'll be right here.", 4.0);
      await c.caption("The door closes. The waiting room is very quiet.", 2.0);
      await c.shot({ from: local([6, 1.6, 2]), to: local([4, 1.6, -1]), look: local([-3, 1.2, -2.6]), dur: 2.2 });
      await c.caption("Paper rustles. A machine beeps twice and stops. The orchid on the desk is fake. Everything else is very, very real.", 3.4);
      await c.say("DR. VEAUX", "It went perfectly. When you walk out that door, you walk out Keseme Nadia. Nobody gets to tell you different.", 4.6);
      await c.say("KESEME", "Thank you, doctor. Sync — drop the boys off. You've got your own night ahead of you.", 3.8);
      await c.say("SYNC", "You sure you're good? I can drive you anywhere.", 2.4);
      await c.say("KESEME", "I've never been more sure of anything. GO. Make your Uncle proud. Make YOURSELF proud.", 4.0);
      await c.caption("She walks out Keseme Nadia. First morning of the rest of her life.", 2.6);
      await c.say("UNCLE", "That's my boy's family takin' care of family. Now GO FILL THAT VAN, NEPHEW.", 3.4);
      await c.title("MISSION PASSED", 2.0);
      await c.card("MISSION 1 COMPLETE", "KESEME'S AWAKENING", "Respect++ · The Uncle has been informed. He is pleased.", { center: true, hold: 2.8 });
    }).then(beginHunt, beginHunt);
  }

  // ------------------------------------------------ Mission 2: family tree
  function beginHunt() {
    room.visible = false; showActors([]);
    if (getPlayer()) getPlayer().visible = true;
    state.cinematic = false; cine.releaseCamera();
    phase = "hunt";
    passengers = 0;
    ensureVan();
    flashObjective("FAMILY TREE — honk at the girls, fill the van, find somewhere secluded");
    cine.scene((c) => c.caption("GTA-III rules, nephew: pull up slow, HONK, and let her come to you. Then drive somewhere private.", 3.4));
  }

  // Called by main.js when a prostitute has entered the player's vehicle.
  function onPassengerEntered() {
    if (phase !== "hunt") return;
    passengers++;
    flashObjective(`Aboard. ${passengers} in the van. Roscoe's tally: ${conceptionCount}. Find somewhere SECLUDED.`);
  }

  // Called by main.js when a passenger leaves the vehicle (kicked, dead car,
  // the girl's own timer). Keeps the hunt counters honest.
  function onPassengerLeft() {
    if (phase !== "hunt") return;
    passengers = Math.max(0, passengers - 1);
  }

  function huntUpdate(dt) {
    if (dropFlash > 0) dropFlash -= dt;
    ensureVan();
    const car = state.veh;
    const p = car ? car.obj.position : playerPos;
    // Secluded check: stopped, with at least one girl aboard, at a drop spot.
    if (car && passengers > 0 && Math.abs(car.speed || 0) < 0.6) {
      for (const s of SECLUDED) {
        if (Math.hypot(p.x - s.x, p.z - s.z) < s.r) {
          completeDrop(s);
          break;
        }
      }
    }
  }

  function completeDrop(spot) {
    conceptionCount++;
    passengers = Math.max(0, passengers - 1);
    flashObjective(`ROSCOE'S TALLY: ${conceptionCount} — "THAT'S MY NEPHEW!" · keep fishing (${passengers} still aboard)`);
    dropFlash = 3;
    cine.scene(async (c) => {
      await c.caption(`Somewhere secluded — ${spot.name}. The van rocks gently. On the radio, a weather report: clear skies, family values.`, 3.0);
      if (conceptionCount === 1) {
        await c.say("UNCLE", "One?! ONE?! I said CHILDREN, plural! Keep driving, boy!", 3.2);
      } else if (conceptionCount === 3) {
        await c.say("UNCLE", "Three! Now we're talkin'! Roscoe's heart is growin' three sizes!", 3.2);
      } else if (conceptionCount === 5) {
        await c.say("UNCLE", "FIVE! I'm rentin' the hall! The GOOD hall!", 2.8);
      } else {
        await c.say("UNCLE", ["Roscoe sees you, nephew. Roscoe ALWAYS sees.", "More. The Uncle demands MORE.", "You're a legend of the family tree, boy."][conceptionCount % 3], 2.8);
      }
    });
    if (conceptionCount >= 5 && phase === "hunt") {
      // keep free-roaming — the campaign stays open, the Uncle stays hungry
      setTimeout(() => { if (phase === "hunt") finale(); }, 1200);
    }
  }

  function finale() {
    phase = "finale";
    state.cinematic = true;
    if (getPlayer()) getPlayer().visible = false;
    room.visible = true; showActors(["sync"]);
    cine.scene(async (c) => {
      c.letterbox(true);
      await c.say("UNCLE", "NEPHEW. FIVE GRANDKIDS IN ONE NIGHT. ROSCOE IS OFFICIALLY OFF YOUR BACK.", 4.0);
      await c.say("SYNC", "You still gonna tell me why it had to be like this, Unc?", 2.8);
      await c.say("UNCLE", "...", 1.4);
      await c.say("UNCLE", "You wouldn't understand.", 2.2);
      await c.caption("The line goes dead. Family is family.", 2.2);
      await c.title("THE TRIALS: COMPLETE", 2.2);
    }).then(() => {
      room.visible = false; showActors([]);
      if (getPlayer()) getPlayer().visible = true;
      state.cinematic = false; cine.releaseCamera();
      phase = "done";
      flashObjective("Free roam. The Uncle is satisfied. For now.");
    }, () => {
      if (getPlayer()) getPlayer().visible = true;
      state.cinematic = false; cine.releaseCamera();
      phase = "done";
    });
  }

  // ------------------------------------------------------------- tick
  function update(dt) {
    if (state.cinematic) {
      for (const a of Object.values(actors)) if (a && a.visible && a.update) a.update(dt);
      // the awakening glitch: Keseme's swap ticks only inside the clinic scene
      if (phase === "awakening" && swapTimer > 0) {
        swapTimer -= dt;
        if (swapTimer <= 0) swapKeseme();
      }
      return;
    }
    if (phase === "driveKeseme") mission1Update();
    else if (phase === "hunt") huntUpdate(dt);
  }

  // Keseme's model swap: the campaign makes the player character canonical.
  // In-fiction: she walks out of the clinic. In-engine: replacePlayerCharacter.
  function swapKeseme() {
    if (typeof ctx.replacePlayerCharacter === "function") ctx.replacePlayerCharacter("keseme", { sex: "f" });
  }

  return {
    buildSet, start, replay,
    onPassengerEntered, onPassengerLeft,
    get props() { return props; },
    get phase() { return phase; },
    get conceptionCount() { return conceptionCount; },
    get passengers() { return passengers; },
    get van() { return van; },
    get waypoint() {
      if (phase === "driveKeseme" && leg === "toKeseme") return { x: -6, z: 132, r: 8 };
      if (phase === "driveKeseme" && leg === "toClinic") return { x: CLINIC_FRONT.x, z: CLINIC_FRONT.z, r: CLINIC_FRONT.r };
      return null;
    },
    // Exposed for the QA harness and future missions.
    __test: {
      beginHunt, completeDrop, ensureVan, mission1Update,
      setVan: (v) => { van = v; van.userData.syncCampaign = true; },
      setLeg: (l) => { leg = l; },
      SECLUDED, CLINIC_FRONT, VAN_SPOT,
    },
  };
}
