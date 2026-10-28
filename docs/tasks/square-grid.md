# Square grid and garage remake

**Status:** executing
**Branch:** garage-view
**Worktree:** .worktrees/garage-view
**Goal:** Every truck's grid is made of square 0.45 m cells that lie over the truck's real top surfaces, so a mounted part's drawing lands on its own cells in the garage and in the 3D game. Each truck holds the same loadouts as before: the same guns, armor, engine, cargo and utilities fit, and prices, rated mass, gun draw and combat numbers stay where they were. The garage view shows the truck quietly at rest, the grid near the pointer, installed parts raised over a faded body, and the fit cells of a picked part. Players use it to fit parts without reading a puzzle. The user confirms it from screenshots of several chassis and from a playtest. Useless if: the grid is square but parts still drift off their cells on some trucks; a truck that held three guns now holds two, or one more; a save loads with parts silently lost; prices or rated mass jump because cell counts changed; the garage is clean at rest but the picked and dragged states are as busy as before; it was checked only on the scout.
**Mode:** hands-off

## Context

- Cells are not square and do not match the truck. A scout cell is 0.44 m wide and 0.65 m long. Inner columns spread over the body's widest point, wheel flares included, so edge cells hang past the deck. Measured on every truck, deck, gun and spot: 1753 of 4369 gun spots put the base more than a quarter cell off its cells, up to 2.7 cells. 70% of those slide sideways, 92% of them inward. The scout's gun bases never stand farther out than 0.89 m from the center line, while its grid reaches 1.11 m.
- `cellRect` and `cellSteps` in `game/src/sim/body.ts` are the one projection from cells to meters. The 3D truck, the garage drawing, lanes and contact points all read it.
- Cell size differs per truck, 0.37 to 0.49 m wide and 0.45 to 0.71 m long, so one part covers different meters on different trucks.
- Part footprints are global per part def in `data/parts.ts`: weapons 1x2 to 2x3, engines 2x2, armor 1x1 and 1x2, rams 3x1, cores 1x2 to 3x2.
- Cell counts feed balance numbers directly: chassis value and rated mass count `D` and `FBLR` cells (`data/chassis.ts:74-90`), cargo rows give rows times grid width (`sim/grid.ts:172`), strip yield, welder scrap, NPC loadout budgets and armor quality use `w * h` (`sim/jobs.ts:167,226`, `sim/npc-loadout.ts:436`, `sim/npc-gear-score.ts:24`). Gun power draw is set per part as `draw`.
- Front and back edges have an odd cell count so a 3-cell ram sits centered (`docs/wiki/mechanics/truck.md:9`).
- The armor rows moved outside the body in `factory/issue-1215`, merged here. Its save step `withArmorRowsOutside_120_121` in `three/save-steps-late.ts` is the model for moving saved items onto a new layout.
- The garage stacks a cell kind wash, a red taken wash, a yellow box on the picked part's cells, a red box on blockers and a fan that spans the frame (`ui/styles/inventory.css:186-240`, `ui/inventory.ts:drawFan`). Built-in parts melt into the body until hurt, and installed parts sit flat on it. `docs/ui.md:228` and `:255` contradict each other about cell washes.
- Mockups agreed with the user live in `game/tmp/fit-mock.mjs`, `game/tmp/narrow-mock.mjs` and `game/tmp/square-mock.mjs`.

## Design

### Grid

- One cell size for every truck, 0.45 m square, defined once in `sim/body.ts`.
- Each chassis gets new layout strings. Its inner columns are the most 0.45 m columns that fit inside the width where its gun bases stand today, and its body rows are its length divided by 0.45 m, rounded. The grid is centered on the body. The scout becomes 4 columns by 12 rows.
- The armor ring stays one cell outside the inner grid on all four sides. In 3D, plates keep sitting on the body faces, so armor looks as it does now.
- A conversion script in `game/scripts/` writes the new layouts and core spots once. It samples the old layout under each new cell's center in meters. The new layouts are then committed as data and checked by the rules below, and the script is deleted.
- `cellSteps` returns 0.45 for both axes. `cellRect` places cells from the grid center, not by stretching over the body.

### Balance stays where it was

