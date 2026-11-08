# Ink ground

**Status:** verifying
**Branch:** proto/ground-old
**Worktree:** .worktrees/ground-old
**Goal:** The approved ink look with drawn ground becomes ROAM's only look. It lands as a commit on proto/ground-old that passes the quality gate with no bypass. Each concept in the code has one owner. A fixed board of reference shots, taken before the refactor, still matches after it. The user keeps tuning the look with live sliders on top of this code. Useless if: the gate passes through `_` prefixes, suppressions or logic moved into bigger strings; the shots match by day but a night program fails to link on a 16-sampler GPU; Chaos Highway, evening, night or far zoom were never shot; captures show a quest screen, a blank canvas or an old build; the dropped looks still sit in the code behind a switch nobody sets.
**Mode:** hands-off

## Context

- `roads.ts` has 979 lines. It holds the shipped game ground and every prototype at once: 5 looks, 4 grounds and the soft levels, picked by URL switches in `look.ts`. `stylePaint.ts` holds 12 paint styles. The user approved one combination: `look=b2`, `style=ink`, `ground=drawn`.
- In that combination much code computes values that never reach a pixel. Examples are the poly facet split, the facet normals and the facet tint in `terrain.ts`. Some code that looks dead does reach a pixel: the blurred ground read `polyGround` shades the road.
- The ground shader and the ink paint talk through GLSL globals. `stylePaint.ts` declares them and `roads.ts` writes them: `styleRoad`, `styleEdge`, `styleHeight`, `styleSlope`, `styleRise` and `styleHasHeight`. Only the dropped illustrated style reads `styleInkLift`.
- The drawn ground adds 5 samplers to the ground program: `heightField`, `roadField` and three kind textures. `docs/architecture/render.md` says the worst night ground program already sits at the 16 samplers WebGL2 guarantees. Every approved shot was taken at hour 14.
- The quality gate blocks the commit with 7 findings. `roads.ts` has 3 unused constants and a compile hook with complexity 11. `paintStyle` has complexity 7 and `bake.ts pickType` has complexity 9. `game.ts` has 1122 code lines, against 1119 at HEAD.
- `game.ts` mounts the style menu for every player. HEAD has no menu.
- `modelFill.ts` runs the paint on every Lambert model. Truck portraits, garage renders and survey pictures take the ink look once it is the default.
- The approved state is saved as `refs/checkpoints/ground-old-approved`.
- The material system was the last attempt to restructure the ground. It changed structure and look in one step and never got the look back.

## Design

Ink with drawn ground is the one look. All other look, ground and style variants are deleted. The live sliders stay.

The work runs as strip, split and pack, with a shot diff after every step:

1. Freeze the reference board from the current tree before any edit.
2. Strip. Remove the dropped looks, grounds and styles and their switches in place, one block at a time. The shot diff decides what was dead, not reading.
3. Split. Move the remaining code into owned modules with an explicit contract.
4. Pack. Merge field textures only if the night sampler count needs it.
5. Clear the remaining gate findings. Update `render.md`, whose road shoulder paragraph and sampler count stop being true. Regenerate the survey pictures.

Two approaches were rejected. A clean rewrite that copies the look by eye would repeat the material system failure. A minimal gate fix that keeps all prototypes contradicts the chosen scope and leaves the hidden coupling in place.

### Module shape

All files stay in `src/three/render/`.

