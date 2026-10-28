# Cell streaming

**Status:** executing
**Branch:** cell-streaming, from basin-regions e87a80f25
**Worktree:** .worktrees/cell-streaming
**Goal:** The scene boot step, the last stage a player waits on, takes at most a tenth of today's time on the same host, measured with `boot:time` on a production build. Players get there because the game builds only the map cells the truck can see, and streams the rest in during play. Confirming the feel needs the user to boot and drive. Useless if: boot is fast only because far cells never build, so a trip shows bare ground; streaming hitches frames during 8x auto travel; the work moves into the first frames after `roam:ready`; cells are picked from a sight disc that shrinks at night, so dawn needs a blocking rebuild; a map error that boot catches today only shows when a player drives to that spot.
**Mode:** hands-off

## Context

- The map is 1875 tiles a side at 4 m a tile, which is 3481 scope chunks of 32 tiles. The scene step builds every view for every chunk.
- A dev-server profile of the Game constructor, with the outline weld fix in, took 9.6 s on the main thread. Scatter took 2.0 s. Shader prep for every material took 2.4 s. Terrain meshes took 1.6 s, with 0.5 s of it on the road mask. Graffiti took 1.5 s, mostly ray casts. Props took 1.3 s. Sites took 0.4 s and their lights 0.2 s. The fog took 0.13 s.
- The turn worker warm takes 0.7 s in its own thread, beside the scene step.
- The player sees only the gray disc. Its radius is sight 25 tiles times `grayFactor` 4, which is 100 tiles. The tourer chassis and perception make it wider. Night and weather make it smaller. The `SightLimit` shader discards everything beyond the disc, and the camera leash keeps the view inside it. The disc covers about 40 of the 3481 chunks.
- `RenderScope` already files each object into a 32-tile chunk by its anchor point. It checks the object's bounds against a claimed circle, and attaches only chunks that meet the disc and the camera frustum.
- `compileAsync` at the end of the Game constructor prepares every material in the scene. `model()` clones the material of every prop, so this prep runs once per prop, though the scene has only 51 shader programs.
- `ShaderWarmup` already hides objects whose program is not compiled yet, and compiles them async.
- Some views read the whole map at once. `FogView` and `ShadeView` take the full list of ground chunks. `NIGHT_POOLS` bakes one map texture from the lamps of every site. `SiteLights` takes the lights of every site. The road mask, glass field and desert field are map-sized textures. The ground texture is a 2048-pixel canvas of the whole map, painted in its own boot step in 0.8 s.
- `chooseGraffiti` picks signs over the whole map by priority, with a 30-tile minimum gap, so a sign's place depends on signs anywhere. Its fit casts at throwaway geometry built from map data, so a fit does not depend on built views.
- `ObstacleViews.syncLoot` throws when a lootable prop has no view. `RenderScope.add` throws when an object leaves its claim. Today every boot hits both checks for the whole map.
- Fast travel runs up to 8 turns per second, a turn is 1 game second, and the fastest chassis tops out near 12 tiles a turn. That is about 100 tiles, or 3 chunks, per real second. `scripts/perf-budgets.json` sets `travelFrameMs` 8.
- Outside the scene step, new-game world setup takes 4.4 s, mostly shop claims and spawns in the sim. Sounds take 7 s on the dev server and already end at the same moment the scene step starts. After this task those two bound the total boot.

## Design

One mechanism builds every map-bound view: objects and map-sized texture layers. A view says what goes where. The streamer decides when.

