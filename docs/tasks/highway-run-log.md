# Run log as a spectator stream

**Status:** reviewing
**Branch:** run-log
**Worktree:** .worktrees/run-log
**Goal:** From one exported run log of any mode, a reader can replay what the player's view held turn by turn and answer why things went as they did: where each truck in view was, what hit what and how hard, what the player ordered and bought, and what the game raised. `npm run run:timeline` prints that story from the log. Confirming it needs the user to play one run on the new build and export its log.
**Mode:** hands-off

## Context
- The exported run log in `game/src/three/run-log.ts` keeps only events that name the player's truck (`run-log.ts:35`) from an allowlist (`run-log.ts:12`). It drops shots, collisions, spawns, stalls and mode events, and it holds no position, speed or part health.
- The player-facing log in `game/src/ui/log.ts` is separate, and stays separate.
- The recorder's `world.jsonl` (`game/src/sim/progression/turn-log.ts:90`) is the opposite extreme: every event of every truck on the map, and a snapshot of all trucks every 10 turns. A 5-day run writes about 7 MB, and a 2-turn fight falls between snapshots.
- Player commands are functions from world to world, passed to `apply()` from about 35 call sites. They carry no name or data.
- Positions are map coordinates, and the highway map moves every truck at each new window (`fury-road.ts:458`).
- The turn that moves the highway window is never logged, because the page reloads first (`game.ts:699`, `save.ts:325`).
- In the analyzed run, stretch 8 took 233 turns against about 72 for the others, and the log could not say why.

## Design
The run log records what a spectator riding with the player would need to watch the run again. It holds the player's trucks, every truck the player sees, and what happened to them, and nothing else. It works like a multiplayer game's network stream: a truck enters the view with its full description, then each turn sends only what changed, then leaves.

Scope. A truck is in scope while the player owns it, while the player sees it, or in a turn where an event ties it to a player truck, such as a shot from out of sight. Places enter scope when discovered.

Lines, each with its turn:
- `session`: run id, version, seed, mode, settings, map hash, then a keyframe: the player's state and an `enter` for every truck in scope. Written at New game, at each load and at each day start, so any session reads on its own.
- `enter`: a truck coming into scope with id, template, faction, chassis, driver, every part with health, cargo, position, heading, speed, order, goals and hunt target.
- `moves`: one line per turn with `[id, x, y, heading, speed]` for each truck in scope that moved.
- `change`: per truck, only the fields that changed: part health, parts and goods gained or lost, money, fuel, supplies, order, gun and utility orders, goals and states.
- `leave`: a truck leaving scope, with the reason: out of sight, wrecked, knocked out, despawned or a window move.
- `event`: every event that ties to a truck in scope or to the player. A turn's shots from one shooter at one target merge into one line with the weapon, rounds, hits, damage per part and parts disabled.
- `player`: the player's money, XP, ranks, perks, storage and switches such as auto fire, when they change.

Player decisions need no command log. Every decision shows as a change on a player truck or the player: an order, a gun order, a switch, a purchase. So the 35 `apply()` call sites stay as they are.

Clutter stays out: trucks out of view, XP practice events, arrivals, talk text, smoke and debris, and any field that did not change.

Positions are world positions: map position plus the map's origin. A map owns its origin. Icarus has origin zero, and the highway's origin moves with each window.

The window-moving world is logged before the page reloads.

The recorder writes the same stream from the bot's view, so a bot run and a human run read the same. `world.jsonl` stays as the recorder's whole-map log for NPC debugging.

`npm run run:timeline -- <log>` linearizes reloads and prints the story per day or per stretch: who came into view, the fights with hits and rams, the player's orders and purchases, and spans where a player truck made no progress.

Approaches weighed:
- Spectator stream: exact for everything in view, compact, mode-blind. Recommended.
- Snapshots of trucks in view every few turns: simpler, but a short fight falls between snapshots, and every turn costs a full snapshot.
- Command log and replay: exact for everything, but commands are not data, and the browser and Node physics would have to match bit for bit. Rejected for now.

Compatibility: the exported log format changes. No tool reads the old one, and saves do not change.

TDD: yes. The writer is a pure function of two worlds, their events and the scope.

