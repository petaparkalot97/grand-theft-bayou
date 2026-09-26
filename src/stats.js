// ---------------------------------------------------------------------------
// stats.js — the character: S.P.E.C.I.A.L., skills, traits, backgrounds, perks, levels (zombie mode).
//
// Fallout: New Vegas supplies the shape: seven attributes (Strength, Perception, Endurance, Charisma,
// Intelligence, Agility, Luck) from 1 to 10; skills derived from them (2 + 2 x the attribute + Luck / 2),
// three of them "tagged" for +15; XP and levels, with skill points on every level and a perk every second one.
//
// Project Zomboid supplies the creation screen's economy: you start with a small pool of points, and a
// trait either COSTS points (a good one) or GIVES them back (a bad one). Lowering an attribute below its
// default hands points back too — so you can be a glass cannon or a tank with a rotten mouth, but every
// choice is paid for somewhere.
//
// This module is pure data + arithmetic: no DOM, no THREE, no game state. pipboy.js draws it, main.js feeds
// it kills and asks it for multipliers.
//
//   const c = createCharacter({ special, traits, background, tagged, name })   // validated; throws on a bad build
//   c.mods.damageTakenMul()   c.mods.gunMul()   c.mods.stealthMul()   c.addXp(30)   c.buySkill("sneak")   ...
// ---------------------------------------------------------------------------

export const SPECIAL = Object.freeze([
  { id: "str", short: "STR", name: "Strength", blurb: "Raw power: melee damage, and how high you jump." },
  { id: "per", short: "PER", name: "Perception", blurb: "Awareness: the beam of your torch, and how early you notice you have been noticed." },
  { id: "end", short: "END", name: "Endurance", blurb: "Toughness: damage you shrug off, stamina, how fast it comes back." },
  { id: "cha", short: "CHA", name: "Charisma", blurb: "Your way with people: better prices, fewer fights." },
  { id: "int", short: "INT", name: "Intelligence", blurb: "Book smarts: skill points every level, and XP." },
  { id: "agi", short: "AGI", name: "Agility", blurb: "Speed and coordination: how fast you run, how steady the gun is." },
  { id: "lck", short: "LCK", name: "Luck", blurb: "Fortune: critical hits, better loot, and a little bit of everything." },
]);

export const SKILLS = Object.freeze([
  { id: "guns", name: "Guns", attr: "agi", blurb: "Damage with firearms." },
  { id: "melee", name: "Melee", attr: "str", blurb: "Damage with the bat and anything you swing." },
  { id: "sneak", name: "Sneak", attr: "agi", blurb: "How little the dead notice you when you crouch or crawl. Sneak attacks hit harder." },
  { id: "speech", name: "Speech", attr: "cha", blurb: "Talk your way out: calms bystanders you provoke; a little off every price." },
  { id: "barter", name: "Barter", attr: "cha", blurb: "What you pay at the gun counter, the Pay 'n' Spray and the hospital." },
  { id: "medicine", name: "Medicine", attr: "int", blurb: "How much food, drink and hospital care actually heals." },
  { id: "survival", name: "Survival", attr: "end", blurb: "Stamina regeneration and how long you last on empty." },
  { id: "athletics", name: "Athletics", attr: "str", blurb: "Sprinting and jumping without gasping." },
  { id: "driving", name: "Driving", attr: "per", blurb: "Handling: grip and top speed in a car." },
]);

/** What a good background hands you for free (Zomboid's occupations): a few skills, no point cost. */
export const BACKGROUNDS = Object.freeze([
  { id: "none", name: "Drifter", blurb: "No history worth mentioning.", skills: {} },
  { id: "trapper", name: "Bayou Trapper", blurb: "Raised in the marsh. Quiet, hardy, good with a shotgun.", skills: { sneak: 15, survival: 15, guns: 5 } },
  { id: "deputy", name: "Parish Deputy", blurb: "Knows a gun and a talking-to.", skills: { guns: 15, speech: 10, driving: 5 } },
  { id: "medic", name: "EMT", blurb: "Runs toward it. Patches people up.", skills: { medicine: 20, athletics: 10 } },
  { id: "dockhand", name: "Dockworker", blurb: "Lifts things. Hits things.", skills: { melee: 15, athletics: 15 } },
  { id: "hustler", name: "Hustler", blurb: "Always has a deal and an angle.", skills: { barter: 20, speech: 15 } },
  { id: "wheelman", name: "Getaway Driver", blurb: "Drives like the road owes him money.", skills: { driving: 25, sneak: 5, guns: 5 } },
]);

