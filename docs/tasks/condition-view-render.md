# Rendered truck condition view

**Status:** executing
**Branch:** condition-view
**Worktree:** .worktrees/cond-armor
**Goal:** In the game, every truck of every chassis shows the settled look: wheels pushed out, armor snug against the body, armor cut around wheels and headlights. The player's condition panel and the other-truck card both show the settled rendered top-down drawing from `game/tmp/condition-mockups/SETTLED.md`, with part name and condition on hover and part aiming on enemy trucks. The player reads their own damage and aims at enemy parts with it. Confirming needs the user to look at in-game screenshots for several chassis. Useless if: the panel matches the mockup only on the scout; the cut or the hug is a per-chassis table someone must fill for a new chassis; the drawing re-renders on every frame or every turn without a part change; hover hits only the larger parts, so small armor tiles cannot be aimed at; the game truck and the panel truck disagree on wheel or armor position; holes in the armor show outlines, the see-through copy or shadows of the cut part.
**Mode:** hands-off

## Context

- `TruckConditionView` in `game/src/ui/truck-condition-view.ts` draws icon tiles on the grid over a chassis sprite. It serves the player panel (`hud.ts:167`) and the inspected card (`hud.ts:169`). It redraws on UI refresh after turn and state events, never per frame.
- Part aiming exists: a click on a part tile of an enemy card calls `aimActions().aimPart` in `ui/weapons.ts`, and `aimMarks` gives the gun numbers shown as a badge. Hover shows a tip with part name and percent.
- `VehicleView.update()` in `three/render/vehicle.ts` rebuilds the truck only when `signatureOf` changes: chassis, paint, and each part's id, wear step, cell and rotation. `pose()` per frame moves only wheel suspension, steer and spin.
- Wheel points come from `wheelMounts()` in `phys/body.ts`. Physics, ruts, dust, icons and the view all read it. Shocks use the raw mount and axles use the wheel mount position.
- Armor is placed by `armorPlacement()` and merged into the static group by `mergeStatic`. Merged meshes are Lambert, keyed by color and part id, and the cloud shadow patches every Lambert material through `onBeforeCompile`.
- Each truck mesh has a see-through copy with a `GreaterDepth` material, and outlines built from the merged geometry. Lamp meshes stay out of the merge with `userData.lamp`. One lamp mesh can hold both headlights.
- 17 chassis exist, and no chassis data names headlight or wheel arch positions.
- The mockup lab (`game/tmp/condition-mockups/topdown.ts`) does the look as post-steps on a posed `VehicleView`: hide the see-through copies and cloud shadows, thicken and raise armor, hug it to the body, cut it with a fragment discard, then render the body, a parts layer and per-part masks with an orthographic camera. A probe on the scout found every readout part tagged and visible from above.
- The uncommitted mockup patch in `vehicle.ts` tags `userData.partId` in `tint()`, keys `mergeStatic` by part, and disables every generic bumper with an always-true test at line 346.

## Design

Two parts in one task, built in order: the truck look first, then the view that renders it.

### Truck look

The look is computed once per truck build inside `VehicleView.rebuild()`, from the built geometry and the body numbers. Nothing in it reads a per-chassis table, so a new chassis gets it with no data.

- Wheel push: one render-side function gives the drawn wheel points, `wheelMounts()` with each z pushed outward by the push distance. The view's wheels, shocks, axles, ruts, dust and icons read it. Physics keeps `wheelMounts()`.
- Armor skin: `armorPlacement()` itself thickens every armor part to the skin depth along its thin axis, raises it by the rise, and sets its inner face to the body face minus the inset, on all four sides. Gun risers and armor debris read the same placement, so nothing floats or clips. The mockup's `skin ? -depth : depth` seat patch goes away.
- Bumpers: generic bumpers and the bumper replacement logic go away, as the user asked during the mockups ("no generic bumper replacements"). Armor parts are drawn at the ends instead. The semi keeps its own modeled bumpers.
- Cuts: after the merge, one cut spec is built per truck. It holds one cylinder per drawn wheel, with the wheel radius scaled by the cut scale, and one box per headlight. Headlights are islands of the `light` material near either end, found by splitting the lamp mesh into connected pieces. `glass` and `radio_light` are not headlights. Every chassis model today has one light mesh at the front, so the rear gets no window, and an end with no lamp gives no window rather than an error. Each window is the island box scaled by the cut scale, reaching outward by the reach distance. The spec is in truck space. Wheel and lamp counts are shader defines in the program cache key, positions are uniforms.
- Every material that draws an armor mesh gets the same discard: color, shadow depth, the see-through copy and the dark outline swap. Shared materials such as the see-through and dark materials are cloned per truck for armor meshes only. The cut patch chains with the cloud shadow patch, so armor keeps its cloud shadow.
- Outlines: armor gets its own outline object, built from armor geometry only and cut. The rest of the truck keeps one uncut outline, so tire and wheel well lines stay inside the arch.

