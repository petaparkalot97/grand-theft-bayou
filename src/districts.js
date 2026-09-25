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
// AS BUILT, and how little room is left. The map is 2400 m square and most of it
// is already claimed, so the two northern towns are wedged between things that
// were there first:
//
//   OrleaRouge   the whole centre, plus the US-167 strip north to z -440
//   Chatboro     x -102 .. 42,  z -720 .. -500      31,680 m2   (chatboro.js)
//   Tusouxroe    x   85 .. 387, z -1152 .. -592    169,120 m2   (tusouxroe.js)
//   Port Calypso x  380 .. 1150 — its own content starts at x 450
//
// The gaps are 43 m between Chatboro and Tusouxroe, 60 m between Chatboro and
// the strip, and 63 m between Tusouxroe and the docks. Those are the numbers a
// town has to grow into, and tools/qa/chatboro.mjs asserts the first two.
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
  //
  // (-6, -600) is not a rounded-off guess: x -6 IS US-167 (main.js ROAD_X) and
  // z -600 IS the Port Highway (stateWorld.js). The origin is the crossroads
  // itself, which is the only junction on the way north — you cannot reach
  // Tusouxroe or the docks without driving through this village, which is the
  // relationship Chatham actually has with Monroe.
  chatboro: { x: -6, z: -600, label: "Chatboro" },

  // Monroe: north-east, and a long way up. The drive from OrleaRouge to Mama's
  // door is meant to be a drive.
  //
  // Sited in the EAST half of stateWorld.js's north wilderness band, between
  // Chatboro and the Port Calypso docks. The first attempt at this put the
  // origin at (560, -880), which dropped Mama's house into the middle of Port
  // Calypso's container yard (that region owns x 380..1150, z -1100..-380) and
  // left only 320 m of map north of the town — not enough for a city. From
  // here the metro runs north to z -1150 and stops short of the docks at
  // x 387, and Mama's neighbourhood lands on its south edge, where "South
  // Tusouxroe" belongs, one block off the Port Highway.
  tusouxroe: { x: 215, z: -580, label: "Tusouxroe" },
};

/**
 * The ground a district has claimed, in WORLD space, so state-scale scatter
 * knows to stay out of it.
 *
 * A district's own composer keeps trees off its own streets, but stateWorld.js
 * lays its wilderness bands down blind — a pine every ~600 m^2 and the odd
 * stilt hut with a 60 m pond under it. The north band covers x -350..350,
 * z -1050..-450, which is exactly where Chatboro and Tusouxroe now are, so
 * without this the city grows a forest through its own downtown.
 */
export const KEEPOUTS = [
  // Tusouxroe: the whole metro, both banks, Bastroux at the north end, and the
  // lake. Matches BOUNDS in tusouxroe.js, padded out to the district edge.
  { x0: 80, x1: 392, z0: -1160, z1: -586, label: "Tusouxroe" },
  // Chatboro: the village on the crossroads. Matches BOUNDS in chatboro.js.
  // Its west end reaches x -86, where the north band does scatter pines (the
  // band only spares the highway corridor, |x| < 100).
  { x0: -106, x1: 46, z0: -724, z1: -496, label: "Chatboro" },
];

/** True if (x, z) falls inside a district's claimed ground. `pad` widens every rect. */
export function inKeepout(x, z, pad = 0) {
  for (const k of KEEPOUTS) {
    if (x > k.x0 - pad && x < k.x1 + pad && z > k.z0 - pad && z < k.z1 + pad) return true;
  }
  return false;
}

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