1. Cells. The cell is the existing 32-tile scope chunk, which is 128 m. Engines that stream at ground level use cells of 64 to 128 m, and every view here already groups by this chunk.
2. Placements. At startup a map view registers placements with its scope instead of building objects. A placement is an anchor point, a claim radius and a build function. The anchor decides the cell. The claims widen the cell's box, so a town or a power line that reaches into view makes its cell wanted. The existing claim check still throws when a built object leaves its claim.
3. Two discs pick the cells. Cells are the unit of work, and a disc only picks which cells to build, because the shader draws a disc. The reach disc is the gray radius the truck would have by day in clear weather, from its chassis and skills now, so night, storms and dawn never change which cells are built. The lead disc is the reach disc plus a lead margin. A cell is wanted when its box meets a disc. The test uses the disc only, because an unbuilt cell has no height range for a frustum test.
4. Building. Before each frame draws, every cell that meets the reach disc is built, blocking if needed. Cells in the lead disc build nearest first within a per-frame millisecond budget, checked between placements. One streamer runs all three scopes, ground, props and craters, with one budget. A cell builds in a fixed order: ground, then props, then decals. The lead margin is sized from the top travel speed and the budget, so 8x auto travel never needs a blocking build. A teleport, a load or a rescue tow builds the reach cells in one blocking frame, as a load does today.
5. Boot builds the reach and lead cells around the truck. The boot set comes from the world, not from the `SightLimit` uniform, which is infinite until the first `set()`.
6. Shader prep is part of building. After a placement builds, the streamer hands it to `ShaderWarmup` to compile against the scene, inside the budget. Boot compiles only the cells it built.
7. Texture layers fill per cell. The ground texture, road mask, glass field and desert field become map-sized data textures. A cell build paints its own region and uploads only those rows, with three.js `addUpdateRange`. The fog restates a cell's tiles when its ground builds. A site build adds its lights to `SiteLights` and paints its lamps into the night-pool texture. `FogView` and `ShadeView` take each ground chunk as it builds. The separate ground boot step goes away.
8. Built cells stay. Nothing unloads. The most memory a session can use is the whole map built, which is what every boot does today. Unloading would need dispose paths in every view that holds state, and nothing measured asks for it.
9. State stays in world data. Props that break or hold loot, craters and salvage piles keep their state in the world, as now. A build reads the current state. A sync touches only built placements and re-registers changed ones. Moving effects near the truck, such as flying debris and a fresh crater, go straight into their cell.
10. Graffiti picks per region. Signs are chosen per fixed square region of whole cells, at least twice the minimum gap wide, by priority. A candidate must stand at least half the minimum gap inside its region edge, so the gap still holds across regions and no region depends on another. The density stays the same. Signs move to other spots, which is render-only and unsaved.
11. A full-build check. `npm run playtest` builds every cell of Icarus once, through the same streamer, and fails on any error. Map errors still fail before release.
12. Perf timers. `stream-build` times the budgeted work per frame. `stream-block` counts blocking builds. The perf panel shows both, with the number of built cells. `npm run perf` fails on any blocking build during its auto travel run.

Approaches set aside:
- Keep the whole-map build and make each object cheaper, with shared materials and placement math in workers. Three.js objects and shader prep stay on the main thread, and the cost still grows with the map, so 10x is out of reach.
- Big cells in a 3x3 ring around the truck. Each big cell holds about 25 chunks of work, so builds must split across frames anyway, and boot builds about 6% of the map instead of about 2%.

Expected boot cost: the reach and lead cells are about 2% of the map, and the fixed costs left in the constructor fall from 0.8 s to under 0.1 s once texture layers fill per cell. That puts the dev scene step near 0.4 s against 9.6 s today.

Compatibility: saves are untouched, since streaming is render-only. The boot step list loses `ground`, which drops its English and Russian lines. Graffiti signs move.

TDD: yes for the cell picker, the build order, the budget stop and the graffiti region choice, which are deterministic logic. No for the view wiring, which `npm run playtest`, `npm run perf` and screenshots check in the browser.

### Invariants

- IV1 — Before any frame draws, every cell whose box meets the reach disc is built.
- IV2 — Each placement belongs to one cell by its anchor, and its built bounds stay within its claim plus the scope margin.
- IV3 — A cell builds the same objects and pixels whether it builds at boot or later, and in any order, because a build reads only map data and current world state.
- IV4 — Streaming never changes sim state or saves.
- IV5 — Budgeted building stops once the frame budget is spent. Only the placement already running can overrun it, and the perf timer records the overrun.
- IV6 — A graffiti region's signs depend only on that region's map data.
- IV7 — The reach disc does not change with time of day or weather.

### Principles

- PC1 — A whole-map pass at boot is allowed only over plain tile data, never for geometry, ray casts, painting or materials.
- PC2 — Views keep their sync API. Streaming lives in the scope, so a new view gets streaming by registering placements.

### Assumptions

- AS1 — At the top travel speed, the stream budget left inside `travelFrameMs` builds each new row of lead cells before the truck reaches it.
- AS2 — The heaviest single placement, a big town, builds in under one frame on a production build.
- AS3 — The async compile of a lead cell finishes before the truck brings it into the reach disc.

### Unknowns