- `groundFields.ts` builds every data texture the ground shader reads from the terrain: height, road field, ground kinds, desert weight, glass and highway wear. It also builds the pad uniforms. It holds no GLSL.
- `groundShader.ts` replaces `roads.ts`. It patches the ground material, owns its uniforms and assembles its GLSL. The GLSL is split by concern into named chunks: kinds and borders, surface marks, road on the ground, glass, pads and wear, and relief. Relief means height, exact slope and rise.
- `inkPaint.ts` replaces `stylePaint.ts`. One shared paint core has a ground entry and a model entry, which replace the `STYLE_GROUND` ifdefs. It also owns the sun shade hook into the lights chunk.
- `inkPaint.ts` exports the contract as two GLSL structs that `groundShader.ts` imports. The ground fills the surface struct: road share, road edge line, height, slope and rise. The lights hook fills the sun struct: cast shade, facing shade and sun direction.
- `inkTuning.ts` holds the knobs, their URL values and their live updates. The menu mounts only when the URL has `tune`. `look.ts` is deleted.
- `crtPass.ts`, `daylight.ts`, `models.ts` and `game.ts` lose their style switches and keep the ink values.
- Before the file layout is fixed, check that the `game/src/three` component stays within its fragmentation ratio. If it does not, the menu merges into the tuning file.

### Look preservation

- GLSL operation order stays the same. The emitted number text stays the same, because the `toFixed` rounding is part of the look.
- Two hash functions that make different patterns both stay, each named by its use. Merging them would change the marks.
- Every shader `.replace` throws when its anchor is missing. `roads.ts` silently skips a missing anchor today.

### Reference board

Each shot pins a spot, hour, heading and zoom. The board has these shots:

- the mud edge close
- the scrub spot
- the ravine at 14:00
- the mud edge at evening and at night
- a fortress at night with truck lamps on
- Chaos Highway by day and at night
- one spot at close and at far zoom
- one truck close-up, for paint and outlines on models

A script diffs each shot against its reference. It reports the largest channel difference and the share of pixels over a small threshold, and it writes a labeled diff sheet. A negative control moves one slider by URL, and it must show up as a diff.

### What changes for players

Ink with drawn ground becomes the default on every map, Chaos Highway included. Truck portraits, garage renders and survey pictures take the ink paint, and `npm run survey:pictures` regenerates the checked survey pictures. The style menu stays hidden unless the URL has `tune`.

TDD: no (a behavior-preserving refactor of shader code. The check is the shot diff against the frozen board, plus the related tests picked by `npm run test:cached -- --related`.)

### Invariants

- IV1 — After every step, every board shot matches its reference. A diff stops the step until it is explained, either as code that was live or as something that moved in the scene, such as clouds or traffic. A visible change is kept only after the user sees it as a labeled pair.
- IV2 — No code in `src/three` reads a look, ground or style switch. A grep for `LOOK_POLY`, `GROUND_DRAWN`, `STYLE_GROUND` and imports of `look.ts` finds nothing.
- IV3 — The worst night ground program uses at most 16 fragment samplers on Icarus and on Chaos Highway. The playtest's 16-unit night check passes in both modes.
- IV4 — `npm run quality` passes with no suppression, no `_` prefix on dead names and no limit change.
- IV5 — The `bake.ts` refactor keeps `icarus.bin` byte-identical after a rebake.
- IV6 — The ground and the ink paint share data only through the two contract structs.
- IV7 — Every shader patch throws when its anchor string is missing.

### Principles

- PC1 — Inside shaders, pixel identity beats DRY. Two GLSL helpers merge only when the diff shows no change.
- PC2 — Structure and look change in separate steps. A step that moves code never tunes a value.

### Assumptions

- AS1 — The current `ground-old` tree matches `refs/checkpoints/ground-old-approved`, so a board taken now shows the approved look.

### Unknowns

- UK1 — The sampler count of the worst night ground program today. If it is over 16, height moves into the unused alpha of `roadField` and the three kind textures merge into one array texture. Then the board is checked again. If packing is not enough, the night ground may drop or severely limit the drawn extras, such as marks, grain and halo reads. The user approved this. The night shots then differ from their references by design and are shown to the user as labeled pairs. A night variant that needs its own shader program must be compiled before dusk, so nightfall does not hitch.
- UK2 — How drawn ground looks on Chaos Highway, since it was never shot. A bad look there goes to the user and is not fixed inside this refactor.
- UK3 — Which tests the dropped looks break. `npm run test:cached -- --related` finds them.
- UK4 — Whether the `game/src/three` fragmentation ratio allows the planned file count. Resolved in planning: the component has 142 files over 30,161 code lines, 4.71 per 1,000. The plan adds `groundFields.ts`, deletes `look.ts` and drops about 500 lines, which stays under the ceiling of 5.

