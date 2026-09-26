// ---------------------------------------------------------------------------
// pedestrianChatter.js — barks civilians throw out when the player walks
// into them, and taunts/flees once a fight actually breaks out.
//
// Three buckets per NPC type (npc.js "mood" decides which fight bucket
// fires: brave/territorial fight back, timid/skittish flee):
//   bump      — bystander gets jostled, nothing violent has happened yet
//   fightBack — the player just hurt them and their temperament is to swing back
//   flee      — the player just hurt them and their temperament is to run
//
// main.js hooks: onFootUpdate() calls bumpLine() on close contact with a calm
// NPC; fire()'s npcs.provoke() call site calls fightLine() for the mood the
// NPC already rolled at spawn (npc.js temperament()). Both return the raw
// line text (for voice lookup, via voiceCast.js's pedestrianVoiceWho) plus a
// ready-to-flash "LABEL: line" display string.
//
// Audio: tools/pedestrian-voiceover-gen.mjs synthesizes every line this file
// knows about (allVoiceLines()) through the Fish Audio voices in
// src/voiceCast.js and writes them into the same manifest.json cinema.js
// already reads — see docs/VOICE_GENERATION.md.
// ---------------------------------------------------------------------------

import { pedestrianVoiceWho } from "./voiceCast.js";

const pick = (arr) => arr[(Math.random() * arr.length) | 0];

const GENERIC = {
  bump: ["Hey, watch it!", "Excuse you!", "Personal space, cher!", "Eyes up, walkin' here!"],
  fightBack: ["Oh, it's on now!", "You want a piece of me?!", "Big mistake, pal!"],
  flee: ["I'm out of here!", "Not today!", "Nope, nope, nope!"],
};

