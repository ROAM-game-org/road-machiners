# Simulation mode UI for the jobs people bring to it

**Status:** validating
**Branch:** sim-mode
**Worktree:** .worktrees/sim-mode
**Goal:** The developer opens `/sim.html`, and each of the five cases below can be answered from the page with no raw ids or debug strings on screen: watch a run, find where raiders gather against where traffic runs, debug one NPC, follow the bot's money, worth and XP over time, and leave it running for hours. Confirming it needs the user to use the page. Useless if: a restyle with no new capability for these cases, features nobody uses, more text on screen that makes reading harder, a chart that resets on resume, a heat map that only repeats the markers.
**Mode:** hands-off

## Context

Observed on seed 1 after about 250 turns at Fast, with every fold open. Screenshots in `game/tmp/sim-ui/before/`.

The cases:

1. Watch a run. The developer opens the page, presses Play at Fast and glances at the map and the log now and then. The question is "what is going on in the world right now, and what is my bot doing?"
2. Raider ground. The developer wants to know where outlaw trucks spend their time, and whether that ground is where the traffic is. Today they can only stare at red markers turn by turn and remember.
3. Debug one NPC. The developer sees a truck do something odd, clicks it, reads its goal, states and memories, and filters the log to that truck. The question is "why is it doing this, and where is it going?"
4. Debug the player experience. The developer asks "is the bot getting richer, when did money drop, which contracts and parts does it hold?" Today the strip shows only the current numbers.
5. Idle. The developer leaves the page on Fast for hours and comes back. The question is "what happened while I was away, and did the page stay healthy?"

Issues found:

- Raw text everywhere, which hits every case. Card rows show `stopAt@228,208`, `scrapjaw`, `buggy`, `kind`, `raider`, `false`, `plates:100`, `ceramicTile 100%`, `goodsSold`, `roughTiles`, `driving 1`, coordinates like `501.1, 165.8`. Contracts print in turn-log syntax and foes as raw ids. Log lines read "You arrives", "sized up broken", "combat expired", "hits something", and quiet activity lines read "Raider Tess Holt: raid — No hostile in sight", raw kinds plus an em dash. A goal reads "Sell carried cargo, something, on the way" because its target is a site, not a truck.
- The strip shows a tag "active" whenever the player is not dead, since it compares the state to "driving", a state that does not exist.
- No history. Money, worth and XP show only now (case 4, 5).
- No way to see where raiders gather over time (case 2).
- The card says where a truck goes only as coordinates. The map does not show its order destination, its goal target or its home (case 3).
- The page keeps every log entry in memory forever. The DOM is capped at 2000 lines, the array is not. An idle run grows without bound (case 5).
- The log is set in mono, which reads worse for sentences. Every line repeats its time even when ten lines share it.
- "16 km/h of 64 km/h" wraps in the stats grid.

## Design

Ranked by how much they help the cases.

1. Plain words in cards and log. `SimText` grows the namers it needs: part, good, faction, template, trait, skill, contract, place and activity. Cards build their rows from the world through `SimText`, not from `turnLine` strings. Booleans become a row of tags that shows only true flags. Places print as the map square, like "E3", the same name the map ruler shows. Sim-only words live in `sim-text.ts`, never in `src/text` or `format.ts`, so the real game and its Russian are untouched. `SIM_WORDS` overrides the game's debug lines for activity and stall. The player is "Your truck" in sim words, which matches the map label and takes a third person verb.
2. Run history chart. `SimRun` samples money, net worth and XP once per game hour and keeps the samples next to the ledger. The save envelope stores them, so a resume keeps the chart. The page draws one chart for money and net worth, which share the M's axis, and one small XP chart, with day ticks and a hover readout. It sits in the player strip.
3. Selected truck's way on the map. The card carries the order destination, the goal target's position and home. The page draws a dashed line to the destination and a mark at the target and at home, under the markers. Dashed means a plan in the visual language.
4. Heat layer. The page counts each truck class per map cell every turn: outlaws, traffic and trucks in combat. A switch picks Off, Raiders, Traffic or Fights. Cells are a quarter of a map square, so the heat lines up with the ruler. Counts live on the page since page open. Its caption gives the hours it covers.
5. Log reading. UI face for words and mono for times. A time prints once per group of lines that share it. Lines that name the player get the player's accent edge. The page keeps the entries of the last game day only, so an idle run stays bounded.
6. Small fixes: strip tag only for knocked out, short speed text.

### Invariants

- IV1: The viewer never changes what the sim plays. No reveal and no `fullLog` on the sim world. The heat layer and the chart only read frames.
- IV2: `src/sim` never imports `src/ui` or `src/text`. Text goes through `SimText`.
- IV3: Same seed, same game. `sim-mode.test.ts` keeps matching `playTurns`.
- IV4: No raw ids, camelCase words, `true` or `false`, `@` or em dashes in any card or log line of a 50-turn run.
- IV5: The marker drawing, `markerAt`, the legend and the icon code stay the icon agent's. This change only wraps the draw callback.

### Principles

- PC1: Tokens only, shared pieces from `docs/ui.md`.
- PC2: Fewest words. No label where a position or drawing says it.

### Assumptions