## Plan

Approach: freeze a reference board, then strip, split and pack in that order, with a board diff after each step. This follows PC2. The gate checks the whole staged tree against HEAD, so no commit can pass until the strip clears every finding. PH1 saves its state as `refs/checkpoints/ink-ground-ph1`, made with `git stash create` and `git update-ref`, the same way as the approved checkpoint. Real commits start at PH2.

### PH1 — Reference board

- 1.1 `game/scripts/look-board.mjs` (create)
  - `node scripts/look-board.mjs shoot --out <dir> [--only <names>] [--url-extra <query>]` boots `playUrl()` with `look=b2&style=ink&ground=drawn` until PH2 removes the switches. It clicks through quest screens as `tmp/one-shot.mjs` does, hides every element but the main canvas, and writes `<dir>/<name>.png` for each shot. It fails when a shot shows the boot screen, a quest screen or a canvas of one flat color.
  - The shot list is fixed in the file. `mud`: 1544.5, 511.5, zoom 1.15, hour 13. `scrub`: 128.5, 251.5, zoom 1.15, hour 13. `ravine`: 366, 1395, heading -2.8, speed 3, zoom 1.6, hour 14. `mud-evening` at hour 19 and `mud-night` at hour 23. `mud-far` at zoom 0.71. `town-night`: the new-game start at hour 22 with the player's lamps on. `highway-day` at hour 13 and `highway-night` at hour 23 through `startNewGame(page, 'chaosHighway')` from `scripts/night-ground.mjs`. `truck`: the player truck at the start, zoom 2, hour 13.
  - `node scripts/look-board.mjs compare --before <dir> --after <dir> --out <dir>` decodes both sets of PNGs in a blank browser page. It needs no new dependency. Per shot it prints the largest channel difference and the share of pixels that differ by more than 8 of 255. It writes `<out>/<name>.png`, a labeled before, after and amplified diff sheet.
  - `node scripts/look-board.mjs samplers` loads Icarus at hour 23 with lamps on, then Chaos Highway at hour 23. It reads `renderer.info.programs` through `window.__ROAM__`. It counts the active sampler uniforms of each program and prints the largest count with its program cache key.
- 1.2 Confirm AS1: `git diff refs/checkpoints/ground-old-approved -- game/src` prints nothing.
- 1.3 Shoot `tmp/board/ref` from the current tree.
- 1.4 Negative control: shoot `mud` with `&edgeWobble=0.9` and compare it to `ref-a`. The diff must be visible.
- 1.5 Run `samplers` and record the counts under UK1.
- Checkpoint: `refs/checkpoints/ink-ground-ph1`. Respects IV1, AS1 and UK1.

### PH2 — Strip the dropped variants

Each step deletes one block, then shoots `mud`, `scrub` and `ravine` and compares them with `ref-a`. The full board runs at the end of the phase.

