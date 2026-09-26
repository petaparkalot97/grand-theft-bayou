// The character system (src/stats.js): the creation economy, skills, traits, perks, levels, multipliers.
//   node --experimental-detect-module tools/qa/stats_test.mjs
import { SPECIAL, SKILLS, TRAITS, PERKS, BACKGROUNDS, creationBudget, validateBuild, createCharacter, xpForNext, DEFAULT_BUILD } from "../../src/stats.js";

let failed = 0;
const check = (c, m) => { console.log(`${c ? "✓ PASS" : "❌ FAIL"}: ${m}`); if (!c) failed++; };
const build = (o = {}) => ({ ...DEFAULT_BUILD, special: { ...DEFAULT_BUILD.special, ...(o.special || {}) }, ...o, ...(o.special ? { special: { ...DEFAULT_BUILD.special, ...o.special } } : {}) });

// ---- the economy
check(creationBudget(DEFAULT_BUILD).attrPoints === 5 && creationBudget(DEFAULT_BUILD).traitPoints === 0, "a fresh character has 5 attribute points and 0 trait points");
check(creationBudget({ special: { str: 8 } }).attrPoints === 2, "STR 8 spends 3 of the 5 points");
check(creationBudget({ special: { cha: 1 } }).attrPoints === 9, "CHA 1 hands 4 points back — 9 to spend");
check(creationBudget({ traits: ["athletic"] }).traitPoints === -6, "a good trait costs its price");
check(creationBudget({ traits: ["athletic", "clumsy", "glassjaw"] }).traitPoints === 3, "bad traits pay for good ones");
check(validateBuild(build({ traits: ["athletic"] })).length === 1, "a good trait with no bad one to pay for it is refused");
check(validateBuild(build({ traits: ["athletic", "slowheal", "clumsy"] })).length === 0, "...and accepted once bad traits cover it (6 <= 8)");
check(validateBuild(build({ special: { str: 10, agi: 10 } })).length === 1, "STR 10 + AGI 10 overspends the attribute pool");
check(validateBuild(build({ special: { str: 10, agi: 10, cha: 1, int: 1 } })).length === 0, "...unless you take it out of Charisma and Intelligence");
check(validateBuild(build({ special: { str: 11 } })).length >= 1, "an attribute above 10 is refused");
check(validateBuild(build({ tagged: ["guns", "sneak", "melee", "speech"] })).length === 1, "only three skills can be tagged");
check(validateBuild(build({ traits: ["nope"] })).length >= 1, "an unknown trait is refused");
check(validateBuild(build({ background: "nope" })).length === 1, "an unknown background is refused");

// ---- skills: Fallout NV's formula, 2 + 2 x attribute + Luck / 2, +15 tagged
const c0 = createCharacter(build());
check(c0.skill("guns") === Math.floor(2 + 2 * 5 + 2.5) + 15, "Guns = 2 + 2xAGI + LCK/2 + 15 (tagged) = " + c0.skill("guns"));
check(c0.skill("melee") === Math.floor(2 + 2 * 5 + 2.5), "an untagged skill has no bonus = " + c0.skill("melee"));
const trapper = createCharacter(build({ background: "trapper" }));
check(trapper.skill("survival") === c0.skill("survival") + 15, "a background adds its skills for free");
check(createCharacter(build({ special: { agi: 8, cha: 2 } })).skill("sneak") > c0.skill("sneak"), "more AGI, more Sneak");

// ---- multipliers
check(Math.abs(c0.mods.priceMul() - (1.2 - c0.skill("barter") / 250 - c0.skill("speech") / 700)) < 1e-9, "priceMul follows Barter and Speech");
check(createCharacter(build({ traits: ["quiet", "slowheal", "cheapskate"] })).mods.stealthMul() < c0.mods.stealthMul(), "Quiet Feet lowers how much the dead notice you");
check(createCharacter(build({ traits: ["loudmouth", "quiet", "cheapskate"] })).mods.stealthMul() > 0, "traits stack without going to zero");
check(createCharacter(build({ traits: ["glassjaw"] })).mods.damageTakenMul() > 1 && createCharacter(build({ special: { end: 9, cha: 1 } })).mods.damageTakenMul() < 1, "Glass Jaw hurts, Endurance protects");
check(createCharacter(build({ special: { lck: 9, cha: 1 } })).mods.critChance() > c0.mods.critChance(), "Luck raises crit chance");
check(createCharacter(build({ traits: ["unlucky", "lucky"] })).mods.critChance() === c0.mods.critChance(), "Lucky and Unlucky cancel");
check(createCharacter(build({ special: { str: 9, cha: 1 } })).mods.jumpMul() > c0.mods.jumpMul(), "Strength raises the jump");
check(createCharacter(build({ traits: ["clumsy", "athletic", "cheapskate"] })).mods.jumpMul() > createCharacter(build({ traits: ["clumsy"] })).mods.jumpMul(), "Athletic outjumps Clumsy");

// ---- levels, skill points, perks
const c = createCharacter(build());
check(c.level === 1 && c.skillPoints === 0, "level 1, no points");
check(c.addXp(0) === 0, "0 xp does nothing");
let ups = c.addXp(xpForNext(1) * 2);
check(ups >= 1 && c.level >= 2, "enough XP levels you up (" + c.level + ")");
check(c.skillPoints === (c.level - 1) * (10 + Math.floor(5 / 2)), "each level grants 10 + INT/2 skill points (" + c.skillPoints + ")");
check(c.perkPoints === Math.floor(c.level / 2), "a perk every second level (" + c.perkPoints + ")");
const before = c.skill("melee");
check(c.buySkill("melee") && c.skill("melee") === before + 1, "a skill point buys +1");
check(c.perks.length === 0 && !c.takePerk("ghost"), "Ghost is locked until Sneak 60");
check(c.takePerk("lifegiver") && c.perks.includes("lifegiver") && c.perkPoints === Math.floor(c.level / 2) - 1, "a perk with no requirement can be taken and costs a perk point");
check(!c.takePerk("lifegiver"), "a perk can only be taken once");
const c2 = createCharacter(build({ special: { int: 10, cha: 1, lck: 1 } })), c3 = createCharacter(build());
c2.addXp(100); c3.addXp(100);
check(c2.xp + (c2.level - 1) * 100 > c3.xp + (c3.level - 1) * 100 || c2.level > c3.level, "Intelligence gains XP faster");
for (let i = 0; i < 200; i++) c.addXp(1000);
check(c.level === 30, "the level cap is 30");
for (const k of SKILLS) { for (let i = 0; i < 300; i++) c.buySkill(k.id); }
check(SKILLS.every((k) => c.skill(k.id) <= 100), "no skill goes past 100");
check(PERKS.length >= 10 && TRAITS.filter((t) => t.cost > 0).length >= 8 && TRAITS.filter((t) => t.cost < 0).length >= 8 && SPECIAL.length === 7 && BACKGROUNDS.length >= 6, "the content is all there");

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nAll character checks passed");
