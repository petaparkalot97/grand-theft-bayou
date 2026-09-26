// ---------------------------------------------------------------------------
// districts.js — where each town IS. One place, so a town can be moved.
//
// Bayou Dixie is Louisiana with the names filed off, and the three settlements
// map onto three real ones:
//
//   Chatboro    ← Chatham, LA               north-CENTRAL (Jackson Parish)
//   Tusouxroe   ← Monroe, LA                north-EAST, on the river
//   Shruston    ← Shreveport + Ruston       north-WEST, on I-20
//   Charsoufre  ← Lake Charles + Sulphur    south-WEST, on I-10
//   OrleaRouge  ← New Orleans               south-EAST
//
// and that is the layout. Chatboro sits in the middle of the north with
// Tusouxroe north-east of it and Shruston north-west; Charsoufre is away down
// the south-west coast, and OrleaRouge holds the south-east. Driving the length
// of US-167 should feel like driving the length of the state, and the two
// east-west highways are the interstates: the Red Dust Pass is I-20 through
// Shruston, the Lakeshore Causeway is I-10 through Charsoufre. Shreveport,
// Ruston and Monroe really are strung along I-20 like that.
//
// AS BUILT, and how little room is left. The map is 2400 m square and most of it
// is already claimed, so the two northern towns are wedged between things that
// were there first:
//
//   OrleaRouge   the whole centre, plus the US-167 strip north to z -440
//   Chatboro     x -102 .. 42,  z  -720 .. -500     31,680 m2  (chatboro.js)
//   Tusouxroe    x   85 .. 387, z -1152 .. -592    169,120 m2  (tusouxroe.js)
//   Shruston     x -370 ..-110, z -1080 .. -470    158,600 m2  (shruston.js)
//   Charsoufre   x -360 ..-100, z   600 ..  900     78,000 m2  (charsoufre.js)
//
// and the four corner regions, which were there first and set the walls:
//
//   Port Calypso  x  380 .. 1150, z -1100 .. -380  (content starts at x 450)
//   Red Dust      x -1150 ..-380, z -1100 .. -380
//   Lakeshore     x -1150 ..-380, z   380 .. 1150
//   Oyster Bay    x  380 .. 1150, z   380 .. 1150
//
// The gaps: 43 m Chatboro–Tusouxroe, 60 m Chatboro–the strip, 63 m
// Tusouxroe–the docks, 10 m Shruston–Red Dust and 20 m Charsoufre–Lakeshore.
// Those are the numbers a town has to grow into, and the QA scripts in
// tools/qa/ assert them.
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

  // Shreveport + Ruston: the north-west, on I-20 (the Red Dust Pass, world
  // z -600 — it crosses local z 180). Louisiana's third city and its college
  // town are an hour apart on that road in real life; here they are one place.
  // West of Chatboro and clear of the Red Dust badlands at x -380.
  shruston: { x: -240, z: -780, label: "Shruston" },

  // Lake Charles + Sulphur: the south-west, on I-10 (the Lakeshore Causeway,
  // world z 750 — local z 0, which is the seam between the two halves). Ten
  // miles apart in real life and joined at the hip; the origin is the join.
  charsoufre: { x: -230, z: 750, label: "Charsoufre" },

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
  // Shruston, and the Red Dust approach corridor runs straight through it at
  // z -600: roadside.js claims this rect, which is what keeps I-20's motels and
  // pines out of the campuses.
  { x0: -376, x1: -104, z0: -1086, z1: -464, label: "Shruston" },
  // Charsoufre, with the Lakeshore approach corridor through it at z 750.
  { x0: -366, x1: -94, z0: 594, z1: 906, label: "Charsoufre" },
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