- 2.1 `game/src/three/render/roads.ts` (modify)
  - `drawRoads()` lines 55-111: the uniforms at lines 64-65 stop depending on `LOOK` and `GROUND`. Delete the uniforms only the plain road path reads, lines 76-82: `shoulderFrom`, `roadFray`, `rimShare`, `rimInside`, `shoulderStones`, `rimColor` and `stoneColor`. `padUniforms` at line 93 takes `pixel`. The fragment header at line 106 defines only `PAD_COUNT` and `HIGHWAY_WEAR`. The cache key at line 109 drops `LOOK` and `GROUND`.
  - Constants, lines 20-53 and 205-262: keep only the ones the drawn path reads. These go: `PIXEL_SPLIT`, which becomes 3, `FINE_JITTER`, `RIM_*`, `SHOULDER_FROM`, `SHOULDER_STONES`, `ROAD_FRAY`, `DIRT_SOFT`, `DIRT_SHOULDER`, every `POLY_*` outside the road albedo, line, dash and half-width group, and `DRAWN_EDGE_ROUGH`. `DRAWN_EDGE_LINE` becomes the ink value 0.8. The three unused constants are deleted, not prefixed, per IV4.
  - `POLY_FUNCTIONS`, lines 263-363: keep `polyHash` and the field uniforms. Delete `Facet`, `polyCorner`, `polyEdge`, `polyInside`, `polyFacet`, `polyMid`, `polySplit`, `polyHeight`, `polyNormal`, `polyRough`, `polyCellHash`, `polyFineCell`, `polyMosaicCell`, `polyKink`, `polyWeights`, `facetWorldNormal` and `facetNormalSmooth`.
  - `ROAD_UNIFORMS`, lines 522-607: `ROAD_SAMPLE` becomes `texture2D`. The uniforms deleted above are dropped.
  - `ROAD_FRAGMENT`, lines 609-901: delete the `LOOK_B`, `LOOK_FINE`, `GROUND_FINE` and `GROUND_MOSAIC` blocks, the poly facet pick at lines 618-635, the `polyMask` and `polyAcross` reads, and the plain road shading at lines 858-873. Keep `polyGround`, the blurred map read that sets `groundLuma`. Lines 803-805 lose the zero pencil term.
- 2.2 `game/src/three/render/terrain.ts` (modify): drop the import at line 15 and `FACET_TINT` and `FACET_SMOOTH_DAY` at lines 25-26. Line 62 passes `roadsAsGround: true`. Line 66 sets `NearestFilter`. `facetGround()` at lines 164-180 keeps only `paintStyle(shader, true)` and its cache key `|facets`. `FACET_FRAGMENT` and `FACET_NORMAL` at lines 182-195 go. Whether the last `normalize` was a no-op is decided by the diff.
- 2.3 `game/src/three/render/stylePaint.ts` (modify): delete `ILLUSTRATED`, `COMIC`, `MARKER`, `LIGNE`, `WOODCUT`, `SURVEY`, `GRAFFITI`, `BRUSH`, `GOUACHE`, `ACRYLIC`, `OIL`, `MODEL_MOSAIC`, `paintModelMosaic()`, `PAINTS`, `stylePlane()` and `styleInkLift`. `paintStyle()` loses the mosaic branch, which brings its complexity under 7.
- 2.4 `game/src/three/render/look.ts` (delete). `pageParams()` moves into `styleTuning.ts`. `KNOBS.outline.start` becomes 1.5 and `KNOBS.crt.start` becomes 0.1, the ink values.
- 2.5 `game/src/three/render/styleMenu.ts` (modify): delete `reloadRow()`, the Style, Ground and Look rows and `INK_ONLY`. `mountStyleMenu()` returns at once unless `pageParams().has("tune")`.
- 2.6 `game/src/three/render/daylight.ts:4,23-24` (modify): `SHADOW_SOFTNESS` is 1.5 and `SHADOW_MAP` is 4096, with no switch.
- 2.7 `game/src/three/game.ts:1,229-230` (modify): delete the `STYLE` import, the tone mapping line and the exposure line. `NoToneMapping` is the three.js default, and the exposure only applies under tone mapping. The board confirms both. That puts the file at its HEAD count of 1119 code lines.
- 2.8 `game/src/mapgen/bake.ts:177-192` (modify): `pickType()` splits into `pickType()`, which handles built and marked tiles, and `naturalType(g, tile, k, c)`, which handles the shoulder and the geology rules. The order of the checks stays the same. Run `npm run map:bake` and `npm run routes:bake`, then confirm `icarus.bin` and `icarus.routes.bin` are byte-identical with `cmp` against copies saved first. Respects IV5.
- 2.9 Run `npm run quality` and `npm run typecheck`, the related tests through `npm run test:cached -- --cache tmp/tc --related <changed files>`, and the full board compare.
- Commit: "Make ink with drawn ground the only look". The whole staged prototype goes in with it. Respects IV1, IV2, IV4, IV5, PC2 and UK3.

