// The Crown Strip (TASK-070) — layout and zone audit, plain node.
//
//   node tools/qa/crown_strip_test.mjs
//
// No browser: this checks the numbers the strip is built from, which is where a
// casino row actually goes wrong (a hall through a cross street, a forecourt
// overlapping the road it fronts, two venues in the same slot). Everything here
// reads CROWN_STRIP, the exported layout, and the district's own zoneAt().
//
// NOT covered here, and honestly so: the geometry itself. Building it needs the
// real three.js from the CDN import map, and node_modules/three is a 345-line
// stub with no BoxGeometry — no headless Chromium is installed in this
// environment either. Mesh counts, draw calls and the night look still need a
// real-browser pass (see the task's "Testing performed" note).

import { createTusouxroeNorth, CROWN_STRIP } from "../../src/tusouxroeNorth.js";

const BOUNDS = { x0: -240, x1: 240, z0: -440, z1: -134 };
const ROAD_X = -6;
const BLVD_Z = -260;
const WEST_STREET_X = -110;
const EAST_STREET_X = 110;

// The composer corridors this district composes, at half-width = width/2 +
// sidewalk (1.6). Restated here on purpose: if the builder's numbers drift, this
// is what notices.
const corridor = (name, x, z, halfX, halfZ) => ({
  name, x0: x - halfX, x1: x + halfX, z0: z - halfZ, z1: z + halfZ,
});
const ROADS = [
  corridor("North US-167", ROAD_X, (-136 - 420) / 2, 6.6, 142),          // x -12.6 .. 0.6
  corridor("Tusouxroe Blvd", 0, BLVD_Z, 190, 7.1),
  corridor("Civic Center Way", WEST_STREET_X, (-420 - 160) / 2, 6.1, 130),
  corridor("Industrial Drive", EAST_STREET_X, (-420 - 160) / 2, 6.1, 130),
  corridor("North Ave 1", 0, -200, 190, 6.1),
  corridor("North Ave 2", 0, -320, 190, 6.1),
  corridor("North Ave 3", 0, -380, 190, 6.1),
];

// The named landmarks tusouxroeNorth builds itself (LANDMARK_FOOTPRINTS + the
// extra `placed` rects) — the strip must not stand on any of them.
const NAMED = [
  { name: "Harborlight Hospital", x0: -79, x1: -51, z0: -249, z1: -227 },
  { name: "Freshfield Market", x0: 50, x1: 70, z0: -248, z1: -232 },
  { name: "Mossline Garage", x0: -53, x1: -37, z0: -187, z1: -173 },
  { name: "Cornerleaf Cafe", x0: 38, x1: 52, z0: -186, z1: -174 },
  { name: "Ember Fire Station", x0: -137, x1: -119, z0: -217, z1: -203 },
  { name: "Willowbrook School", x0: -144, x1: -120, z0: -329, z1: -311 },
  { name: "Sageworks Offices", x0: 119, x1: 141, z0: -219, z1: -201 },
  { name: "Meadow Apartments", x0: 120, x1: 136, z0: -326, z1: -314 },
  { name: "Cloudline Tower", x0: -16, x1: 4, z0: -410, z1: -390 },
];

// touching is fine, crossing is not
const overlaps = (a, b) => a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6;
const centre = (r) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });

