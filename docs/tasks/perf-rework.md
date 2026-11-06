# Perf rework

Status: design under review; next is the perf-gate child task

Branch: perf-rework, from origin/dev 74c51d3b6

Worktree: .worktrees/perf-rework

Goal: What the player waits on stops growing with the world. Frame time, turn wait and boot depend on what is near the player, not on map size or content count, and a perf gate keeps it that way after each landing. Confirmed by the bench on the factory laptop meeting more of the budgets in `game/scripts/perf-budgets.json` with each child task, by far-content tests, and by the user playing on the Mac. The user and players get a game that stays smooth as content grows. Useless if: a scene is faster because it draws less than the player should see near the truck; the bench improves while the matching play case does not; a cost is cut on a scene that does not run it; the gate passes because its noise band is wide enough to hide a real slowdown; far stand-ins look or behave visibly wrong; the work only moves to the first frames or the first turn after boot.

Mode: interactive

## Context

Numbers come from the factory laptop, GTX 1660 Ti, 1600 by 1000 at pixel ratio 2, `npm run perf` at b0f93dc0c, which is dev at 849722ed9 plus task files. Dev at 74c51d3b6 has 73 landings on top of that, with no change to the bench. The reports are on branch stop-redoing-work under `docs/tasks/stop-redoing-work-evidence/`, mainly `factory-final-before.json` and `factory-six-before.json`. Savings are one short replay with one thing removed, quoted as the range over both reports. Savings overlap and are never added.

- Median frame time is within about 1 ms of graphics card time in every scene but fight. Game code outside drawing is 1 to 2 ms per frame in those scenes. Fight spends 13.2 to 13.6 ms per frame against 8.0 ms on the graphics card.
- Night is the largest frame cost. town-night takes 13.3 ms against 8.0 ms by day, with p99 22 to 23 ms against the 16.7 ms budget. Hiding the lamps, which are the truck beams, the site spots and the truck glow, saves 6.3 to 6.5 ms. Hiding terrain saves 6.5 ms, and hiding props saves 5.9 to 6.0 ms. Turning off shadow maps saves 1.9 to 2.0 ms. Quarter the pixels saves 2.5 to 6.4 ms.
- The per-pixel light pool is 26 lights: 12 site spots, 12 truck beams, the truck glow and the sun. Lights go dark by intensity and stay visible, so three.js keeps the same pool by day. The pool size alone does not explain the 5.3 ms gap between day and night. The bench has no town-day lights replay, since replays run only when p99 is over budget.
- Far views cost draws. town-day-far has 1,577 draws against 497 at normal zoom, and town-night-far has p99 28 to 30 ms. Hiding props saves 4.6 to 9.4 ms there, and turning off shadow maps saves 2.2 to 6.6 ms. Props are 70 to 80 percent of draws and over 90 percent of triangles in every scene but fight, where they are 36 and 77 percent. The game has no level of detail for props.
- First-use shader stalls break the "no frame over 100 ms" budget in every trusted town-day run: 2 frames, about 369 ms together, in the truck armor-cut programs. The depth program links just before its first shadow draw, and the main program blocks about 160 ms on its first log read. The `compile()` call in three.js prepares only main materials. `models.ts` `model()` clones a material per prop copy.
- Turn wait p99 is 580 to 686 ms against the 100 ms budget, and the median is 469 to 474 ms. The report pools 10 samples: 8 fight turns and 2 drive turns. A drive-only report gave about 46 ms and 440 ms. So the median is set by fight presses. `travel.ts` computes a turn ahead only when the player follows an order. The worker's own fight and drive turn is 289 to 299 ms at the median, and its split by stage is not known. An older note in route-cells gives 11 to 18 ms from a different setup, and no report here reproduces it.
- Boot is 8.1 to 8.4 s in the bench against the 2,000 ms budget. In the 8.4 s run, map took 1.0 s, world 1.5 s, ground 2.0 s and scene 2.5 s. The Mac bench boots in 4.5 to 4.8 s. route-cells removed the whole-map route wait, so the warm-up runs without blocking the scene step and its route grids build per cell. The warm-up notes in `docs/tasks/cell-streaming.md` predate that work.
- Fixes wear off. All four six-scene reports fail 12 of 22 budget lines, before and after the stop-redoing-work branch made turns slower, so a new slowdown never shows as a new failure. No workflow runs the bench by itself. `--compare` prints changes and sets no pass or fail.
- The same code differs between runs by more than it differs within a run. Between the two main reports, town-day-far median is 9.5 and 11.0 ms, and fight p99 is 22.6 and 29.7 ms. Pass spread inside those scenes is at most 3.2 percent. One of the two runs was untrusted for factory load.
- The drive scene fails the 10 percent spread check in every run, at 29 to 79 percent. Its two passes drive opposite sides of town on purpose, so both are cold and both build new cells, which its content check requires. Repeating one route would make the second pass warm.
- The Ally, a ROG Xbox Ally with a Ryzen Z2 A, plays town-day at 16.3 to 17.9 ms median and 19.5 to 24.8 ms p99 over 4 runs of one commit, about 2.2 times slower than the factory laptop. It shows no frame over 100 ms. Quarter the pixels saves at most 0.5 ms there, so the town-day frame on the Ally is not limited by pixels.
- dev has 35 to 47 landings a day at its busiest. The factory laptop also hosts the factory and has stalled it under heavy perf runs. The bench's own limit is 15 minutes per run.
- The stop-redoing-work branch cached repeated CPU work and saved no measured time. Its bench fixes `2e186895d`, radio calls hung up, and `6eeac3a34`, travel stops at the requested turn, are the only parts carried over. Neither applies cleanly to dev, and the helpers they call exist there, so they are ported by hand.

