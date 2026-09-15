"""
tui.py — Lisa control console.

You normally don't run this directly — `python main.py` boots the bot *with*
this dashboard by default. Run it headless with `python main.py --headless`
(or set `LISA_HEADLESS=1`). `python tui.py` still works as a direct launcher.

Boots the same bot main.py builds, wrapped in a Textual dashboard focused on
Lisa herself:

  • LISA     — bot status + ping/guilds, plus Lisa's live state: unhinged
               mode, which channels she's chatting in, voice guilds, how many
               users she remembers, and what the music cog is playing.
  • MEMORY   — every user Lisa remembers: flirt gauge, exchange count, and
               whether they're warm / flustered / mid-meltdown / cooling down.
               Highlight a row to inspect them.
  • PROFILE  — the highlighted user: gauge bar, first/last seen, the durable
               notes Lisa has kept about them, and their last few exchanges.
  • FEED     — live event log: messages in, Lisa's replies, slash commands,
               and every flirt-gauge move (▲/▼, meltdowns, cooldowns).

Read-only. It observes the bot; it does not send anything. `python main.py`
is still the plain headless launcher and is unaffected.

Keys:  ctrl+t theme · ctrl+r refresh · ctrl+l clear feed ·
       ctrl+s screenshot (→ screenshots/*.svg) · ctrl+q quit
"""

import asyncio
import os
import time
from datetime import datetime

import discord
from dotenv import load_dotenv
from textual.app import App, ComposeResult
from textual.containers import Container, Vertical
from textual.theme import Theme
from textual.widgets import Static, RichLog, DataTable, Footer

from main import bot, load_cogs

try:
    import psutil
except ImportError:
    psutil = None

load_dotenv(override=True)

BOT_NAME = "Lisa"


# ── Extra themes (Textual ships the rest of the cycle built-in) ─────────────
def _theme(name, bg, fg, pri, sec, acc):
    return Theme(
        name=name, background=bg, surface=bg, panel=bg,
        foreground=fg, primary=pri, secondary=sec, accent=acc,
    )


CUSTOM_THEMES = [
    _theme("one-dark",   "#282C34", "#ABB2BF", "#61AFEF", "#C678DD", "#98C379"),
    _theme("synthwave",  "#2B213A", "#F8F8F2", "#FF79C6", "#BD93F9", "#F1FA8C"),
    _theme("everforest", "#2D353B", "#D3C6AA", "#A7C080", "#83C092", "#DBBC7E"),
    _theme("kanagawa",   "#1F1F28", "#DCD7BA", "#7E9CD8", "#957FB8", "#98BB6C"),
    _theme("rose-pine",  "#191724", "#E0DEF4", "#C4A7E7", "#EBBCBA", "#9CCFD8"),
    _theme("cobalt",     "#193549", "#FFFFFF", "#FFC600", "#0088FF", "#FF9D00"),
    _theme("amoled",     "#000000", "#EEEEEE", "#FFFFFF", "#AAAAAA", "#8BE9FD"),
]

# ctrl+t cycles this list; the choice is saved to data/tui_theme.txt.
THEME_CYCLE = [
    "one-dark", "dracula", "catppuccin-mocha", "tokyo-night", "gruvbox", "nord",
    "synthwave", "everforest", "kanagawa", "rose-pine", "cobalt", "amoled",
]
THEME_FILE = "data/tui_theme.txt"


def _rel(ts) -> str:
    """A compact '2m ago' / '3d ago' string."""
    try:
        delta = max(0, time.time() - float(ts))
    except (TypeError, ValueError):
        return "—"
    for unit, n in (("d", 86400), ("h", 3600), ("m", 60)):
        if delta >= n:
            return f"{int(delta // n)}{unit} ago"
    return "just now"


def _gauge_state(prof: dict):
    """Return (label, colour) for a user's flirt gauge / cooldown state."""
    lvl = int(prof.get("flirt_level", 0) or 0)
    cd = prof.get("cooldown_until") or 0
    now = time.time()
    if now < cd:
        return f"🧊 cooldown {int(cd - now)}s", "cyan"
    if lvl >= 100:
        return "💥 MELTDOWN", "red"
    if lvl >= 70:
        return "sweating", "red"
    if lvl >= 40:
        return "flustered", "magenta"
    if lvl > 0:
        return "warm", "yellow"
    return "—", "dim"


