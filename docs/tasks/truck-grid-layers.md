# Truck grids with a below-deck layer

**Status:** validating
**Branch:** truck-grid-layers
**Worktree:** .worktrees/truck-grid-layers
**Goal:** On all 18 chassis, the cells a player can build on follow the drawn truck: wheels and every part the truck does not draw sit below deck so gear can go over them, no blank cell sits on a usable surface, and the cab is centred on the drawn cab. Players use the grid to fit parts without guessing why a cell is refused. The user confirms it from garage screenshots of every chassis and a playtest. Useless if: cells open on air, so parts float or squeeze; a save loses parts; a part under gear can no longer be hit, repaired or swapped; the game refuses gear on a cell the garage shows as open.
**Mode:** hands-off

## Context

- The approved scout layout has a 4 by 2 cab, the tank on the right at rows 9 and 10 sharing a rear wheel cell, the gun on the hood and 28 deck cells against 17 today. The approved sheet of every chassis is `game/tmp/truck-grids/sheet.png` in the main checkout, built by `sheet.mjs` beside it, whose `propose()` is the source for the new layouts.
- Mounting reads one letter per cell (`game/src/sim/grid.ts:161`), so a layout cannot say deck above and wheel below. Every core part is on the `base` layer (`game/src/sim/grid.ts:38`).
- Crate room counts every non-skin cell minus base items (`game/src/sim/grid.ts:342`).
- Core parts are placed only by `addCoreParts`, cannot be bought or moved, and `swapChassis` builds new ones, so a cab shape can differ per chassis (`game/src/sim/economy.ts:727`).
- In a lane walk, gear and a wheel on one cell tie on position, so a wheel can shield gear above it (`game/src/sim/armor.ts:395`).
- Engine bays are 2 wide with model holes cut to them, so engines stay off-centre on odd-width trucks and on the wagon and carrier.
- `restFlat` shrinks a part to the flat part of its cell down to `MIN_KEEP` 0.3 per axis (`game/src/sim/body.ts:301`), which squeezes the tank onto a 20 cm bed rail.

## Design

The user approved the sheet and decided: everything hidden goes below deck, crate room grows with the cells, and difficulty and NPC balance are retuned later in separate work.

### Layers

A third layer, `below`, holds wheels, tanks and transmissions on `showsCores: false` chassis, and the mounted buggy engine. A part is below when it sits on its own chassis spot. Two items collide only on one layer, as accessories already do. Below parts leave crate room. Their mount comes from the chassis data, not the cell letter, so the cells over them carry `D`, or `C` on the semi.

Drawn parts keep blocking: every cab, plus the tank and transmission on the scout and wagon, keep `X`. The scout's tank is on `base` and overlaps a `below` wheel.

### Layouts

Follow `propose()` on the approved sheet: wheel and hidden part cells open, blank cells with at least 30% support open, on every chassis including the semi. Cabs are centred: 4 by 2 on even widths through a new part `cabWide`, 3 by 3 on odd widths, and the seat of buggy, courier, jeep and niva turns sideways. The loader's cab moves onto its drawn cab and its tank and transmission take the old cab spot. The scout's gun starts on the hood.

### Hits

A lane walk meets accessory, then base, then below. Below parts never shield what is above them from a blast, and never get the sorokonoga deck armor bonus.

### Look

A part that would keep under 70% of its cell on either axis stands whole at the top surface on legs instead of shrinking, by raising `MIN_KEEP`. Parts keep their shape on rails.

### Garage

Top gear takes a press. A second press on the same selected cell selects the part beneath, and keyboard focus reaches every item.

### Saves

One tiny step sets the new cab id and spot, moves tank and transmission, and moves any gear the new cab or tank covers to the nearest free legal spot. A homeless player part goes to storage and an NPC one is dropped, as `withSquareGrid_128_129` does.

TDD: yes for layer rules, hit order and the save step. The look and garage are checked from screenshots.

### Invariants

- IV1 — Every chassis builds through `addCoreParts` with no error and every core part stays mounted.
- IV2 — Every open cell holds a gun spot or part without `vehicle.ts` throwing, checked by `gunRisers.test.ts`.
- IV3 — A round on a stacked cell hits gear before the part below, and can reach the part below.
- IV4 — A save from before the step loads with every part placed, stored or logged as dropped, and awards nothing.
- IV5 — A press in the garage never selects a covered part before its cover.

### Assumptions

- AS1 — Standing a part whole on legs at `MIN_KEEP` 0.7 looks right on every chassis. The user confirms from screenshots.

### Unknowns

- UK1 — How many tests pin layouts. The code map lists about 15 files.

## Plan

Approach: add the layer with today's data first, so behavior stays until the layouts change, then swap data and fix what depends on it.

### PH1 — Below layer
- `game/src/data/chassis.ts:61-62` — `hiddenBay?: { x; y; w; h }` for the buggy.
- `game/src/sim/grid.ts:27,38,367,421,461` — `Layer` gains `below`, `belowDeck(chassisId, item): boolean`, `layerOf` and `mountSpots` use it. `computeMountLetter` returns `X` or `E` for a below part.
- `game/src/sim/inventory.ts:393`, `game/src/sim/repack.ts:23`, `game/src/three/render/garageRender.ts:102,107` — read the new layer.
- `game/src/sim/layers.test.ts` — stacking, crate room, refused overlap on one layer.
- Commit: Wheels and hidden parts sit on a below-deck layer.

