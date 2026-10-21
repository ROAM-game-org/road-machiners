# Truck surface shading in the game

**Status:** executing
**Branch:** truck-shading
**Worktree:** .worktrees/truck-shading
**Goal:** Every truck in the game shows the look the user approved on the armored scout preview. That look is baked crease shadow and edge wear, light paint chips, edge-only metal shine, grey metal, paint grain at 0.05, a warm daytime sky light over the whole scene, a contact shadow under each truck, and body paint at 80% saturation. Players get it without a slower game: the perf budgets and the GPU playtest pass, and the truck models download about as fast as today. The user confirms the look in the running game, on the player truck and on NPC trucks of other chassis. Useless if: the look ships only on the scout or only in the preview page; frame rate holds because the effect silently turns off; models ship at many times their face count; a rebuilt model quietly loses its bake; faction colors get muted along with body paint.
**Mode:** hands-off

## Context

- Truck models are flat-shaded Lambert meshes with no UVs and one color per material. The game merges each truck's static meshes by color in `mergeStatic()` in `game/src/three/render/vehicle.ts`, so a truck draws as a few meshes.
- The preview look stores crease shadow and edge wear in vertex colors. Vertex colors need a dense mesh: `base_scout` grew from 744 to 99,680 faces and from 60 KB to 2.8 MB. The 79 baked truck models total 15 MB against 3 MB today.
- The preview shader in `game/src/three/render/models.ts` runs value noise per pixel for chips and grain, which is 4 noise calls on every truck pixel.
- All 252 models come from Blender scripts in `game/tools/blender/` through `Kit.export()` in `kit.py`. All 17 chassis bases and every part model have a script.
- Icon hashes in `game/src/data/item-icons.json` cover model bytes, so any change to a truck `.glb` makes `item-icons.test.ts` fail until `npm run icons` runs.
- Budgets in `game/scripts/perf-budgets.json`: boot 2000 ms, frame p95 17 ms. The playtest emulates a GPU limit of 16 texture units per shader.
- Daytime light comes from keyframes in `game/src/three/render/daylight.ts`. The day sky color is a cool blue, `0x9cbff0`.
- Body paint is material `paint`, set per truck from `paintOf()`. The faction cab color is material `trim`.

## Design

Keep the models low-poly. Move crease shadow, edge wear and chip shapes from dense vertex colors into one small mask image per model, packed into a single shared texture when the game loads.

### Approaches

1. Dense vertex colors, as in the preview. No textures and no UVs. Truck models grow about 5 times in download size and up to 130 times in faces, and every truck's shadow pass pays for those faces too. Rejected.
2. One mask image per model, packed into one shared texture at load. Recommended. The faces stay as they are. Each model gets UVs and a small mask image inside its `.glb`. On load the game copies every mask into one atlas texture and moves each model's UVs into its slot. All trucks then sample one texture, so the per-color merge still works. Costs: a UV unwrap and an image bake per model, about one extra texture, and a few milliseconds of packing at boot.
3. One atlas file built offline. Same runtime as option 2 with one fetch fewer, but every model rebuild repacks a shared file and touches every icon hash. More tooling for a small gain.

### How it works

- Bake step. `npm run models:bake` reads the truck model list from `game/src/render/partLooks.ts` and runs a Blender bake on each `.glb`. It adds a UV map and writes a mask image into the model's glTF occlusion texture. Red is crease shadow, green is edge wear, and blue is the chip pattern, baked offline so the game runs no noise for chips. Texel density is fixed in meters per pixel, so big bases get bigger masks.
- A bake marker in each `.glb` records the bake version. A test fails when any truck model lacks the current bake, the same way the icon test catches stale icons. Rebuilding a model from its script and forgetting the bake breaks the build loudly.
- Load. `loadModels()` collects each truck model's mask, packs all of them into one atlas canvas with padding, uploads it as one texture, and rewrites each model's UVs to its slot. Models without a mask, including load stand-ins, point at a neutral slot meaning no shadow and no wear.
- Draw. `surfacedMaterial()` samples the atlas instead of vertex colors. Per-material rules stay as approved: paint, metal, rust, grime and plain. Grain stays procedural, because it is finer than any mask texel, and the shader skips it wherever it would already be faded out.
- Saturation. `paint` materials render at 80% saturation. `trim`, faction colors, lamps and warning colors keep full strength.
- Light. The daytime sky keyframes in `daylight.ts` change from cool blue to the approved warm tan, so ground, props and trucks warm up together. Night and twilight keyframes stay as they are.
- Contact shadow. Each truck view gets one flat quad under its body with a shared soft radial texture. It moves and tilts with the truck.
- Icons. Run `npm run icons` after the bake, since model bytes change.

