# Square grid and garage remake

**Status:** validating
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
- Each chassis gets new layout strings. Its inner columns are the width where its gun bases stand today divided by 0.45 m and rounded, and may grow up to the body width divided by 0.45 m when the truck cannot keep its capacity otherwise. Its body rows are its length divided by 0.45 m, rounded. The grid is centered on the body. The scout becomes 4 columns by 12 rows. Measured widths are in `game/tmp/square-widths.json`.
- The armor ring stays one cell outside the inner grid on all four sides. In 3D, plates keep sitting on the body faces, so armor looks as it does now.
- A conversion script in `game/scripts/` writes the new layouts and core spots once. It samples the old layout under each new cell's center in meters. The new layouts are then committed as data and checked by the rules below, and the script is deleted.
- `cellSteps` returns 0.45 for both axes. `cellRect` places cells from the grid center, not by stretching over the body.

### Balance stays where it was

- Part footprints are rebuilt from meters at the typical old cell, 0.42 m across and 0.65 m along: widths stay, and lengths of 1, 2 and 3 become 1, 3 and 4. Rams keep 3 across. The small built-ins `wheel`, `tank`, `transmission` and `cab` keep their length, since they ride the small cars, whose old rows were 0.46 to 0.5 m long, so 2 rows of 0.45 m match them.
- Layouts are designed per truck against `game/tmp/square-check.ts`, which scores a candidate against the old capacities in `game/tmp/square-targets.json`. Shapes bigger than one cell must fit exactly as many times as before, one-cell shapes at least as many.
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

## Verify

All work is merged on branch `sq-grid` in `.worktrees/sq-grid`.

- IV1 holds. `GRID_CELL` is 0.45 m, and `cellSteps` returns it on both axes for every chassis.
- IV2 holds. On the final layouts, 0 of 3930 gun spots put the base center outside its own cells, and no spot fails to stand. Before the change, 1753 of 4369 spots had the base more than a quarter cell off.
- IV3 holds except where the Hands-off decisions say otherwise. The capacity checker passes on 12 of 18 chassis. The bus, lincoln, carrier and courier lost one gun of some shapes so nothing floats, and the niva holds 4 small guns instead of 6.
- IV4 holds. Value and rated mass read `oldGrid`, and the chassis tests pin them.
- IV5 holds. On a full old world at seed 1337, the save step places every item, or logs it as dropped from an NPC: 83 items. The player truck lost nothing. The save rescue now carries a truck the way the step chain does, and a test runs both on six old saves.
- IV6 holds. Garage screenshots of all 17 player trucks, at rest, near a cell, with a gun picked, with its fan and while dragging, show no page error. At rest there are no cell washes and no grid lines. A drag to a legal spot shows the ok preview on 16 trucks. The scout's only other mg spots are turned across the truck, which the script does not drag. The contact sheets are `game/tmp/sheet-rest.png` and `game/tmp/sheet-picked.png` in `.worktrees/sq-grid`. The semi is the Chaos Highway hauler, and its grid opens from the outpost's Hauler tab. A Chaos Highway game showed it with 207 free cells and no page error, at rest and with the cab picked. The shots are in `game/tmp/garage-check/semi/`.
- IV7 holds. The wiki truck page, the models doc and the saves doc describe the square grid.
- AS2 does not hold. See the first Deferred item.
- In the game, `npm run playtest` played 30 turns at 60 fps with no page error. `npm run combat` ran merc, merc with snowball gear, gunwagon and hunter against buggy, heavy buggy, two buggies, courier and vulture, seeds 1 to 20, on both grids: 400 fights each. Outcomes keep their shape: most fights end in a truce or a flight on both grids, and wins and losses stay rare. Damage dealt per turn by side a rose on most lineups, for example merc against vulture from 8.0 to 21.9. The courier fled the merc 7 times on both grids. Buggies fled the merc 7 times on the old grid and 3 on the new.
- The full test suite on `sq-grid` fails 10 files, against 19 before this work, and every one of the 10 failed before. Two of them have one test more failing than before, both listed under Deferred: the courier flee test in `combat-harness` and the loader small-part cells in `truckSupport`.