Tuning numbers live in `src/data/`: push 0.24 m, skin depth 0.24 m, rise 0.1 m, inset 0.1 m, cut scale 1.2, lamp end share 0.8, reach 0.6 m.

### Rendered condition view

`TruckConditionView` keeps its role and its callers. Its tiles are replaced by layered images.

- A truck renderer builds an offscreen `VehicleView` of the pristine truck once per render signature: the vehicle id plus the view's `signatureOf` with wear steps cleared. Builds are cached by that key, so moving the pointer between two enemies does not rebuild. The cache holds the trucks on screen, the player plus the inspected and recent trucks, dropped when a truck leaves sight.
- It renders with the settled camera and light: orthographic, front down, 25 degree tilt, no cast shadows, no cloud shadows, no see-through copies, lighter tire tint, glass sheen and neutral reds as in the mockup. It draws through the game's own `WebGLRenderer` into a render target, so no second WebGL context compiles the truck shaders again. The offscreen truck casts no shadow.
- Each build makes three renders: the lit truck, the dimmed body, and a part-id map drawn flat with no antialiasing. Each id map pixel is read back once. A part's occluded mask is the lit pixels where the id map holds that part. Masks, hit areas and badge centers all come from these same pixels.
- The id map holds every tagged part, also utility, cargo and scanner parts the readout skips. Those count as taken but cannot be aimed at. Hover and click look up the id map at the pointer. Only empty or body pixels snap to the nearest readout part within half the touch target, computed once per build. Small armor tiles stay hittable, and a click on a smoke mortar never aims at its neighbor.
- Hidden parts: a readout part the truck does not draw gets the body pixels over its cells as its area. That covers transmission and tank on the 14 chassis with `showsCores` false, and parts in a cargo bay. The id pass draws its cell rect at the body top, `highestUnder()`, only over body pixels. Its glow is the lit body pixels in that area, and hover and aim use the same area.
- A condition change only swaps tinted layers. A tinted mask per part and tier is made once with a canvas and cached on the build. Tiers come from the readout: hurt under 70%, critical under 40%, broken at 0, as the mockup used. Halos show for critical and broken, and broken gets the hatch.
- The tier colors, filters and panel values become tokens in `tokens.css`, so `style-guard.test` holds.
- The view keeps its features: tip with part name and condition, damage flash on a new hit, the repair work meter, and on enemy trucks the aim click and the gun badge. The badge and meter sit at the part's mask center. Hover on an enemy part outlines the part it would aim at.
- Touch follows docs/ui.md: the first tap shows the tip, a tap on the shown part aims.
- `fitTo` and `boxFor` keep their contract, sized from the render's aspect.
- The panel CSS is the settled panel: black at 30% with a 6px blur, no border, no shadow, with values from `tokens.css`.

`docs/ui.md` changes in the same work. The condition drawing paragraph at line 218 describes the rendered view, and the aim target rule names the snapped hit area. P8 and lines 218 and 313 say a healthy part shows green on both drawings. The settled look breaks this on purpose: a healthy part keeps its own color and only damage gets a tier color, on both drawings. The doc names P8 and gives this reason.

TDD: yes for the pure parts: cut spec, lamp island split, tiers, id map lookup and snapping. Rendering is checked by browser screenshots.

### Invariants

- IV1 — The truck look and the condition view read no per-chassis table. A test builds every chassis in `CHASSIS` and checks each armor mesh carries the cut and each wheel has a cut cylinder.
- IV2 — Every material that draws armor geometry carries the same cut. A test walks a built truck and checks color, depth, see-through, armor outline and dark outline materials, and that the body outline carries no cut.
- IV3 — The condition view builds a new render only when its render signature changes. A test renders twice with only HP changed and counts one build.
- IV4 — Nothing in the look or the view runs per frame. `pose()` gains no work.
- IV5 — Game truck and panel truck use the same wheel points and armor placement functions.
- IV6 — Physics wheel points and collision are unchanged.
- IV7 — Every readout part on every chassis has a non-empty mask and a hit area. A browser check fails on a part with zero pixels.