const CHATTER = {
  redneck: {
    bump: [
      "Hey now, watch where you're walkin', cher!",
      "You bump into me again, I'm gettin' my shotgun outta the truck.",
      "Easy there, partner — I just waxed these boots.",
      "You buyin' me a beer for that or what?",
      "Watch it! I got a bad hip from the deer stand.",
      "That's twice today somebody's run into me. Must be my cologne.",
      "Careful now, I'm carryin' concealed and I'm ticklish.",
      "You tryna start somethin', or you just clumsy?",
      "Mind the gator tail, I ain't done cookin' it yet.",
      "Get your own lane, this one's mine.",
      "Whoa there — I just got outta the deer stand, don't test me.",
    ],
    fightBack: [
      "Oh it's ON now, boy!",
      "I been waitin' all week to whup somebody's tail.",
      "You picked the wrong redneck, cher!",
      "Come on then, I didn't skip leg day at the deer camp for nothin'.",
      "Bless your heart, you're about to get folded.",
      "This is why I carry a tire iron in the truck!",
      "Hold my beer — actually I don't have one, let's just go!",
    ],
    flee: [
      "Whoa whoa whoa, I don't want no trouble!",
      "My mama didn't raise no fool, I'm out!",
      "Nope! Nope! Not today!",
      "I'll pray for you, but from over there!",
      "This truck ain't gonna jack itself, but I ain't dyin' for it!",
      "I got kids! Well, I got a dog. Same thing!",
    ],
  },

  hoodrat: {
    bump: [
      "Bro. Personal space is a thing.",
      "You just knocked my AirPod out, that's assault.",
      "Watch it, my guy, I just got these kicks clean.",
      "Oh we bumpin' now? A'ight, my bad, my bad.",
      "You need glasses or somethin'?",
      "Chill, chill, it's a big sidewalk.",
      "Say less, just walk around me next time.",
      "I saw that comin' and I still ain't move, that's on me.",
      "You in a rush or just don't care?",
      "That's a foul, ref!",
    ],
    fightBack: [
      "Oh you WANT it, say no more!",
      "Bet. Let's go, right here, right now.",
      "You just signed up for an L.",
      "I been itchin' for this all day, for real.",
      "Hands up, this ain't a debate no more.",
      "You bout to be a highlight on somebody's story.",
    ],
    flee: [
      "Yeah nah, I'm good, I'm good!",
      "I got somewhere to be, actually!",
      "Not today, not never, bye!",
      "This ain't it, I'm out!",
      "I fight with my feet — RUNNING!",
    ],
  },

  hobo: {
    bump: [
      "Hey now — that's my whole spot you just stepped on.",
      "You see a shopping cart 'round here? No? Then watch it.",
      "Careful, I just found this smell and I'm keepin' it.",
      "Spare a dollar? No? Then spare me a 'sorry'.",
      "That's the second time today the universe pushed me.",
      "I've been run over by better than you.",
      "Watch the cardboard, that's a two-bedroom!",
      "You interrupted a very important conversation with this can.",
      "Easy — I'm one bump away from a nap right here.",
      "I read your future. It involves walkin' into more people.",
    ],
    fightBack: [
      "Oh NOW you got my attention!",
      "I fought a raccoon for this bridge, I can fight you too!",
      "You just made the worst decision of your week.",
      "I got nothin' to lose and a shoppin' cart to swing!",
      "Let's dance, sunshine.",
    ],
    flee: [
      "Nope, takin' my can collection elsewhere!",
      "I didn't survive three winters under this bridge for THIS.",
      "Peace out, I got places to not be.",
      "This is why I sleep with one eye open — RUNNIN'!",
    ],
  },

  prostitute: {
    bump: [
      "Careful sugar, that'll cost extra.",
      "Ooh, forward. I like forward. But watch it.",
      "You bump into all the girls or just the pretty ones?",
      "Slow down, baby, the night's still young.",
      "That's cute, but my heels cost more than your car.",
      "Watch it — these shoes are not for runnin'.",
      "Mmhm, that's one way to say hello.",
      "You got cash or you got apologies?",
      "Careful, honey, I bruise like a peach.",
      "Bump me again and I'm chargin' a consultation fee.",
    ],
    fightBack: [
      "Oh, you picked the WRONG girl tonight.",
      "Honey, I've fought off worse in these heels.",
      "You're about to learn why they call me Hurricane.",
      "Big mistake, sugar. Big.",
      "I didn't do my nails for this, but here we go!",
    ],
    flee: [
      "Not on this outfit, absolutely not!",
      "I run in heels better than you chase, bye!",
      "This conversation is over, and so is this street corner!",
      "Security! ...oh wait, I AM the security. Runnin' anyway!",
    ],
  },

  dockworker: {
    bump: [
      "Hey! I'm carryin' forty pounds of shrimp here!",
      "Watch it — you almost made me drop the good crab.",
      "This dock ain't big enough for your bad drivin' on FOOT.",
      "I clock out in ten minutes, don't test me now.",
      "You see the crane? No? Then watch where you're goin'.",
      "That's the third thing that's hit me today. Second was a seagull.",
      "Easy, chief, some of us actually work for a livin'.",
      "Mind the rope, mind ME.",
      "This ain't a bumper car ride, pal.",
      "I got a union rep for this kinda thing, you know.",
    ],
    fightBack: [
      "Oh, you wanna go? I load two tons a day, buddy.",
      "Forty-hour week and you wanna do THIS? Fine!",
      "I've thrown bigger crates than you.",
      "You just picked a fight with the strongest guy on this dock.",
      "Comin' outta your paycheck, not mine — oh wait, let's just fight.",
    ],
    flee: [
      "Nope! I got a family and a pension to think about!",
      "Not gettin' hurt two hours before my shift ends!",
      "I'll report this to Sheriff Mercer, RUNNIN' while I do it!",
      "This crab ain't worth dyin' for — actually, RUN!",
    ],
  },

  mechanic: {
    bump: [
      "Watch the wrench, it's expensive and so's my time.",
      "You break it, you're payin' shop rate, cher.",
      "I got grease on my hands and now on your shirt. You're welcome.",
      "Careful — that's the same clumsy that wrecks transmissions.",
      "This ain't a test drive, slow down.",
      "You want a diagnostic? 'Cause you just diagnosed yourself as annoyin'.",
      "Easy! I'm holdin' a socket wrench and my patience is thinner.",
      "That engine ain't gonna fix itself while you're bumpin' into me.",
      "You run into customers like you run into curbs, huh?",
      "Watch it, I just got this jumpsuit clean. Emphasis on JUST.",
    ],
    fightBack: [
      "Oh, I got a whole toolbox and an attitude, let's go!",
      "You just voided your own warranty, pal.",
      "I fix cars for a livin', fixin' you'll be a nice break.",
      "Grease monkey? More like grease TYPHOON, let's go!",
      "Big mistake bumpin' the guy holdin' a tire iron.",
    ],
    flee: [
      "Nope, I got three cars on the lift, no time for this!",
      "Not with these hands, they're worth too much to the shop!",
      "I'll come back for my wrench, RUNNIN'!",
      "This ain't in the estimate, I'm out!",
    ],
  },

  suit: {
    bump: [
      "Do you have ANY idea how much this suit cost?",
      "I have a call in four minutes. Move.",
      "Watch it — I bill by the hour and you just cost me one.",
      "Excuse me, I'm very important and very late.",
      "This is Armani. Well, Armani-adjacent. WATCH IT.",
      "I could have you fired. I don't know from what, but I could.",
      "You're lucky I don't have my lawyer's number memorized.",
      "That's assault on my briefcase AND my dignity.",
      "Some of us have quarterly earnings to worry about.",
      "Do I look like I have time for pedestrians? No offense.",
    ],
    fightBack: [
      "You know what? I did boxing at the country club. Let's GO.",
      "I did NOT get an MBA to be pushed around!",
      "This suit is insured. My fists are FREE.",
      "You just triggered my one and only life skill: rage.",
      "Fine. FINE. Let's settle this like uncivilized men.",
    ],
    flee: [
      "I have a family and a golf handicap to protect!",
      "Absolutely not, I have a meeting to survive for!",
      "This is NOT in my job description, runnin' now!",
      "Security! ...I'll just run instead, faster.",
    ],
  },

  tourist: {
    bump: [
      "Oh! Sorry — wait, was that YOUR fault or mine?",
      "Whoa, is this part of the swamp tour?",
      "Careful, I just bought this shirt at a gas station!",
      "Excuse me, do you know the way to the alligator farm?",
      "Is this normal here? Should I be worried?",
      "I read three reviews and NONE of them mentioned this!",
      "Hang on, let me get a picture of this first.",
      "My GPS didn't say anything about gettin' bumped into!",
      "Is there a Waffle House near here? Askin' for a friend. The friend is me.",
      "I came here for beignets, not THIS.",
    ],
    fightBack: [
      "You know what, I did a self-defense class on my cruise once!",
      "This is NOT the Louisiana I signed up for, let's go!",
      "I've got sunscreen in my eyes and nothin' to lose!",
      "Fine! FINE! Vacation's already ruined anyway!",
      "I'm from out of town but my fists aren't!",
    ],
    flee: [
      "Nope, nope, I'm goin' back to the hotel!",
      "This is why they said don't wander off the tour!",
      "I'm callin' my travel agent AND runnin'!",
      "One star review, ZERO stars, RUNNING!",
    ],
  },

  thug: {
    bump: [
      "You just made a real bad choice, walkin' into me.",
      "Watch it. I don't do 'accidents.'",
      "You lucky I'm in a good mood today.",
      "Keep walkin', or keep talkin'. Your pick.",
      "That's your one warning.",
      "You know whose block this is?",
      "Careful — I don't like surprises.",
      "You got a death wish or just bad balance?",
      "Try that again, see what happens.",
      "I don't forget faces. Remember that.",
    ],
    fightBack: [
      "A'ight. You asked for this.",
      "I don't do warnings twice.",
      "You just picked the worst day to test me.",
      "Let's see what you got, for real.",
      "This is what happens when you don't listen.",
      "I was gonna let it go. Was.",
    ],
    flee: [
      "Not today — too many witnesses!",
      "I got better business than this, movin' on!",
      "Ain't worth the heat, I'm out!",
      "Catch me later, I got places to be!",
    ],
  },

  // Hogs don't talk. They emote.
  // OrleaRouge's out crowd (characters.js randomGayMan / randomLesbian) — on the
  // sidewalks, and in the bars and clubs on Frenchmen Street (nightlife.js)
  gayman: {
    bump: [
      "Honey. The sidewalk is RIGHT there.",
      "Careful, sweetie — this outfit is dry-clean only.",
      "Excuse you! I'm walking here, and I'm walking fabulously.",
      "Did you just bump me? Bold. My husband's gonna hear about this.",
      "These shoes cost more than your car, baby. Watch it.",
      "Oh, you're clumsy AND underdressed? Rough night.",
      "Girl, I have brunch in ten minutes and you are in my way.",
      "If you wanted my number you could've just asked.",
      "Mmm-mm. Not in front of the drag brunch crowd.",
      "Bless your heart, the Quarter's big enough for both of us.",
    ],
    fightBack: [
      "Oh, it's giving violence? Fine. I do kickboxing at the gym.",
      "You just ruined my whole look. Now you gotta pay!",
      "I didn't survive Mardi Gras to get punked by YOU.",
      "Hold my daiquiri — actually, I'm keeping the daiquiri.",
      "Honey, I've been in bar fights at the Pink Pelican. Bring it.",
    ],
    flee: [
      "Nope! These heels were NOT made for this!",
      "I'm calling my husband — and then the police!",
      "Not the face! Not the face!",
      "Absolutely not. I'm too cute for a hospital gown!",
    ],
  },
  lesbian: {
    bump: [
      "Easy — I just got these Docs broken in.",
      "Watch it. I've got a U-Haul to catch.",
      "My girlfriend's watching, so let's keep this civil.",
      "Bump me again and my whole softball team hears about it.",
      "Personal space, pal. I rescued three cats, I'll rescue myself.",
      "You lost? Bayou Belles is two doors down, everybody's welcome.",
      "Hey. Eyes up. I fix transmissions for a living.",
      "Cute. Now move.",
      "That's my flannel you're wrinkling.",
    ],
    fightBack: [
      "I've changed a transmission in the rain. I can handle you.",
      "Oh, you picked the WRONG woman.",
      "I bench more than you, buddy. Let's go.",
      "My ex taught me how to throw a punch. Finally paying off.",
    ],
    flee: [
      "Not worth it! My cats need me!",
      "I'm out — Tuesday's trivia night, I'm not missing it for you!",
      "Nope. Calling it. Bye!",
    ],
  },
  hog: {
    bump: ["*confused snort*", "*territorial grunting*", "*aggressive oinking*", "*snout twitches menacingly*", "*SQUEAL*", "*stares you down*"],
    fightBack: ["*ENRAGED SQUEALING*", "*tusks bared*", "*full charge posture*", "*war snort*"],
    flee: ["*terrified oinking*", "*bolts into the brush*", "*panicked squeal fading into the distance*"],
  },
};

