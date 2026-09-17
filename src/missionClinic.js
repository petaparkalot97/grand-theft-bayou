// ---------------------------------------------------------------------------
// missionClinic.js — MISSION 1 "TRANSITION DAY".
//
// The real first mission: Keseme drives out to Oyster Bay Medical for her
// surgery. What used to be Mission 1 ("Hog Wild" — Mally's stolen Bravado,
// the hog stampede) is now Mission 2; prologue.js's own cold open is
// untouched and just plays right after this one hands off to it.
//
// Same shape as greedoCampaign.js ("FIND PETA"): a scripted opening, a
// player-driven objective with a waypoint, and an arrival cutscene — no new
// set geometry needed, since Oyster Bay Medical is already a real building
// placed by stateWorld.js at (550, 500).
// ---------------------------------------------------------------------------

const HOSPITAL = { x: 550, z: 500, r: 16, label: "Oyster Bay Medical" };

/**
 * @param {object} ctx  provided by main.js:
 *   scene, cine, state, playerPos, getPlayer(), makeActor(id),
 *   flashObjective(text), setObjective(text), onFinished(), ROAD_X, SPAWN_Z
 */
export function createMissionClinic(ctx) {
  const { scene, cine, state, playerPos, getPlayer, makeActor, flashObjective, setObjective, onFinished, ROAD_X, SPAWN_Z } = ctx;
  const actors = {};
  let started = false;
  let phase = "idle";   // idle | opening | drive | arrival | done

  function buildSet() {
    actors.keseme = makeActor("keseme");
    actors.keseme.visible = false;
    scene.add(actors.keseme);
  }

  function start() {
    if (started) return;
    started = true;
    phase = "opening";
    if (getPlayer()) getPlayer().visible = false;
    state.cinematic = true;
    const ox = ROAD_X + 2, oz = SPAWN_Z - 4;
    playerPos.set(ox, 0, oz);
    actors.keseme.position.set(ox, 0, oz);
    actors.keseme.rotation.y = 0;
    actors.keseme.visible = true;

    cine.scene(async (c) => {
      c.letterbox(true);
      await c.shot({ from: [ox + 5, 2.1, oz - 6], to: [ox + 2.5, 1.7, oz - 4], look: [ox, 1.3, oz + 0.5], dur: 1.5 });
      await c.caption("Today's the day. Keseme's phone buzzes.", 1.8);
      c.sfx("chime", 0.5);
      await c.say("PETA", "You still going through with it? Last chance to chicken out.");
      await c.say("KESEME", "Chicken out? I've been waiting twenty-six years, Peta. I'm not stalling now over cold feet.");
      await c.say("PETA", "Just checking. Want me to come with?");
      await c.say("KESEME", "Nah, I got this. Can't wait to have this cock chopped off — maybe I'll feed it to the hogs later!");
      await c.say("PETA", "...The hogs are gonna need therapy after that.");
      await c.say("KESEME", "Everybody in Tusouxroe needs therapy, Peta. Wish me luck.");
      await c.caption("She hangs up, gets in the car, and points it toward Oyster Bay.", 2.0);
      await c.card("MISSION 1", "TRANSITION DAY", `Drive to ${HOSPITAL.label}`, { center: true, hold: 2.6 });
    }).then(beginDrive, beginDrive);
  }

  function beginDrive() {
    actors.keseme.visible = false;
    if (getPlayer()) getPlayer().visible = true;
    state.cinematic = false;
    cine.releaseCamera();
    phase = "drive";
    flashObjective(`Drive to ${HOSPITAL.label}`);
  }

  function arrivalScene() {
    phase = "arrival";
    if (getPlayer()) getPlayer().visible = false;
    state.cinematic = true;
    const ax = HOSPITAL.x, az = HOSPITAL.z - 14;
    actors.keseme.position.set(ax, 0, az);
    actors.keseme.rotation.y = 0;
    actors.keseme.visible = true;

    cine.scene(async (c) => {
      c.letterbox(true);
      await c.shot({ from: [ax + 6, 2.2, az - 6], to: [ax + 2, 1.7, az - 3], look: [ax, 1.3, az + 1], dur: 1.4 });
      await c.caption("Oyster Bay Medical. Keseme walks in like she owns the place.", 2.0);
      await c.say("RECEPTIONIST", "Name?");
      await c.say("KESEME", "Keseme Nadia. I've got an appointment to finally match the outside to the inside.");
      await c.say("RECEPTIONIST", "...Right. Take a seat, someone will call you back.");
      await c.say("KESEME", "Try not to lose the piece you're taking out — I hear the hogs out back are hungry.");
      await c.caption("A few hours later.", 1.6);
      await c.black(true, 1.0);
      actors.keseme.position.set(ax - 2, 0, az);
      await c.black(false, 1.0);
      await c.shot({ from: [ax + 4, 2.0, az - 5], to: [ax, 1.6, az - 2], look: [ax - 2, 1.2, az], dur: 1.1 });
      await c.say("KESEME", "Okay. Ow. Worth it. Extremely worth it — but ow.", 2.4);
      await c.say("PETA", "Told you the hogs wouldn't want it anyway.");
      await c.say("KESEME", "Their loss.", 1.4);
      await c.title("TRANSITION COMPLETE", 1.8);
    }).then(finish, finish);
  }

  function finish() {
    actors.keseme.visible = false;
    if (getPlayer()) getPlayer().visible = true;
    state.cinematic = false;
    cine.releaseCamera();
    phase = "done";
    playerPos.set(ROAD_X, 0, SPAWN_Z);
    setObjective(null);
    if (onFinished) onFinished();
  }

  return {
    buildSet, start,
    get props() { return [actors.keseme]; },
    get waypoint() { return phase === "drive" ? HOSPITAL : null; },
    update(dt) {
      if (state.cinematic && actors.keseme && actors.keseme.visible && actors.keseme.update) actors.keseme.update(dt);
      if (phase === "drive") {
        setObjective(`Drive to ${HOSPITAL.label}`);
        if (!state.cinematic && Math.hypot(playerPos.x - HOSPITAL.x, playerPos.z - HOSPITAL.z) < HOSPITAL.r) {
          arrivalScene();
        }
      }
    },
  };
}
