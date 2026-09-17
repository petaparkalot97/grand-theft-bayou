// ---------------------------------------------------------------------------
// greedoCampaign.js — Gr33do's own campaign: "FIND PETA".
//
// Source: the human's brief (2026-09-17). Greedo goes looking for Peta,
// finds a stranger (XC) at the door instead, and learns Peta's turned
// Conservative right before an election. The chase: drive to a string of
// leads across the state before the real one turns up, then — since Peta
// won't listen to reason — go find Keseme to talk some sense into him.
//
// Peta's porch is a sealed set under the map (y = -40, like Act One's
// kitchen and Welcome Back's Sheriff's Office) so it never has to compete
// with real-world placement; it's invisible except while this opening plays.
// The search itself runs on the same checkpoint state-machine bluelight.js
// uses for the Blue Light Special escape, just without the police heat.
// ---------------------------------------------------------------------------

import * as THREE from "three";

const HOUSE = { x: 300, y: -40, z: 300 };   // sealed porch set, well clear of every other sealed room

// Decoy leads first, then Peta's actual location (the Lakeshore Marsh diner,
// TASK-041's newest region), then Keseme's turf once Peta won't budge.
const LEADS = [
  { hint: "Try the strip — someone said they saw him near Popeyes.", x: 24, z: 88, r: 10,
    note: "Just a guy who looks nothing like Peta, eating a biscuit." },
  { hint: "Check the rest stop out on Parish Highway 9.", x: -300, z: -40, r: 12,
    note: "Wrong guy again. This one has a better mustache." },
  { hint: "The riverboat casino in OrleaRouge — worth a look.", x: 48, z: 376, r: 10,
    note: "Not there either, but the pit boss says he owes money to \"a very online guy.\"" },
  { hint: "One more tip: the diner out past Lakeshore Marsh.", x: -910, z: 815, r: 14,
    peta: true },
];
const KESEME_STOP = { hint: "Find Keseme. She's the only one who can talk him down.", x: -6, z: 130, r: 10 };