/**
 * Traits, Zomboid style. `cost` > 0 costs creation points; `cost` < 0 GIVES them. Effects are read by
 * `mods` below (multipliers, nudges to attributes or skills), so a trait is data, not code.
 */
export const TRAITS = Object.freeze([
  // ---- the good ones (they cost)
  { id: "athletic", name: "Athletic", cost: 6, blurb: "+25% stamina, higher jumps, and sprinting costs less.", fx: { staminaMul: 1.25, jumpMul: 1.15, sprintCostMul: 0.8 } },
  { id: "quiet", name: "Quiet Feet", cost: 5, blurb: "The dead notice you 20% less.", fx: { stealthMul: 0.8 } },
  { id: "lucky", name: "Lucky", cost: 4, blurb: "+1 Luck effect: crits and loot.", fx: { luckBonus: 1 } },
  { id: "brawler", name: "Hard Hitter", cost: 5, blurb: "+20% melee damage.", fx: { meleeMul: 1.2 } },
  { id: "deadeye", name: "Deadeye", cost: 5, blurb: "+15% damage with firearms.", fx: { gunMul: 1.15 } },
  { id: "thick", name: "Thick Skinned", cost: 4, blurb: "Take 15% less damage.", fx: { damageTakenMul: 0.85 } },
  { id: "scavenger", name: "Scavenger", cost: 5, blurb: "The dead carry 25% more: cash and ammo.", fx: { lootMul: 1.25 } },
  { id: "learner", name: "Fast Learner", cost: 6, blurb: "+20% XP.", fx: { xpMul: 1.2 } },
  { id: "nightowl", name: "Night Owl", cost: 3, blurb: "Your torch reaches further.", fx: { torchMul: 1.25 } },
  { id: "hardy", name: "Hardy", cost: 4, blurb: "+15% healing from everything.", fx: { healMul: 1.15 } },
  // ---- the bad ones (they pay)
  { id: "clumsy", name: "Clumsy", cost: -4, blurb: "Louder: the dead notice you 20% more. Jump 10% lower.", fx: { stealthMul: 1.2, jumpMul: 0.9 } },
  { id: "slowheal", name: "Slow Healer", cost: -4, blurb: "-30% healing from everything.", fx: { healMul: 0.7 } },
  { id: "glassjaw", name: "Glass Jaw", cost: -5, blurb: "Take 25% more damage.", fx: { damageTakenMul: 1.25 } },
  { id: "smoker", name: "Smoker", cost: -3, blurb: "Stamina runs out 20% faster.", fx: { sprintCostMul: 1.2, staminaMul: 0.9 } },
  { id: "poorshot", name: "Poor Aim", cost: -4, blurb: "-15% damage with firearms.", fx: { gunMul: 0.85 } },
  { id: "loudmouth", name: "Loud Mouth", cost: -3, blurb: "The dead notice you 25% more.", fx: { stealthMul: 1.25 } },
  { id: "sickly", name: "Sickly", cost: -6, blurb: "Take 15% more damage and heal 15% less.", fx: { damageTakenMul: 1.15, healMul: 0.85 } },
  { id: "cheapskate", name: "Bad Credit", cost: -2, blurb: "Everything costs 15% more.", fx: { priceMul: 1.15 } },
  { id: "unlucky", name: "Unlucky", cost: -4, blurb: "-1 Luck effect.", fx: { luckBonus: -1 } },
]);

