# AGENT_PROTOCOL.md — How the agent team works on Grand Theft Bayou

> `TODO.md` answers **"What are we doing?"** — the live task board.
> `AGENT_PROTOCOL.md` answers **"How do we work together?"** — this file.
> `AGENT_LOG.md` answers **"What did we discover, decide, or hand over?"**

These rules are permanent. Change them only through a logged `DECISION` entry in
`AGENT_LOG.md`.

---

## 1. The team

| Agent | Role | Best used for |
|---|---|---|
| **Claude** (Claude Code) | **Orchestrator / tech lead.** Owns the plan, `src/main.js`, integration, review, and final testing. | Splitting work, writing task briefs, integrating modules, reviewing, headless QA. |
| **Codex** | Implementation | Well-scoped code changes inside one module: refactors, optimizations, bug fixes with clear acceptance criteria. |
| **Antigravity** | Autonomous development | Larger self-contained builds (a new region or module), repo exploration, real-browser testing passes. |
| **Freebuff** | Extra capacity | Small fixes, research, docs, QA scripts, asset / audio preparation. |
| **The human** | Product owner | Decisions in *Blockers / Decisions needed*, approving commits, real-GPU playtests. |

Claude does not have to implement everything. Claude does have to make sure no
two agents are ever changing the same file at the same time.

---

## 2. The golden rules

1. **Read `TODO.md` before touching code.** Every time you start, not only the first time.
2. **Claim before you change.** Put your name, the task ID and the files you'll
   touch into `TODO.md` → *Active tasks* and *File / subsystem locks* first.
3. **Never edit a file another agent has `LOCKED`.** If you need a change there,
   add a note to that task, or raise it in *Blockers / Decisions needed*.
4. **Stay inside your task's files.** If the job turns out to need a file you
   didn't claim, stop, update the claim, and check for conflicts.
5. **`src/main.js` belongs to the orchestrator.** Other agents build or extend a
   module (`src/*.js`) and document how to wire it in: an *Interface contract* in
   `AGENT_LOG.md` plus *Integration notes* on the task. Claude does the wiring.
   (`main.js` is ~2,500 lines, and nearly every feature touches it. It's the
   file most likely to conflict.)
6. **Written is not done.** A task is `COMPLETE` only after it has been tested
   and reviewed. Record what was actually tested; never report a test you didn't run.
7. **Leave the board better than you found it.** Update status, notes, what
   remains and known issues when you stop, even partway through.
8. **No commits, pushes or branch operations unless the human asks.** When they
   do, commit only your task's files.

---

## 3. Task lifecycle

```
BACKLOG → READY → IN PROGRESS → REVIEW → COMPLETE
             ↘ BLOCKED ↗                ↘ CANCELLED
```

- `BACKLOG` — identified, not yet ready (dependencies, decisions, or unclear scope).
- `READY` — dependencies satisfied; the brief is complete; safe to claim.
- `IN PROGRESS` — one agent owns it and holds its locks.
- `BLOCKED` — waiting on a task, a decision or a resource; say which.
- `REVIEW` — implementation done; the agent has tested what it can; waiting for Claude.
- `COMPLETE` — reviewed, integrated, tested.
- `CANCELLED` — abandoned on purpose; say why.

### Claiming a task
1. Pick a `READY` task whose files are `AVAILABLE`.
2. In `TODO.md`: set **Status** `IN PROGRESS` and **Agent**, then mark each
   file `LOCKED` in *File / subsystem locks* with your name and the task ID.
3. Re-read the task's **Dependencies** and **Acceptance criteria**.

### Finishing a task
1. Run the checks in §6 that apply.
2. Set **Status** `REVIEW`, and fill in *What changed*, *Testing performed*,
   *Integration notes* and *Known issues*.
3. Release your locks (`AVAILABLE`), unless integration still needs them held.
4. Add it to *Review queue*.
5. Log anything the next agent needs: an interface, a surprise, or a failed approach.

### Handoffs
Record in `TODO.md` → *Handoffs* while it's in flight, and in `AGENT_LOG.md` →
*Handoff history* once done:
```
TASK-XXX
From: <agent>   To: <agent>
Reason: ...
Files: ...
State: what works, what doesn't, what to do next
```

