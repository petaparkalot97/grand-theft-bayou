// ---------------------------------------------------------------------------
// corridors.js — the profiles for roadside.js (TASK-084): US-167 north and
// south of the core, and the four connector highways from it to the districts.
//
// A composer road's side +1 is the RIGHT of the way it is drawn: heading north
// that is east, heading south west, heading east south, heading west north.
// (Billboard `side`, by contrast, is in the world: +1 east / south.)
// ---------------------------------------------------------------------------

import { buildRoadside } from "./roadside.js";

const PINES = (kit, ctx, spacing = 11) => ({
  spacing,
  trunk: ctx.surface("dirt", 512).material(2, { color: 0xc9b49a, envMapIntensity: 0.7 }),
  foliage: ctx.surface("grass", 512).material(3, { color: 0xb9d69a, envMapIntensity: 0.8 }),
});

export function buildCorridors(R) {
  const { ctx, kit } = R;
  const pines = (s) => PINES(kit, ctx, s);
  const cypress = (s) => ({ spacing: s, shape: kit.props.cypressShape(), trunk: kit.mat(0x4a3d30, "cypress trunk bark", 0.95), foliage: kit.mat(0x2a4a30, "cypress leaves foliage", 0.9) });
  const scrub = (s) => ({ spacing: s, shape: kit.props.scrubShape(), trunk: kit.mat(0x5a4a3a, "scrub trunk bark", 0.95), foliage: kit.mat(0x6a6a3a, "scrub dry leaves foliage", 0.95) });

  // ---- the four connectors: from the junction on US-167 to where each district's own frontage takes over
  buildRoadside(R, {
    name: "Oyster approach", seed: 61001, bounds: { x0: 60, x1: 392, z0: 530, z1: 670 },
    road: { name: "Oyster Highway", points: [[70, 600], [392, 600]], width: 10 },
    profile: {
      mix: [[3, "farm"], [2, "bungalow"], [2, "trailer"], [2, "stand"], [1, "gas"], [1, "church"], [1, "cottage"]], density: 0.5, spacing: 38,
      forced: [{ at: 120, side: 1, kind: "gas" }],
      billboards: [{ at: 150, side: -1, ry: -Math.PI / 2, headline: "OYSTER BAY", sub: "Fresh seafood · 12 miles", graffiti: "OVERRATED" }],
      forest: pines(12),
    },
  });
  buildRoadside(R, {
    name: "Port approach", seed: 61002, bounds: { x0: 60, x1: 392, z0: -670, z1: -530 },
    road: { name: "Port Highway", points: [[70, -600], [392, -600]], width: 12 },
    profile: {
      mix: [[3, "shed"], [2, "tire"], [2, "trailer"], [1, "gas"], [1, "diner"], [1, "farm"]], density: 0.55, spacing: 38,
      forced: [{ at: 150, side: -1, kind: "gas" }],
      billboards: [{ at: 210, side: 1, ry: -Math.PI / 2, headline: "PORT CALYPSO", sub: "Now hiring · Union preferred" }],
      forest: pines(13),
    },
  });
  buildRoadside(R, {
    name: "Red Dust approach", seed: 61003, bounds: { x0: -392, x1: -70, z0: -670, z1: -530 },
    road: { name: "Red Dust Pass", points: [[-70, -600], [-392, -600]], width: 9 },
    profile: {
      mix: [[3, "trailer"], [2, "shotgun"], [2, "cabin"], [1, "stand"], [1, "gas"], [1, "farm"]], density: 0.4, spacing: 42,
      billboards: [{ at: -200, side: -1, ry: Math.PI / 2, headline: "RED DUST", sub: "Population: ask around", graffiti: "DON'T" }],
      forest: scrub(16),
    },
  });
  buildRoadside(R, {
    name: "Lakeshore approach", seed: 61004, bounds: { x0: -392, x1: -70, z0: 680, z1: 820 },
    road: { name: "Lakeshore Causeway", points: [[-70, 750], [-392, 750]], width: 12 },
    profile: {
      mix: [[3, "cabin"], [3, "stilt"], [2, "stand"], [1, "trailer"], [1, "gas"], [1, "church"]], density: 0.5, spacing: 36,
      billboards: [{ at: -220, side: 1, ry: Math.PI / 2, headline: "AIRBOAT TOURS", sub: "See a real gator · 6 miles", graffiti: "OR BE ONE" }],
      forest: cypress(11),
    },
  });

  // ---- US-167 beyond the core. Junction stubs are registered so nothing is built across a side road.
  buildRoadside(R, {
    name: "US-167 north", seed: 62001, bounds: { x0: -70, x1: 60, z0: -1200, z1: -424 },
    road: { name: "US-167 north", points: [[-6, -430], [-6, -1190]], width: 10 },
    junctions: [{ name: "Port Highway stub", points: [[-6, -600], [60, -600]], width: 12 }, { name: "Red Dust stub", points: [[-6, -600], [-70, -600]], width: 9 }],
    avoid: [{ at: -600, r: 34 }],
    profile: {
      mix: [[4, "farm"], [2, "bungalow"], [2, "trailer"], [2, "stand"], [1, "gas"], [1, "church"], [1, "cabin"]], density: 0.5, spacing: 44, footprint: { w: 30, d: 28 },
      forced: [{ at: -760, side: 1, kind: "gas" }, { at: -760, side: -1, kind: "diner" }, { at: -940, side: 1, kind: "motel" }],
      billboards: [
        { at: -520, side: 1, ry: 0, headline: "PORT CALYPSO", sub: "Next right · Now hiring" },
        { at: -700, side: -1, ry: Math.PI, headline: "TUSOUXROE", sub: "Home of the potholes", graffiti: "FIX THEM" },
        { at: -880, side: 1, ry: 0, headline: "BIG SAM'S", sub: "Truck stop · Showers · Pie" },
        { at: -1100, side: -1, ry: 0, headline: "LEAVING DIXIE", sub: "Y'all come back now", graffiti: "PLEASE" },
      ],
      forest: pines(10),
    },
  });
  buildRoadside(R, {
    name: "US-167 south", seed: 62002, bounds: { x0: -70, x1: 60, z0: 424, z1: 1200 },
    road: { name: "US-167 south", points: [[-6, 430], [-6, 1190]], width: 10 },
    junctions: [{ name: "Oyster Highway stub", points: [[-6, 600], [60, 600]], width: 10 }, { name: "Causeway stub", points: [[-6, 750], [-70, 750]], width: 12 }],
    avoid: [{ at: 600, r: 34 }, { at: 750, r: 34 }],
    profile: {
      mix: [[3, "cabin"], [3, "stilt"], [2, "trailer"], [2, "stand"], [1, "gas"], [1, "church"], [1, "cottage"]], density: 0.5, spacing: 44, footprint: { w: 30, d: 28 },
      forced: [{ at: 900, side: -1, kind: "gas" }, { at: 900, side: 1, kind: "diner" }],
      billboards: [
        { at: 500, side: 1, ry: Math.PI, headline: "OYSTER BAY", sub: "Right at the light · Shrimp Fest", graffiti: "NO" },
        { at: 690, side: -1, ry: 0, headline: "LAKESHORE", sub: "Bait · Beer · Bad ideas" },
        { at: 1000, side: 1, ry: Math.PI, headline: "MARSH TOURS", sub: "Every hour on the hour" },
        { at: 1120, side: -1, ry: Math.PI, headline: "BAYOU BAPTIST", sub: "All are welcome (not gators)", graffiti: "AMEN" },
      ],
      forest: cypress(10),
    },
  });

  // ---- a country track through the forest from Port Calypso to Oyster Bay (dirt, no traffic lanes, no poles)
  buildRoadside(R, {
    name: "Delta Road", seed: 63001, bounds: { x0: 690, x1: 870, z0: -430, z1: 436 },
    road: { name: "Delta Road", points: [[750, -420], [750, -40], [805, -40], [805, 436]], width: 6, dirt: true },
    poles: false,
    profile: {
      mix: [[3, "farm"], [3, "cabin"], [2, "trailer"], [2, "bungalow"], [1, "stand"], [1, "shed"]], density: 0.4, spacing: 46, setback: 16, footprint: { w: 24, d: 26 },
      startAt: 30, endAt: 30, forest: pines(11),
    },
  });
}