/** Perks: one every second level (Fallout NV), chosen from those whose requirements you meet. */
export const PERKS = Object.freeze([
  { id: "ghost", name: "Ghost", blurb: "The dead notice you 30% less. Sneak 60.", req: { skill: ["sneak", 60] }, fx: { stealthMul: 0.7 } },
  { id: "commando", name: "Commando", blurb: "+15% firearm damage. Guns 50.", req: { skill: ["guns", 50] }, fx: { gunMul: 1.15 } },
  { id: "slayer", name: "Slayer", blurb: "+25% melee damage. Melee 50.", req: { skill: ["melee", 50] }, fx: { meleeMul: 1.25 } },
  { id: "toughness", name: "Toughness", blurb: "Take 12% less damage. END 5.", req: { attr: ["end", 5] }, fx: { damageTakenMul: 0.88 } },
  { id: "silvertongue", name: "Silver Tongue", blurb: "A further 10% off everything. Speech 50.", req: { skill: ["speech", 50] }, fx: { priceMul: 0.9 } },
  { id: "medic", name: "Medic!", blurb: "+40% healing. Medicine 40.", req: { skill: ["medicine", 40] }, fx: { healMul: 1.4 } },
  { id: "sprinter", name: "Marathoner", blurb: "Sprinting costs 30% less. Athletics 40.", req: { skill: ["athletics", 40] }, fx: { sprintCostMul: 0.7 } },
  { id: "jumper", name: "Spring Loaded", blurb: "+25% jump height. AGI 6.", req: { attr: ["agi", 6] }, fx: { jumpMul: 1.25 } },
  { id: "cherry", name: "Better Criticals", blurb: "Critical hits do triple damage. LCK 6.", req: { attr: ["lck", 6] }, fx: { critMul: 3 } },
  { id: "scrounger", name: "Scrounger", blurb: "+30% cash and ammo from the dead. Survival 30.", req: { skill: ["survival", 30] }, fx: { lootMul: 1.3 } },
  { id: "backstab", name: "Assassin", blurb: "Sneak attacks do triple damage. Sneak 40.", req: { skill: ["sneak", 40] }, fx: { sneakAttackMul: 1.5 } },
  { id: "lifegiver", name: "Life Giver", blurb: "Take 8% less damage.", req: {}, fx: { damageTakenMul: 0.92 } },
  { id: "learner2", name: "Educated", blurb: "+15% XP. INT 6.", req: { attr: ["int", 6] }, fx: { xpMul: 1.15 } },
]);

const DEFAULT_SPECIAL = 5, MIN_S = 1, MAX_S = 10, BASE_POINTS = 5, MAX_TAGS = 3, TAG_BONUS = 15, TRAIT_CAP = 12;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * The creation economy in one place (pipboy.js and the tests both use it). Two separate pools, as in
 * Zomboid:
 *   attrPoints  start at 5; each attribute point above the default of 5 spends one, each below it hands one back
 *               (a 1 in Charisma is four points for somewhere else);
 *   traitPoints start at 0; a good trait spends its cost, a bad trait gives its cost back.
 * Neither pool may end below zero.
 */
export function creationBudget({ special = {}, traits = [] } = {}) {
  let attrPoints = BASE_POINTS;
  for (const s of SPECIAL) attrPoints -= (special[s.id] ?? DEFAULT_SPECIAL) - DEFAULT_SPECIAL;
  let traitPoints = 0;
  for (const id of traits) { const t = TRAITS.find((x) => x.id === id); if (t) traitPoints -= t.cost; }
  return { attrPoints, traitPoints };
}

