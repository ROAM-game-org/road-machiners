# Route grids per cell

**Status:** design
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

## Next

The two-level summary per 32-tile cell is the remaining way. It needs its own design: a small baked graph between cells for long routes and connected areas, and fine grids built per cell on first use. Route shapes change slightly, so it needs the user's approval on that change.