### PH3 — Split into owned modules

- 3.1 `game/src/three/render/groundFields.ts` (create). It takes the texture builders from `roads.ts`: `heightTexture`, `roadFieldTexture`, `groundKindTextures`, `kindTexture`, `glassTexture`, `desertTexture`, `imageTexture`, `maskTexture`, `wearUniforms`, `padUniforms`, `roadHoles`, `dirtTint` and `luma`.
  - `groundFields(mask: PaintCanvas, t: Terrain, shelters: readonly Site[]): GroundFields` returns every texture and value uniform the ground shader reads, in one typed object.
- 3.2 `git mv roads.ts groundShader.ts` (modify). `drawRoads()` becomes `drawGround(material, mask, t, shelters)`. It patches the material through one `patchShader(source, anchor, insert)` that throws when the anchor is missing, per IV7. The GLSL splits into named string constants: `KIND_BORDERS`, `SURFACE_MARKS`, `ROAD_ON_GROUND`, `GLASS`, `PADS_AND_WEAR` and `RELIEF`. The fragment body calls them in today's order. The compile hook builds its header from a list, which keeps its complexity under 7. The `polyHash` and `glassHash` names change to `markHash` and `noiseHash`, per PC1. The `poly` and `drawn` prefixes go from the GLSL names.
- 3.3 `git mv stylePaint.ts inkPaint.ts` (modify).
  - It exports `INK_CONTRACT`, the GLSL declaration of `struct InkSurface { float road; float edge; float height; vec2 slope; float rise; }` and `struct InkSun { float cast; float castLit; float facing; vec3 dirView; }`. It also declares one global of each. The ground fills `InkSurface` in `RELIEF` and `ROAD_ON_GROUND`. `sunShadeLights()` fills `InkSun`. Respects IV6.
  - `paintStyle(shader, worldAnchored)` becomes `paintGround(shader)` and `paintModel(shader)`. Both call a shared `inkPaint(linear, albedo, shade, plane)` core. `paintGround` adds the height tint, contour and relief from `InkSurface`, which replaces every `STYLE_GROUND` ifdef. `styleHasHeight` goes, since only the ground carries height.
  - Every `.replace` goes through `patchShader`.
- 3.4 `git mv styleTuning.ts inkTuning.ts` and `git mv styleMenu.ts inkMenu.ts`. Update the imports in `crtPass.ts`, `models.ts`, `shader-errors.ts`, `modelFill.ts`, `terrain.ts` and `game.ts`. The uniform names `ink*` stay.
- 3.5 Gate, typecheck, related tests and a full board compare.
- Commit: "Split the ink ground into fields, shader and paint". Respects IV1, IV6, IV7, PC1 and PC2.

### PH4 — Fit the night sampler budget

Skip this phase if the PH1 count is at most 16 on both maps.

- 4.1 `groundFields.ts`: `roadFieldTexture` writes height into alpha. `heightTexture` goes. `groundKindTextures` builds one `THREE.DataArrayTexture` with 3 layers. `groundShader.ts` reads `roadField.a` and `texture(groundKinds, vec3(uv, layer))`.
- 4.2 Run `samplers` again. If the count is still over 16, the night ground drops the drawn extras behind a `NIGHT_GROUND` define. The program for it is compiled during warmup before dusk. The night shots go to the user as labeled pairs.
- 4.3 Run `npm run playtest`, which checks the 16-unit night link on Roaming and Chaos Highway. Then a full board compare.
- Commit: "Pack ground fields to fit 16 samplers at night". Respects IV1 and IV3.

### PH5 — Docs, pictures and the final check

- 5.1 `game/docs/architecture/render.md:16-17,56`: rewrite the road shoulder paragraph for the drawn ground. Update the sampler count and the night facet sentence, since the ground no longer blends facet normals.
- 5.2 `game/docs/tools.md`: add one line for `scripts/look-board.mjs`.
- 5.3 Run `npm run survey:pictures`, then the stale-picture test.
- 5.4 Run `npm run playtest` if PH4 was skipped, the full board compare, the gate and the related tests.
- Commit: "Document the ink ground and refresh survey pictures". Respects IV3 and IV4.

