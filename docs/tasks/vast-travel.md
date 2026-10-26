# Vast travel

**Status:** planning
**Branch:** vast-travel
**Worktree:** .worktrees/vast-travel
**Goal:** On a long auto-travel trip the player picks a speed and the truck crosses empty road fast, dropping to normal play on its own when anything worth a choice shows up. Turns run fast enough that the top picked speed holds on a real trip. A sim-only trial on a 2x wider map reports the real-time gaps between choices against the caps: median at most 10 s, worst at most 30 s. The user uses this to decide how large to make Icarus. Confirming the feel needs the user to play a trip. Useless if: speed buttons exist but the worker cannot keep up so the picked speed is never reached; fast travel saves fuel or time over normal travel on the same route; gaps look short only because of stops with no choice in them; the trial meets the caps only because NPCs were spawned to be met; perf work changes what a seed plays.
**Mode:** hands-off

## Context

- Icarus is 780 tiles of 4 m, 3.1 km a side. The lore describes a basin of tens of km.
- Auto travel plays 1 turn per real second, held Space plays `CONFIG.travelFastSpeed` 4. There is no speed control.
- The worker computes one turn per request. The player is always moved by physics in the browser. Far rules move every truck farther than sight plus `PERF.liveMargin` from the player, and move the player only in headless recorder runs.
- Far rules keep fuel and wear identical to physics, but skip the unpaved top-speed cut and slopes, so far trucks are faster off-road.
- Dev-server worker turns cost 250 to 580 ms. A CPU profile of physics turns: about half physics, a third NPC planning, a fifth far moves, plus 11% in `vehicleStats` and 13% GC.
- Physics bodies persist across turns. The physics cost is mostly the drive snapshot, about 2.4 MB with the full-map heightfield, serialized four times per turn, and the stop tail that re-plans every near truck.
- `navLayer` keys its cache with a string joining every static prop key, rebuilt on every call.
- `vehicleStats` is pure over chassis, items, part hp and wear, and a few world factors. It has about 98 call sites and runs hundreds to thousands of times per turn.
- Every NPC thinks every turn and draws from the shared world RNG, so thinking less often would change what a seed plays.
- Sight radius is `TERRAIN.vision.radius` 20 tiles. `sightRadius()` in `src/sim/vision.ts` is the one formula. Contacts in `src/sim/detect.ts` are an anonymous beyond-sight layer with sources sound, dust, radio, beacon, mark and flare.
- A 3x wider map needs about 3.5 GB of RAM across the main thread and two workers, mostly full-map nav grids and route-search scratch. The last 1.3x spread took 52 commits.
- A separate worktree `world-scale` is rewriting docs to call the map a miniature of real-size towns.

## Design

Six parts, in order. Perf first, so its traces can be checked against an unchanged game before sight and fast travel change it.

1. Golden traces and a turn bench. Before any change, record recorder traces for two seeds with the far mover and one with the physics mover, plus a turn-time bench in `tmp/`. Each perf fix must leave every trace byte-identical and must lower the bench time, or it is dropped.
2. Perf fixes, each kept only if it passes part 1:
   - `vehicleStats` caches its loadout part by a content key of chassis, item layout, part hp and wear. World-dependent factors stay per call. Weapon entries hold part ids, not part objects from an older clone.
   - `navLayer` keys layers by a numeric statics id instead of the joined prop-key string.
   - Further fixes only where the bench shows the next hotspot, such as the snapshot heightfield or pairwise vehicle scans.
