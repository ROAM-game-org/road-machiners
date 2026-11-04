# Perf rework

Status: design approved; next is the perf-gate child task

Branch: perf-rework, from origin/dev 74c51d3b6

Worktree: .worktrees/perf-rework

Goal: What the player waits on stops growing with the world. Frame time, turn wait and boot depend on what is near the player, not on map size or content count, and a perf gate keeps it that way after each landing. Confirmed by the bench on the factory laptop meeting more of the budgets in `game/scripts/perf-budgets.json` with each child task, by far-content tests, and by the user playing on the Mac. The user and players get a game that stays smooth as content grows. Useless if: a scene is faster because it draws less than the player should see near the truck; the bench improves while the matching play case does not; a cost is cut on a scene that does not run it; the gate passes because its noise band is wide enough to hide a real slowdown; far stand-ins look or behave visibly wrong; the work only moves to the first frames or the first turn after boot.

Mode: interactive

## Context

Numbers come from the factory laptop, GTX 1660 Ti, 1600 by 1000 at pixel ratio 2, `npm run perf` at b0f93dc0c. The reports are on branch stop-redoing-work under `docs/tasks/stop-redoing-work-evidence/`, mainly `factory-final-before.json` and `factory-six-before.json`. Savings are one short replay with one thing removed, quoted as the range over both reports. Savings overlap and are never added.

- Median frame time matches graphics card time in every scene but fight. Game code outside drawing is 1 to 2 ms per frame.
- Night is the largest frame cost. town-night takes 13.3 ms against 8.0 ms by day, with p99 22 to 23 ms against the 16.7 ms budget. Hiding the lamps saves 6.3 to 6.5 ms, and turning off shadow maps saves 1.9 to 2.0 ms. Every lit pixel loops over a fixed pool of about 26 lights: 12 site spots, 12 truck beams, the truck glow and the sun. Pixels no light reaches pay too.
- Far views cost draws. town-day-far has 1,577 draws against 497 at normal zoom, and town-night-far has p99 28 to 30 ms. Hiding props saves 4.6 to 9.4 ms there, and turning off shadow maps saves 2.2 to 6.6 ms. Props are about 70 percent of draws and over 90 percent of triangles in every scene, each at full detail with its own outline at any distance.
- First-use shader stalls break the "no frame over 100 ms" budget in every town-day run: 2 frames, 369 ms together, in the truck armor-cut programs. three.js `compile()` never gathers depth materials. Each armor-cut clone counts as a new uncompiled material. `models.ts` `model()` clones a material per prop copy, so thousands of materials hide 51 programs.
- The bench reports turn wait at 469 ms median against the 100 ms budget. The drive scene times only the first turn after a teleport, about 2 samples per run, and that turn cannot use a turn computed ahead. route-cells measured the player's wait in play at 11 to 18 ms. A worker turn copies the whole physics world, ground included, about 4 times and restores it 3 times, all untimed.
- Boot is 8.4 s in the bench against the 2,000 ms budget, and 10.5 to 13.3 s with `boot:time` on the Mac. The bench boot has no sounds step, which took 3.4 to 6.5 s on the Mac. Boot builds whole-map work: route data for 11 truck sizes, which the scene step waits about 6 s for, the ground texture and the road mask.
- Fixes wear off. route-cells stopped boot from building whole-map route grids. cell-streaming then measured boot waiting on a whole-map route pass for all 11 truck sizes. Every bench run fails about 12 budget lines, so a new slowdown never shows as a new failure.
- The drive scene fails the bench's trust check in every run, since its two passes drive opposite sides of town. Town scenes pass it.
- The stop-redoing-work branch cached repeated CPU work and saved no measured time. Its bench fixes `2e186895d`, radio calls hung up, and `6eeac3a34`, travel stops at the requested turn, are the only parts carried over.

## Design

Two rules shape every system.

Rule 1, cost follows the player. Each system names a near zone where it does full work and a far stand-in that is cheap. Nothing the player waits on grows with map size or content count. Map-only data is baked once into files. Everything else is built near the player first, and nothing waits on far work.

Rule 2, every budget is a gate. A landing on dev runs the bench on the factory laptop. A scene slower than its last landed number by more than its noise band fails the landing. A child task that improves a number lowers the stored number, so the gain cannot be lost later.

How Rule 1 applies to each measured cost:
- Night lighting: a pixel pays only for the lights that reach it. Lights have a finite range, so the picture stays the same.
- Far views: far props draw as merged, simpler meshes per area, and only near props cast detailed shadows. The far picture changes, so the user signs off from labeled screenshots.
- Turns: physics copies hold only what is near the player. The next turn is ready before the press.
- Boot: route data, the ground texture and the road mask are baked or built near the player first. This settles the route warm-up decision cell-streaming left open: the scene step stops waiting for whole-map routes, and the first turn must not wait for them either.
- Shader stalls: materials are shared per program, so the program list is small and known, and all of it compiles on the loading screen. This is a bug fix, not a Rule 1 change.

Child tasks, each its own task file with a trusted before and after:
1. perf-gate: the carried bench fixes; drive passes that repeat one route; every turn press timed, and marked when it took a turn computed ahead; shadow draws per light in the report; noise bands per scene; stored landed numbers; the run on each landing.
2. shader-stalls.
3. boot, measured with `boot:time` on a production build, sounds included.
4. night-light.
5. far-props.
6. turn-wait, once the gate shows what players wait for in play.

Steps 2 to 6 run in order of measured size once the gate exists. Each step that changes the far picture or far behavior stops for the user's sign-off.

TDD: yes. Work counts per system, such as draws, lights per pixel, physics bodies copied and route cells built at boot, are deterministic and get failing tests first. Times are checked by the bench and the gate.

### Invariants

- IV1 — Adding content far from the player leaves near work counts unchanged. Tests add far sites, props and trucks and compare draws, lights evaluated near the truck, physics bodies copied per turn and route cells built at boot.
- IV2 — The picture near the player is unchanged, checked by bench screenshots compared pixel for pixel. A far picture change lands only with the user's sign-off.
- IV3 — Same seed, same game. The determinism tests and a progression record give the same turns as before each child task.
- IV4 — Trucks take the same routes as before. Near-first route data gives the same route search results.
- IV5 — A landing that slows any bench scene beyond its noise band fails, and so does an untrusted run.

### Principles

- PC1 — Pick each cost by its measured milliseconds on what the player waits for, from a bench report, before work starts.
- PC2 — Each child task names its near zone and far stand-in, and shows the stand-in to the user when it changes what the player sees or how far trucks behave.
- PC3 — Cache only map-only data or results whose inputs did not change, and only when the cost is on what the player waits for.

### Assumptions

- AS1 — Bench noise on the factory laptop is small enough for a useful gate. Town scenes pass the 10 percent spread check today.
- AS2 — The Mac feel follows the factory laptop numbers. The user confirms it by playing.
- AS3 — Every light the game uses has a finite range.

### Unknowns

- UK1 — Whether players in play wait for turns at all, or the press usually takes a turn computed ahead. perf-gate answers it.
- UK2 — The noise band per scene, which sets the gate's tolerance. perf-gate measures it.
- UK3 — How a pixel can pay only for nearby lights in three.js on WebGL 2. night-light answers it.
- UK4 — How long the gate run takes per landing, and how it shares the factory laptop with the factory. perf-gate answers it.