- Part footprints are rebuilt from meters at the typical old cell, 0.42 m across and 0.65 m along: widths stay, and lengths of 1, 2 and 3 become 1, 3 and 4. Rams keep 3 across.
- Each chassis must keep its old capacity. For every chassis and every common shape, the number of parts that fit on their own mounts must equal the old count: guns of each size, engines, armor pieces per edge, cargo frames and utilities. Where the converted layout misses, its `D`, `E` and edge cells are hand-tuned until the counts match. A test checks this against a table of the old counts made once from the old layouts.
- Balance numbers that read cell counts read a part's `bulk` instead, its old `w * h`, written into each part def. Chassis value and rated mass keep their old per-chassis results through the same rule: deck and armor counts read the old counts from the capacity table, so no price or rating moves.
- Cargo parts add rows. A row on the new grid is narrower in meters, so rows per cargo part are rescaled to keep the same added area, rounded up.
- Front and back edges with an even count center a 3-cell ram one cell off center, toward the left. This keeps rams at 3 cells.

### Saves

- One new save step moves every item on every truck to the new layout. An item goes to the new cell nearest its old center in meters with the same rotation. If that spot is taken or not legal, it goes to the nearest legal free spot on the same truck. A player's part that fits nowhere goes to player storage, and an NPC's part that fits nowhere is dropped. The step logs every moved part. Refit plans and queues are mapped the same way, as `withArmorRowsOutside_120_121` does.

### Garage view

The mockup look becomes the real one:

- At rest: the truck body and built-in parts are dimmed together. Installed parts keep full color and cast a soft shadow. No cell washes and no grid lines. Damage tints stay on every part.
- Near the pointer, cell lines and armor edge marks fade in within about one cell. All cells show while a part is held or dragged.
- A picked or held part shows the cells it can mount on in green for as long as it is picked, including a part picked in the shop, storage or loot. Its edge is bright white and follows its drawing, with no cell box.
- A picked or hovered gun shows its yellow fan above every part except guns, and the fan starts at the gun's pivot. A blocker gets a danger color edge on its own drawing, never a box.
- The grid has padding, so the truck does not touch the panel edges.
- `docs/ui.md` gets one paragraph for this and loses the contradiction. The unused `--garage-cell-*` tokens are removed.

TDD: yes for the conversion rules, the capacity table check and the save step. They are deterministic and must stay green. The garage look is checked by screenshots.

### Invariants

- IV1 — Every cell is 0.45 m square on every chassis.
- IV2 — For every chassis and gun spot, the gun base lies within a quarter cell of its cells' center. The same measure as the Context run gives the number.
- IV3 — For every chassis, every capacity in the old capacity table holds on the new layout.
- IV4 — Every chassis's value and rated mass equal their old values.
- IV5 — A save from before the step loads with every item placed, stored or logged as dropped. No item vanishes without a log line.
- IV6 — At rest the drawn grid shows no cell background and no grid lines.
- IV7 — Every rule in `docs/wiki/mechanics/truck.md` and `docs/art/models.md` about grid shapes is rewritten for the new grid, and each still has a test.

### Assumptions

- AS1 — The width where gun bases stand today is a fair measure of each truck's deck width.
- AS2 — Fights stay balanced when side lanes become shorter and more numerous, because armor covers the same meters. `npm run combat` on a few loadouts checks it.

### Unknowns

- UK1 — Whether hand-tuning layouts to old capacities leaves any truck with a layout that breaks the cab, transmission and wheel placement rules.
- UK2 — How many tests hardcode old coordinates. The armor-row move touched 47 files.

## Plan

Approach: split a part's size into two meanings first, with no behavior change, then swap the grid. `w` and `h` become the grid footprint. A new `bulk: { w, h }` keeps the old footprint for every balance number and for model scaling, since the part models were built at the old cell size `PHYSICS.cell`. After that the grid swap is data plus one projection change, and the rest is fallout: saves, tests, docs and the garage look.