3. Picked speed. Speeds 1, 4, 16 and 64 turns per real second live in `src/config.ts`. A speed control next to the turn button picks one, following `docs/ui.md`. The picked speed plays all auto travel. A held Space still plays its fast-forward. Every event that pauses auto travel today still pauses it. The picked speed stays picked across pauses.
4. Fast travel on the far rules. When the picked speed is above 1, auto travel runs, and no other truck is within far sight of the player, the turn moves every truck by `advanceFar`, the player included, with no physics and no tail, and the player's far route is kept. Live range only shrinks for such a turn, so the near and far split stays the one rule `src/sim/fidelity.ts` and `src/sim/far.ts` own. Once a truck enters far sight, or travel stops, the next turn goes back to physics from a snapshot rebuilt with `driveSnapshotOf`. Far rules gain the same unpaved top-speed cut physics applies, so a far trip matches a physics trip in time and fuel, for NPCs too. Autosave keeps its turn interval. On today's map a driving turn has no truck within live range about 1 time in 30, and none within far sight about 1 time in 4, from a 337-turn trader trace.
5. Sight. Near sight is 1.25x, set in `TERRAIN.vision.radius`. Far sight is 1.5x near, a plain distance check with no rays, added as a contact source `far` that the player and NPCs get and the contacts view draws without identity. A new far contact pauses auto travel.
6. Map trial, sim only. On a side branch off this one, spread the map 2x, scale NPC caps with the road length, rebake, and record the trader and scavenger bots at low CPU priority. `tmp/distance/mine.py` reports trips, gaps in turns, the turn cost with the larger NPC count, fuel share and choices per Bowl to Nose trip, and gaps in real seconds at the speed the turn cost allows. The side branch is not for merge, because browser memory for a larger map needs windowed nav first.

TDD: yes for sim rules: the far rule choice, the unpaved cut in far rules, the far contact source, and fast-travel fuel and time parity. No for perf fixes: golden traces and the bench check them.

### Invariants

- IV1 — Perf fixes leave the golden recorder traces byte-identical.
- IV2 — On the same route, a far-moved truck and a physics-moved truck burn the same fuel per tile and take a similar number of turns. The tolerance is set from one measured parity run on a road with off-road and hill stretches, since far rules still ignore slopes.
- IV3 — Fast travel never skips a turn's pause events: each turn's events are checked by `canTravel` before the next turn starts.
- IV4 — A turn runs on far rules only when the picked speed is above 1, auto travel runs, no other truck is within far sight, the player is not on a rope, not in combat and has a move order.
- IV5 — A far contact carries no truck identity in what the player sees: no name, faction or inspect target.
- IV6 — The worker holds the picked speed on a real trip on the current map, measured in the browser at 16.

### Principles

- PC1 — The far-rule choice for the player lives in `src/sim/far.ts`, beside `isNear`, per architecture principle 1. No rule outside it branches on fast travel.
- PC2 — Measure before keeping: a perf change without a bench gain is reverted.

### Assumptions

- AS1 — Rapier physics stepped from a rebuilt snapshot after far turns gives a valid turn, as on game load.
- AS2 — Adding the unpaved cut to far rules changes NPC trip times but no economy check fails.
- AS3 — A 2x map bakes and records in Node within a few GB of RAM.

### Unknowns

- UK1 — The turn cost with headless off, the player far-moved and the new sight radius, and the main-thread cost per turn, which set the speed values.
- UK3 — How long a 2x bake takes.

UK2, whether the `far` contact source needs a save step, is resolved: contacts are stripped on save and absent from `save-schema.json`.

## Plan

## Verify

## Conclusion

### Hands-off decisions

- make: size Medium to Large, full flow — perf, two travel features, sight and a map trial.
- make: branch `vast-travel` in `.worktrees/vast-travel` off `dev` at 7245277a6.
- udesign: far sight, not live range, gates fast travel — a 337-turn trader trace had no truck within live range in only 1 of 30 driving turns.
- udesign: map trial at 2x — the cost of the spread, bake and recording grows with area, and 2x is the smallest step that tests the model; Node memory is not the limit.
- udesign: NPC planning cadence left unchanged — skipping thinks shifts the shared world RNG and breaks same seed, same game.
- udesign: autosave keeps its 20-turn interval — no evidence yet that it costs enough to matter; measured in the browser bench.

### Deferred (needs user input)

- Docs on world scale — the `world-scale` worktree rewrites DESIGN and lore to call the map a miniature of real-size towns, which pulls against a larger map — choose one direction before the lore distances are fixed.