### Test strategy

- The board compare is the look test for every phase, per IV1.
- `terrain.test.ts`, `zones.test.ts`, `ground.test.ts` and every test `--related` picks for the changed files must pass. A test that pins a dropped look is rewritten for the ink look, never deleted without a replacement.
- The playtest night check is the sampler test, per IV3.

### Order & dependencies

- PH1 blocks everything, since the references must come from the untouched tree.
- PH2, PH3, PH4 and PH5 run in order on the same files.

### Risks / rollback

- RK1 — A strip step changes pixels because code that looked dead was live. Undo that step from the last checkpoint or commit, and keep the block.
- RK2 — `DataArrayTexture` sampling differs from three 2D reads at the texel edges. If the board shows that, the kind channels pack into fewer 2D textures instead.
- RK3 — Chaos Highway looks bad under drawn ground, per UK2. Report it to the user. Do not tune it in this task.

## Verify

Result: passed

Happy-path:
- CK1 (IV1) — the final code changes a day shot — held: a fresh board against the references showed at most 0.037% of pixels off by more than 8, all scattered single pixels.
- CK2 — the menu leaks to players or vanishes for tuning — held: no `.ink-menu` without `?tune`, one with it.

Negative:
- CK3 — a bad knob value in the URL is silently clamped — held: `edgeWobble=99` throws "Ink setting edgeWobble=99 must be a number from 0 to 2". The probe found the old "Style setting" wording, which is fixed.
- CK4 (IV7) — a missing anchor patches nothing — held: `shaderPatch.test.ts` passes, and every patch in `groundShader.ts` and `inkPaint.ts` goes through it.

Invariants / assumptions:
- CK5 (IV2) — a dropped switch survives — held: no `LOOK_POLY`, `GROUND_DRAWN`, `STYLE_GROUND`, `look.ts` import or `LOOK`, `GROUND` or `STYLE` comparison in `src` or `scripts`.
- CK6 (IV3) — the night program fails on a 16-unit GPU — held: the playtest night checks pass on both maps at a missing ground share of 0.000, and `samplers` reports 15 and 16 at night.
- CK7 (IV4) — the gate passes through a suppression or a limit change — held: `npm run quality` passes with `.oxlintrc.json` and `.quality.json` untouched and no `_` names added.
- CK8 (IV5) — the bake split changes the map — held: `icarus.bin` was byte-identical after `npm run map:bake`. `bake.ts` has not changed since.
- CK9 (IV6) — the ground writes paint state outside the contract — held: `groundShader.ts` touches only `inkSurface.road`, `edge`, `height`, `slope` and `rise`, and no `style*` global is left.

Smoke: `node scripts/look-board.mjs shoot` on the final code. All 10 shots rendered with no page error, and the day shots match the references.
Goal: proxy only. Day looks match the approved state by pixel diff. The night look and Chaos Highway are new and need the user's eye. The playtest frame rate gate fails while the CRT filter is at 0.1, as recorded under Deferred.
Notes: `highway-night` differs by 19% between two runs of the same code. The diff is the fort lamps' brightness, which had faded in to different levels when the shot was taken. The ground matches. Night lamp shots therefore compare by eye, not by number.

## Conclusion

### Progress