### Principles

- PC1 — Port the mockup's settled behavior, not its variant switches. Lab-only controls such as yaw, side views and skirts do not enter the game.

### Assumptions

- AS1 — Each headlight is one connected island of the `light` mesh. Checked during design: all 17 base models have one `light` mesh at the front end.
- AS2 — The thin-axis rule for armor parts holds for every armor model on every side.
- AS3 — The merged `still` group sits at identity under the truck root, so the shader can cut in model space with no extra matrix.

### Unknowns

- UK1 — Whether ram and cage armor look right under the hug, since the mockup checked only one kit per chassis.
- UK2 — Render time of one build on a slow machine, measured in the browser check.

## Plan

Approach: two implementers in parallel. Implementer A changes the truck look in `vehicle.ts` and its helpers. Implementer B builds the portrait renderer and the new view against the `VehicleView` contract in IF2. The mockup code in `game/tmp/condition-mockups/topdown.ts` and `variants/r47y0.*` is the reference for every look number and step (PC1). All paths are under `game/`.

### PH1 — Drawn wheels, armor skin, no generic bumpers (A)
- 1.1 `src/data/truckLook.ts` (create) — `TRUCK_LOOK = { wheelPush: 0.24, armorDepth: 0.24, armorRise: 0.1, armorInset: 0.1, cutScale: 1.2, lampEndShare: 0.8, lampReach: 0.6 }`, the one home of these numbers.
- 1.2 `src/three/render/drawnWheels.ts` (create) — `drawnWheelPoints(b: Body): { x: number; y: number; z: number }[]`, `wheelMounts(b)` with z pushed outward by `wheelPush`. Respects IV5, IV6.
- 1.3 `src/three/render/vehicle.ts:439-470` — `buildWheels()` and `buildSuspension()` read `drawnWheelPoints`. Shock tops keep the body side at the old mount, so the shock leans out to the wheel.
- 1.4 `src/three/render/ruts.ts:140-147` — `tirePoints()` reads `drawnWheelPoints`. `fx.ts:455` reads only the side sign and stays.
- 1.5 `src/three/render/vehicle.ts:671-705` — `armorPlacement()` for mounted armor: thin-axis depth `armorDepth`, raise `armorRise`, inner face at body face minus `armorInset` on F, B, L and R. Drop `SIDE_SKIN` use there and the `skin ? -depth : depth` patch. `seatArmor()` follows. Unmounted armor stays. Respects AS2, UK1.
- 1.6 `src/three/render/vehicle.ts:337-358, 574-598, 706-710` — delete generic bumper drawing, `bumperPlacement`, `replacesBumper`, `bumperlessCells`, `BUMPER_LOOKS` and the `bumperless` argument. `drawsOwnBumpers` in `src/render/partLooks.ts:43-47` and its test use go if nothing else reads them. Check `SKIRT` and `EDGE_H` users before removing.
- 1.7 Tests: `vehicleCargo.test.ts` and `gunRisers.test.ts` updated for the new placement. New `src/three/render/drawnWheels.test.ts`. A test per chassis in `CHASSIS` that every mounted armor part's inner face sits at the body face minus the inset.
- Commit: Wheels drawn 0.24 m out, armor snug against the body on all sides, generic bumpers gone