### PH1 — Bulk split, no behavior change
- `game/src/data/parts.ts` — `PartDef.bulk: { w: number; h: number }`, set equal to today's `w`, `h` for every def. The armor price at `:200` reads `bulk`.
- Balance readers switch to `bulk.w * bulk.h`: `sim/jobs.ts:167,226`, `sim/npc-loadout.ts:436`, `sim/npc-gear-score.ts:24`, `sim/progression/orders.ts:65` and gun draw if it reads cells.
- Model scale switches to `bulk`: `three/render/vehicle.ts:964-973 footprint()`, `three/render/armorCut.ts:220`, `three/icons/render.ts:216`.
- Commit: Parts keep their old size as bulk for balance and model scale.

### PH2 — Square grid
- `game/src/sim/body.ts:184-235` — `GRID_CELL = 0.45`. `cellSteps()` returns it on both axes. `singleCellRect()` places inner cells from the grid center. Ring cells stay on the body faces.
- `game/scripts/square-grid-convert.mjs` (temporary) — writes the new layouts and core spots by sampling the old layout under each new cell center, and the old capacity table.
- `game/src/data/chassis.ts` — new layouts and core spots, hand-tuned to IV3. `priceCells: { deck, armor }` per chassis, the old counts, read by `chassisModifier()` and `ratedMassOf()` (IV4).
- `game/src/data/parts.ts` — new `w`, `h` by the design's rule.
- `game/src/sim/grid.ts:172` and cargo rows — rows rescaled to keep crate capacity.
- `game/src/sim/square-grid.test.ts` (create) — IV1, IV3, IV4 against `square-grid-capacity.json`, the frozen old table.
- Commit: Square 0.45 m grid on every truck, layouts tuned to the old capacities.

### PH3 — Saves
- `game/src/three/save-steps-late.ts`, `save-migrations.ts`, `save-shape.json` — step `withSquareGrid` per the design, with its old layouts frozen inside the step like `OLD_ROWS_120_121`.
- `game/src/three/save-step-square-grid.test.ts` (create) — IV5 on the latest fixture.
- Commit: Save step moves every truck item onto the square grid.

### PH4 — Garage remake
- `game/src/ui/styles/inventory.css`, `ui/tokens.css`, `ui/inventory.ts`, `ui/inventory-draw.ts`, `ui/garage-draw.ts` — the design's garage view. The mockup CSS in `game/tmp/fit-mock.mjs` and `narrow-mock.mjs` is the reference.
- `game/docs/ui.md:228,255` — one paragraph for the new look.
- Commit: Garage view shows a quiet truck, the grid near the pointer and the fit cells of a picked part.

### PH5 — Fallout
- Every test that hardcodes old coordinates or counts, found by the full cached run against the baseline.
- Rule tests in `sim/body.test.ts` and `three/render/gunRisers.test.ts` updated for IV2 and IV7. Generated files regenerated: `npm run save:shape`, `npm run wiki`, `npm run sim:sprites`.
- Docs: `docs/wiki/mechanics/truck.md`, `docs/art/models.md`, `docs/architecture/saves.md`.

### Test strategy
- TDD for PH2's capacity and price checks and PH3's step. The tests are written red against the old grid, then the data turns them green.
- IV2 by the gun base measure run as a test in PH5.
- Fights: `npm run combat` on a few loadouts before and after, for AS2.
- In the game: `npm run playtest` and garage screenshots of the scout, a 7-column truck, the semi and the sorokonoga.

### Order & dependencies
- PH1 and PH4 run in parallel in their own worktrees while the baseline test run holds this one. PH2 follows PH1, PH3 follows PH2, PH5 follows all.

### Risks / rollback
- RK1 — Hand-tuned layouts drift from the look the user approved. Mitigation: garage screenshots of every chassis before closing.
- RK2 — A save that fit before loses parts. Mitigation: IV5 and its log lines.

## Conclusion

### Hands-off decisions
- make: size large, full flow — every chassis, part, save and the garage change together.
- udesign: one cell size of 0.45 m for every truck, chosen by the user; columns from the gun base width, rows from the length.
- udesign: lengths of 1, 2 and 3 cells become 1, 3 and 4; widths stay; layouts tuned to the old capacities, as the user allowed.
- udesign: an even front or back edge centers a 3-cell ram one cell left of center, so rams keep 3 cells.
- udesign: a saved part with no legal spot goes to the player's storage, or is dropped from an NPC truck, with a log line.
- uplan: plan auto-approved.