- AS1: A run at Fast makes about 3 to 6 turns a second, so a game day is a few minutes and a day of entries is a few thousand lines.
- AS2: The user's saved run predates history. No backwards compatibility: a save with no history fails loud on resume and New run starts over.

### Unknowns

- UK1: Whether the heat layer is readable over the painted map at full zoom.

TDD: yes for the text check over a 50-turn run and the save round trip of history. No for drawing code, checked by screenshot.

## Plan

Order: files the icon agent does not touch first.

1. `src/ui/sim/sim-text.ts`: new namers, activity and stall overrides, player as "Your truck", stateEnded and collision words, site targets.
2. `src/sim/progression/sim-mode.ts`: `SimText` grows; cards built from the world; `Card.way` with destination, target and home; `Hud` numbers; `Sample` history in `SimRun`, posted in a `history` message at start and as `sample` on frames.
3. `src/three/sim-save.ts` and `sim-worker.ts`: history in the envelope, required on resume.
4. Tests: `sim-mode.test.ts` text scan over 50 turns; `sim-save.test.ts` history round trip.
5. `src/ui/sim/sim-chart.ts`: the history chart. `src/ui/sim/sim-heat.ts`: heat counts and drawing. Only if the fragmentation ratio allows; else they go in one file.
6. `page.ts` and `sim.css`: strip with chart, heat switch, way drawing, log grouping and accent, entries cap, strip tag fix. Only after the icon agent's files are clean.

## Verify

- `sim-mode.test.ts` plays 60 turns and scans every truck's card and every log line for camelCase words, `@`, braces, `v123` or `p123` ids, `true` or `false`, em dashes, "something" and "You arrives". It passes. Further tests cover routine events hidden unless they name the player, prop names in collisions, the player as "Your truck", hourly history samples and the history message sent first.
- `sim-save.test.ts` round-trips history through the save, and an outdated save with no history is deleted.
- Browser, seed 1, 300 turns at Fast with all events on: 4 lines read "hits something", all collisions with props like `deadTree-5853`. Fixed with prop names. No other raw line.
- Browser, seeds 7 and 69094, 2 minutes at Fast each with All events on, 2000 log lines each: a first scan found shots at your truck printed twice and reading "fires at You", and pleas, guard fees, encounters, claim rivals and radio calls in field form with a raw fee in cents. All fixed. The scan after the fixes finds no raw line, only one false match on the game's own "Search started: stay parked about 2 turns."
- Browser resume: a run saved on seed 3 at turn 166 reopens at the same turn with its chart intact and "Resumed" in the footer.
- Screenshots: `game/tmp/sim-ui/before/`, `game/tmp/sim-ui/after/`, `game/tmp/sim-ui/v2/`.

## Conclusion

The page now answers each case without raw text. The side column holds the toolbar, your truck with its money, net worth and XP chart, the selected truck's card and the log. Heat sits on the map. Routine NPC events hide unless All events is on.

- AS1 held: Fast plays about 4 turns a second, so a game day of log stays a few thousand lines.
- AS2 changed on the user's word: an outdated save with no history is deleted and a new run starts. The main session built that part.
- UK1 resolved: heat reads well on a log scale at 0.7 strength. A square-root scale let one parked raider wash out the rest.
- Left: four cargo sale lines from one sale stay four lines. The game's own player lines such as "Search started: stay parked about 1 turn." stay as the game writes them. The heat counts reset when the page reloads.

### Hands-off decisions

- make: size Medium, full flow. The work spans six files and new capabilities.
- make: worked in the existing `sim-mode` worktree, as the brief says, instead of a new worktree.
- make: no design approval wait and no end-of-task question. This run is a subagent with no user to answer, so the decisions list goes in the report.
- make: commits have no Co-Authored-By trailer, as the user's rules say.
- udesign: sim-only words go in `sim-text.ts`, not the game catalog, so the real game and its Russian stay unchanged.
- udesign: history is saved in the run's save. The user later chose that an older save with no history is deleted and a new run starts.
- uexecute: card building moved to `src/sim/progression/sim-cards.ts` and the player panel and card view to `src/ui/sim/panels.ts`, so `page.ts` stays the map and wiring.
- uexecute: the log keeps one game day of entries, so an idle run stays bounded. Older lines drop out of Selected and Find too.
- uexecute: routine NPC events are jobs, trades, shots, empty guns, questions, payments, passes, collisions, finds and guard fees. They hide by default and show when they name your truck.
- ureview: the `describe()` debug line on log hover and the truck id on card hover are gone, per P16 in `docs/ui.md`, which bans debug strings. `LogEntry` no longer carries the raw line.
- ureview: left the whole money history rewritten into every autosave. It grows with the run but stays a few hundred KB per write after a night at Fast.
- ureview: NPC markers carry the player's paint in `markersOf`. That is the icon agent's code, so it is handed to them.
- uexecute: times print as game clocks, not turn numbers, on every surface.
- uexecute: commits that touched `page.ts` and `sim-mode.ts` swept in the icon agent's working changes, since the page only compiles with them.
- udesign: heat counts live on the page and reset on reload. Saving them would change the save shape for a view-only aid.

### Deferred (needs user input)