export function createGreedoCampaign(ctx) {
  const { scene, cine, state, playerPos, getPlayer, makeActor, makeHoodrat, flashObjective, setObjective } = ctx;
  const props = [];
  const room = new THREE.Group();
  const actors = {};
  let openingRunning = false, openingPlayed = false;
  let phase = "idle";     // idle | opening | search | petaTalk | toKeseme | resolve | done
  let lead = 0;

  function add(mesh) { room.add(mesh); props.push(mesh); return mesh; }
  function box(w, h, d, color, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return add(m);
  }

  function buildSet() {
    props.push(room);
    room.position.set(HOUSE.x, HOUSE.y, HOUSE.z);
    // a modest porch: siding wall, a door-shaped gap implied by the actors
    // standing in it, a porch light and a step
    add(box(14, 6, 0.4, 0xb8ab8f, 0, 3, -3));
    add(box(14, 0.3, 6, 0x3a3a3a, 0, -0.15, 0));
    add(box(3, 0.3, 1.2, 0x8a8272, 0, 0.15, 2.4));    // porch step
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffdca0 }));
    light.position.set(3.5, 4.6, -2.8); add(light);

    actors.gr33do = makeActor("gr33do");
    actors.xc = makeHoodrat({ sex: "m", seed: 4471, height: 1.86, top: 0x2c2c30, denim: 0x1c1c1f, hair: 0x0d0d0d, headwear: "none", crew: { cloth: 0x2c2c30, chain: 0x555555, shoe: 0x151515 } });
    actors.peta = makeActor("peta");
    actors.keseme = makeActor("keseme");
    actors.gr33do.position.set(0, 0, 2.2); actors.gr33do.rotation.y = Math.PI;
    actors.xc.position.set(0, 0, -1.5); actors.xc.rotation.y = 0;
    actors.peta.position.set(-4, 0, -1.5); actors.keseme.position.set(4, 0, -1.5);
    room.add(actors.gr33do, actors.xc, actors.peta, actors.keseme);
    for (const a of Object.values(actors)) a.visible = false;
    scene.add(room);
    room.visible = false;
  }

  function local(v) { return [HOUSE.x + v[0], HOUSE.y + v[1], HOUSE.z + v[2]]; }
  function showActors(names) {
    for (const [k, a] of Object.entries(actors)) a.visible = names.includes(k);
  }

  function beginSearch() {
    room.visible = false; showActors([]);
    if (getPlayer()) getPlayer().visible = true;
    state.cinematic = false; cine.releaseCamera();
    phase = "search"; lead = 0;
    playerPos.set(24, 0, 68);   // strip, headed toward the first lead
    flashObjective("FIND PETA");
  }

  function start() {
    if (openingRunning || openingPlayed) return;
    openingRunning = true; openingPlayed = true;
    room.visible = true;
    state.cinematic = true; if (getPlayer()) getPlayer().visible = false;
    showActors(["gr33do", "xc"]);
    const run = cine.scene(async (c) => {
      c.letterbox(true);
      await c.shot({ from: local([0, 2.2, 7]), to: local([0, 1.9, 4]), look: local([0, 1.2, -1]), dur: 1.4 });
      await c.caption("Gr33do's bored. He knows one thing that fixes bored: bother Peta.", 2.2);
      c.sfx("squeal", 0.3);
      await c.caption("Nobody answers the door. From inside — unmistakably — the sound of somebody having a very good time.", 2.6);
      await c.say("GR33DO", "Oi Peta!! The horse is here!! Can you hear me?!! Are you banging that whore Keseme again?!!", 3.6);
      await c.shot({ from: local([-1, 2.4, 6]), to: local([-1, 1.9, 3]), look: local([0, 1.3, -1.5]), dur: 1.0 });
      await c.caption("The door opens. It is not Peta.", 1.6);
      await c.say("XC", "The name's XC, mate. Peta isn't here right now. And he's voting for Trump.");
      await c.say("GR33DO", "What... No... It can't be? How...?", 2.6);
      await c.shot({ from: local([1, 2.1, 5]), to: local([0.5, 1.9, 3]), look: local([-1, 1.3, -1.8]), dur: 0.9 });
      await c.say("XC", "It's too late — you'll never find him before voting's over. HAHAHAHAHAA!", 3.4);
      await c.title("FIND PETA", 2.0);
      await c.card("MISSION", "FIND PETA", "Track him down before he votes, and talk him out of it.", { center: true, hold: 2.6 });
    });
    run.then(beginSearch, beginSearch).finally(() => { openingRunning = false; });
  }

  function replay() { if (openingRunning) return; openingPlayed = false; start(); }

  function petaScene() {
    room.visible = true; state.cinematic = true;
    showActors(["gr33do", "peta"]);
    if (getPlayer()) getPlayer().visible = false;
    return cine.scene(async (c) => {
      c.letterbox(true);
      await c.shot({ from: local([0, 2.1, 6]), to: local([0, 1.9, 3]), look: local([-2, 1.2, -1]), dur: 1.1 });
      await c.say("GR33DO", "There you are! Come on man, this Trump thing — it's not you.");
      await c.say("PETA", "It's exactly me. I've never felt more canonical.");
      await c.say("GR33DO", "You're the Prince! You debate people into the dirt, you don't fall for this!");
      await c.say("PETA", "I debated myself. I won.");
      await c.caption("He won't budge. There's only one person stubborn enough to out-argue him.", 2.6);
      await c.say("GR33DO", "Fine. I'm getting Keseme.", 1.8);
    }).then(() => { room.visible = false; showActors([]); if (getPlayer()) getPlayer().visible = true; state.cinematic = false; cine.releaseCamera(); phase = "toKeseme"; flashObjective("Find Keseme — she's the only one who can talk Peta down"); });
  }

  function resolveScene() {
    room.visible = true; state.cinematic = true;
    showActors(["gr33do", "peta", "keseme"]);
    if (getPlayer()) getPlayer().visible = false;
    return cine.scene(async (c) => {
      c.letterbox(true);
      await c.shot({ from: local([0, 2.2, 7]), to: local([0, 1.9, 4]), look: local([0, 1.2, -1]), dur: 1.2 });
      await c.say("GR33DO", "Keseme, he's gone full Conservative. You're the only one who can snap him out of it.");
      await c.say("KESEME", "Of course it's me. It's always me.");
      await c.say("PETA", "Keseme? Oh no. Not the debate voice.");
      await c.say("KESEME", "Sit down, Peta. We're talking about your policy positions until you remember who you are.");
      await c.caption("Twenty minutes later, Peta remembers who he is.", 2.4);
      await c.say("PETA", "Okay. Okay! I take it back. All of it. Every position.", 2.2);
      await c.say("GR33DO", "There he is.", 1.4);
      await c.title("PETA IS BACK", 2.0);
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
    get waypoint() {
      if (phase === "search") return LEADS[lead];
      if (phase === "toKeseme") return KESEME_STOP;
      return null;
    },
    update(dt) {
      if (state.cinematic) { for (const a of Object.values(actors)) if (a.visible && a.update) a.update(dt); }
      if (phase === "search") {
        const t = LEADS[lead];
        setObjective(`FIND PETA (${lead + 1}/${LEADS.length}) — ${t.hint}`);
        if (Math.hypot(playerPos.x - t.x, playerPos.z - t.z) < t.r && !state.cinematic) {
          if (t.peta) { phase = "petaTalk"; petaScene(); }
          else { if (t.note) cine.scene((c) => c.caption(t.note, 2.2)); lead++; }
        }
      } else if (phase === "toKeseme") {
        setObjective(`FIND PETA — ${KESEME_STOP.hint}`);
        if (Math.hypot(playerPos.x - KESEME_STOP.x, playerPos.z - KESEME_STOP.z) < KESEME_STOP.r && !state.cinematic) {
          phase = "resolve"; resolveScene();
        }
      }
    },
  };
}