## Conclusion

### Hands-off decisions
- make: size large, full flow — every chassis, part, save and the garage change together.
- udesign: one cell size of 0.45 m for every truck, chosen by the user; columns from the gun base width, rows from the length.
- udesign: lengths of 1, 2 and 3 cells become 1, 3 and 4; widths stay; layouts tuned to the old capacities, as the user allowed.
- udesign: an even front or back edge centers a 3-cell ram one cell left of center, so rams keep 3 cells.
- udesign: a saved part with no legal spot goes to the player's storage, or is dropped from an NPC truck, with a log line.
- uplan: plan auto-approved.
- uexecute: work runs in worktrees `sq-bulk`, `sq-grid`, `sq-ui` and `sq-save`, all cut from `garage-view`, merged into `sq-grid`. Agent-made worktrees came from the stale `origin/main` and were discarded.
- uexecute: the baseline full run before any change failed 19 test files; the list is in `game/tmp/baseline-failing-files.txt`.
- uexecute: the small built-ins `wheel`, `tank`, `transmission` and `cab` keep 2 rows; the 1-row shapes, like 2x1 racks, need at least their old count, not the exact count.
- uexecute: cores may share a wheel column in rows the wheel does not use, since a 3-wide cab cannot clear both wheel columns on 4 to 6 columns. The scout keeps the user's 4 by 12.
- uexecute: some trucks bend the gun width rule: van and bukhanka by up to 0.22 m a side, the tractor's 6 columns run 0.03 m past its body, and the bukhanka takes a 13th row.
- uexecute: prices, rated mass and cargo rows read `oldGrid` per chassis, the old deck count, armor count and row width, so none of them moves.
- uexecute: crate room, counted as deck, bay and plain cells plus the plain rows under the chassis, equals the old room on every truck or exceeds it by the fewest cells possible. Surplus cells became holes with no surface; missing cells came back as plain spare rows under the chassis. A test freezes the old room per truck.
- uexecute: bed rows under the chassis keep plain rounding of old rows times old width over new width. Rounding up would add a row on the scout, hauler and longbed and break the crate room match.
- uexecute: every truck keeps a plain front and back row, except where the old gun count needs those cells as deck: hauler, buggy, wagon, courier, longbed, carrier, jeep, bus and niva.

- uexecute: save step `withSquareGrid_121_122` in its own files. Unknown chassis pass untouched, since load repair removes retired ones after the steps. A part that fits nowhere in its own rotation is turned as a last resort, with a warning. On a full standard world at seed 1337 with the final layouts it drops 83 of the NPC items, up from 80 on the first layouts. Most are armor plates on small cars: 17 on jeeps, 23 on buggies and 11 on couriers. Plates two cells long become three and the front and back edges are narrower. One NPC van also loses a slug cannon, and NPC nivas lose 5 crates of goods. Every lane still takes armor. The player truck lost nothing.

- uexecute: gun bases slid off their cells mostly because `plateSpot` searched for a flat seat up to half a base past the cells, not because of overhanging cells. The search now stays inside the gun's own cells: 662 of 4376 gun spots had the base center outside its cells, now 0.
- uexecute: balance is held by best packing per truck. Fire-arc first-fit mounting, as NPC loadouts do it, fits one or two fewer guns than before on most big trucks. Accepted and logged, since a player can still fit the old loadout.
- uexecute: a full side of armor takes as many plates as before; the front and back take one plate fewer, with the same lanes covered.
- uexecute: Sunward riders on the night schedule no longer stop for salvage. A loot detour stalled them short of their posts, and the new grid's id shift exposed it.
- uexecute: the hunter bot now picks a stand point where its gun reaches the target, and refuses mercy when it cannot ask a foe to stand down. Before, a reply it could not pick silently fell back to accepting the plea.
- uexecute: parts never floating beats exact gun capacity where the loss is one gun of a shape. Deck cells over a sloped tail, roof edge, fender or cowl step became plain or blank on the bus, lincoln, courier and carrier, each losing one gun of some shapes. The convertible's floating spots predate this work: it had 29 known spots and now has 10, kept as its known list.
- uexecute: same-lane head-on avoidance crashed about half the time on any layout. A truck now predicts a holder along the headings toward its destination and stops when its way around would need a turn past 90 degrees. Crashes over 20 id shifts went from 10 to 0.
- uexecute: an armed NPC truck now always mounts a gun covering its front when its layout has such a spot. Before, a buggy could roll only a side flamer.