### Invariants
- IV1 — One pure function writes the stream for both the game and the recorder.
- IV2 — The writer never branches on mode id or map id.
- IV3 — Replaying `enter`, `moves`, `change` and `leave` from the last `session` rebuilds each in-scope truck's logged fields exactly as the world held them.
- IV4 — Every shot and collision that involves a truck in scope appears in an `event` line.
- IV5 — Every logged position is a world position.
- IV6 — Writing the log changes no world state and draws no random number.
- IV7 — The player-facing log and the run log never read each other.

### Principles
- PC1 — Positions to 0.1 tile, angles to whole degrees, health to whole percent.

### Assumptions
- AS1 — A 1000-turn highway run and a 5-day Roaming run each export under about 3 MB.

### Unknowns
- UK1 — Resolved: trucks in view carry their goals and hunt target in `enter` and `change`, since they explain most NPC moves.

## Conclusion

The run stream is built and wired into the game, the recorder and a new `npm run run:timeline`.

### Hands-off decisions
- Scope owns trucks by `faction === 'player'`. `playerTrucks()` in damage.ts special-cases Fury Road with `world.furyRoad`, and the hauler is spawned with faction `player`, so the faction rule gives the same trucks without a mode check.
- The earlier whole-world log was dropped. The map origin on `Atlas` (zero for Icarus, per window on the highway) and its tests were kept. The `modeState` dispatch in settings.ts was dropped because it branches on mode.
- The writer is a pure step function over the last logged state, and `RunStream` is a thin holder of that state. It diffs against the last line it wrote, not against the previous world, so a repeated world and a shared events array add nothing.
- Hunt target: goals are written as `kind:targetId`, so a goal's target shows in `enter` and `change`. No separate hunt field.
- Part ids key `parts` and `storage`. A part's value is `defId:percent`. Goods are counts per good.
- Shots merge per shooter and target and turn. Several weapons go into one `weapons` list. Parts a shot disabled are listed in the shot line, and the matching `partDisabled` event is not written again.
- Collisions merge per pair and turn the same way.
- Event filter: clutter kinds are dropped, player-level outcomes are kept, and any other event is kept when it names a truck in scope. Clutter: practice, activity, arrived, spawn, despawn, info, weather, say, call, note, honk.
- A truck tied in only by an event enters in that turn and leaves as `unseen` in the next.
- `leave` reasons come from the destroyed, npcKnockout and despawn events, a map hash change (`window`), and otherwise `unseen`.
- An event with its own `kind` field (`shopMoney`) keeps its value under `shop`, so the line kind stays `event`.
- A loaded world's own events are not written again at load.
- A leave reason comes only from an event whose `vehicle` is the leaving truck, so a killer that drives out of sight is `unseen`.
- The timeline drops every record before the first `session` line and says how many, because a run begun on an older build keeps its old records in the same log store.
- The exported header line stays as it was. The timeline skips it.
- The recorder file is `<bot>-<seed>.stream.jsonl`, beside `.run.jsonl` (the escort statistics), `.turns.jsonl` and `.world.jsonl`. Those three are unchanged. The version in its session line is `recorder`.
- `LogEntry` in save-db.ts lost its required `day` field, since stream lines carry the day only on `session`.
- Timeline constants: a stall is 20 turns within 2 tiles, and a fight ends after 3 turns without a shot or ram between a pair. They are named constants in `run-timeline.ts` and are not flags.
- The timeline reports a truck's `window` and `unseen` leaves nowhere, and a new `session` keyframe never reports its trucks as arrivals except at the first session.
- Fuel and money are written as whole numbers, supplies to 0.1.
- The window-move turn is logged inside `changeMapIfMoved`, before the save and the flush. `game.ts` is unchanged.

### Deferred (needs user input)
- Confirming the goal needs the user to play one run on this build, export the log with the Save panel and run `npm run run:timeline` on it.
- A stall span also fires for a truck parked on an outpost pad. The timeline does not know about outposts, because that would branch on mode. Say if parked spans should be hidden.
- Bots that re-issue an order every turn produce long order runs. The timeline merges runs on consecutive turns into one line.