- UK1 — The production baseline of the scene step and of the whole boot, from `boot:time`.
- UK2 — The spread of build cost per cell and per placement, and the costliest of each.
- UK3 — Whether the ground and road painters can paint one region with the same pixels as a whole-map paint.
- UK4 — What else builds these views outside the game, such as survey pictures, `shot.html`, sim sprites and icons. Planning found one: `src/three/survey-pictures.ts:169` draws `chunkGeometry` with `groundMaterial(w)`, so it must paint the layers of the cells it draws.

## Plan

Approach: build the placement API and the streamer first, with tests, then move each view onto it, then wire the game, then move the texture layers. Each view phase leaves the game booting and drawing the same picture, because the game still builds every cell at boot until PH6 turns streaming on. That keeps every phase checkable against today's look.

Views whose content comes from play keep eager `scope.add`: craters, salvage piles, prop debris and part debris. Their count grows with play, not with the map, so PC1 does not cover them.

### PH1 — Baseline and the weld fix
- 1.1 `game/src/three/render/models.ts:385-420` (modify), `game/src/three/render/hulks.test.ts` (modify)
  - Commit the outline weld cache already in the tree: `copyGeometry()` and `unchangedSource()` key the weld by the source model while the copy's positions are unchanged, so dented hulks still weld their own shape.
- 1.2 Baseline, no code. Run `npm run build && npx vite preview`, then `npm run boot:time -- --runs 3` in the background with a log in `game/tmp/`. Run `npm run perf -- --seams-only` for today's travel frame cost. Write the per-step medians and the travel frame under `## Verify` as the numbers to beat. Resolves UK1.
- Commit: Prop outlines weld once per model instead of once per prop copy, and a dented hulk still welds its own shape

### PH2 — Placements and the streamer
- 2.1 `game/src/three/render/scope.ts:16-120` (modify)
  - `type Placement = { readonly pos: Vec; readonly radius: number; readonly cell: number; built: THREE.Object3D | null }`
  - `RenderScope.place(pos: Vec, radius: number, build: () => THREE.Object3D): Placement` — files the placement under its anchor cell and widens that cell's claim rectangle in tiles. It builds nothing.
  - `RenderScope.remove(target: THREE.Object3D | Placement): void` — removes a built object or an unbuilt placement. Throws on an unknown target, as now.
  - `RenderScope.claimOf(cell: number): Rect | null`, `RenderScope.buildNext(cell: number): boolean` — builds one pending placement of the cell through the same path as `add()`, with the claim check, outlines and patches. Returns false when the cell has nothing left.
  - Respects: IV2, PC2.
- 2.2 `game/src/three/render/streamer.ts` (create)
  - `wantedCells(perSide: number, claims: (cell: number) => Rect | null, center: Vec, radius: number): number[]` — cells whose claim rectangle meets the disc, nearest first, ties by cell index. Pure.
  - `class CellStreamer { constructor(scopes: readonly RenderScope[], prepare: (root: THREE.Object3D) => void, now: () => number, budgetMs: number); boot(center: Vec, reach: number, lead: number): void; frame(center: Vec, reach: number, lead: number): void; buildAll(): void; get built(): number }`
  - `frame()` builds every reach cell fully, counting each one that was not ready under `stream-block`, then builds lead cells between clock checks until `budgetMs` is spent, under the `stream-build` timer. Each cell builds scope by scope in the order given: ground, props, decals. `prepare` runs on each built object.
  - Respects: IV1, IV3, IV5.
- 2.3 `game/src/sim/vision.ts:26-43` (modify)
  - `grayReach(world: World, viewer: Vehicle): number` — the gray radius with the night and weather factors at 1. `sightRadius()` and `grayRadius()` share the chassis and skill part with it, so the formula stays in one place. Respects: IV7.
- 2.4 `game/src/data/perf.ts` (modify)
  - `PERF.stream = { budgetMs, leadTiles }`. `budgetMs` is `travelFrameMs` minus the PH1 travel frame cost. `leadTiles` starts at one cell, 32, and PH8 checks it against AS1.
- 2.5 `game/src/three/shader-errors.ts:115-160` (modify)
  - `ShaderWarmup.prepare(root: THREE.Object3D): void` — starts the async compile of every drawn object under the root, with no time limit.
- Tests first: `game/src/three/render/streamer.test.ts` and `scope.test.ts`, listed below.
- Commit: Map views can register placements that a cell streamer builds near the truck, nearest first, on a frame budget

### PH3 — Ground cells
- 3.1 `game/src/three/render/terrain.ts:114-185` (modify)
  - `terrainMesh()` places one ground chunk per cell and each deck pick, and calls `onChunk(chunk: TerrainChunk)` when a chunk builds. It returns the shared ground material instead of the chunk list.
