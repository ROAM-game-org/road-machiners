# Run log as a spectator stream

**Status:** executing
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
