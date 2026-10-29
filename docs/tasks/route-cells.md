# Route grids per cell

**Status:** validating
**Branch:** cell-streaming
**Worktree:** .worktrees/cell-streaming
**Goal:** Boot does not wait for whole-map route grids: the scene step finishes under 2 s on a production build, and neither the first turn nor the first cross-map auto travel freezes for seconds. Useless if: boot is fast but the first turn builds the grids instead; trucks lose routes they have today; the map download grows by more than the time saved.
**Mode:** interactive

## Context

- The boot scene step waits about 4.5 s for the turn worker, which builds route grids for every truck size over the whole map in `warmLayers` (`game/src/sim/nav/layer.ts`).
- The worker builds 11 truck sizes, from 0.5 to 1.2 tiles. A fresh roaming world has trucks of 7 of them.
- In Node one truck size takes 0.75 to 1.5 s on the real map. The fine grid has 3744 x 3744 half-tile cells.
- Long routes read a whole-map coarse graph: 8 x 8 cell blocks split into regions, region edges and connected areas. `route` past 16 tiles, `routeAhead`, `coarseTrip`, `drivable` and `reachesFrom` all need it.
- The solid prop set is the same in every roaming game, checked over seeds 1 to 3. Breakable props change during play and only change region costs. Kill wrecks are an overlay per route.
- The coarse graph per truck size has about 204,000 regions and 1.48M edges, about 11 MB. All 11 sizes come to about 120 MB, too big to bake into the map download. Measured with `game/tmp/route-facts.mjs`.
- `RegionGrid.local` holds one byte per fine cell, so region lookups can only be lazy if each cell rebuilds its own block floods.

## Tried and dropped

- Fewer truck size classes. Rounding a truck up to a larger class cuts it off roads it reaches today. From 0.5 to 0.7 the main road network loses 234 half-tile cells, most inside Fallen Sun, the rest in 2 to 6 cell spots near Granary, Kiln and Green Pit. Every other pair loses cells too. Measured with `game/tmp/size-classes.mjs` and `game/tmp/size-loss-spots.mjs`.
- Helper threads that build some truck sizes and hand the arrays to the turn worker. One helper needs 500 to 700 MB and about 2 s of setup before its first size, because it rebuilds the whole-map terrain arrays. Ten helpers crashed the tab. Three threads left the scene step at 7.4 s, the same as without them. The code is kept in `game/tmp/route-helpers-tried.patch`.

- One baked node per piece, at its center. Long routes cost 3 to 11% more than before, because a road near a cell edge looked dear. Road-aware anchors and an exact piece search closed part of the gap only.

## Design

The user approved slightly changed route shapes.

- Route grids are built per 32-tile cell when a search first reads the cell. `game/src/sim/nav/cells.ts` owns cells, regions, pieces and crossings.
- The baked summary is HPA* style: a piece is the connected part of a cell, a crossing joins pieces of neighbouring cells at their cheapest touching regions, and each piece keeps the exact region-level cost between each pair of its crossings. `npm run routes:bake` writes `public/maps/icarus.routes.bin`.
- A key per cell, from its ground tiles and solid props, finds the cells that differ from the bake. Only those rebuild, such as the Hollow or another kit's props.
- Long routes search the crossings with the driver's taste, then the region search runs only in that chain of cells and one ring around it, four rings on the try that avoids blockers.
- Claim spots read the claim clue bake, which already lists every reachable remote wreck.

## Verify

- Production boot, two runs: fresh game ready 5.7 s with scene 1.9 s, saved world ready 4.3 s with scene 1.8 s. Before the cell work: 20.0 s with scene 12.6 s, and 21.1 s with scene 17.0 s.
- Eight sample long trips: seven equal the old routes in length and cost, one costs 2.6% more. `game/tmp/route-cells-check.mjs` against a checkout of 533a3184a.
- 15 world turns in Node: 40 ms per turn after the first, the same as before.
- Route-dependent tests pass: 44 files. The tow save and load test takes 25 s on both old and new code and times out at 30 s only when files run in parallel.
- `npm run playtest` PASS at 60 fps. `npm run perf`: boot 5.9 s against 14.2 s, frame p95 50 ms against 100 ms, travel frame 6.7 ms, within budget. Worker turns 2 and 3 take about 100 ms more while their cells build, with the player's wait unchanged at 11 to 18 ms. The second path preview takes 214 ms against 74 ms.
- The summary file is 6.6 MB, 3.3 MB gzipped, next to a 6.4 MB gzipped map.
- `hunting-spots.json` was rebaked: 61 spots where 59 were, from the changed route shapes.

- On basin-regions after the merge and the early terrain send, production boot, two runs: fresh game ready 5.1 s with scene 1.3 s, saved world ready 3.9 s with scene 1.2 s. `npm run perf` on the dev server at load average 5: boot 4.8 s, first preview 211 ms against 1.36 s before, frame p95 50 ms, slowest worker turn 245 ms against 182 ms before. Every budget missed before this work as well. Playtest PASS at 60 fps.

## Known risks

- Worker turns 2 to 4 after boot build the cells of far NPC trips and run 60 to 100 ms longer than before. The player's wait per turn stays at 11 to 18 ms.

- A full build of every cell, for a map with no baked file or a world whose props differ everywhere, costs about 1.2 s per truck size against 0.9 s before.
