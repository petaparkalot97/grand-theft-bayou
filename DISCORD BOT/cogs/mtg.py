# ===================================================================
#          🃏 MTG COG — SEARCH · DECKS · DUELS vs LISA 🃏
# ===================================================================
# /mtg opens the hub panel:
#   🔍 Search    — real card lookup via the free Scryfall API (no key)
#   📚 Deck      — build up to 3 saved decks (60 cards max) via modal
#   💜 Duel Lisa — play the Lisa Format against her. Her flirt gauge
#                  climbs while she plays; beating her pumps it hard.
#   🎯 Challenge — duel another server member (turns alternate)
#   📖 Rules     — how the Lisa Format works
#
# THE LISA FORMAT (simplified duels — real cards, approachable rules):
#   - 20 life, 7-card opening hand, one land drop per turn
#   - Lands are abstracted: you get one per turn, each taps for 💎1
#   - Spells cost their printed generic mana; creature P/T is derived
#     deterministically from the card name (same card, same fight)
#   - Attacks declared manually; defender blocks chosen by heuristic
#   - Deck-out burns your hand at 1 life per card instead of ending
#     the game instantly; games cap at MAX_TURNS turns
# ===================================================================

import discord
from discord.ext import commands
from discord import app_commands
import aiohttp
import asyncio
import hashlib
import json
import os
import random
import re
import traceback

DECKS_FILE = os.path.join("data", "mtg_decks.json")
DECK_LOCK = asyncio.Lock()

SCRYFALL_API = "https://api.scryfall.com"
SCRYFALL_HEADERS = {
    "User-Agent": "LisaBot/1.0 (personal Discord bot)",
    "Accept": "application/json;q=0.9,*/*;q=0.8",
}
MAX_DECKS = 3
MAX_DECK_SIZE = 60
MAX_COPIES = 4
BASIC_LANDS = {"plains", "island", "swamp", "mountain", "forest",
               "wastes", "snow-covered mountain", "snow-covered island",
               "snow-covered plains", "snow-covered swamp", "snow-covered forest"}
STARTING_LIFE = 20
HAND_SIZE = 7
MAX_TURNS = 30
BUTTON_TIMEOUT = 900          # 15 min per duel view
SCRY_VALIDATE_LIMIT = 25      # max card lookups when saving a deck

LISA_FAKE_UID = -1            # Lisa's player id inside duels (draws use None)

EMOJI_LISA = "💜"


# -------------------------------------------------------------------
# --- CARD DATA (Scryfall) ---
# -------------------------------------------------------------------
def _stats_from_name(name: str):
    """Deterministic P/T + generic cost from the card name.

    Same card always fights the same — no RNG, so duels are fair
    and repeatable. Power/toughness hash into 1..7, cost into 1..5.
    """
    h = hashlib.md5(name.strip().lower().encode("utf-8")).hexdigest()
    power = 1 + (int(h[:4], 16) % 7)
    toughness = 1 + (int(h[4:8], 16) % 7)
    cmc = 1 + (int(h[8:10], 16) % 5)
    return power, toughness, cmc


def _card_body(card: dict) -> str:
    """Compact rules text for search embeds."""
    bits = []
    if card.get("power") or card.get("toughness"):
        bits.append(f"**{card.get('power', '?')}/{card.get('toughness', '?')}**")
    if card.get("mana_cost"):
        bits.append(f"Mana: `{card['mana_cost']}`")
    if card.get("type_line"):
        bits.append(f"*{card['type_line']}*")
    body = "\n".join(bits)
    oracle = card.get("oracle_text")
    if oracle:
        body += ("\n\n" if body else "") + oracle[:700]
    flavor = card.get("flavor_text")
    if flavor:
        body += f"\n\n> *{flavor[:200]}*"
    return body[:1020] or "No rules text available."


def _sample_hand_text(names, n=5) -> str:
    """Random n-card sample with Lisa Format stats — hand-quality preview.
    Drawn fresh each time the embed is built, so reopening rerolls it."""
    if not names:
        return "*empty deck — no hand to deal*"
    picks = random.sample(list(names), min(n, len(names)))
    parts = []
    for name in picks:
        pw, th, cmc = _stats_from_name(name)
        parts.append(f"**{name}** {pw}/{th} 💎{cmc}")
    return " · ".join(parts)


def _card_choice_label(card: dict) -> str:
    pw, th, cmc = _stats_from_name(card.get("name", ""))
    kind = "creature" if (card.get("power") or card.get("toughness")) else "spell"
    return f"{kind} · {pw}/{th} · cost 💎{cmc} (Lisa Format)"


