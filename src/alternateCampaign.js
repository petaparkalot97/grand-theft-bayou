import * as THREE from "three";

// Alternate campaign opening. It uses the existing cinema timeline and camera
// ownership; there is no second game loop or second player controller.
export function createAlternateCampaign(ctx) {
  const { scene, cine, state, playerPos, makeActor, getPlayer, flashObjective } = ctx;
  const props = [];
  const room = new THREE.Group();
  const actors = {};
  const origin = new THREE.Vector3(92, 0, -104);
  let openingRunning = false;
  let openingPlayed = false;

  function add(mesh) { room.add(mesh); props.push(mesh); return mesh; }
  function box(w, h, d, color, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.88 }));
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return add(m);
  }
  function buildSet() {
    props.push(room);
    room.position.copy(origin);
    add(box(24, 0.25, 18, 0x493d37, 0, -0.13, 0));
    add(box(24, 5, 0.3, 0x322a2a, 0, 2.5, -9));
    add(box(0.3, 5, 18, 0x322a2a, -12, 2.5, 0));
    add(box(0.3, 5, 18, 0x322a2a, 12, 2.5, 0));
    add(box(24, 0.3, 18, 0x201b1b, 0, 5, 0));
    add(box(5, 0.8, 2.5, 0x5e3a29, 0, 0.45, 1.5)); // battered table
    add(box(2.5, 1.8, 0.5, 0x792f2d, -8, 0.9, -5.2)); // suspicious couch
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc273 }));
    bulb.position.set(0, 4.4, 0); add(bulb);
    actors.chimi = makeActor("chimi"); actors.dixon = makeActor("dixon"); actors.gr33do = makeActor("gr33do");
    actors.chimi.position.set(-3, 0, 0); actors.dixon.position.set(3, 0, 0); actors.gr33do.position.set(10, 0, -2);
    actors.chimi.rotation.y = 0.35; actors.dixon.rotation.y = -0.35; actors.gr33do.rotation.y = -Math.PI / 2;
    room.add(actors.chimi, actors.dixon, actors.gr33do);
    for (const a of Object.values(actors)) a.visible = false;
    scene.add(room);
    // The room stands on the South Tusouxroe street, right in front of Keseme's (the Nadia)
    // house, so it is only on screen while this opening plays; the rest of the time it
    // would read as a black block over her street.
    room.visible = false;
  }
  function local(v) { return [origin.x + v[0], v[1], origin.z + v[2]]; }
  function showActors(on) { for (const a of Object.values(actors)) a.visible = on; }
  function finish() {
    showActors(false); room.visible = false; if (getPlayer()) getPlayer().visible = true; state.cinematic = false; cine.releaseCamera();
    playerPos.set(-6, 0, 130); flashObjective("MISSION 01 · SAVE THE HOGS");
  }
  function start() {
    // Character confirmation can arrive from both a button click and a key
    // event in the same interaction. Cinema deliberately queues scenes, so a
    // duplicate start would look like the opening is looping forever.
    if (openingRunning || openingPlayed) return;
    openingRunning = true;
    openingPlayed = true;
    room.visible = true;
    state.cinematic = true; if (getPlayer()) getPlayer().visible = false; showActors(true);
    const run = cine.scene(async (c) => {
      c.letterbox(true);
      await c.shot({ from: local([0, 8.5, 15]), to: local([0, 5.5, 12]), look: local([0, 1.2, 0]), dur: 1.8 });
      await c.card("INT.", "THE ROOM", "East of nowhere", { hold: 1.2 });
      await c.say("CHIMI", "So this is the plan? We sit here and pretend the bayou isn't making that noise?");
      await c.shot({ from: local([-8, 3.5, 8]), to: local([-5, 2.4, 5]), look: local([-1, 1.1, 0]), dur: 1.2 });
      await c.say("DIXON", "It is a strategic pause.");
      await c.say("CHIMI", "It smells like a tactical couch.");
      c.sfx("squeal", 0.45);
      await c.shot({ from: local([8, 3.1, 8]), to: local([7, 2.5, 3]), look: local([10, 1.2, -2]), dur: 0.8 });
      await c.caption("The door opens with the confidence of a bad decision.", 1.2);
      await c.say("GR33DO", "GUYS WE HAVE A PROBLEM!!!! ITS JAZZ CIGARETTES HES BACK AND HES INSPIRED BY JERKMATE!!!", 4.4);
      await c.shot({ from: local([11, 2.8, 4]), to: local([8, 2.2, 0]), look: local([10, 1.2, -2]), dur: 1.0 });
      await c.say("DIXON", "That sentence had too many emergencies in it.");
      await c.say("GR33DO", "Jazz Cigarettes can't get a derektiojn. Direction. He's got bad Derektile Dysfunction.");
      await c.say("CHIMI", "I regret asking what that means.");
      await c.caption("A ridiculous rumor spreads through the swamp: Jazz Cigarettes has gone feral and is attacking—and breeding with—feral hogs.", 3.8);
      await c.say("GR33DO", "He's supposedly inspired by Jerkmate!");
      await c.say("DIXON", "Cmon we gotta go rescue those hogs before Jazz Cigarettes breeds them!!", 3.2);
      await c.title("SAVE THE HOGS", 2.2);
      await c.card("MISSION 01", "SAVE THE HOGS", "The bayou has questions. The hogs have worse answers.", { center: true, hold: 2.8 });
    });
    run.then(finish, finish).finally(() => { openingRunning = false; });
  }
  function replay() {
    if (openingRunning) return;
    openingPlayed = false;
    start();
  }
  return { buildSet, start, replay, get props() { return props; }, update(dt) {
    if (!state.cinematic) return;
    for (const a of Object.values(actors)) if (a.visible && a.update) a.update(dt);
  } };
}