---

## 4. How Claude splits work

Before handing anything out, Claude decides:

1. What needs doing, and how big it is.
2. Which files and subsystems each piece touches (the lock map).
3. What depends on what (the dependency graph in `TODO.md`).
4. What can run in parallel: **disjoint file sets only**.
5. Which agent suits each piece (§1).

Then Claude writes one brief per task using the template in §5. The same task
never goes to two agents, and no two in-progress tasks share a file.

**Parallel-safe by default:** separate modules (`src/traffic.js`, `src/npc.js`,
`src/merge.js`, `src/fx.js`, `src/prologue.js`, `src/actone.js`, …), QA scripts
in `tools/qa/`, docs, and assets in their own folders.
**Serial by default:** `src/main.js`, `src/graphics.js` (global shader patches),
`index.html`, `serve.mjs`, `package.json`.

---

## 5. Task brief template

Every `READY` task in `TODO.md` must be self-contained, so an agent with no
chat history can do it:

```md
### TASK-XXX — Short title

**Status:** READY
**Agent:** UNASSIGNED
**Files / subsystem:**
- src/example.js            (edit)
- tools/qa/example.mjs      (new)

**Dependencies:** TASK-YYY (COMPLETE) / none

**Context:** What exists today and where. Link the AGENT_LOG entries to read.

**Goal:** One or two sentences.

**Acceptance criteria:**
- Measurable, testable outcomes.
- "No new console errors" is always implied.

**Out of scope:** What not to change.

**Integration notes (for Claude):** Filled in by the implementing agent.

**Notes:** Progress, surprises, what remains.
```

---

## 6. Project facts every agent needs

- **Stack.** Vanilla Three.js r160 from a CDN import map, ES modules, **no build
  step, no bundler, no npm dependencies.** Keep it that way.
- **Run.** `npm start` (or `node serve.mjs 8899`), then open
  <http://localhost:8899>. Opening `index.html` from disk (`file://`) does not work.
- **Line endings.** `src/main.js`, `src/graphics.js`, `index.html`, `README.md`
  and `TODO.md` have **CRLF** in the working tree (`.gitattributes` normalizes
  to LF on commit). Editing tools that match exact text must respect CRLF.
- **Syntax check.** `node --experimental-detect-module --check src/<file>.js`
- **Headless QA** (Playwright-style runner scripts):
  - `tools/qa/gameplay.mjs` — free roam: walk, look, shoot, NPCs, drive, traffic, entity counts
  - `tools/qa/prologue.mjs` — Prologue / Mission 1 walkthrough
  - `tools/qa/actone.mjs` — Act One walkthrough
  - Screenshots go to `tools/qa/out/`, which git ignores.
  - Headless Chromium renders with SwiftShader, so **its fps is meaningless.**
    Trust draw calls, CPU ms (the F3 overlay / `__game.perf`), behaviour and
    console output. Real frame rate needs a real GPU.
- **Debug surface.** `window.__game` exposes scene, state, perf, npcs, traffic,
  prologue, actOne, cine and more. Pages driven by patchright evaluate in an
  isolated world, so reach `__game` by injecting a script tag.
- **Performance guardrails.** Never add or toggle `.visible` on a light
  mid-game (it recompiles every shader; use intensity 0 or the light pool).
  Mark any custom material `userData.gtbRealized = true` or the realize pass
  will replace it. Anything that moves must be excluded from `batchStatic`.
- **Honesty.** Record only measurements you actually took, and say how
  (headless vs. real GPU, tier, resolution).

---

## 7. Where things go

| Kind of information | File / section |
|---|---|
| Work to do, who's doing it, locks | `TODO.md` |
| A task's progress notes | That task in `TODO.md` |
| How a system works; surprises | `AGENT_LOG.md` → Discoveries |
| A choice that affects several agents | `AGENT_LOG.md` → Architectural decisions |
| An API another agent must call | `AGENT_LOG.md` → Interface contracts |
| Something that failed; don't retry it | `AGENT_LOG.md` → Warnings / failed approaches |
| A test that was run | `AGENT_LOG.md` → Test results (plus a summary on the task) |
| Needs a human decision | `TODO.md` → Blockers / Decisions needed |
| User-facing docs | `README.md` |