### PH2 — Hits
- `game/src/sim/armor.ts:395` — `outerFirst` ranks three layers. `:197` `shields` skips below cells for targets above. `:450` `sitsOnDeck` is false for below parts.
- `game/src/sim/armor-stepped.test.ts` — IV3.
- Commit: Rounds reach gear before the part below it.

### PH3 — Layouts
- `game/src/data/chassis.ts` — every layout and core spot from `propose()`. `game/src/data/parts.ts:302,853` — `cabWide`. `game/src/data/start.ts:44,58,60` — scout kit spots.
- `game/src/text/en/names.ts`, `en/lore.ts`, `ru/names.ts`, `ru/lore.ts` — `cabWide` text, Russian from agy.
- `game/src/data/chassis.test.ts:94,113,120,178,196,226,282,327` — rules rewritten for the new grids.
- Commit: Every truck gets its new grid.

### PH4 — Legs
- `game/src/sim/body.ts:301` — `MIN_KEEP` 0.7. `game/src/three/render/gunRisers.test.ts`, `game/src/sim/body.test.ts` — IV2.
- Commit: Parts stand whole on legs instead of squeezing onto rails.

### PH5 — Garage
- `game/src/ui/inventory-draw.ts:218,237`, `game/src/ui/inventory.ts`, `game/src/ui/condition-plan.ts:49`, `game/src/three/render/truckPortrait.ts:548` — stack order, second press, one owner per cell picks the top part, buggy bay shown for a held engine.
- Commit: The garage reaches parts under gear.

### PH6 — Saves
- `game/src/three/save-step-truck-grids.ts` (create), `save-migrations.ts` — step with its own copies of old and new spots. `npm run save:shape`. `save-step-truck-grids.test.ts` — IV4 on a fixture.
- Commit: Old saves move onto the new truck grids.

### PH7 — Fallout
- Pinned tests and generated files: `game/src/sim/market.test.ts:31`, `npc-loadout-floor.test.ts:101`, `inventory.test.ts:406`, `mass.test.ts:51`, `npc-loadout-unarmed.json`, `npm run wiki`, `npm run models:shapes` if stale.
- `game/docs/wiki/mechanics/truck.md:9`, `game/docs/art/models.md` — new rules.
- Commit: Tests and docs follow the new grids.

### Test strategy
- Touched test files only during work, then the full suite through `scripts/land-dev.sh` when the user chooses to land.
- `node scripts/garage-ui-check.mjs`, `npm run playtest`, `npm run layout`, and a garage sheet of every chassis with real gear for the user.

### Order & dependencies
- PH1, PH2, PH3, PH4, PH5, PH6, PH7 in order. I build them myself, because they share `grid.ts` and the layouts.

### Risks / rollback
- RK1 — NPC rolls and fights shift, which the user accepts until a later tuning pass.
- RK2 — The trader economy moves with crate room. `npm run stuck` guards against stalls and income is retuned later.

## Verify

- Passed on the final code: the layer, hit-order, save-step, garage-press, market and NPC loadout test files, typecheck and the quality hook.
- A real-game run of the condition view with guns over wheels on the hauler, buggy and wagon, plus the semi and the starting scout, drew with no page error.
- A real-game run of the garage on the starting scout gave gun, wheel, nothing, gun on four presses.
- A run of 196 files, the support tests plus the files that failed before, was stopped at 57 files when the work went to factory hardening. 50 passed. 7 failed with 11 gun support tests at the 30 s limit, on the wagon, longbed, convertible and sorokonoga, with swap about 92% full. No test reported a floating part. Whether the timeouts come from load or from more cells to check is not known.
- Not run: `garage-ui-check` past the bowl, `npm run playtest`, `npm run layout`, `npm run stuck`. The sheet `game/tmp/truck-grids/final-sheet.png` predates the four-corner legs.

## Conclusion

Grids, below-deck layer, hit order, legs, garage press and save step are committed. The goal needs the user's check of the garage sheet and a playtest.

### Deviations from plan

- The new cab id is `cabBroad`, because `cabWide` is a retired id that `save-rescue.ts` renames to `cabPickup`.
- The niva seat is at row 6, not 5, because the antenna needs a flat roof.
- Semi 4,15 stays blank because it has no surface, an error in the sheet survey. Loader 1,9 and 6,9 stay blank for the same reason. Sorokonoga 1,11 and 5,11 stay blank because a long gun there has no surface under its post.
- The save step only renames and moves core parts and drops refit jobs on those trucks. Existing load repair re-places gear the new cab covers.
- The Russian for `cabBroad` came from Codex, because agy timed out after 300 s.
- The support test files split from 80 to 160 gun files and 12 to 18 edge files with every case kept, which raises suite cost.

### Known risks

- Market curve tests hold the old loads of scout 23 and hauler 53. A full hauler now moves prices past the tested limit, and trader income is higher until the retune.
- Single gun cases on the longbed and sorokonoga used 22 to 25 s of CPU under the memory pressure, near the per-test limit.

### Hands-off decisions

- uplan: plan auto-approved.
- uexecute: closed cells with no surface rather than float parts on them.
- uexecute: a part on legs now gets a leg or brace at all four corners, and a part on a slope needs a closer fit, so no known floating spot remains.
- ureview: reviewer found nothing at confidence 80 or higher.

### Deferred (needs user input)

- Full test run and landing: factory hardening runs both.
- Goal check: the user judges `game/tmp/truck-grids/final-sheet.png` and plays a fight.
