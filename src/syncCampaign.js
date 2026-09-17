// ---------------------------------------------------------------------------
// syncCampaign.js — Sync's own campaign: "THE TRIALS".
//
// Source: the human's brief (2026-09-17), reworked per the human's own
// follow-up to drop the original mission concept entirely. Sync gathers the
// crew (Chimi, Dixon, Gr33do, Peta) because Uncle Roscoe — heard but never
// seen, always by phone — has decreed that Sync must complete four old
// family "Trials" by sundown or lose his inheritance. The crew doesn't
// understand the Trials and Sync won't explain them; they help anyway. The
// mission itself is a GTA-style drive-to-checkpoints collection run, reusing
// bluelight.js's proven lead/distance-check pattern, routed through three of
// TASK-041's new state-wide regions plus the original map.
//
// Sync's garage (the cast's hangout) is a sealed set under the map (y = -40,
// same convention as Act One's kitchen, Welcome Back's Sheriff's Office and
// Greedo's porch) so it never competes with real-world placement. Uncle
// Roscoe has no physical model — he's a phone voice throughout, which is
// both simpler and funnier than giving him a body.
// ---------------------------------------------------------------------------

import * as THREE from "three";

const GARAGE = { x: -300, y: -40, z: -300 };   // sealed set, clear of every other sealed room

// Four trials across the state — three of them route through TASK-041's new
// regions (Chatboro is the original map; the rest are the state-wide
// expansion), so this mission also doubles as a tour of the new content.
const TRIALS = [
  { hint: "The ceremonial gator tooth — Uncle left it at the trailer park again.", x: -48, z: 116, r: 20,
    react: "The tooth?! Already? Fine. Three more, Sync. Sundown doesn't move for anybody." },
  { hint: "The ship's bell off the old lighthouse at Port Calypso.", x: 1020, z: -980, r: 20,
    react: "The bell rings true. Your grandfather would be — actually he'd still be disappointed. Keep going." },
  { hint: "The lucky fishing lure, out at the Lakeshore Marsh shacks.", x: -680, z: 820, r: 20,
    react: "That lure caught your great-uncle's third wife. Sentimental value. One left." },
  { hint: "The family flag, still flying over the Cypress Hills watchtower.", x: -950, z: -800, r: 20,
    final: true },
];

