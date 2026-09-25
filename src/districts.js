// ---------------------------------------------------------------------------
// districts.js — where each town IS. One place, so a town can be moved.
//
// Bayou Dixie is Louisiana with the names filed off, and the three settlements
// map onto three real ones:
//
//   Chatboro    ← Chatham, LA      north-CENTRAL (Jackson Parish)
//   Tusouxroe   ← Monroe, LA       north-EAST, on the river (Ouachita Parish)
//   OrleaRouge  ← New Orleans      south-EAST
//
// and that is the layout: Chatboro in the middle of the north, Tusouxroe
// north-east of it, OrleaRouge away to the south-east of both. Driving the
// length of US-167 should feel like driving the length of the state.
//
// WHY THIS FILE EXISTS
// --------------------
// Every district used to hardcode its own world coordinates, and so did every
// story beat inside it — Act One's `NB`, the Nadia house, the street, the
// lamps. Moving a town therefore meant hand-editing hundreds of literals and
// hoping no mission had been missed, which is exactly how a story gets broken.
//
// Now a district declares an ORIGIN here, and everything inside it is written
// as an offset from that origin. Moving a town is changing two numbers in this
// file, and every building, street, lamp, mission waypoint and cutscene mark
// inside it moves with it. Keseme's story follows her town.
//
// RULES
// -----
//  * Nothing in a district may hardcode a world coordinate. Take the origin and
//    add to it. If you find yourself typing a number over ~100 in a district
//    module, it is probably an absolute coordinate that should be an offset.
//  * `ORLEAROUGE` is the origin the game was originally built around, so it is
//    (0, 0) and must stay there. Everything that already exists is OrleaRouge;
//    moving it would mean re-homing the entire built world.
//  * The map is STATE_BOUNDS, currently ±1200 (stateWorld.js). Keep a district's
//    whole extent inside it.
// ---------------------------------------------------------------------------

/** −z is north in this world (the causeway at z 136 is south of the city core). */
export const DISTRICTS = {
  // Everything that was already built. The original parish, the strip, the
  // riverfront, the Gulf. Origin (0, 0) by definition — see the rules above.
  orlearouge: { x: 0, z: 0, label: "OrleaRouge" },

  // Chatham: north-central. A village on the highway between the other two, so
  // you drive through it going north, which is what a state-highway village is.
  chatboro: { x: 0, z: -640, label: "Chatboro" },

  // Monroe: north-east, and a long way up. The drive from OrleaRouge to Mama's
  // door is meant to be a drive.
  tusouxroe: { x: 560, z: -880, label: "Tusouxroe" },
};

/** Offset a point into a district: `at("tusouxroe", 92, -100)`. */
export function at(district, dx, dz) {
  const d = DISTRICTS[district];
  if (!d) throw new Error(`districts.js: no district "${district}"`);
  return { x: d.x + dx, z: d.z + dz };
}

/** Which district a world point falls nearest, for zone/label lookups. */
export function districtAt(x, z) {
  let best = "orlearouge", bd = Infinity;
  for (const [key, d] of Object.entries(DISTRICTS)) {
    const dd = (x - d.x) ** 2 + (z - d.z) ** 2;
    if (dd < bd) { bd = dd; best = key; }
  }
  return best;
}