### PH2 — Armor cuts (A)
- 2.1 `src/three/render/armorCut.ts` (create) — pure: `cutSpec(wheels: Box3[], lamps: Box3[], half: Body['half'], look: typeof TRUCK_LOOK): CutSpec`, `lampIslands(geo: BufferGeometry): Box3[]` (connected pieces by shared corners), `withCut(mat: Material, spec: CutSpec): Material` that clones, adds the discard at `clipping_planes_fragment`, chains any existing `onBeforeCompile`, and sets defines for wheel and lamp counts with a matching `customProgramCacheKey`. Positions go in uniforms in body space. Respects UK1 resolved by defines.
- 2.2 `src/three/render/vehicle.ts:208-252` `rebuild()` — after `mergeStatic`, build one `CutSpec` from the drawn wheel boxes at rest and the `light` lamp islands near the ends. Apply `withCut` to every armor mesh, its `customDepthMaterial`, its see-through twin and the dark outline material it swaps to. Run `CLOUD_SHADOWS.shadeTree` before the cut so the cut chains it. Respects IV2, IV4, AS1, AS3.
- 2.3 `src/three/render/vehicle.ts:828-882` `mergeStatic()` — return armor outline meshes apart from the body outline, so only the armor outline gets the cut. Keep the color and part key, using a `Map` keyed by an object or a nested map in place of the `|` string split.
- 2.4 `src/three/render/vehicle.ts` constructor and `rebuild()` — `new VehicleView(v, seen, scene: 'world' | 'portrait')`. Portrait: no see-through twins, no cloud shading, `castShadow` and `receiveShadow` false. Update the callers `icons/render.ts:205`, `src/test/gun-clearance-kit.ts:66` and the tests, all `'world'`. PH4 updates `game.ts:1190`, since PH4 owns `game.ts`.
- 2.5 Tests: `src/three/render/armorCut.test.ts` for `cutSpec`, `lampIslands` on two separate boxes, and `withCut` chaining. A test over every chassis in `CHASSIS` with one armor kit: each armor mesh and its depth, twin and dark materials carry the cut, the body outline does not, and every chassis gets one window per headlight island and none at the rear. Respects IV1, IV2.
- Commit: Armor cut around wheels and headlights on every chassis

### PH3 — Portrait renderer (B)
- 3.1 `src/render/portraitPixels.ts` (create, no Three.js) — pure pixel work on `Uint8ClampedArray` with width and height: `partMaskOf(lit, ids, idOf: number): Uint8ClampedArray`, `snapIds(ids, aimable: Set<number>, radiusPx: number): Uint16Array` nearest aimable part for empty and body pixels, `centerOf(ids, idOf): {x, y}`, `tintMask(mask, tint): Uint8ClampedArray` with the mockup's luminance levels.
- 3.2 `src/three/render/truckPortrait.ts` (create) — `class TruckPortraits { constructor(renderer: THREE.WebGLRenderer); portraitOf(v: Vehicle): Portrait; forget(keep: ReadonlySet<string>): void }`. Builds a `VehicleView(pristine, false, 'portrait')`, applies glass sheen and neutral reds as in the mockup, frames it with the settled camera, and renders lit, dimmed body and id map into one `WebGLRenderTarget`, reading pixels back once each. The id pass uses flat colors, no antialias, and hidden-part footprints over body pixels. Cache key is vehicle id plus `signatureOf` of the pristine truck. Respects IV3, IV4, IV5, IV7.
- 3.3 `Portrait` type in `truckPortrait.ts` — `{ width; height; body: HTMLCanvasElement; parts: HTMLCanvasElement; partAt(x: number, y: number): string | null; centerOf(partId: string): { x: number; y: number }; glow(partId: string, tier: Tier): HTMLCanvasElement }`. `glow` caches per part and tier.
- 3.4 Tests: `src/render/portraitPixels.test.ts` for masks, snapping that never steals a non-aimable part's pixels, center. `truckPortrait` gets a cache test with a stub renderer: two `portraitOf` calls with only HP changed build once.
- Commit: Truck portraits rendered once per truck build

### PH4 — Rendered condition view (B)
- 4.1 `src/ui/hud-readout.ts:160-216` — readout part gains `tier: Tier` from named thresholds `HURT_BELOW = 70`, `CRITICAL_BELOW = 40`, broken at 0. `getConditionState` goes if nothing else reads `state`.
- 4.2 `src/ui/truck-condition-view.ts` (rewrite) — `constructor(portraits: TruckPortraits)`, same `root`, `fitTo`, `boxFor`, `render(vehicle, aim?, working?)`. Layers: dimmed body, parts, halos for critical and broken, glows, hatch for broken. One pointer handler reads `partAt` for the tip, the hover outline on aimable trucks, and the click aim. Touch: the first tap shows the tip, a tap on the shown part aims. Badge and work meter at `centerOf`. Flash on `hit`.
- 4.3 `src/ui/truck-condition.css` (rewrite) and `src/ui/tokens.css` — the r47y0 panel and layer styles, with every raw value as a token.
- 4.4 `src/ui/hud.ts:167-169, 262` and `src/three/game.ts:223, 308` — game creates one `TruckPortraits` on its renderer and passes it to `Hud`, which passes it to both views. `refreshInfo` calls `forget` with the ids still in sight.
- 4.5 `docs/ui.md:35, 218, 313` and the aim target rule — describe the rendered drawing, the snapped hit area and the P8 exception.
- 4.6 Tests: `src/ui/truck-condition.test.ts` for tiers. `style-guard.test.ts` passes.
- Commit: Condition panel and truck card show the rendered truck