export function createSyncCampaign(ctx) {
  const { scene, cine, state, playerPos, getPlayer, makeActor, flashObjective, setObjective } = ctx;
  const props = [];
  const room = new THREE.Group();
  const actors = {};
  let openingRunning = false, openingPlayed = false;
  let phase = "idle";     // idle | opening | trials | resolve | done
  let trial = 0;

  function add(mesh) { room.add(mesh); props.push(mesh); return mesh; }
  function box(w, h, d, color, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.82 }));
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return add(m);
  }

  function buildSet() {
    props.push(room);
    room.position.set(GARAGE.x, GARAGE.y, GARAGE.z);
    // a cramped, cluttered garage: back wall, side walls, a workbench
    add(box(16, 5.5, 0.3, 0x3a3a3e, 0, 2.75, -6));
    add(box(0.3, 5.5, 12, 0x2c2c30, -8, 2.75, 0));
    add(box(0.3, 5.5, 12, 0x2c2c30, 8, 2.75, 0));
    add(box(16, 0.3, 12, 0x1c1c1e, 0, -0.15, 0));
    add(box(4, 0.9, 1.4, 0x4a3a2a, -4, 0.45, -4.8));    // workbench
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
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

  function beginTrials() {
    room.visible = false; showActors([]);
    if (getPlayer()) getPlayer().visible = true;
    state.cinematic = false; cine.releaseCamera();
    phase = "trials"; trial = 0;
    playerPos.set(-40, 0, 100);   // Chatboro, headed toward the first trial
    flashObjective("THE TRIALS");
  }

  function start() {
    if (openingRunning || openingPlayed) return;
    openingRunning = true; openingPlayed = true;
    room.visible = true;
    state.cinematic = true; if (getPlayer()) getPlayer().visible = false;
    showActors(["sync", "chimi", "dixon", "gr33do", "peta"]);
    const run = cine.scene(async (c) => {
      c.letterbox(true);
      await c.shot({ from: local([0, 2.2, 8]), to: local([0, 1.9, 4]), look: local([0, 1.2, -1]), dur: 1.4 });
      await c.say("SYNC", "Guys. I need your help. Tonight.");
      await c.say("CHIMI", "Bad help or fun help?");
      await c.say("SYNC", "My uncle just called. If I don't finish the Trials by sundown, I'm cut out of everything. The house. The boats. The airboat fleet.");
      await c.shot({ from: local([-3, 2.4, 6]), to: local([-2, 2.0, 3]), look: local([-1, 1.2, -1]), dur: 1.0 });
      await c.say("DIXON", "What Trials?");
      await c.say("SYNC", "You wouldn't understand. It's a whole family thing. Generations of it.");
      await c.say("SYNC", "I just need you with me. Please.", 2.4);
      await c.shot({ from: local([3, 2.2, 6]), to: local([2, 1.9, 3]), look: local([1, 1.2, -1]), dur: 0.9 });
      await c.say("GR33DO", "Say less. I'm always down for a fetch quest with actual stakes.");
      await c.say("PETA", "I have several thoughts on inheritance law. None of them helpful right now.");
      await c.say("CHIMI", "Let's go before Sync starts crying.", 2.0);
      await c.caption("They pile into whatever's parked outside and go looking for trouble.", 2.2);
      await c.title("THE TRIALS", 2.0);
      await c.card("MISSION", "THE TRIALS", "Uncle Roscoe wants proof before sundown. Go get it.", { center: true, hold: 2.6 });
    });
    run.then(beginTrials, beginTrials).finally(() => { openingRunning = false; });
  }

  function replay() { if (openingRunning) return; openingPlayed = false; start(); }

  function resolveScene() {
    room.visible = true; state.cinematic = true;
    showActors(["sync", "chimi", "dixon", "gr33do", "peta"]);
    if (getPlayer()) getPlayer().visible = false;
    return cine.scene(async (c) => {
      c.letterbox(true);
      await c.shot({ from: local([0, 2.2, 8]), to: local([0, 1.9, 4]), look: local([0, 1.2, -1]), dur: 1.2 });
      await c.say("SYNC", "We got everything. All four.");
      await c.say("UNCLE", "...Huh. You actually did it.", 2.2);
      await c.say("CHIMI", "We actually did it.");
      await c.say("UNCLE", "Doesn't mean you're off the hook. There's always a Trial Five.", 2.6);
      await c.say("SYNC", "There's never been a Trial Five.");
      await c.say("UNCLE", "There is now.", 1.6);
      await c.caption("Somewhere, Uncle Roscoe hangs up, satisfied for exactly four minutes.", 2.6);
      await c.title("THE TRIALS: SURVIVED (FOR NOW)", 2.2);
    }).then(finish);
  }

  function finish() {
    room.visible = false; showActors([]);
    if (getPlayer()) getPlayer().visible = true;
    state.cinematic = false; cine.releaseCamera();
    phase = "done";
    playerPos.set(-6, 0, 130);
    flashObjective("Free roam");
  }

  return {
    buildSet, start, replay,
    get props() { return props; },
    get waypoint() { return phase === "trials" ? TRIALS[trial] : null; },
    update(dt) {
      if (state.cinematic) { for (const a of Object.values(actors)) if (a.visible && a.update) a.update(dt); }
      if (phase !== "trials") return;
      const t = TRIALS[trial];
      setObjective(`THE TRIALS (${trial + 1}/${TRIALS.length}) — ${t.hint}`);
      if (Math.hypot(playerPos.x - t.x, playerPos.z - t.z) < t.r && !state.cinematic) {
        if (t.final) { phase = "resolve"; resolveScene(); }
        else { if (t.react) cine.scene((c) => c.say("UNCLE", t.react, 2.4)); trial++; }
      }
    },
  };
}