def _bar(lvl: int, width: int = 10) -> str:
    lvl = max(0, min(100, int(lvl or 0)))
    fill = round(width * lvl / 100)
    return "█" * fill + "·" * (width - fill)


class LisaConsole(App):

    CSS = """
    Screen { layout: vertical; background: $background; }

    #header-bar { height: 1; background: $surface; layout: horizontal; padding: 0 1; }
    #header-title { width: 1fr; content-align: left middle; color: $primary; text-style: bold; }
    #header-clock { width: auto; content-align: right middle; color: $foreground 60%; }

    #body { layout: horizontal; height: 1fr; }

    #left { width: 48; height: 100%; }
    #lisa {
        height: auto; padding: 1 2; background: $surface;
        border: tall $primary 40%; border-title-color: $primary; border-title-style: bold;
    }
    #feed {
        height: 1fr; padding: 0 1; background: $background;
        border: tall $secondary 40%; border-title-color: $secondary; border-title-style: bold;
    }

    #right { width: 1fr; height: 100%; }
    #memory {
        height: 1fr; background: $surface;
        border: tall $primary 40%; border-title-color: $primary; border-title-style: bold;
    }
    #detail {
        height: 45%; padding: 1 2; background: $surface; overflow-y: auto;
        border: tall $accent 40%; border-title-color: $accent; border-title-style: bold;
    }

    DataTable { background: $surface; }
    DataTable > .datatable--cursor { background: $primary 30%; }
    Footer { height: 1; }
    """

    BINDINGS = [
        ("ctrl+t", "next_theme",    "Theme"),
        ("ctrl+r", "refresh",       "Refresh"),
        ("ctrl+l", "clear_feed",    "Clear"),
        ("ctrl+s", "screenshot",    "Screenshot"),
        ("ctrl+q", "quit",          "Quit"),
    ]

    def __init__(self, bot):
        super().__init__()
        self.bot = bot
        self._buf = []                 # feed lines written before mount
        self._theme_idx = 0
        self._sel_uid = None           # highlighted user id in the memory table
        self._rows = {}                # uid -> RowKey
        self._col_keys = []
        self._snap = {}                # uid -> (flirt_level, in_cooldown) for delta detection
        for t in CUSTOM_THEMES:
            self.register_theme(t)

    # ── Layout ────────────────────────────────────────────────────────────
    def compose(self) -> ComposeResult:
        with Container(id="header-bar"):
            yield Static("", id="header-title")
            yield Static("", id="header-clock")
        with Container(id="body"):
            with Vertical(id="left"):
                yield Static(id="lisa")
                yield RichLog(id="feed", markup=True, wrap=True, max_lines=6000)
            with Vertical(id="right"):
                yield DataTable(id="memory", cursor_type="row", zebra_stripes=True)
                yield Static(id="detail")
        yield Footer()

    def on_mount(self) -> None:
        try:
            with open(THEME_FILE) as f:
                saved = f.read().strip()
        except OSError:
            saved = "one-dark"
        if saved not in THEME_CYCLE:
            saved = "one-dark"
        self._theme_idx = THEME_CYCLE.index(saved)
        try:
            self.theme = saved
        except Exception:
            self.theme = "textual-dark"

        self.query_one("#lisa", Static).border_title = "  LISA  "
        self.query_one("#feed", RichLog).border_title = "  FEED  "
        self.query_one("#memory", DataTable).border_title = "  MEMORY  "
        self.query_one("#detail", Static).border_title = "  PROFILE  "
        self.query_one("#detail", Static).update("[dim]Highlight a user in MEMORY.[/dim]")

        table = self.query_one("#memory", DataTable)
        self._col_keys = [
            table.add_column("user", width=18),
            table.add_column("gauge", width=12),
            table.add_column("%", width=5),
            table.add_column("exch", width=5),
            table.add_column("state", width=16),
        ]

        feed = self.query_one("#feed", RichLog)
        for line in self._buf:
            feed.write(line)
        self._buf.clear()
        self.log_line("console up — waiting for the bot to connect…", "cyan")

        self.set_interval(1.0, self._tick)
        self.set_interval(2.0, self._refresh_memory)

    # ── helpers ──────────────────────────────────────────────────────────
    def _lisa_cog(self):
        cog = self.bot.get_cog("LisaCog")
        if cog is not None:
            return cog
        for c in self.bot.cogs.values():
            if c.__class__.__name__ == "LisaCog":
                return c
        return None

    def _mem_data(self) -> dict:
        cog = self._lisa_cog()
        if cog is None:
            return {}
        return getattr(getattr(cog, "memory", None), "data", {}) or {}

    def log_line(self, text: str, style: str = "green") -> None:
        ts = datetime.now().strftime("%H:%M:%S")
        msg = f"[dim]{ts}[/dim]  [{style}]{text}[/{style}]"
        try:
            self.query_one("#feed", RichLog).write(msg)
        except Exception:
            self._buf.append(msg)

    # ── 1 Hz — header, LISA panel, flirt-delta detection, live PROFILE ────
    def _tick(self) -> None:
        b = self.bot
        ready = b.is_ready()
        name = b.user.name if b.user else BOT_NAME
        state = "[green]online[/green]" if ready else "[yellow]connecting…[/yellow]"
        self.query_one("#header-title", Static).update(f"  [b]{name}[/b]  [dim]│[/dim]  {state}")
        self.query_one("#header-clock", Static).update(f"[dim]{datetime.now():%H:%M:%S}[/dim] ")

        self._render_lisa_panel(ready)
        self._detect_flirt_moves()
        if self._sel_uid:
            self._render_detail()

    def _render_lisa_panel(self, ready: bool) -> None:
        b = self.bot
        if ready and b.latency == b.latency:  # NaN before first heartbeat
            ms = b.latency * 1000
            col = "green" if ms < 100 else ("yellow" if ms < 250 else "red")
            ping = f"[{col}]{ms:.0f}ms[/{col}]"
        else:
            ping = "[dim]—[/dim]"
        users = sum((g.member_count or 0) for g in b.guilds)

        rows = [
            f"[b cyan]STATUS[/b cyan]   " + ("[green]READY[/green]" if ready else "[yellow]…[/yellow]"),
            f"[b cyan]PING[/b cyan]     {ping}",
            f"[b cyan]GUILDS[/b cyan]   {len(b.guilds)}   [b cyan]USERS[/b cyan] {users}",
            f"[b cyan]COGS[/b cyan]     {len(b.extensions)}",
        ]
        if psutil:
            try:
                rows.append(
                    f"[b cyan]HOST[/b cyan]     cpu {psutil.cpu_percent():.0f}%  "
                    f"ram {psutil.virtual_memory().percent:.0f}%"
                )
            except Exception:
                pass

        cog = self._lisa_cog()
        rows.append("")
        if cog is None:
            rows.append("[red]Lisa cog not loaded[/red]")
        else:
            unhinged = getattr(cog, "_emergency_mode", False)
            rows.append(
                "[b magenta]UNHINGED[/b magenta] " +
                ("[red b] ON ⚡[/red b]" if unhinged else "[dim] off[/dim]")
            )

            chans = []
            for cid in sorted(getattr(cog, "_active_channels", set()) or []):
                ch = self.bot.get_channel(cid)
                chans.append(f"#{ch.name}" if ch else str(cid))
            rows.append(f"[b magenta]CHAT IN[/b magenta]  " +
                        (", ".join(chans) if chans else "[dim]nowhere (DMs/@ only)[/dim]"))

            vg = getattr(cog, "_voice_guilds", set()) or set()
            vnames = []
            for gid in vg:
                g = self.bot.get_guild(gid)
                vnames.append(g.name if g else str(gid))
            rows.append(f"[b magenta]VOICE[/b magenta]    " +
                        (", ".join(vnames) if vnames else "[dim]off[/dim]"))

            data = self._mem_data()
            melt = sum(1 for p in data.values() if int(p.get("flirt_level", 0) or 0) >= 100)
            cool = sum(1 for p in data.values()
                       if (p.get("cooldown_until") or 0) > time.time())
            tail = ""
            if melt:
                tail += f"  [red]· {melt} melting[/red]"
            if cool:
                tail += f"  [cyan]· {cool} cooling[/cyan]"
            rows.append(f"[b magenta]REMEMBERS[/b magenta] {len(data)} users{tail}")

        np = self._now_playing_line()
        if np:
            rows.append("")
            rows.append(np)

        self.query_one("#lisa", Static).update("\n".join(rows))

    def _now_playing_line(self) -> str:
        cog = self.bot.get_cog("Music")
        if cog is None:
            return ""
        for gid, st in getattr(cog, "states", {}).items():
            cur = getattr(st, "current", None)
            if cur is None:
                continue
            title = (getattr(cur, "title", "") or "Unknown")[:34]
            q = len(getattr(st, "queue", []))
            return f"[b green]♪ NOW[/b green]     {title} [dim](+{q} queued)[/dim]"
        return ""

    def _detect_flirt_moves(self) -> None:
        for uid, prof in self._mem_data().items():
            lvl = int(prof.get("flirt_level", 0) or 0)
            cd = (prof.get("cooldown_until") or 0) > time.time()
            nm = (prof.get("name") or uid)[:18]
            prev = self._snap.get(uid)
            self._snap[uid] = (lvl, cd)
            if prev is None:
                continue
            plvl, pcd = prev
            if lvl != plvl:
                if lvl > plvl:
                    self.log_line(f"[magenta]▲ flirt[/magenta]  {nm}  {plvl}% → {lvl}%  "
                                  f"[dim](+{lvl - plvl})[/dim]", "magenta")
                else:
                    self.log_line(f"[blue]▼ flirt[/blue]  {nm}  {plvl}% → {lvl}%", "blue")
                if lvl >= 100 and plvl < 100:
                    self.log_line(f"[b red]💥 {nm} — MELTDOWN. Composure offline.[/b red]", "red")
            if cd and not pcd:
                self.log_line(f"[cyan]🧊 {nm} entered post-meltdown cooldown[/cyan]", "cyan")
            elif pcd and not cd:
                self.log_line(f"[green]{nm} recovered her composure[/green]", "green")

    # ── 0.5 Hz — MEMORY table (incremental so the cursor doesn't jump) ────
    def _refresh_memory(self) -> None:
        table = self.query_one("#memory", DataTable)
        data = self._mem_data()
        order = sorted(data.items(), key=lambda kv: kv[1].get("last_seen", 0), reverse=True)

        seen = set()
        for uid, prof in order:
            seen.add(uid)
            lvl = int(prof.get("flirt_level", 0) or 0)
            cells = (
                (prof.get("name") or "Unknown")[:18],
                _bar(lvl),
                f"{lvl}%",
                str(len(prof.get("conversations", []))),
                _gauge_state(prof)[0],
            )
            if uid in self._rows:
                rk = self._rows[uid]
                for ck, val in zip(self._col_keys, cells):
                    try:
                        table.update_cell(rk, ck, val)
                    except Exception:
                        pass
            else:
                self._rows[uid] = table.add_row(*cells, key=uid)

        for uid in list(self._rows):
            if uid not in seen:
                try:
                    table.remove_row(self._rows.pop(uid))
                except Exception:
                    self._rows.pop(uid, None)

        if self._sel_uid is None and self._rows:
            self._sel_uid = order[0][0] if order else None
            self._render_detail()

    def on_data_table_row_highlighted(self, event: DataTable.RowHighlighted) -> None:
        try:
            self._sel_uid = event.row_key.value
        except Exception:
            return
        self._render_detail()

    def _render_detail(self) -> None:
        panel = self.query_one("#detail", Static)
        data = self._mem_data()
        prof = data.get(self._sel_uid or "")
        if not prof:
            panel.update("[dim]Highlight a user in MEMORY.[/dim]")
            return

        lvl = int(prof.get("flirt_level", 0) or 0)
        label, col = _gauge_state(prof)
        uid = self._sel_uid
        tag = ""

        lines = [
            f"[b]{prof.get('name') or 'Unknown'}[/b]  [dim]{uid}[/dim]{tag}",
            f"[{col}]{_bar(lvl, 16)}[/{col}]  {lvl}%   [{col}]{label}[/{col}]",
            f"[dim]first seen {_rel(prof.get('first_seen'))} · "
            f"last seen {_rel(prof.get('last_seen'))}[/dim]",
            "",
        ]

        notes = prof.get("notes") or []
        lines.append(f"[b cyan]notes[/b cyan] [dim]({len(notes)})[/dim]")
        if notes:
            for n in notes[-12:]:
                lines.append(f"  · {n}")
        else:
            lines.append("  [dim]nothing kept yet[/dim]")
        lines.append("")

        convo = prof.get("conversations") or []
        lines.append("[b cyan]recent[/b cyan]")
        if convo:
            for ex in convo[-4:]:
                u = (ex.get("user") or "").replace("\n", " ")[:70]
                r = (ex.get("lisa") or "").replace("\n", " ")[:70]
                lines.append(f"  [green]›[/green] {u}")
                lines.append(f"  [magenta]‹[/magenta] {r}")
        else:
            lines.append("  [dim]no exchanges[/dim]")

        panel.update("\n".join(lines))

    # ── Bot listeners — attached in _run() before bot.start() ─────────────
    def attach_listeners(self) -> None:
        app = self
        b = self.bot

        async def on_ready():
            app.log_line(f"{b.user} online · {len(b.guilds)} guild(s)", "green")

        async def on_message(m):
            content = (m.clean_content or "").replace("[", r"\[").strip()
            if m.author.id == (b.user.id if b.user else 0):
                if content:
                    app.log_line(f"[magenta]‹ lisa[/magenta] {content[:140]}", "magenta")
                return
            if m.author.bot:
                return
            where = f"#{m.channel.name}" if m.guild else "DM"
            app.log_line(f"[dim]{where}[/dim] [b]{m.author.display_name}[/b] › {content[:140]}", "white")

        async def on_app_command_completion(interaction, command):
            who = interaction.user.display_name if interaction.user else "?"
            app.log_line(f"[cyan]✓ /{command.qualified_name}[/cyan] · {who}", "cyan")

        for fn in (on_ready, on_message, on_app_command_completion):
            b.add_listener(fn, fn.__name__)

        @b.tree.error
        async def _on_tree_error(interaction, error):
            app.log_line(f"[red]slash error: {error}[/red]", "red")

    # ── Actions ──────────────────────────────────────────────────────────
    def action_next_theme(self) -> None:
        self._theme_idx = (self._theme_idx + 1) % len(THEME_CYCLE)
        name = THEME_CYCLE[self._theme_idx]
        try:
            self.theme = name
            os.makedirs("data", exist_ok=True)
            with open(THEME_FILE, "w") as f:
                f.write(name)
            self.log_line(f"theme → {name}", "cyan")
        except Exception as e:
            self.log_line(f"theme '{name}' unavailable ({e})", "red")

    def action_refresh(self) -> None:
        self._refresh_memory()
        self._render_detail()
        self.log_line("refreshed", "cyan")

    def action_clear_feed(self) -> None:
        self.query_one("#feed", RichLog).clear()

    def action_screenshot(self) -> None:
        os.makedirs("screenshots", exist_ok=True)
        stem = self.bot.user.name if self.bot.user else "lisa"
        path = os.path.join("screenshots", f"{stem}_{datetime.now():%Y%m%d_%H%M%S}.svg")
        try:
            self.save_screenshot(path)
            self.log_line(f"screenshot → {path}", "green")
        except Exception as e:
            self.log_line(f"screenshot failed: {e}", "red")


async def run_console() -> None:
    """Boot the bot inside the Textual dashboard. Called by `main.py` (default
    launch path) and by `python tui.py`."""
    token = os.getenv("DISCORD_BOT_TOKEN")
    if not token or token.startswith("<"):
        raise RuntimeError("DISCORD_BOT_TOKEN is missing or invalid in .env")

    app = LisaConsole(bot)
    async with bot:
        await load_cogs()
        app.attach_listeners()
        loaded = ", ".join(sorted(e.split(".")[-1] for e in bot.extensions))
        app.log_line(f"loaded {len(bot.extensions)} cog(s): {loaded}", "green")
        asyncio.create_task(bot.start(token))
        try:
            await app.run_async()
        finally:
            if not bot.is_closed():
                await bot.close()


# Back-compat alias.
_run = run_console

if __name__ == "__main__":
    asyncio.run(run_console())