let failures = 0;
const checks = [];
function check(label, ok, detail = "") {
  checks.push({ label, ok, detail });
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? `  — ${detail}` : ""}`);
}

const mockScene = { add: () => {}, children: [] };
const district = createTusouxroeNorth({
  scene: mockScene,
  camera: { position: { x: 0, y: 0, z: 0 } },
  surface: () => ({ material: () => ({ userData: {} }) }),
  roadMaterial: () => ({ userData: {} }),
  addBlocker: () => {},
  addLitSpot: () => {},
  addService: () => {},
  placeGlbLandmark: () => {},
  loadGLB: async () => null,
});

const V = CROWN_STRIP.venues;

// The fixture and prop builders that `buildVenue()` is allowed to dispatch to.
// Restated on purpose: a layout entry naming a fixture that does not exist would
// otherwise be a silent hole in a floor plan.
const FIXTURES = new Set(["partition", "slotBank", "gamingTable", "bar", "stage", "danceFloor",
  "djBooth", "vip", "seating", "poolTable", "backRoom", "chandelier", "discoBall"]);
const PROPS = new Set(["glove", "pig", "disco"]);
// North Ave 2 (z = -320) to North Ave 3 (z = -380), minus both 6.1 m corridors.
const DEPTH_BUDGET = 60 - 6.1 * 2;

console.log(`\nCrown Strip layout — ${V.length} venues on ${CROWN_STRIP.avenue.name} (z = ${CROWN_STRIP.avenue.z})\n`);

// ---- the row itself -------------------------------------------------------
const kinds = V.reduce((n, v) => (n[v.kind] = (n[v.kind] || 0) + 1, n), {});
check("names are unique", new Set(V.map((v) => v.name)).size === V.length);
check("every kind is a known hall", V.every((v) => v.k.d && v.k.w > 0 && v.k.d > 0 && v.k.h > 0));
check("both terraces are used", new Set(V.map((v) => v.side)).size === 2);
check(
  "the row is four merged mega-venues",
  V.length === 4 && kinds.casino === 1 && kinds.club === 2 && kinds.lounge === 1,
  JSON.stringify(kinds),
);
check("no two venues in the same slot", new Set(V.map((v) => `${v.side}:${v.x}`)).size === V.length);

// ---- each venue is data, and the data is complete -------------------------
check("every venue declares an interior theme", V.every((v) => typeof v.interior === "string" && v.interior));
check("every venue has a palette, a sign and a layout",
  V.every((v) => v.theme && v.theme.accent && v.sign && v.sign.h > 0 && Array.isArray(v.layout) && v.layout.length >= 5));
check("every layout entry names a real fixture",
  V.every((v) => v.layout.every((s) => FIXTURES.has(s.fixture))),
  V.flatMap((v) => v.layout.filter((s) => !FIXTURES.has(s.fixture)).map((s) => s.fixture)).join(", "));
check("every special prop names a real prop builder",
  V.every((v) => (v.props || []).every((p) => PROPS.has(p))));
check("the merged venues kept a landmark prop",
  V.some((v) => (v.props || []).includes("glove")) && V.some((v) => (v.props || []).includes("pig")));
check("every entrance is wide enough to walk through",
  V.every((v) => v.k.door >= 8), V.map((v) => `${v.name}:${v.k.door}`).join(" "));
check("the interiors are places, not cupboards",
  V.every((v) => v.k.w * v.k.d >= 1000),
  V.map((v) => `${v.name}:${v.k.w}x${v.k.d}`).join(" "));
check("no hall is deeper than the block it sits in",
  V.every((v) => v.k.fore + v.k.d <= DEPTH_BUDGET), V.map((v) => `${v.name}:${v.k.fore + v.k.d}`).join(" "));
check("one entrance each: a door is narrower than the facade it is cut into",
  V.every((v) => v.k.door < v.k.w));
check("no leftover signage from the venues that merged",
  V.every((v) => !/pelican crown|gator's fortune|honeysuckle|brass alligator|midnight special|le bon temps|honeydripper/i.test([v.name, v.sign.sub].join(" "))),
  "BAYOU GOLD / BILLY JEANS / DISCO GATORS / HAPPY HOGS only");

// ---- nothing stands on anything else --------------------------------------
let pairHits = [];
for (let i = 0; i < V.length; i++) {
  for (let j = i + 1; j < V.length; j++) {
    for (const [an, a] of [["hall", V[i].hall], ["fore", V[i].fore]]) {
      for (const [bn, b] of [["hall", V[j].hall], ["fore", V[j].fore]]) {
        if (overlaps(a, b)) pairHits.push(`${V[i].name}/${an} × ${V[j].name}/${bn}`);
      }
    }
  }
}
check("halls and forecourts never overlap each other", pairHits.length === 0, pairHits.slice(0, 3).join(", "));

const roadHits = [];
for (const v of V) {
  for (const r of ROADS) {
    if (overlaps(v.hall, r)) roadHits.push(`${v.name} hall × ${r.name}`);
    if (overlaps(v.fore, r)) roadHits.push(`${v.name} forecourt × ${r.name}`);
  }
}
check("no hall or forecourt crosses a street", roadHits.length === 0, roadHits.slice(0, 3).join(", "));

const namedHits = [];
for (const v of V) {
  for (const n of NAMED) {
    if (overlaps(v.hall, n) || overlaps(v.fore, n)) namedHits.push(`${v.name} × ${n.name}`);
  }
}
check("no venue stands on a named landmark", namedHits.length === 0, namedHits.slice(0, 3).join(", "));

check(
  "every hall is inside the district bounds",
  V.every((v) => v.hall.x0 > BOUNDS.x0 && v.hall.x1 < BOUNDS.x1 && v.hall.z0 > BOUNDS.z0 && v.hall.z1 < BOUNDS.z1),
);

// ---- each front meets the avenue it fronts --------------------------------
const kerb = CROWN_STRIP.avenue.half;
let kerbHits = [];
for (const v of V) {
  // north terrace: the forecourt's +z edge is the kerb. south terrace: its -z edge.
  const want = v.side < 0 ? CROWN_STRIP.avenue.z - kerb : CROWN_STRIP.avenue.z + kerb;
  const got = v.side < 0 ? v.fore.z1 : v.fore.z0;
  if (Math.abs(got - want) > 1e-6) kerbHits.push(`${v.name} forecourt edge ${got} (wanted ${want})`);
}
check("every forecourt ends exactly on the avenue kerb", kerbHits.length === 0, kerbHits.slice(0, 3).join(", "));
check(
  "every facade is on the far side of its forecourt from the avenue",
  V.every((v) => (v.side < 0 ? v.facadeZ < v.fore.z1 : v.facadeZ > v.fore.z0)),
);

// ---- the gate over US-167 ------------------------------------------------
const G = CROWN_STRIP.gate;
const carriageway = corridor("US-167 carriageway", ROAD_X, (-136 - 420) / 2, 5, 142);
const pillars = [-1, 1].map((s) => ({ x: G.x + s * G.span, z: G.z }));
check("neither gate pillar stands in the carriageway", pillars.every((p) => p.x < carriageway.x0 || p.x > carriageway.x1),
  pillars.map((p) => `x=${p.x}`).join(", "));
check("the gate clears every venue", V.every((v) => !overlaps({ x0: G.x - G.span - 1, x1: G.x + G.span + 1, z0: G.z - 1, z1: G.z + 1 }, v.hall)
  && !overlaps({ x0: G.x - G.span - 1, x1: G.x + G.span + 1, z0: G.z - 1, z1: G.z + 1 }, v.fore)));
check("the gate faces south — it is on the Chatboro side of the avenue", G.z > CROWN_STRIP.avenue.z);

// ---- zoneAt --------------------------------------------------------------
let zoneBad = [];
for (const v of V) {
  if (district.zoneAt(v.x, v.cz) !== "building") zoneBad.push(`hall of ${v.name} -> ${district.zoneAt(v.x, v.cz)}`);
  const f = centre(v.fore);
  if (district.zoneAt(f.x, f.z) !== "entertainment") zoneBad.push(`forecourt of ${v.name} -> ${district.zoneAt(f.x, f.z)}`);
}
check("a hall is a no-spawn zone, a forecourt is entertainment", zoneBad.length === 0, zoneBad.slice(0, 3).join(", "));
check("the avenue itself is entertainment", district.zoneAt(60, CROWN_STRIP.avenue.z) === "entertainment");
check("the rest of the district is untouched", district.zoneAt(0, -150) === "forest" && district.zoneAt(-6, -260) === "corporate");
check("outside the district bounds there is no zone", district.zoneAt(0, 60) === null);

console.log(`\n${checks.length - failures}/${checks.length} checks passed.\n`);
process.exit(failures ? 1 : 0);