## Verify
- `npx vitest run src/sim/run-stream.test.ts src/sim/progression/run-timeline.test.ts src/three/run-log.test.ts src/three/save-modes.test.ts src/three/save-db.test.ts` passes, and `npm run typecheck` and `npm run quality` pass.
- IV3 is tested by replaying a Roaming fight over real `endTurn` turns, and a highway run across `waitForRoad` with a reload session, and comparing every replayed truck to the world.
- AS1 holds with a wide margin. Chaos Highway escort, 1000 turns, seed 2: 472 KB. Sprinter seed 2: 392 KB. Escort seed 3: 332 KB. Roaming trader, 2250 turns (5 days), seed 1: 502 KB. No compaction was needed. For comparison, the same Roaming run wrote 5.7 MB of `world.jsonl`.
- The GPU playtest passed on the coordinator's Mac: 12 turns at 60 fps. In the agent sandbox `npm run playtest -- --cpu` could not finish turn 1, because software rendering starved the page.
- Cost of one `RunLog.note` (scope, truck fields, diffs), measured in Node over recorder worlds with `RunStream.step`: Chaos Highway escort, 300 worlds, mean 0.22 ms, p95 0.45 ms, max 4.2 ms. Roaming trader, 300 worlds, mean 0.19 ms, p95 0.37 ms, max 5.2 ms. The turn budget is 100 ms. The browser path wraps the same call in the `runLog` timer of `src/perf.ts`, so the console command `fps` shows it.
- Review fixes: the IV3 test now checks the replayed truck set against the scope and the replayed player against the world, with a truck that leaves and re-enters and a day-start keyframe. A failed write is followed by a `resync` keyframe. A truck that no longer exists leaves as `gone`. Every line carries a session id and readers rebuild per session id.
- Window reload: `save-modes.test.ts` reads the log back after `changeMapIfMoved` and finds the `roadOpened` event of the window-move turn.
- Excerpt of `npm run run:timeline -- tmp/m-hw2/escort-2.stream.jsonl --by stretch`:

```
== Stretch 8 ==
T568 roadOpened, stretch 8
T568 holdings changed: money -69590 (now 17086); gained cab, transmissionMid, tank, wheelMid, wheelMid, wheelMid, wheelMid, scrapSheet, ceramicTile, spacedArmor; lost cabPickup, transmission, tank, wheel, wheel, wheel, wheel; good [cut]
T568 player/own/scout v1 27 order changes (T568-T594), last: order null
T568 player/own/semi v35 69 order changes (T568-T636), last: order stopAt@216,-2120
T587 came into view: convoys/convoyGuard/scout v598 at 218.5,-1917.6
T587 came into view: raiders/gunwagon/carrier v627 at 219.5,-1914.4
T588 fight T588-T596, convoys/convoyGuard/scout v598 against raiders/gunwagon/carrier v627: convoys/convoyGuard/scout v598 fired 10 rounds, 6 hits, 30 damage; raiders/gunwagon/carrier v627 fired 12 rounds, 7 hits, 155 damage; 2 pa [cut]
T591 came back into view: convoys/convoyGuard/scout v598 at 214.3,-1911.1
T591 came back into view: raiders/gunwagon/carrier v627 at 216.9,-1911.7
T592 fight T592-T602, player/own/scout v1 against convoys/convoyGuard/scout v598: player/own/scout v1 fired 90 rounds, 29 hits, 129 damage; convoys/convoyGuard/scout v598 fired 12 rounds, 5 hits, 67 damage; 4 parts disabled
```

Lines marked `[cut]` are shortened at the end for this file. The same log, a later stretch:

```
== Stretch 11 ==
[earlier lines of the section left out]
T869 came back into view: raiders/buggy/scout v976 at 207.3,-3033.7
T870 outpostReached, milestone 11, pay 62000, wrecks 1
T870 player/own/semi v35 made no progress: within 2 tiles of 214,-3046.7 for 22 turns (T870-T891), last order through@208,-3058.7, 0 hits taken
T871 player/own/semi v35 order brake
T873 player/own/semi v35 order null
T890 player/own/niva v1 29 order changes (T890-T918), last: order null
```

- Excerpt of `npm run run:timeline -- tmp/m-roam/trader-1.stream.jsonl`, from the Roaming trader run, Day 1:

```
T136 player/own/scout v1 order null
T140 came back into view: scavengers/scavenger/jeep v1273 at 317.1,472
T140 came back into view: raiders/buggy/courier v1616 at 341.5,491.8
T141 player/own/scout v1 2 order changes (T141-T142), last: guns {"p18":"v1616/body"}
T142 fight T142-T145, player/own/scout v1 against raiders/buggy/courier v1616: player/own/scout v1 fired 6 rounds, 1 hits, 5 damage; raiders/buggy/courier v1616 fired 24 rounds, 5 hits, 22 damage
T147 player/own/scout v1 guns {"p18":null}
```