Backwards compatibility: saves are untouched. Changed model bytes need the icon rerun, as above.

TDD: yes for the atlas packing and UV remap, which are pure, deterministic and easy to break. No for the shader look, which the user judges from renders.

### Invariants

- IV1 — Every truck `.glb` keeps its face count from before the bake. UV seams may add vertices, never faces.
- IV2 — Every model named by `partLooks.ts` carries the current bake version, or a test fails.
- IV3 — Trucks bind one mask texture in total, whatever the number of trucks or models.
- IV4 — A truck mesh merged from several models samples each model's own atlas slot. Masks never bleed between slots at any mip level the game uses.
- IV5 — Only `paint` materials are desaturated.
- IV6 — The perf budgets and the GPU playtest pass with at least 6 trucks on screen.

### Principles

- PC1 — Bake once offline and pay nothing per frame for what the bake can hold. Runtime noise only for grain, and only near the camera.
- PC2 — The mask format is one table, channel to meaning, defined once and shared by the bake script and the shader.

### Assumptions

- AS1 — Blender 5.2 exports a baked image as the glTF occlusion texture with a UV map, and three's GLTFLoader loads it as `aoMap`.
- AS2 — Packing about 100 masks at boot takes under 50 ms on the boot-time run.

### Unknowns

- UK1 — The texel density that keeps edge wear crisp on parts while the atlas stays at or under 2048 by 2048.
- UK2 — The added download size of all masks. It should stay near the 3 MB of truck models today, and `npm run boot:time -- --net 4g` decides.
- UK3 — Whether the warm sky changes need matching twilight keyframes so dawn and dusk do not jump.

## Plan

Approach: prove the mask path on one model first, then build the bake tool, the atlas, the shader switch and the scene changes in that order. The loader path in PH3 depends on what the PH1 spike shows, because about 20 test files load the real `.glb` files in Node through `loadModels(read)`.

### PH1 — Spike on base_scout
- 1.1 `tools/blender/bake_mask.py` (create)
  - Reads `in.glb`, adds a UV map with Smart UV Project and an island margin, copies it to a dense twin, writes crease shadow, edge wear and chip noise into the twin's color attribute, bakes that color into an image on the original UVs with an emission bake and a pixel margin, and exports the original faces with the image as the occlusion texture.
  - Writes the bake marker as glTF scene extras `{ surfaceMask: <version> }`.
  - Respects: IV1, PC2, AS1.
- 1.2 Spike checks, written to `tmp/bake/spike.log`.
  - Dump the glb JSON. Check `images`, `textures`, `occlusionTexture`, `TEXCOORD_0` and the extras marker.
  - Load the glb through `loadModels` in a scratch vitest file with the injected `read`. Record whether it rejects, logs and continues, or resolves with the texture.
  - Load it in `tmp/truck-shading/page.html` and confirm the image reaches the material.
- Commit: the bake script only. Spike files stay in `tmp/`.

### PH2 — Bake tool for every truck model
- 2.1 `scripts/models-bake.mjs` (create), `package.json` script `models:bake`.
  - Reads the truck model list, runs `bake_mask.py` per model with a log per model, fails loud on any failed bake.
- 2.2 `src/render/partLooks.ts` (modify)
  - Exports `SURFACE_MODELS: readonly ModelName[]`, every model a truck view draws, built from the existing look tables and the chassis bases.
- 2.3 `src/three/render/surfaceMask.ts` (create)
  - `SURFACE_MASK = { version, channels: { shadow: 'r', wear: 'g', chips: 'b' } }`, the one table of channel meanings. The bake script reads the version from the same value through the bake command line.
  - Respects: PC2.
- 2.4 `src/three/render/surfaceMask.test.ts` (create)
  - Every name in `SURFACE_MODELS` has a `.glb` whose extras marker equals `SURFACE_MASK.version`.
  - Every baked `.glb` keeps the face count recorded in `src/data/truck-faces.json`, written once from today's models before the bake.
  - Respects: IV1, IV2.
- 2.5 Run `npm run models:bake`, then `npm run icons`. The bake runs in the background with a log.
- Commit: baked truck models, the face table, refreshed icons.