- 3.2 `game/src/three/render/fog.ts:31-110` (modify)
  - `FogView` constructor takes the ground material, not chunks. `FogView.attach(chunk: TerrainChunk): void` adds the `fogLook` attribute and restates that chunk's tiles. Restates and writes skip cells with no chunk yet.
- 3.3 `game/src/three/render/shade.ts:47-90` (modify)
  - `ShadeView` constructor takes the ground material instead of the chunk list.
- 3.4 `game/src/three/game.ts:235-250` (modify) — makes the `CellStreamer` over the three scopes and calls `buildAll()` once the views are made, so the whole map still builds at boot until PH6. Updates the `terrainMesh`, `FogView` and `ShadeView` calls.
- Respects: IV1, IV3.
- Commit: Ground chunks and deck picks build as cell placements, and the fog takes each chunk as it builds

### PH4 — Prop cells
- 4.1 `game/src/three/render/obstacles.ts:61-258, 470-519` (modify)
  - `syncViews()` places a view per obstacle instead of building it. The build reads current loot state from `lit`. `dropStanding()` and the removal loop call `remove()` on the placement.
  - `syncLoot()` paints only built views and throws only for a lootable id that has no placement.
  - `addRocks()` and `addPowerLines()` place their groups.
- 4.2 `game/src/three/render/trees.ts:20-60` (modify)
  - `TreeInstances` knows every tree id up front and places one group per cell. `hide()` and `show()` on an unbuilt tree only mark it, and the build applies the marks.
- 4.3 `game/src/three/render/sites.ts:553-629` (modify), `game/src/three/render/siteLights.ts:80-90` (modify), `game/src/three/render/lightPools.ts:66-145` (modify)
  - `addSites()` places each site and deck. A site build adds its movers to `SiteMotion`, its lights through `SiteLights.add(lights: SiteLight[])` and its lamps through `NightPools.addLamps(site: Site, lamps: PoolLamp[])`, which sums them into a kept float map and uploads the rows of the site's region. `HollowLamps` places its lamps.
  - `NightPools.bake()` becomes `NightPools.start(worldSize, maxTextureSize)` with an empty map.
- 4.4 `game/src/three/render/scatter.ts:49-80` (modify), `game/src/three/render/ship-decks.ts:32-40` (modify)
  - `addScatter()` keeps the whole-map tile flags, which PC1 allows, and places one build per cell that runs `chunkScatter()` for that cell.
  - `addShipDecks()` places each deck.
- Respects: IV2, IV3, IV4.
- Commit: Props, rocks, trees, power lines, sites, ship decks and scatter build as cell placements, and site lights and night pools join as their site builds

### PH5 — Graffiti per region
- 5.1 `game/src/three/render/graffiti.ts:17-27, 137-160, 383-443` (modify)
  - `GRAFFITI.regionCells` — a region side in cells, at least twice `minGapTiles` wide.
  - `chooseRegionGraffiti<F>(region: Rect, sites: GraffitiSites, fit: (site: GraffitiSite) => F | null): GraffitiPlaced<F>[]` replaces `chooseGraffiti`. It keeps candidates at least half `minGapTiles` inside the region edge, and the target is the region's share of `tilesPerSign`.
  - `GraffitiViews` places one build per cell. The build chooses its region once, caches the choice, and draws the signs anchored in that cell. `graffitiSites()` splits into a per-region scan, so no whole-map cliff pass runs at boot.
- Respects: IV3, IV6, PC1.
- Tests first: in `graffiti.test.ts`.
- Commit: Graffiti signs are chosen per region, so a sign never depends on another region, and they build as cell placements

### PH6 — Streaming on in the game
- 6.1 `game/src/three/game.ts:230-325, 1080-1105` (modify)
  - The constructor builds a `CellStreamer` over the ground, prop and crater scopes, with `ShaderWarmup.prepare`, `performance.now` and `PERF.stream.budgetMs`. It calls `boot()` with the truck's tile position and `grayReach()`. `compileAsync` stays and now sees only the boot cells.
  - `frame()` runs each frame before `scope.update()`, centered on the same point `SightLimit.set()` gets.
  - A dev handle `__ROAM__.buildAllCells()` calls `buildAll()`.