export function validateBuild(build) {
  const errors = [];
  const special = build.special || {};
  for (const s of SPECIAL) { const v = special[s.id] ?? DEFAULT_SPECIAL; if (v < MIN_S || v > MAX_S || !Number.isInteger(v)) errors.push(`${s.name} must be ${MIN_S}-${MAX_S}`); }
  const { attrPoints, traitPoints } = creationBudget(build);
  if (attrPoints < 0) errors.push(`You have spent ${-attrPoints} too many attribute points`);
  if (traitPoints < 0) errors.push(`You have spent ${-traitPoints} too many trait points (take a bad trait, or drop a good one)`);
  const traits = build.traits || [];
  if (new Set(traits).size !== traits.length) errors.push("A trait is listed twice");
  if (traits.length > TRAIT_CAP) errors.push(`At most ${TRAIT_CAP} traits`);
  for (const id of traits) if (!TRAITS.some((t) => t.id === id)) errors.push(`Unknown trait ${id}`);
  const tags = build.tagged || [];
  if (tags.length > MAX_TAGS) errors.push(`Tag at most ${MAX_TAGS} skills`);
  for (const id of tags) if (!SKILLS.some((k) => k.id === id)) errors.push(`Unknown skill ${id}`);
  if (build.background && !BACKGROUNDS.some((b) => b.id === build.background)) errors.push("Unknown background");
  return errors;
}

/** XP needed to go from `level` to `level + 1`. */
export const xpForNext = (level) => 60 + level * 40;

