// ---------------------------------------------------------------------------
// syncCampaign.js — Sync's first mission: "UNCLE SCUNTER'S ERRAND".
//
// Sync needs five prostitutes in the car and back at the drop-off before Uncle
// Scunter loses his patience. The mission deliberately uses the normal game
// interaction: stop near a prostitute, press H to honk, let her enter, then
// return to the drop-off. No special teleport or hidden collection logic.

import * as THREE from "three";

const GARAGE = { x: -300, y: -40, z: -300 };
const HOME = { x: -48, z: 116, r: 18 };
const REQUIRED = 5;

export function createSyncCampaign(ctx) {
  const { scene, cine, state, playerPos, getPlayer, makeActor, flashObjective, setObjective } = ctx;
  const props = [];
  const room = new THREE.Group();
  const actors = {};
  let openingRunning = false, openingPlayed = false;
  let phase = "idle"; // idle | opening | collect | return | resolve | done
  let collected = 0;
  let lastAnnounced = -1;
  let returnSceneRunning = false;

  function add(mesh) { room.add(mesh); props.push(mesh); return mesh; }
  function box(w, h, d, color, x, y, z) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: 0.82 })
    );
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    return add(m);
  }

  function buildSet() {
    props.push(room);
    room.position.set(GARAGE.x, GARAGE.y, GARAGE.z);
    add(box(16, 5.5, 0.3, 0x3a3a3e, 0, 2.75, -6));
    add(box(0.3, 5.5, 12, 0x2c2c30, -8, 2.75, 0));
    add(box(0.3, 5.5, 12, 0x2c2c30, 8, 2.75, 0));
    add(box(16, 0.3, 12, 0x1c1c1e, 0, -0.15, 0));
    add(box(4, 0.9, 1.4, 0x4a3a2a, -4, 0.45, -4.8));
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0 })
    );
    bulb.position.set(0, 5, 0); add(bulb);

    actors.sync = makeActor("sync");
    actors.chimi = makeActor("chimi");
    actors.dixon = makeActor("dixon");
    actors.gr33do = makeActor("gr33do");
    actors.peta = makeActor("peta");
    actors.sync.position.set(0, 0, 2.5); actors.sync.rotation.y = Math.PI;
    actors.chimi.position.set(-3.5, 0, 0); actors.chimi.rotation.y = 0.5;
    actors.dixon.position.set(-1.2, 0, -1); actors.dixon.rotation.y = 0.2;
    actors.gr33do.position.set(1.5, 0, -1); actors.gr33do.rotation.y = -0.2;
    actors.peta.position.set(3.5, 0, 0); actors.peta.rotation.y = -0.5;
    room.add(actors.sync, actors.chimi, actors.dixon, actors.gr33do, actors.peta);
    for (const a of Object.values(actors)) a.visible = false;
    scene.add(room);
    room.visible = false;
  }

  function local(v) { return [GARAGE.x + v[0], GARAGE.y + v[1], GARAGE.z + v[2]]; }
  function showActors(names) {
    for (const [k, a] of Object.entries(actors)) a.visible = names.includes(k);
  }

  function beginMission() {
    room.visible = false;
    showActors([]);
    if (getPlayer()) getPlayer().visible = true;
    state.cinematic = false;
    cine.releaseCamera();
    state.prostituteTrips = 0;
    phase = "collect";
    collected = 0;
    lastAnnounced = -1;
    playerPos.set(-6, 0, 130);
    flashObjective("UNCLE SCUNTER'S ERRAND — Honk near prostitutes to pick them up (H)");
  }

  function start() {
    if (openingRunning || openingPlayed) return;
    openingRunning = true;
    openingPlayed = true;
    phase = "opening";
    room.visible = true;
    state.cinematic = true;
    if (getPlayer()) getPlayer().visible = false;
    showActors(["sync", "chimi", "dixon", "gr33do", "peta"]);

    const run = cine.scene(async (c) => {
      c.letterbox(true);
      await c.shot({ from: local([0, 2.2, 8]), to: local([0, 1.9, 4]), look: local([0, 1.2, -1]), dur: 1.4 });
      await c.say("SYNC", "Holy shit guys Uncle Scunter is going to be furious if I'm not back here with 10 prostitutes soon!!");
      await c.say("CHIMI", "Why?");
      await c.say("SYNC", "Don't worry, I'll tell you later..");
      await c.shot({ from: local([-3, 2.4, 6]), to: local([-2, 2.0, 3]), look: local([-1, 1.2, -1]), dur: 1.0 });
      await c.say("DIXON", "Are you sure it's not something I can help you with?? Hehe..");
      await c.say("SYNC", "No! Quick, we gotta go get these whores NOW!!");
      await c.say("GREEDO", "I don't know what the plan is, but this is already the worst family emergency I've ever heard.");
      await c.say("PETA", "I'm choosing not to ask what Uncle Scunter intends to do with ten people.");
      await c.say("CHIMI", "At least take a car.");
      await c.caption("Sync grabs the nearest car. The crew points him toward the strip.", 2.2);
      await c.card("MISSION", "UNCLE SCUNTER'S ERRAND", "Pick up five prostitutes with H, then bring them home.", { center: true, hold: 2.6 });
    });
    run.then(beginMission, beginMission).finally(() => { openingRunning = false; });
  }

  function finish() {
    room.visible = false;
    showActors([]);
    if (getPlayer()) getPlayer().visible = true;
    state.cinematic = false;
    cine.releaseCamera();
    phase = "done";
    flashObjective("Free roam");
  }

  function resolveScene() {
    if (returnSceneRunning) return;
    returnSceneRunning = true;
    room.visible = true;
    state.cinematic = true;
    if (getPlayer()) getPlayer().visible = false;
    showActors(["sync", "chimi", "dixon", "gr33do", "peta"]);
    cine.scene(async (c) => {
      c.letterbox(true);
      await c.shot({ from: local([0, 2.2, 8]), to: local([0, 1.9, 4]), look: local([0, 1.2, -1]), dur: 1.2 });
      await c.say("SYNC", "There. Five prostitutes. Uncle Scunter better be happy now.");
      await c.say("CHIMI", "You said ten.");
      await c.say("SYNC", "I said five. You heard ten.");
      await c.say("DIXON", "I can help with the next five if you want. Hehe..");
      await c.say("PETA", "Nobody is helping with the next five.");
      await c.say("GREEDO", "Mission complete. Somehow.");
      await c.title("UNCLE SCUNTER'S ERRAND: COMPLETE", 2.2);
    }).then(finish, finish);
  }

  function replay() {
    if (openingRunning || returnSceneRunning) return;
    openingPlayed = false;
    phase = "idle";
    start();
  }

  return {
    buildSet,
    start,
    replay,
    get props() { return props; },
    get phase() { return phase; },
    get collected() { return collected; },
    get required() { return REQUIRED; },
    get waypoint() {
      if (phase === "return") return { x: HOME.x, z: HOME.z, r: HOME.r, hint: "Bring the passengers home" };
      if (phase === "collect") return { x: -6, z: 55, r: 120, hint: "Honk near prostitutes (H)" };
      return null;
    },
    update(dt) {
      if (state.cinematic) {
        for (const a of Object.values(actors)) if (a.visible && a.update) a.update(dt);
      }
      if (phase === "collect") {
        const trips = Math.min(REQUIRED, state.prostituteTrips || 0);
        if (trips > collected) {
          collected = trips;
          flashObjective(`UNCLE SCUNTER'S ERRAND — ${collected}/${REQUIRED} prostitute pickups complete`);
        }
        if (collected >= REQUIRED) {
          phase = "return";
          flashObjective("Bring the passengers home to the trailer park.");
        }
      } else if (phase === "return" && Math.hypot(playerPos.x - HOME.x, playerPos.z - HOME.z) < HOME.r && !state.cinematic) {
        if ((state.prostituteTrips || 0) >= REQUIRED) {
          phase = "resolve";
          resolveScene();
        }
      }
    },
  };
}