- 6.2 `game/scripts/playtest.mjs` (modify) — after boot, calls `buildAllCells()` once and fails on any page error. Map errors still fail before release.
- 6.3 `game/scripts/perf.mjs` (modify) — fails when `stream-block` grows during the auto travel run.
- 6.4 `game/src/ui/perf-panel.ts` (modify) — shows `stream-build`, `stream-block` and the built cell count.
- Respects: IV1, IV5.
- Commit: The game builds only the cells around the truck at boot and streams the rest in during play

### PH7 — Texture layers per cell
- 7.1 `game/src/render/groundPaint.ts:142-150, 378-470` (modify)
  - `paintGroundRegion(c: PaintCanvas, t: Terrain, look: TileLook, region: Rect, hillshade: number): void` paints one region's pixels. Strokes clip to the region. `glassFieldRegion(t: Terrain, region: Rect, out: Uint8Array): void` blurs with the kernel's margin read from neighbor tiles.
- 7.2 `game/src/three/render/terrain.ts:46-112` (modify), `game/src/three/render/roads.ts:51-345` (modify)
  - `class GroundLayers { paintCell(cell: number): void }` owns the ground, road mask, glass and desert data textures and uploads the painted rows with `addUpdateRange`. The ground chunk build calls `paintCell` before it makes geometry.
- 7.3 `game/src/three/survey-pictures.ts:160-175` (modify) — paints the cells under each picture before drawing it. Resolves UK4.
- 7.4 `game/src/three/main.ts:230-236` (modify), `game/src/ui/boot-progress.ts:7-25` (modify), `game/src/text/` (modify) — drop the `ground` boot step and its English and Russian lines.
- Tests first: a whole-map paint and the union of per-cell paints give equal pixels for each layer, on the Icarus map. Resolves UK3.
- Respects: IV3, PC1.
- Commit: The ground, road, glass and desert textures paint per cell as ground chunks build, so boot paints no whole-map texture

### PH8 — Measure and check
- No new code. Fills `## Verify`.
- `boot:time -- --runs 3` on a production build, against the PH1 baseline, for the goal. `npm run perf` with zero blocking builds during 8x auto travel, for AS1 and AS3. A per-cell cost dump from `buildAllCells()` with timings, for UK2 and AS2. `npm run playtest`. Screenshots at the spawn and after a long 8x trip.

### Test strategy
- `streamer.test.ts`: `wantedCells()` picks a cell whose claim from a far anchor reaches the disc, and skips one that does not. Order is nearest first and the same on every run.
- `streamer.test.ts`: `frame()` builds every reach cell even past the budget, and stops lead cells once a fake clock passes `budgetMs`, so only the placement already running overruns.
- `streamer.test.ts`: building cells in two different orders gives the same objects per cell.
- `scope.test.ts`: `remove()` on an unbuilt placement drops it, and the cell never builds it. A placement whose build leaves its claim throws at build time.
- `vision.test.ts`: `grayReach()` is the same at noon, at night and in a storm, and grows with the tourer chassis.
- `obstacles.test.ts`: loot painted before a prop's cell builds shows on the built prop. A prop broken before its cell builds never builds.
- `trees.test.ts`: a tree hidden before its cell builds stays hidden after.
- `graffiti.test.ts`: two signs in neighbor regions are at least `minGapTiles` apart. A region's choice is the same whether its neighbors are chosen or not.
- `lightPools.test.ts`: adding sites one by one in any order gives the same pool map as one bake of all lamps.
- `fog.test.ts`: a chunk attached late shows the same fog look as one attached at boot.

### Order & dependencies
- The phases run in order, one after another. PH3, PH4 and PH5 own disjoint view files, but each updates its own calls in `game.ts`, so they do not run at the same time.

### Risks / rollback
- RK1 — A big town builds in more than one frame, so a lead build hitches travel. PH8 measures it, and the fix is to split the site build into parts.
- RK2 — A per-region paint differs from the whole-map paint at region edges. The pixel test in PH7 catches it.
- RK3 — The basin-regions branch keeps changing the same render files. Merge basin-regions into this branch before PH6 and again before PH8.
- RK4 — A save load, a tow or a teleport stalls for one long frame while the reach cells build. This is accepted, and `stream-block` counts it.
- Rollback: each phase is one commit. Reverting PH6 brings back the whole-map build at boot, since the views still place every cell.