export function createCharacter(build = {}) {
  const errors = validateBuild(build);
  if (errors.length) throw new Error("Invalid character: " + errors.join("; "));
  const name = String(build.name || "Survivor").slice(0, 20);
  const special = {};
  for (const s of SPECIAL) special[s.id] = build.special?.[s.id] ?? DEFAULT_SPECIAL;
  const traits = [...(build.traits || [])];
  const bg = BACKGROUNDS.find((b) => b.id === (build.background || "none")) || BACKGROUNDS[0];
  const tagged = [...(build.tagged || [])];
  const perks = [];
  const invested = {};                                // skill points the player has bought since creation
  let level = 1, xp = 0, skillPoints = 0, perkPoints = 0, kills = 0;

  const effects = () => [...traits.map((id) => TRAITS.find((t) => t.id === id).fx), ...perks.map((id) => PERKS.find((p) => p.id === id).fx)];
  const prod = (key, dflt = 1) => effects().reduce((a, fx) => (fx[key] != null ? a * fx[key] : a), dflt);
  const sum = (key) => effects().reduce((a, fx) => a + (fx[key] || 0), 0);
  const luck = () => clamp(special.lck + sum("luckBonus"), 1, 10);

  const skillBase = (k) => Math.floor(2 + 2 * special[SKILLS.find((s) => s.id === k).attr] + luck() / 2);
  const skill = (id) => clamp(skillBase(id) + (tagged.includes(id) ? TAG_BONUS : 0) + (bg.skills[id] || 0) + (invested[id] || 0), 0, 100);

  const api = {
    name, special, traits, tagged, perks, background: bg,
    get level() { return level; }, get xp() { return xp; }, get xpToNext() { return xpForNext(level); },
    get skillPoints() { return skillPoints; }, get perkPoints() { return perkPoints; }, get kills() { return kills; },
    skill,
    /** How much of the next level's bar is filled, 0..1. */
    get xpFrac() { return xp / xpForNext(level); },
    /** Give XP (scaled by Intelligence and traits). Returns the number of levels gained. */
    addXp(amount) {
      const gained = Math.max(0, Math.round(amount * (0.9 + special.int * 0.04) * prod("xpMul")));
      xp += gained;
      let ups = 0;
      while (xp >= xpForNext(level) && level < 30) {
        xp -= xpForNext(level); level++; ups++;
        skillPoints += 10 + Math.floor(special.int / 2);
        if (level % 2 === 0) perkPoints++;
      }
      return ups;
    },
    noteKill() { kills++; },
    /** Spend one skill point (Fallout: +1 to the skill, capped at 100). */
    buySkill(id) {
      if (skillPoints <= 0 || skill(id) >= 100 || !SKILLS.some((k) => k.id === id)) return false;
      skillPoints--; invested[id] = (invested[id] || 0) + 1; return true;
    },
    canTakePerk(p) {
      if (perks.includes(p.id) || perkPoints <= 0) return false;
      if (p.req.skill && skill(p.req.skill[0]) < p.req.skill[1]) return false;
      if (p.req.attr && special[p.req.attr[0]] < p.req.attr[1]) return false;
      return true;
    },
    takePerk(id) {
      const p = PERKS.find((x) => x.id === id);
      if (!p || !api.canTakePerk(p)) return false;
      perks.push(id); perkPoints--; return true;
    },
    /** Everything the game asks for, as multipliers on its own numbers. */
    mods: {
      // damage
      gunMul: () => prod("gunMul") * (1 + (skill("guns") - 30) / 250),
      recoilMul: () => clamp(1.2 - skill("guns") / 125, 0.4, 1.2),
      meleeMul: () => prod("meleeMul") * (1 + (skill("melee") - 30) / 250) * (1 + (special.str - 5) * 0.06),
      damageTakenMul: () => clamp(prod("damageTakenMul") * (1 - (special.end - 5) * 0.045), 0.35, 2),
      critChance: () => clamp(0.03 + luck() * 0.012, 0, 0.3),
      critMul: () => prod("critMul", 2),
      sneakAttackMul: () => 2 * prod("sneakAttackMul") * (1 + skill("sneak") / 100),
      // body
      staminaMul: () => prod("staminaMul") * (1 + (special.end - 5) * 0.06),
      staminaRegenMul: () => (1 + (special.end - 5) * 0.07) * (1 + skill("survival") / 200),
      explosionDamageMul: () => clamp(1 - skill("survival") / 100, 0.2, 1.2),
      sprintCostMul: () => prod("sprintCostMul") * (1 - skill("athletics") / 250),
      fallDamageMul: () => clamp(1 - skill("athletics") / 100, 0, 1.2),
      jumpCostMul: () => 1 - skill("athletics") / 300,
      jumpMul: () => prod("jumpMul") * (1 + (special.str - 5) * 0.03) * (1 + skill("athletics") / 400),
      speedMul: () => 1 + (special.agi - 5) * 0.025 + skill("athletics") / 1000,
      healMul: () => prod("healMul") * (1 + skill("medicine") / 150),
      medDropChance: () => skill("medicine") / 250,
      driveMul: () => 1 + skill("driving") / 500,
      vehDamageTakenMul: () => clamp(1 - skill("driving") / 150, 0.2, 1.0),
      // people
      priceMul: () => clamp(prod("priceMul") * (1.2 - skill("barter") / 250 - skill("speech") / 700 - (special.cha - 5) * 0.02), 0.5, 1.6),
      calmChance: () => clamp(skill("speech") / 220 + (special.cha - 5) * 0.03, 0, 0.6),      // a provoked bystander might just... not
      lootMul: () => prod("lootMul") * (1 + (luck() - 5) * 0.05),
      xpMul: () => prod("xpMul"),
      // senses
      stealthMul: () => clamp(prod("stealthMul") * (1 - skill("sneak") / 220), 0.3, 1.6),
      invisibleToHeli: () => skill("sneak") > 50,
      torchMul: () => prod("torchMul") * (1 + (special.per - 5) * 0.06),
    },
    toJSON() { return { name, special, traits, tagged, background: bg.id, perks, invested, level, xp, skillPoints, perkPoints, kills }; },
    /** Put back the progress part of a toJSON() snapshot (the build itself is given to createCharacter). */
    restore(j = {}) {
      level = clamp(j.level | 0 || 1, 1, 30); xp = Math.max(0, j.xp | 0); skillPoints = Math.max(0, j.skillPoints | 0);
      perkPoints = Math.max(0, j.perkPoints | 0); kills = Math.max(0, j.kills | 0);
      perks.length = 0; for (const id of j.perks || []) if (PERKS.some((p) => p.id === id)) perks.push(id);
      for (const k of Object.keys(invested)) delete invested[k];
      for (const [k, v] of Object.entries(j.invested || {})) if (SKILLS.some((sk) => sk.id === k)) invested[k] = Math.max(0, v | 0);
      return api;
    },
  };
  return api;
}

/** A sensible default build for "just start": balanced, two useful tags. */
export const DEFAULT_BUILD = Object.freeze({ name: "Survivor", special: { str: 5, per: 5, end: 5, cha: 5, int: 5, agi: 5, lck: 5 }, traits: [], tagged: ["guns", "sneak"], background: "none" });