### PH5 — Browser check (controller)
- 5.1 `tmp/condition-check.mjs` — Playwright on the real GPU: for every chassis, a kit with armor and a gun, damaged and healthy, writes the player panel and the enemy card to `tmp/condition-check/` and one sheet. It fails on a readout part with an empty mask, logs build time per chassis, hovers one small armor tile and checks its tip, and clicks it on an enemy card and checks the weapon order. Respects IV7, UK2.
- 5.2 `npm run playtest` and the touched test files.

### Test strategy
- Failing tests first for `cutSpec`, `lampIslands`, `withCut` chaining, `portraitPixels` and tiers.
- Per-chassis tests in Vitest for placement and cut coverage. Pixel truth is checked in the browser check only.

### Order & dependencies
- PH1 then PH2 in implementer A. PH3 then PH4 in implementer B, in parallel with A. PH5 after both.

### Risks / rollback
- RK1 — Raised and hugged armor can clip gun posts or loose items. The gun riser test and the browser sheet catch it.
- RK2 — Drawing into a render target on the game renderer can disturb its state, such as the current target or the clear color. The portrait code saves and restores them.
- RK3 — `readPixels` stalls the GPU. It runs once per build only.

### Interfaces
- IF1 — `drawnWheelPoints(b: Body)` in `src/three/render/drawnWheels.ts`.
- IF2 — `new VehicleView(v: Vehicle, seen: boolean, scene: 'world' | 'portrait')`. Every drawn part mesh carries `userData.partId`, armor is already skinned and cut, and portrait trucks have no twins, cloud shading or shadows.
- IF3 — `TruckPortraits` and `Portrait` in `src/three/render/truckPortrait.ts`, as in 3.2 and 3.3.

### Interface graph
- PH1 -> IF1 @ src/data/truckLook.ts, src/three/render/drawnWheels.ts, src/three/render/ruts.ts, src/three/render/vehicle.ts, src/render/partLooks.ts, vehicle tests
- PH2 IF1 -> IF2 @ src/three/render/armorCut.ts, src/three/render/vehicle.ts, src/three/icons/render.ts, src/test/gun-clearance-kit.ts
- PH3 IF2 -> IF3 @ src/render/portraitPixels.ts, src/three/render/truckPortrait.ts
- PH4 IF3, IF2 -> @ src/ui/truck-condition-view.ts, src/ui/truck-condition.css, src/ui/tokens.css, src/ui/hud-readout.ts, src/ui/hud.ts, src/three/game.ts, docs/ui.md

## Verify

## Code smells

- `game/src/three/render/vehicle.ts:851` — color and part id packed into one string key and split on `|`.
- `game/src/ui/hud-readout.ts:169` — unnamed 0.25 threshold.
- `game/src/text/en/screens.ts:211` and `game/src/text/en/log.ts:29` — two keys for "broken" (one name per concept).

## Conclusion

### Hands-off decisions

- make: size Medium — two linked systems, many files.
- make: branch `condition-view` in the existing worktree `.worktrees/cond-armor`, which already holds the mockup patches.
- udesign: wheel push is drawn only, physics keeps its wheel points — moving physics changes handling, which the user did not ask for.
- udesign: tiers follow the mockup, 70% and 40% — the settled look was judged with those.
- udesign: lamp windows at both ends, as the settled mockup cut them.
- udesign: generic bumpers removed cleanly in the game — the user said "no generic bumper replacements" during the mockups.
- udesign: hit area snaps to the nearest part within half the touch target — keeps docs/ui.md's target size rule for small parts.
- uplan: plan auto-approved (hands-off).
- uexecute: PH1 and PH2 go to one implementer and PH3 and PH4 to another, both on Sonnet — PH1 and PH2 share `vehicle.ts`, so they cannot run as separate concurrent phases.
- udesign: hidden parts glow on the body over their cells — the mockup only tried the scout, where cores show, and the old view showed every part.
- udesign: healthy parts keep their own color on both drawings, breaking P8's green for healthy — the settled look shows color only for damage.