## Design

Two rules shape every system.

Rule 1, cost follows the player. Each system names a near zone where it does full work and a far stand-in that is cheap. Nothing the player waits on grows with map size or content count. Map-only data is baked once into files. Everything else is built near the player first, and nothing waits on far work.

Rule 2, every budget is a gate. A landing on dev runs the bench on the factory laptop. A scene slower than its last landed number by more than its noise band fails the landing. A child task that improves a number lowers the stored number, so the gain cannot be lost later.

How Rule 1 applies to each measured cost:
- Night lighting: a pixel pays only for the lights that reach it. Lights other than the sun have a finite range, so the picture stays the same. night-light first measures how much of the night cost this can reach.
- Far views: far props draw as merged, simpler meshes per area, and only near props cast detailed shadows. The far picture changes, so the user signs off from labeled screenshots.
- Turns: worker work per turn follows what is near the player, and the next turn is ready before the press where the game can predict it. turn-wait first finds where the worker's time goes.
- Boot: the ground texture and the road mask are baked or built near the player first. boot takes its targets from `boot:time` on a production build.
- Shader stalls: materials are shared per program, so the program list is small and known, and all of it, depth programs included, compiles on the loading screen. This is a bug fix, not a Rule 1 change.

Child tasks, each its own task file with a trusted before and after:
1. perf-gate: the two carried bench fixes; turn waits reported per scene, with every turn start timed and marked when it took a turn computed ahead; drive keeps its two cold passes and each pass is compared with the same pass of the last landed report, in place of the spread check; a first trusted report on dev as the stored numbers; noise bands per scene; a pass or fail from `--compare`; the run on each landing.
2. shader-stalls.
3. boot.
4. night-light.
5. far-props.
6. turn-wait.

Steps 2 to 6 run in order of measured size once the gate exists. Each step that changes the far picture or far behavior stops for the user's sign-off.

TDD: yes. Work counts per system, such as draws and lights per pixel, are deterministic and get failing tests first. Times are checked by the bench and the gate.

### Invariants

- IV1 — Adding content far from the player leaves near work counts unchanged. Tests add far sites, props and trucks and compare draws and lights evaluated near the truck. Each later child task adds its own count.
- IV2 — The picture near the player is unchanged, checked by `npm run site:shot` captures before and after that the user compares. A far picture change lands only with the user's sign-off.
- IV3 — Same seed, same game. A child task that touches the sim gives the same turns as before in the determinism tests and `npm run progression:record`.
- IV4 — A landing that slows any bench scene beyond its noise band fails. An untrusted run passes nothing and runs again when the laptop is free.

### Principles

- PC1 — Pick each cost by its measured milliseconds on what the player waits for, from a bench report, before work starts.
- PC2 — Each child task names its near zone and far stand-in, and shows the stand-in to the user when it changes what the player sees or how far trucks behave.
- PC3 — Cache only map-only data or results whose inputs did not change, and only when the cost is on what the player waits for.

### Assumptions

- AS1 — Bench noise on the factory laptop is small enough for a useful gate. Two runs of the same code are the only evidence today, and they differ by up to 16 percent on a median and 31 percent on a p99.
- AS2 — The Mac feel follows the factory laptop numbers. The user confirms it by playing.
- AS3 — Every light but the sun has a finite range.

### Unknowns

- UK1 — Whether a player's turn press in a fight or on the road takes a turn computed ahead, and what the wait is when it does not. perf-gate answers it.
- UK2 — The noise band per scene, which sets the gate's tolerance. perf-gate measures it from repeated runs of one commit, each approved first.
- UK3 — How long a gate run takes, and whether a run per landing fits 35 to 47 landings a day on a laptop shared with the factory. perf-gate answers it, and a change to when the gate runs goes back to the user.
- UK4 — How much of the night cost scales with pixels and lights. The one replay of each gives wide or overlapping savings, and town-day has none to compare. night-light answers it with replays forced on both town scenes.
- UK5 — How a pixel can pay only for nearby lights in three.js on WebGL 2. night-light answers it.
- UK6 — Where the worker's 289 to 299 ms per turn goes. turn-wait answers it with `scripts/turn-profile.mjs`.