### PH3 — Mask atlas at load
- 3.1 `src/three/render/maskAtlas.ts` (create)
  - `packMasks(sizes: readonly MaskSize[]): AtlasLayout` puts square power-of-two masks into aligned slots, biggest first, with slot 0 as the neutral mask.
  - `slotUv(layout: AtlasLayout, name: ModelName, uv: Vector2Like): Vector2Like` moves a model's UV into its slot.
  - `MaskAtlas` owns the one texture and the per-model slot.
  - Respects: IV3, IV4.
- 3.2 `src/three/render/maskAtlas.test.ts` (create), written before 3.1.
  - Slots never overlap and stay inside the atlas.
  - Every slot starts on a multiple of its own size, so mip levels never mix two slots.
  - A UV of 0 and 1 maps to the slot's inner edges.
  - The atlas side stays at or under 2048.
- 3.3 `src/three/render/models.ts` (modify) `loadModels()`, `toLambert()`, `standIn()`.
  - Takes the occlusion image of each model before `toLambert` drops it. The path follows the PH1 result. Any Node-only handling sits next to the existing `read` injection, never in merge or shader code.
  - A model in `SURFACE_MODELS` without a mask throws at load.
  - Rewrites each loaded geometry's UVs into its slot once, so every `model()` clone carries atlas UVs. Stand-ins and unmasked models get the neutral slot.
- Commit: atlas packing with tests, then the loader.

### PH4 — Shader reads the atlas
- 4.1 `src/three/render/models.ts` (modify) `surfacedMaterial()`, `SURFACE_UNIFORMS`, `SURFACE_COLOR`.
  - Samples `surfaceMask` at the uv instead of `vColor`. Chips read the blue channel, so the chip noise call goes. Grain stays procedural and skips its two noise calls when the fade is zero.
  - Respects: PC1.
- 4.2 `src/three/render/vehicle.ts` (modify) `shadeOf()`, `KEPT_ATTRIBUTES`, `staticGeometry()`.
  - Drops `shadeOf` and the color attribute. Keeps `uv`, and a geometry without one fails loud.
- 4.3 Set the approved defaults: grain 0.05.
- Commit: shader switch.

### PH5 — Paint, light and contact shadow
- 5.1 `src/three/render/vehicle.ts:773` (modify)
  - Body paint renders at 80% saturation where `mat.name === PAINT` sets the color. `trim` and all other materials keep full color.
  - Test in `src/three/render/vehicleWear.test.ts` or a new vehicle test: a built truck's `paint` mesh is desaturated, its `trim` mesh is not.
  - Respects: IV5.
- 5.2 `src/three/render/daylight.ts:33-55` (modify) `KEYS`
  - The two daytime keys take the warm sky `0xd8b08c`. The dusk keys stay, and UK3 is checked with a render at hour 8.
- 5.3 `src/three/render/vehicle.ts` (modify) `VehicleView`
  - Adds one flat contact shadow quad under the body, sized from the chassis, with one shared radial texture and material for all trucks. It renders after the ground, never writes depth and never writes `TRUCK_BIT`.
- Commit per bullet.

### PH6 — Proof
- 6.1 Renders of the player truck and NPC trucks of three other chassis in the running game, as a labeled sheet for the user.
- 6.2 `npm run perf`, `npm run playtest`, `npm run boot:time -- --net 4g`, with 6 or more trucks on screen. Respects: IV6, UK2, AS2.
- 6.3 Touched test files only, per the slow-tests rule.

### Test strategy
- TDD for `packMasks` and `slotUv` in PH3.
- Bake marker and face counts in PH2.
- Saturation split between `paint` and `trim` in PH5.
- The look itself is judged by the user from renders.

### Order & dependencies
- PH1 decides the loader path in PH3.3.
- PH2 must finish before PH3.3 and PH4 can run on real models.
- PH5 does not depend on the mask and can run after PH4.

### Risks / rollback
- RK1 — GLTFLoader cannot decode an embedded image in Node. Mitigation: decide from PH1 and keep the Node handling at the `read` injection.
- RK2 — Smart UV Project makes many small islands and the mask blurs across seams. Mitigation: the bake pixel margin, and a close render check.
- RK3 — The masks make the download much bigger. Mitigation: UK2 measure, then lower texel density.
- Rollback: every phase is its own commit on `truck-shading`.

## Verify

## Conclusion

### Hands-off decisions

- udesign: design and goal approved by the user, who then switched the task to hands-off.
- size: medium — new bake tool, loader change, shader change and light change across several files.
- branch: truck-shading in .worktrees/truck-shading — the worktree already holds the preview work.
- uplan: plan auto-approved (hands-off).
- uplan: desaturate by material name `paint`, not by surface class — the paint surface class also covers trim.
