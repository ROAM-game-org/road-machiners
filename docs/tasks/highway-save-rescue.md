# Chaos Highway save rescue keeps the run

**Status:** done
**Branch:** fight-bot
**Worktree:** .worktrees/fight-bot
**Goal:** A Chaos Highway save that no longer loads, such as one made under HIGHWAY.version 3, goes through Migrate save and comes back on the current highway at the start of the stretch it was on. Both trucks wait on that outpost's pad, the stretch's groups come fresh, and money, XP, gear, part damage, hauler cargo, stretch number and run totals are kept. Confirmed by tests on real v3 fixtures and one browser run through the boot path.
**Mode:** hands-off

## Context

- `rescueSave()` reads a broken save with `readCarried()` and rebuilds it with `carriedWorld()`. For Chaos Highway that build always lands on window 0, so a rescue starts a fresh stretch-1 run with a new hauler.
- HIGHWAY.version went from 3 to 4, so every older Chaos Highway save now fails `mapFor()` with `otherMap`.
- A run is `window` w, outposts w and w+1, groups of stretch w+1 and `waitingAt`: null while driving, w at the start pad, w+1 after paying at the next outpost.
- `carryPlayer()` keeps only Icarus site ids in `discovered`, so every outpost id is lost and its discovery XP would pay again.

## Design

Extend the roaming carry path with the run. `readCarried()` reads a `run`: the start milestone S, earned, wrecks, the trucks sold at outpost S and the hauler's chassis, items and stores. S is w+1 when the run waits at w+1, else w. `carriedWorld()` builds the world on `highwayMap(seed, S)` with both trucks on the pad of outpost S, `waitingAt` S, outpost S paid, outpost S+1 fresh and the groups of stretch S+1 fresh. The hauler's items go through the same `carryTruck()` as the player truck. Every id is new, and outpost stock is rolled again. Discovered outpost ids are kept. The report is the existing `CarryReport`.

A save with a run that has no readable window or hauler throws. A save whose run is null, from the migrations that drop old runs, keeps today's fresh-run rescue.

TDD: yes. The rescue is deterministic and regressions matter.

### Invariants
- IV1: Rescue awards nothing: no money, XP, discovery or outpost pay beyond the save.
- IV2: Both trucks start free of obstacles on the pad of outpost S for any seed and S.
- IV3: No change to the saved shape, so no migration step.

### Principles
- PC1: One carry path for both modes.
- PC2: No new player text.

### Assumptions
- AS1: The hauler chassis never changes, since `outpostBuyChassis` swaps only the player truck.
- AS2: The v3 fixture saves are at the current save format 2.64.

### Unknowns
- UK1: Whether the outpost pad has room for both trucks at every S.

## Plan

1. `fury-road.ts`: `runStart(seed, chassis, S)` and `startRun(world, resumed)` take the start outpost. New games pass 0.
2. `world.ts`: `Carried.run`, `carriedWorld()` builds on window S through a map callback with the window, `carryTruck()` takes the target truck, `carryPlayer()` keeps outpost ids.
3. `save-rescue.ts`: `runOf()` reads the run defensively and throws on a run with no window or hauler.
4. Tests in `save-rescue.test.ts` on two v3 fixtures from commit c04bc4711: mid-stretch 2 and paid at outpost 2.
5. `docs/architecture/saves.md`: rescue section.
6. Browser run: seed the fixture into the auto slot, boot, Migrate save, Wait for the road, one turn.

## Verify

- Fixtures: two saves written by commit c04bc4711 with HIGHWAY.version 3, seed 21, window 1. One is mid-stretch 2 with a spawned group. One is paid at outpost 2. Both have extra money, XP, plates on the hauler, parts goods on the hauler, a stowed plate, a stored engine and halved part HP.
- `save-rescue-highway.test.ts`: 11 pass. It covers the refused load, the start-of-stretch placement, everything kept, the reload round trip, one turn after the wait with no discover, money or outpost events, a throw on a run with no hauler, a fresh run for a null run, and both trucks clear on the pad for 5 seeds and start outposts 0 to 3.
- Related files: save-rescue, carry, opening, save-modes, save, fury-road, fury-road-start, fury-road-rules, outposts, outpost-hauler, save-outpost-garage and save-migrations ran 380 of 382 green. The 2 failures also fail on HEAD 80312ceda: spawned group trucks now get a trail and load drops trails.
- Quality gate passed.
- Browser run on a dev server from this worktree: the v3 mid-stretch save in the auto slot, boot, Migrate save, Drive on. The run came back on `highway:4:21:1` with window 1 and waiting at outpost 1, money 12345, XP 77, earned 25000, both trucks on the pad with their parts, HP and cargo. Enter Outpost 1, Wait for the road and one turn played with no page errors and no crash screen.
- The v3 truck positions for seed 21 happen to lie on the v4 road. The tests catch a rescue that only skips the hash check through the pad, waiting and fresh-group checks.

## Conclusion

The rescue resumes a broken Chaos Highway run at the start of its stretch, on the current highway, with both trucks and everything the run earned. The review found three silent drops: a run with no hauler key, unreadable totals defaulting to zero, and a run under a setup that lost its mode. Each now throws. Only a run from before format 2.60, when the hauler came in, still gets a fresh run, as the migrations already document.

- AS1 held: only the player truck changes chassis, so the hauler is rebuilt on its kit chassis.
- AS2 held: both fixtures are format 2.64.
- UK1 resolved: both trucks sit clear on the pad for 5 seeds at start outposts 0 to 3.
- The `carryCore` fix also changes the roaming rescue. Before it, every same-name core part, such as the four wheels, took the first one's damage.

Open:
- The save screen still says Migrate "moves you to a town", which is wrong for Chaos Highway. A fix needs new English text and Russian from agy.
- Driver health of both trucks resets to full on rescue, as in the roaming rescue.
- save-modes and save-outpost-garage each have one failure on HEAD 80312ceda, since spawned group trucks now get a trail and load drops trails.

### Hands-off decisions
- size: Medium. It touches the sim, the save rescue and docs.
- worktree: stayed in .worktrees/fight-bot on branch fight-bot, as the brief asked.
- outpost stock: rolled fresh at the start outpost, since saved part ids would collide with new ones.
- turn: restarts at 1, as the roaming rescue does.

### Deferred (needs user input)