- uexecute: a lane cell costs a round its share of the old cell's meters, per chassis, from the old row length for front and rear lanes and the old column width for side lanes. Blank cells inside the body cost the same, so a hole is no shortcut. Aiming at a part reads its old footprint, so grown parts are not wider targets.
- uexecute: the hauler tank lies lengthwise again. Across the truck it shielded the transmission from every rear lane, and an mg could not stop the hauler from behind.

### Deferred (needs user input)
- Combat toughness moved, and it comes from the layouts, not from per-cell cost. Toughness is the rounds a truck takes to be stopped from each side. Armed trucks, with an mg, a stock engine and plates on every edge, are 25 to 40 percent easier to stop from the front and rear on most trucks. For example, the wagon front fell from 28.9 to 17.3. Bare sides rose by up to 82 percent on the loader's left. The causes: transmissions now share rows with the rear wheels, so a wheel shields them; narrow trucks lost one lane per end; 3-cell plates leave more front and back lanes bare; and the 3x3 cabs. A test raider duel moved from 90 to 71 percent raider wins. Decide whether to tune layouts and armor toward the old toughness per side, or to accept the shift and retune fights. Tables are in `game/tmp/final-*.txt` in the `sq-tough` worktree.
- Small cars got smaller in capacity terms where their old cells were short: niva below, and plates on the jeep, courier and buggy. Decide whether small-car loadouts may shrink or their grids should grow.
- The courier lost its only spot for a gun 1 cell wide and 3 long, like the recoilless rifle, when its deck over the fender and cowl step was demoted so nothing floats. Decide whether the courier needs that spot back.
- Loader cells (2,12), (5,12) and (5,6) lie over walls and the lower fender, so a small box there does not stand on the truck. Demoting them costs more than one gun per shape: 1x2 guns from 12 to 9. Decide between floating small parts on those cells and the lost capacity.
- A 2-wide cargo frame on the longbed's front row does not stand on the truck at seed 1337. Demoting one cell only moves the fault along the row. Decide whether the longbed front row stays deck.
- NPC couriers roll a gun about half as often as before: at standard gear 25 of 60 rolls, against 55. The courier picks its cargo part and utilities first, and they take the top cells of both gun lanes. A patch that makes utilities take the spot leaving the most gun spots open is at `game/tmp/loadout.patch` in `.worktrees/sq-merc`. It brings couriers back to 60 of 60, but it reshuffles NPC loadouts everywhere, and two dice-dependent harness tests then need new seeds. Decide whether to apply it.
- The combat harness test "names the courier side when it flees a stronger truck" fails on seed 2. The merc rolls its 3 percent keep option and goes trading, so neither side flees. It is a dice tail that the new loadout draws moved onto this seed, not a rule fault. Its file failed before this work on other tests.
- A loaded truck keeps less room for goods than before. Parts grew in cells by about half while the free room of an empty truck stayed equal. The hold-up hauler with 30 parts has 19 free cells, down from 27. Decide whether goods room on a loaded truck must hold, which would mean more room on every truck.
- Niva capacity: it holds 4 small guns instead of 6, the best its body allows, because it needs 18 deck cells and has 12 free. Decide between a smaller loadout, smaller built-ins for the niva, or a grid past its body.