### Interfaces
- IF1 [blocks] — `RenderScope.place()`, `remove()`, `claimOf()`, `buildNext()` and `Placement`. Every view phase builds on them, and they carry IV1 and IV2, so they are done and tested first.
- IF2 [blocks] — `CellStreamer` and `wantedCells()`. Until PH6 turns streaming on, the view phases check their work with `buildAll()`.
- IF3 — `grayReach(world, viewer): number`.
- IF4 — `ShaderWarmup.prepare(root): void`.
- IF5 — `terrainMesh(w, scope, onChunk): THREE.MeshLambertMaterial` and `FogView.attach(chunk): void`.
- IF6 — `SiteLights.add(lights)`, `NightPools.start(worldSize, maxTextureSize)` and `NightPools.addLamps(site, lamps)`.
- IF7 — `GroundLayers.paintCell(cell): void`.

### Interface graph
- PH2 -> IF1, IF2, IF3, IF4 @ game/src/three/render/scope.ts, game/src/three/render/streamer.ts, game/src/sim/vision.ts, game/src/data/perf.ts, game/src/three/shader-errors.ts
- PH3 IF1, IF2 -> IF5 @ game/src/three/render/terrain.ts, game/src/three/render/fog.ts, game/src/three/render/shade.ts, game/src/three/game.ts
- PH4 IF1 [blocks: PH3] -> IF6 @ game/src/three/render/obstacles.ts, game/src/three/render/trees.ts, game/src/three/render/sites.ts, game/src/three/render/siteLights.ts, game/src/three/render/lightPools.ts, game/src/three/render/scatter.ts, game/src/three/render/ship-decks.ts, game/src/three/game.ts
- PH5 IF1 [blocks: PH4] -> @ game/src/three/render/graffiti.ts, game/src/three/render/craters.ts, game/src/three/game.ts
- PH6 IF2, IF3, IF4, IF5, IF6 -> @ game/src/three/game.ts, game/scripts/playtest.mjs, game/scripts/perf.mjs, game/src/ui/perf-panel.ts
- PH7 IF5 -> IF7 @ game/src/render/groundPaint.ts, game/src/three/render/terrain.ts, game/src/three/render/roads.ts, game/src/three/survey-pictures.ts, game/src/three/main.ts, game/src/ui/boot-progress.ts, game/src/text/

## Verify

Baseline, PH1, production build at 1d611cace with the weld fix, `boot:time --runs 3` on an M3 Pro, medians. This resolves UK1.
- Fresh game, cold cache: ready 20.0 s. Steps: map 0.8 s, sounds 6.5 s, world 3.6 s, ground 0.8 s, scene 12.6 s, frame 0.3 s.
- Saved world, warm cache: ready 21.1 s. Steps: map 0.7 s, sounds 3.4 s, world 0.3 s, ground 1.1 s, scene 17.0 s, frame 0.3 s.
- Goal targets: scene at most 1.26 s fresh and 1.70 s saved.

## Code smells

- `game/src/three/render/models.ts` `model()` — clones the material of every prop copy, so the scene holds thousands of materials for 51 programs, and each one pays shader prep.

## Conclusion

### Hands-off decisions

- uplan: plan approved by the user, execution switched to hands-off at the user's request
- uexecute: merged basin-regions at 85453fcc3 before PH6, per RK3

### Deviations from plan

- PH2 2.4 — `PERF.stream` moved to PH6, because its budget needs the travel frame measured with streaming wired in.
- PH2 IF4 — the streamer prepares each cell group a frame touched once, not each built object. One compile call per prop walked the whole scene each time, and the dev scene step rose from 13.6 s to 24.8 s. `boot()` and `buildAll()` prepare nothing, since the Game constructor's `compileAsync` covers the boot cells.
- PH3 IF5 — `terrainMesh(w, material, scope, onChunk): void` takes the ground material, so the fog exists before any chunk builds.
- PH3 — map view setup moved from `game.ts` into `game/src/three/world-views.ts`, because `game.ts` is over the line limit and the gate blocks any growth.
- PH4 IF6 — `SiteLights` takes the Hollow lamps in its constructor and `add(lights, lamps)` per site. `NightPools.addLamps(lamps)` needs no site, since each lamp names its site. The pool map re-uploads whole, because three.js update ranges assume RGBA and the pool map is one channel.
- PH5 — graffiti places one build per region, not per cell, and `craters.ts` needs no change. The unused `marks` list is gone.

### Known risks

- Three tests fail on the starting commit 1d611cace as well as on this branch: the two IV1 tests in `lightPools.test.ts` and the bracket test in `fortLamps.test.ts`. They come from the basin-regions map, not from this task.