- PH1: the board shoots 10 shots. The negative control with `edgeWobble=0.9` changed `mud` by up to 94 and `scrub` by up to 117. UK1: the approved tree's ground program uses 14 samplers by day on Icarus and 15 on Chaos Highway, and fails to link at night on both maps on a real M3 GPU. The night references therefore show no ground, and the game stops drawing after that failure. Night shots can't be compared, so PH4 is required and its night shots go to the user as new looks.
- PH2, a538c73bb: every day shot matches its reference, apart from 25 to 230 isolated pixels per frame, under 0.03%. Those pixels sit where a sharp threshold flips from rounding. `icarus.bin` is byte-identical after `npm run map:bake`. The gate passes.
- PH3, 8acbd174a: the board matches the same way. 168 tests in the 13 related files pass.
- PH4, 2a7bd451b: samplers dropped from 14 to 9 by day on Icarus and from 15 to 10 on Chaos Highway. At night they are 15 and 16, and every program links. Day shots still match. Night shots now show ground, and the user sees them as new looks. No drawn extras had to be dropped at night.
- PH5, 955029183: docs updated and survey pictures regenerated. The 4 survey picture tests pass.
- Playtest: the night ground check passes on both maps with the 16-unit floor emulated. The frame rate check fails: 24.5 FPS on this branch, 60.5 FPS on HEAD, and 60.5 FPS on this branch with `?crt=0`. The CRT filter at its approved strength of 0.1 is the whole cost. See Deferred.
- AS1 held: the tree matched the approved checkpoint before any edit.
- UK2: Chaos Highway under drawn ground was shot for the first time, by day and at night. It renders without errors, and the user has not reviewed the look.
- UK3: the dropped looks broke 3 test files that pinned old values. `daylight.test.ts` pinned the 2048 shadow map, `modelFill.test.ts` expected only the fill uniform, and `shader-errors.test.ts` used a fake renderer the CRT pass could not draw with. All 3 are fixed.

### Deviations from plan

- `injectAfter`, `injectBefore` and `replaceChunk` live in a new `shaderPatch.ts`. `scope.ts` uses it too, in place of its own copy of the same check. The plan named one `patchShader` in the ground shader. Both ground and paint need it, and `scope.ts` already had the pattern.
- The ground material hook moved from `terrain.ts` into `inkGround()` in `inkPaint.ts`, with cache key `|ink` in place of `|facets`. `scripts/night-ground.mjs` finds the ground program by `|roads` now.
- The menu stays in its own `inkMenu.ts`. The fragmentation ratio had room for it.
- The look board pins Chaos Highway to seed 1, because a random seed made each highway shot a different world.
- The `drawn*` GLSL names stay, since drawn ground is still the look's name. Only the names left from the deleted poly look changed.
- GLSL helpers that only fed dead code were deleted, such as `drawnSegment` and the zero pencil term. The diff confirmed no change.

### Hands-off decisions

- uplan: plan auto-approved — the user said "execute the rest" in hands-off after one correction.
- uexecute: the isolated pixel diffs were accepted as rounding — under 0.03% of pixels, scattered single pixels, with no visible change on the sheets.
- uexecute: `factory/node_modules` and the root `node_modules` in this worktree are links to the main checkout, so the gate can typecheck. They are untracked and gitignored.
- uexecute: `~/Library/Caches/ms-playwright/chromium_headless_shell-1243` links to the installed 1248 build, so the playtest can launch. This avoided a download, and the link can be removed.
- uexecute: the CRT strength stays at 0.1, as approved, even though it fails the playtest frame rate gate. Changing the look is the user's call.

### Deferred (needs user input)

- CRT filter cost — at 0.1 it takes the playtest from 60.5 to 24.5 FPS, below the 50 FPS gate, so `scripts/land-dev.sh` would fail — choose one: default CRT to 0, make the pass cheaper, which may change the look slightly, or accept the cost.
- Chaos Highway look — first shots under drawn ground are in `game/tmp/board/s4/highway-day.png` and `highway-night.png` — review them.
- Night look — night ground draws for the first time in this look, in `game/tmp/board/s4/mud-night.png` and `town-night.png` — review it.

### Code smells

- `game/src/three/shader-errors.ts:147` — `ShaderWarmup.render()` reads the global `TUNING.crt` to pick its draw path, so its tests must reset a module global (GPC1).
- `game/src/three/render/groundShader.ts` — the wear functions still take `roadLook.a`, which the drawn ground fixes at 0.5, so every wear stipple hash is one constant (GPC6).