/** A calm NPC reacting to getting jostled — not a fight, just a bark.
 * Returns `{ text, display }`: `text` is the raw line (for the voice
 * manifest lookup), `display` is the "LABEL: text" string flashObjective()
 * shows. */
/**
 * Types with no lines or voice of their own borrow a cast member's, so what they say is in a
 * recorded human voice, never the browser's generic text-to-speech (human report, 2026-09-26:
 * "the pedestrian chatter is in a generic voice ... it needs to be an actual human voice"). The tuxedo
 * regulars talk like suits, the escorts like the prostitutes, the klansmen like rednecks.
 */
const BORROWS = { tuxedo: "suit", highendescort: "prostitute", klansman: "redneck" };
export const voiceType = (type) => BORROWS[type] || type;

export function bumpLine(type, label) {
  type = voiceType(type);
  const bucket = (CHATTER[type] && CHATTER[type].bump) || GENERIC.bump;
  const text = pick(bucket);
  return { text, display: `${label}: ${text}` };
}

/** The player just hurt this NPC. `mood` (npc.js temperament) picks the
 * bucket. Same `{ text, display }` shape as bumpLine(). */
export function fightLine(type, label, mood) {
  type = voiceType(type);
  const flees = mood === "timid" || mood === "skittish";
  const table = CHATTER[type];
  const bucket = (table && table[flees ? "flee" : "fightBack"]) || GENERIC[flees ? "flee" : "fightBack"];
  const text = pick(bucket);
  return { text, display: `${label}: ${text}` };
}

/** Every (voiceWho, text) pair that needs a synthesized clip — the single
 * source of truth tools/pedestrian-voiceover-gen.mjs generates from. Hogs
 * are excluded (non-verbal; see the CHATTER.hog comment above). Gendered
 * archetypes (hoodrat/hobo/thug — see voiceCast.js's pedestrianVoiceWho)
 * produce two entries per line, one per voice; the shared GENERIC fallback
 * bucket is intentionally left unvoiced (it only fires for a type this file
 * hasn't been taught yet). */
export function allVoiceLines() {
  const out = [];
  for (const type of Object.keys(CHATTER)) {
    if (type === "hog") continue;
    const genders = (type === "hoodrat" || type === "hobo" || type === "thug") ? [false, true] : [false];
    for (const female of genders) {
      const voiceWho = pedestrianVoiceWho(type, female);
      for (const bucket of ["bump", "fightBack", "flee"]) {
        for (const text of CHATTER[type][bucket]) out.push({ voiceWho, text });
      }
    }
  }
  return out;
}