class ScryfallClient:
    """Thin cached wrapper around the free Scryfall API."""

    def __init__(self):
        self._session = None
        self._cache = {}        # lowercase query -> card dict or None
        self._name_cache = {}   # lowercase canonical name -> card dict

    async def _ensure_session(self):
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(headers=SCRYFALL_HEADERS)
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()

    async def search_named(self, query: str):
        """Fuzzy 'named' lookup — best single card match for a query."""
        key = query.strip().lower()
        if not key:
            return None
        if key in self._cache:
            return self._cache[key]
        session = await self._ensure_session()
        try:
            async with session.get(
                f"{SCRYFALL_API}/cards/named",
                params={"fuzzy": query},
                timeout=aiohttp.ClientTimeout(total=12),
            ) as resp:
                if resp.status == 200:
                    card = await resp.json()
                    self._cache[key] = card
                    self._name_cache[(card.get("name") or "").lower()] = card
                    return card
                if resp.status == 404:
                    self._cache[key] = None
                    return None
                print(f"[MTG] Scryfall named search {resp.status} for {query!r}")
        except Exception as e:
            print(f"[MTG] Scryfall error: {e}")
        return None

    async def search_text(self, query: str):
        """Full search — up to 5 cards matching text (name/oracle)."""
        session = await self._ensure_session()
        try:
            async with session.get(
                f"{SCRYFALL_API}/cards/search",
                params={"q": query, "order": "name", "include_extras": "false"},
                timeout=aiohttp.ClientTimeout(total=12),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data.get("data", [])[:5]
        except Exception as e:
            print(f"[MTG] Scryfall text search error: {e}")
        return []


# -------------------------------------------------------------------
# --- DUEL ENGINE (pure logic — testable headless) ---
# -------------------------------------------------------------------
class DuelPlayer:
    def __init__(self, uid, name: str, is_lisa=False):
        self.uid = uid
        self.name = name
        self.is_lisa = is_lisa
        self.life = STARTING_LIFE
        self.deck = []          # [{"name", "power", "toughness", "cmc"}]
        self.hand = []
        self.battlefield = []   # creatures: {"name","power","toughness","tapped"}
        self.lands = 0
        self.lands_tapped = 0
        self.land_dropped = False

    @property
    def mana_available(self):
        return self.lands - self.lands_tapped

    def summary(self) -> str:
        hand = ", ".join(c["name"] for c in self.hand[:4]) or "—"
        if len(self.hand) > 4:
            hand += f" (+{len(self.hand) - 4} more)"
        board = ", ".join(
            f"{c['name']} {c['power']}/{c['toughness']}"
            + (" (tapped)" if c.get("tapped") else "")
            for c in self.battlefield
        ) or "empty"
        return (
            f"**{self.name}** — ❤️ {self.life} | 🃏 {len(self.hand)} in hand | "
            f"💎 {self.mana_available}/{self.lands} lands\n"
            f"Battlefield: {board}\nHand: {hand}"
        )


class LisaDuel:
    """One duel. All game math lives here so it's testable headless."""

    def __init__(self, challenger_id: int, challenger_name: str,
                 decks_by_uid: dict, opponent: dict, seed=None):
        """opponent: {"uid": int, "name": str, "is_lisa": bool}
        decks_by_uid: {uid: [card name, ...]} — Lisa's deck is generated."""
        self.rng = random.Random(seed)
        self.turn_count = 0
        self.current = 0        # index into players; challenger starts
        self.log = []
        self.finished = False
        self.winner_uid = None  # None while running AND on a draw
        self.pending_ai_reply = None
        self.players = []

        p1 = DuelPlayer(challenger_id, challenger_name)
        p1.deck = self._build_from_names(decks_by_uid.get(challenger_id) or [])
        if not p1.deck:
            p1.deck = self._default_deck()
        self.players.append(p1)

        if opponent.get("is_lisa"):
            lp = DuelPlayer(LISA_FAKE_UID, "Lisa", is_lisa=True)
            lp.deck = self._lisa_deck()
        else:
            oid = opponent["uid"]
            lp = DuelPlayer(oid, opponent["name"])
            lp.deck = self._build_from_names(decks_by_uid.get(oid) or [])
            if not lp.deck:
                lp.deck = self._default_deck()
        self.players.append(lp)

        for p in self.players:
            self.rng.shuffle(p.deck)
            p.hand = [p.deck.pop() for _ in range(min(HAND_SIZE, len(p.deck)))]

        self.log.append("⚔️ The duel begins! Lisa Format: 20 life, one land per turn.")

    # --- deck construction -----------------------------------------
    @staticmethod
    def _build_from_names(names):
        deck = []
        for n in names[:MAX_DECK_SIZE]:
            pw, th, cmc = _stats_from_name(n)
            deck.append({"name": n, "power": pw, "toughness": th, "cmc": cmc})
        return deck

    @staticmethod
    def _default_deck():
        """Fallback draft for people who challenge without a saved deck."""
        flavor = [
            "Grizzly Bears", "Llanowar Elves", "Serra Angel", "Shivan Dragon",
            "Hill Giant", "Giant Growth", "Lightning Bolt", "Counterspell",
            "Savannah Lions", "Hypnotic Specter", "Sengir Vampire", "Juggernaut",
            "Bog Wraith", "Grave Titan", "Sun Titan", "Acidic Slime",
        ]
        deck = []
        for i in range(MAX_DECK_SIZE):
            n = flavor[i % len(flavor)]
            pw, th, cmc = _stats_from_name(n)
            deck.append({"name": n, "power": pw, "toughness": th, "cmc": cmc})
        return deck

    @staticmethod
    def _lisa_deck():
        """Lisa's deck — oppressive, and entirely an excuse for innuendo."""
        names = [
            "Hypnotic Specter", "Sengir Vampire", "Necropotence", "Dark Ritual",
            "Korvold, Fae-Cursed King", "Sheoldred, the Apocalypse",
            "Grave Titan", "Consecrated Sphinx", "Smothering Tithe",
            "Rhystic Study", "Cyclonic Rift", "Fierce Guardianship", "Swan Song",
        ]
        deck = []
        for i in range(MAX_DECK_SIZE):
            n = names[i % len(names)]
            pw, th, cmc = _stats_from_name(n)
            deck.append({"name": n, "power": pw, "toughness": th, "cmc": cmc})
        return deck

    # --- turn flow ---------------------------------------------------
    @property
    def active_player(self):
        return self.players[self.current]

    @property
    def opponent_of_active(self):
        return self.players[1 - self.current]

    def _draw(self, player, n=1):
        for _ in range(n):
            if player.deck:
                player.hand.append(player.deck.pop())
            elif player.hand:   # deck-out: burn from hand, 1 life per card
                player.hand.pop()
                player.life -= 1

    def begin_turn(self):
        p = self.active_player
        p.lands_tapped = 0
        for c in p.battlefield:
            c["tapped"] = False
        p.land_dropped = False
        self.turn_count += 1
        self._draw(p, 1)
        if p.is_lisa:
            self.pending_ai_reply = self.rng.choice([
                "Unnh… untapping… you have *no idea* how long that takes. [FLIRT: +6]",
                "Tapping my lands. Slowly. You're watching, aren't you. [FLIRT: +6]",
                "Big mana turn, bebiiii. Hope you're ready for something huge. [FLIRT: +6]",
                "Sleeving up another threat. Try not to lose composure. [FLIRT: +6]",
                "Top-decking like the universe wants me. It usually does. [FLIRT: +6]",
            ])

    def play_land(self, player) -> str:
        if player.land_dropped:
            return "One land per turn, greedy."
        player.lands += 1
        player.land_dropped = True
        self.log.append(f"🌾 {player.name} plays a land ({player.lands} total).")
        return None

    def cast(self, player, hand_index: int) -> str:
        if not (0 <= hand_index < len(player.hand)):
            return "That card isn't in your hand."
        card = player.hand[hand_index]
        if card["cmc"] > player.mana_available:
            return (f"Not enough mana — **{card['name']}** costs 💎{card['cmc']}, "
                    f"you have 💎{player.mana_available} untapped.")
        player.lands_tapped += card["cmc"]
        player.hand.pop(hand_index)
        player.battlefield.append({
            "name": card["name"], "power": card["power"],
            "toughness": card["toughness"], "tapped": False,
        })
        self.log.append(
            f"✨ {player.name} casts **{card['name']}** "
            f"({card['power']}/{card['toughness']}) for 💎{card['cmc']}."
        )
        if player.is_lisa and self.rng.random() < 0.4:
            self.pending_ai_reply = self.rng.choice([
                f"Casting {card['name']}. It's not the size that matters — it's exactly the size. [FLIRT: +4]",
                f"{card['name']} enters the battlefield. So do I, emotionally. [FLIRT: +4]",
                f"Resolving {card['name']}. No counterspells? How trusting of you. [FLIRT: +4]",
            ])
        return None

    def declare_attackers(self, player, creature_indices) -> str:
        if not creature_indices:
            return "No creatures ready to attack — play something first."
        attackers = []
        for i in creature_indices:
            if not (0 <= i < len(player.battlefield)):
                return "That creature doesn't exist."
            c = player.battlefield[i]
            if c.get("tapped"):
                return f"**{c['name']}** is already tapped."
            attackers.append(c)
        for c in attackers:
            c["tapped"] = True

        defender = self.opponent_of_active
        blockers = self._auto_block(defender, attackers)
        unblocked_damage = 0
        for atk in attackers:
            blk = blockers.get(id(atk))
            if blk is None:
                unblocked_damage += atk["power"]
                continue
            if atk["power"] >= blk["toughness"]:
                if blk in defender.battlefield:
                    defender.battlefield.remove(blk)
                if blk["power"] >= atk["toughness"] and atk in player.battlefield:
                    player.battlefield.remove(atk)
                self.log.append(f"🗡️ **{atk['name']}** trades into **{blk['name']}**.")
            else:
                self.log.append(f"🛡️ **{blk['name']}** blocks **{atk['name']}** and holds.")
        if unblocked_damage:
            defender.life -= unblocked_damage
            self.log.append(
                f"💥 {defender.name} takes **{unblocked_damage}** damage "
                f"(❤️ {max(0, defender.life)} left)."
            )
        if defender.life <= 0:
            self.finished = True
            self.winner_uid = player.uid
            self.log.append(f"🏆 **{player.name} WINS!**")
        return None

    def _auto_block(self, defender, attackers):
        """Block the biggest threat with the best survivor; trade only when
        desperate; never block with tapped creatures."""
        blocks = {id(a): None for a in attackers}   # creature dicts aren't hashable
        avail = [c for c in defender.battlefield if not c.get("tapped")]
        for atk in sorted(attackers, key=lambda a: a["power"], reverse=True):
            if not avail:
                break
            survivors = [b for b in avail if b["toughness"] > atk["power"]]
            pick = None
            if survivors:
                pick = max(survivors, key=lambda b: b["power"])
            elif defender.life <= atk["power"] + 4:
                lethal = [b for b in avail if b["power"] >= atk["toughness"]]
                if lethal:
                    pick = max(lethal, key=lambda b: b["power"])
            if pick:
                blocks[id(atk)] = pick
                avail.remove(pick)
        return blocks

    def end_turn(self) -> bool:
        """Pass the turn. If Lisa is next, her whole turn resolves now.
        Returns True if an AI turn bundle happened."""
        self.current = 1 - self.current
        self.begin_turn()
        if self.active_player.is_lisa and not self.finished:
            self._lisa_take_turn()
            if not self.finished:
                self.current = 1 - self.current
                self.begin_turn()
            return True
        return False

    def _lisa_take_turn(self):
        """Lisa AI: drop a land, cast the biggest affordable threat,
        attack all-in when it's lethal or the coast is clear."""
        p = self.active_player
        if not p.land_dropped:
            self.play_land(p)
        while p.hand:
            castable = [i for i, c in enumerate(p.hand) if c["cmc"] <= p.mana_available]
            if not castable:
                break
            best = max(castable, key=lambda i: p.hand[i]["power"] + p.hand[i]["toughness"])
            if self.cast(p, best):
                break
        if p.battlefield:
            foe = self.opponent_of_active
            ready = [i for i, c in enumerate(p.battlefield) if not c.get("tapped")]
            total_power = sum(p.battlefield[i]["power"] for i in ready)
            if total_power >= foe.life or not foe.battlefield:
                self.declare_attackers(p, ready)
            else:
                big = max(ready, key=lambda i: p.battlefield[i]["power"])
                self.declare_attackers(p, [big])
        if not self.finished and self.rng.random() < 0.5:
            self.pending_ai_reply = self.rng.choice([
                "Attack phase. Brace yourself, stooge. [FLIRT: +5]",
                "Swinging. This is the fun part for me. [FLIRT: +5]",
                "You should see your face when my creatures resolve. [FLIRT: +5]",
            ])

    def check_turn_cap(self):
        if not self.finished and self.turn_count >= MAX_TURNS * 2:
            self.finished = True
            a, b = self.players
            if a.life == b.life:
                self.winner_uid = None       # draw — Lisa calls it romantic
            else:
                self.winner_uid = (a if a.life > b.life else b).uid
            self.log.append("⏳ Turn limit reached — the judge (Lisa) calls it.")

    def state_text(self) -> str:
        p1, p2 = self.players
        return (f"{p1.summary()}\n\n{p2.summary()}\n\n⏱️ Turn {self.turn_count} — "
                f"**{self.active_player.name}**'s move\n"
                + "\n".join(self.log[-6:]))


# -------------------------------------------------------------------
# --- VIEWS & MODALS ---
# -------------------------------------------------------------------
class MTGPanelView(discord.ui.View):
    def __init__(self, cog):
        super().__init__(timeout=300)
        self.cog = cog

    @discord.ui.button(label="Search", style=discord.ButtonStyle.primary, emoji="🔍", row=0)
    async def search_btn(self, interaction: discord.Interaction, _):
        await interaction.response.send_modal(MTGSearchModal(self.cog))

    @discord.ui.button(label="Deck", style=discord.ButtonStyle.secondary, emoji="📚", row=0)
    async def deck_btn(self, interaction: discord.Interaction, _):
        await interaction.response.defer(ephemeral=True)
        await self.cog.open_deck_builder(interaction)

    @discord.ui.button(label="Duel Lisa", style=discord.ButtonStyle.danger, emoji="💜", row=0)
    async def duel_lisa_btn(self, interaction: discord.Interaction, _):
        await interaction.response.defer()
        await self.cog.start_duel(interaction, opponent=None)

    @discord.ui.select(cls=discord.ui.UserSelect,
                       placeholder="🎯 Challenge a member to a duel…", row=1)
    async def challenge_select(self, select: discord.ui.UserSelect,
                               interaction: discord.Interaction):
        user = select.values[0]
        if user.bot and user.id != interaction.client.user.id:
            return await interaction.response.send_message(
                "❌ That one's a bot, and not the fun kind.", ephemeral=True)
        if user.id == interaction.user.id:
            return await interaction.response.send_message(
                "❌ You can't duel yourself. Lisa tried once; the mirror won.",
                ephemeral=True)
        await interaction.response.defer()
        await self.cog.start_duel(interaction, opponent=user)

    @discord.ui.button(label="Rules", style=discord.ButtonStyle.secondary, emoji="📖", row=2)
    async def rules_btn(self, interaction: discord.Interaction, _):
        await interaction.response.send_message(embed=self.cog.rules_embed(), ephemeral=True)


class MTGSearchModal(discord.ui.Modal, title="🔍 Card Search"):
    query = discord.ui.TextInput(label="Card name", placeholder="e.g. sheoldred",
                                 max_length=80)

    def __init__(self, cog):
        super().__init__()
        self.cog = cog

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer()
        card = await self.cog.scryfall.search_named(str(self.query.value))
        if not card:
            return await interaction.followup.send(
                f"❌ No card found for **{self.query.value}**. Lisa judges your spelling.",
                ephemeral=True)
        embed = discord.Embed(
            title=f"{card.get('name', '?')}  {card.get('mana_cost', '')}".strip(),
            url=card.get("scryfall_uri"),
            description=_card_body(card),
            color=0x9B59B6,
        )
        if card.get("set_name"):
            embed.set_footer(text=f"{card['set_name']} · {card.get('set', '').upper()}")
        img = (card.get("image_uris") or {}).get("normal")
        if img:
            embed.set_image(url=img)
        await interaction.followup.send(embed=embed)


class MTGDeckModal(discord.ui.Modal):
    """Paste a decklist: one card per line, optional count prefix."""

    cards = discord.ui.TextInput(
        label="Decklist — one card per line ('4 Lightning Bolt')",
        style=discord.TextStyle.paragraph,
        placeholder="4 Lightning Bolt\n4 Counterspell\n10 Island\n2 Sheoldred, the Apocalypse\n…",
        max_length=1800,
        required=False,
    )

    def __init__(self, cog, slot: int):
        super().__init__(title=f"📚 Deck slot {slot + 1}")
        self.cog = cog
        self.slot = slot

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        raw = str(self.cards.value or "").strip()
        uid = str(interaction.user.id)
        decks = self.cog._load_decks()
        decks.setdefault(uid, [])
        while len(decks[uid]) <= self.slot:
            decks[uid].append([])

        if not raw:  # empty input clears the slot
            decks[uid][self.slot] = []
            await self.cog._save_decks(decks)
            return await interaction.followup.send(
                f"🗑️ Deck {self.slot + 1} cleared.", ephemeral=True)

        # parse "count name" lines
        parsed = {}   # canonical-ish name -> count
        for line in raw.splitlines():
            line = line.strip()
            if not line:
                continue
            m = re.match(r"^(\d{1,2})\s+x?\s+(.+)$", line, re.IGNORECASE)
            count, name = (int(m.group(1)), m.group(2)) if m else (1, line)
            parsed[name] = parsed.get(name, 0) + count

        # validate up to SCRY_VALIDATE_LIMIT unique names via Scryfall
        final, notes, unknown = [], [], []
        for name, count in list(parsed.items())[:SCRY_VALIDATE_LIMIT]:
            card = await self.cog.scryfall.search_named(name)
            if card:
                canon = card.get("name", name)
                key = canon.lower()
                if key not in [k.lower() for k in unknown]:
                    max_copies = (20 if key in BASIC_LANDS else MAX_COPIES)
                    count = min(count, max_copies)
                    notes.append(f"• {canon} ×{count}")
                    final.extend([canon] * count)
            else:
                unknown.append(name)
        if len(parsed) > SCRY_VALIDATE_LIMIT:
            notes.append(f"• …{len(parsed) - SCRY_VALIDATE_LIMIT} more lines skipped "
                         f"(validation limit {SCRY_VALIDATE_LIMIT})")
        for name in unknown:
            notes.append(f"❓ Unknown: {name}")

        final = final[:MAX_DECK_SIZE]
        decks[uid][self.slot] = final
        await self.cog._save_decks(decks)
        extra = final[len(notes):]
        summary = "\n".join(notes[:20])
        if extra:
            summary += f"\n• …and {len(extra)} more cards"
        await interaction.followup.send(
            f"💾 **Deck {self.slot + 1} saved** — {len(final)}/{MAX_DECK_SIZE} cards.\n{summary}"
            f"\n\n🎲 Opening sample: {_sample_hand_text(final)}",
            ephemeral=True)


class DeckView(discord.ui.View):
    def __init__(self, cog, user_id):
        super().__init__(timeout=300)
        self.cog = cog
        self.user_id = user_id

    @discord.ui.select(placeholder="📚 Pick a deck slot to edit…", options=[
        discord.SelectOption(label="Deck 1", value="0", emoji="1️⃣"),
        discord.SelectOption(label="Deck 2", value="1", emoji="2️⃣"),
        discord.SelectOption(label="Deck 3", value="2", emoji="3️⃣"),
    ])
    async def slot_select(self, select: discord.ui.Select,
                          interaction: discord.Interaction):
        await interaction.response.send_modal(
            MTGDeckModal(self.cog, int(select.values[0])))

    @discord.ui.button(label="My decks", style=discord.ButtonStyle.secondary,
                       emoji="👁️", row=1)
    async def show_btn(self, interaction: discord.Interaction, _):
        decks = self.cog._load_decks().get(str(interaction.user.id), [])
        if not decks:
            desc = "*No decks yet.*"
        else:
            lines = []
            for i, d in enumerate(decks[:MAX_DECKS]):
                preview = ", ".join(d[:6]) + ("…" if len(d) > 6 else "")
                lines.append(f"**Deck {i+1}** ({len(d)} cards): {preview or 'empty'}")
                lines.append(f"🎲 Opening sample: {_sample_hand_text(d)}")
            desc = "\n".join(lines)
        await interaction.response.send_message(
            embed=discord.Embed(title="📚 Your decks", description=desc, color=0x9B59B6),
            ephemeral=True)


class DuelView(discord.ui.View):
    """Buttons + hand select for the human whose turn it is.

    Rebuilt after every action via _refresh() so the select always shows
    the current hand and the uid check keeps turns honest."""

    def __init__(self, cog, duel: LisaDuel):
        super().__init__(timeout=BUTTON_TIMEOUT)
        self.cog = cog
        self.duel = duel
        self._refresh()

    def _human(self) -> DuelPlayer:
        d = self.duel
        # Lisa's turns resolve instantly inside end_turn, so the view is
        # only ever interacted with while a human is active.
        return d.active_player if not d.active_player.is_lisa else d.opponent_of_active

    def _refresh(self):
        for child in list(self.children):
            self.remove_item(child)
        d, human = self.duel, self._human()

        if d.finished:
            return

        options = [
            discord.SelectOption(
                label=c["name"][:100], value=str(i),
                description=f"{c['power']}/{c['toughness']} · cost 💎{c['cmc']}")
            for i, c in enumerate(human.hand[:25])
        ] or [discord.SelectOption(label="(hand empty — end turn)", value="-1")]
        hand_select = discord.ui.Select(
            placeholder=f"✨ {human.name}: pick a card to cast…", options=options, row=0)
        hand_select.callback = self._cast_callback
        self.add_item(hand_select)

        for label, emoji, style, action in [
            ("Play Land", "🌾", discord.ButtonStyle.secondary, "land"),
            ("Attack", "🗡️", discord.ButtonStyle.danger, "attack"),
            ("End Turn", "⏭️", discord.ButtonStyle.primary, "end"),
            ("Concede", "🏳️", discord.ButtonStyle.secondary, "concede"),
        ]:
            btn = discord.ui.Button(label=label, emoji=emoji, style=style,
                                    custom_id=f"mtg_{action}", row=1)
            btn.callback = self._button_callback
            self.add_item(btn)

    async def _cast_callback(self, interaction: discord.Interaction):
        # the select is child 0
        select = self.children[0]
        await self.cog.duel_action(interaction, self, "cast",
                                   hand_index=int(select.values[0]))

    async def _button_callback(self, interaction: discord.Interaction):
        action = interaction.data["custom_id"].replace("mtg_", "")
        await self.cog.duel_action(interaction, self, action)


# -------------------------------------------------------------------
# --- MAIN COG ---
# -------------------------------------------------------------------
class MTGCog(commands.Cog):
    """MTG hub: Scryfall search, deck builder, and Lisa Format duels."""

    LISA_WIN_LINES = [          # Lisa won — she gloats
        "Told you. Now bow to the queen of the stack. [FLIRT: +15]",
        "That was a lesson, not a game. I charge for the next one. [FLIRT: +12]",
        "Your board state and your OPSEC have something in common. [FLIRT: +10]",
    ]
    LISA_LOSE_LINES = [         # Lisa lost — she copes
        "…rematch. Right now. This proves nothing. [FLIRT: -5]",
        "I let you win. For morale. Mine. [FLIRT: -5]",
        "Fine. FINE. Your deck is 'adequate'. Happy?! [FLIRT: -8]",
    ]
    LISA_DRAW_LINE = "🤝 A draw. Lisa declares it 'unresolved romantic tension'. [FLIRT: +8]"

    def __init__(self, bot):
        self.bot = bot
        self.scryfall = ScryfallClient()
        self._lisa_cog = None

    def _lisa(self):
        if self._lisa_cog is None:
            self._lisa_cog = self.bot.get_cog("LisaCog")
        return self._lisa_cog

    async def cog_load(self):
        os.makedirs("data", exist_ok=True)
        asyncio.create_task(self._warmup())

    async def _warmup(self):
        try:   # warm one cache entry so the first search isn't cold
            await self.scryfall.search_named("black lotus")
        except Exception:
            pass

    async def cog_unload(self):
        await self.scryfall.close()

    # --- persistence --------------------------------------------------
    def _load_decks(self) -> dict:
        try:
            if os.path.exists(DECKS_FILE):
                with open(DECKS_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
        except Exception as e:
            print(f"⚠️ MTG decks load error: {e}")
        return {}

    async def _save_decks(self, data):
        async with DECK_LOCK:
            try:
                with open(DECKS_FILE, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2)
            except Exception as e:
                print(f"❌ MTG decks save failed: {e}")

    # --- /mtg ----------------------------------------------------------
    @app_commands.command(
        name="mtg",
        description="Magic: The Gathering — search cards, build decks, duel Lisa.")
    async def mtg(self, interaction: discord.Interaction):
        embed = discord.Embed(
            title="🃏 Magic: The Gathering Hub",
            description=(
                "Welcome to the stack, stooge. ✨\n\n"
                "**🔍 Search** — look up any real card (Scryfall).\n"
                "**📚 Deck** — build & save up to 3 decks of 60 via paste-in modal.\n"
                "**💜 Duel Lisa** — play the Lisa Format against me. I flirt *and* I top-deck.\n"
                "**🎯 Challenge** — pick a member from the dropdown to duel them.\n"
                "**📖 Rules** — the Lisa Format, explained."
            ),
            color=0x9B59B6,
        )
        embed.set_footer(text="Every term in this game is an innuendo and I refuse to pretend otherwise.")
        await interaction.response.send_message(embed=embed, view=MTGPanelView(self))

    def rules_embed(self):
        return discord.Embed(
            title="📖 The Lisa Format",
            description=(
                "Simplified MTG — real cards, approachable rules:\n\n"
                f"• **{STARTING_LIFE} life**, 7-card opening hand, one land drop per turn.\n"
                "• Lands are abstracted: one per turn, each taps for 💎1. "
                "Spells cost their printed generic mana — colors are flavor, "
                "exactly like my threats.\n"
                "• Creature power/toughness is derived deterministically from the "
                "card name: same card, same fight, every time.\n"
                "• **Play Land**, **Attack** (all creatures), or **End Turn**. "
                "The defender's blocks are chosen by their AI — it blocks big "
                "threats and trades up when desperate.\n"
                f"• Deck-out burns your hand at 1 life per card. Games cap at "
                f"{MAX_TURNS} turns — then whoever's ahead wins.\n"
                "• Beating Lisa does... things to her. You'll see. 💜"
            ),
            color=0x9B59B6,
        )

    # --- deck builder ---------------------------------------------------
    async def open_deck_builder(self, interaction: discord.Interaction):
        decks = self._load_decks().get(str(interaction.user.id), [])
        lines = []
        for i, d in enumerate(decks[:MAX_DECKS]):
            preview = ", ".join(d[:6]) + ("…" if len(d) > 6 else "")
            lines.append(f"**Deck {i+1}** ({len(d)} cards): {preview or 'empty'}")
            lines.append(f"🎲 Opening sample: {_sample_hand_text(d)}")
        if not lines:
            lines.append("*No decks yet — pick a slot below and paste a decklist.*")
        embed = discord.Embed(
            title="📚 Your Decks",
            description="\n".join(lines) +
                        "\n\nPick a slot → paste a decklist (one card per line, "
                        "`4 Lightning Bolt` for copies). Empty paste clears the slot. "
                        "Names are auto-corrected via Scryfall. "
                        "_🎲 Sample = 5 random cards with Lisa Format stats — "
                        "reopen to reroll._",
            color=0x9B59B6,
        )
        await interaction.followup.send(embed=embed, view=DeckView(self, interaction.user.id),
                                        ephemeral=True)

    # --- duels ------------------------------------------------------------
    async def start_duel(self, interaction: discord.Interaction, opponent):
        """opponent None => Lisa, else a discord.Member/User."""
        challenger = interaction.user
        decks = self._load_decks()
        decks_by_uid = {int(k): v for k, v in decks.items() if k.isdigit()}

        if opponent is None:
            opp = {"uid": LISA_FAKE_UID, "name": "Lisa 💜", "is_lisa": True}
        else:
            opp = {"uid": opponent.id, "name": opponent.display_name, "is_lisa": False}

        duel = LisaDuel(challenger.id, challenger.display_name, decks_by_uid, opp,
                        seed=random.randrange(2**31))
        duel.begin_turn()

        text = (f"⚔️ **{challenger.display_name}** vs **{opp['name']}** — Lisa Format!\n"
                + duel.state_text())
        view = DuelView(self, duel)
        await interaction.followup.send(content=text[:1990], view=view)

        if opp["is_lisa"]:
            lisa_cog = self._lisa()
            if lisa_cog and lisa_cog.memory.get_user_memory(challenger.id)["flirt_level"] >= 100:
                await interaction.followup.send(
                    content=f"{EMOJI_LISA} <@{challenger.id}> — a DUEL?! Now?! "
                            f"You shouldn't have. SLEEVE UP.")

    async def duel_action(self, interaction: discord.Interaction, view: DuelView,
                          action: str, hand_index=None):
        duel = view.duel
        human = view._human()
        if interaction.user.id != human.uid:
            return await interaction.response.send_message(
                "❌ Not your turn, benchwarmer.", ephemeral=True)
        if duel.finished:
            return await interaction.response.send_message(
                "❌ This duel is over.", ephemeral=True)

        err = None
        if action == "cast":
            if hand_index is None or hand_index < 0:
                return await interaction.response.defer()  # empty-hand select — ignore
            err = duel.cast(human, hand_index)
        elif action == "land":
            err = duel.play_land(human)
        elif action == "attack":
            err = duel.declare_attackers(
                human, [i for i, c in enumerate(human.battlefield) if not c.get("tapped")])
        elif action == "concede":
            duel.finished = True
            duel.winner_uid = duel.opponent_of_active.uid
            duel.log.append(f"🏳️ {human.name} concedes. Lisa logs this permanently.")
        elif action == "end":
            duel.end_turn()
        else:
            err = "Unknown action."

        if err:
            return await interaction.response.send_message(f"❌ {err}", ephemeral=True)

        duel.check_turn_cap()
        view._refresh()
        state = (f"⚔️ **{duel.players[0].name}** vs **{duel.players[1].name}** — Lisa Format\n"
                 + duel.state_text())
        await interaction.response.edit_message(content=state[:1990], view=view)

        if duel.finished:
            await self._finish_duel(interaction, duel)
        else:
            await self._maybe_lisa_chirp(interaction, duel)

    async def _maybe_lisa_chirp(self, interaction, duel):
        if not duel.pending_ai_reply:
            return
        line = duel.pending_ai_reply
        duel.pending_ai_reply = None
        lisa_cog = self._lisa()
        if not lisa_cog:
            return
        from cogs.lisa import _extract_flirt_delta
        line_clean, delta = _extract_flirt_delta(line)
        await lisa_cog.memory.update_flirt_level_async(interaction.user.id, delta)
        await interaction.followup.send(f"{EMOJI_LISA} {line_clean}")

    async def _finish_duel(self, interaction, duel: LisaDuel):
        lisa_cog = self._lisa()
        p1, p2 = duel.players
        if p2.is_lisa:
            if duel.winner_uid is None:                      # draw
                line_raw = self.LISA_DRAW_LINE
            elif duel.winner_uid == p2.uid:                  # Lisa won
                line_raw = random.choice(self.LISA_WIN_LINES)
            else:                                            # human won
                line_raw = random.choice(self.LISA_LOSE_LINES)
            if lisa_cog:
                from cogs.lisa import _extract_flirt_delta
                line_clean, delta = _extract_flirt_delta(line_raw)
                await lisa_cog.memory.update_flirt_level_async(p1.uid, delta)
                # Beating Lisa slams the gauge — guaranteed meltdown territory
                if duel.winner_uid == p1.uid:
                    await lisa_cog.memory.update_flirt_level_async(p1.uid, 40)
                await interaction.followup.send(f"{EMOJI_LISA} {line_clean}")
        else:
            winner = p1 if duel.winner_uid == p1.uid else p2
            loser = p2 if duel.winner_uid == p1.uid else p1
            if duel.winner_uid is None:
                await interaction.followup.send("🤝 It's a draw. Lisa calls it chemistry.")
            else:
                await interaction.followup.send(
                    f"🏆 GG **{winner.name}** — better luck next time, {loser.name}.")


async def setup(bot):
    await bot.add_cog(MTGCog(bot))
    print("🃏 MTG COG LOADED — search, decks, duels vs Lisa ✨")
