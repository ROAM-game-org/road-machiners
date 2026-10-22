# Accessory layer, odd fronts and small armor

**Status:** done
**Branch:** accessory-layer
**Worktree:** .worktrees/accessory-layer
**Goal:** On every truck, a player can bolt a ram onto the front or back over a full row of armor plates, and the ram sits centered because every front and back edge is an odd number of cells. Every armor type comes in 1 and 2-cell pieces, so one type can fill any edge. Spikes are a weak ram of 1 or 2 cells that hurts a truck which rams the cells they cover. Rolled NPC trucks no longer show a ram beside a lone 1-cell plate. The player uses this to build a truck that looks deliberate and to choose where it rams and where it bites back. Confirming the look needs the user to view in-game screenshots and rolled NPC sheets. Useless if: a ram on the new layer does not hit harder or does not soak hits before the plate under it; an accessory hides the plate under it or cannot be clicked, dragged or sold in the inventory; a 1-cell spike turns a whole side into a ram; loading an old save drops a player part or deletes an NPC; NPCs stop carrying rams and spikes; a widened truck draws its parts squashed or off the model.
**Mode:** hands-off

## Context

- One grid item covers each cell. `takenCells` in `game/src/sim/grid.ts` blocks any overlap, `planItemMove` in `game/src/sim/inventory.ts` has its own overlap check, and the inventory draws each item as one full-cell box.
- Rams (`ram`, `plowRam`, `claymoreRam`) are 3-cell armor parts. They compete with plates for edge cells, so a 4-cell front gets ram plus a lone 1-cell plate. NPC rolls put a 3 or 4-cell piece next to a lone 1-cell piece on 68% of armored sides.
- Front widths are 4 on buggy, courier, jeep and niva, 6 on bus, carrier and wagon, and 5 or 7 on the rest. A 3-cell piece centers only on an odd edge.
- `plates` is 3 cells, `spacedArmor` 4 and `reinforcedCage` 3. Cage has no 1-cell piece, spaced and reinforced cage have neither 1 nor 2.
- `ramMult()` in `game/src/sim/armor.ts` takes the best ram multiplier of any working armor on the struck side, wherever on the side it sits. `reinforcedCage` also has a ram multiplier of 1.2.
- Lane walks (`cellOwners`, `walkCells`, `passShare`, `heldPart`, `blastCells` in `armor.ts`) assume one part per cell.
- Chassis value and rated mass are computed from the layout letters. `chassis.test.ts` pins every value. `body.test.ts` bounds inner cell width at 0.75 to 1.1 of a nominal cell, and the wagon at 7 inner columns would land near 0.72.
- Load repair sends a player's misfit part to storage and drops an NPC's misfit part. An NPC whose built-in parts no longer sit on their cells is deleted. Adding a grid column shifts every item right of it, so widening needs a tiny save step. `withWideMg_42_43` is the precedent for a step that holds copied layouts.
- NPC gear scores protection per side as quality times cells, capped at full cover, so a ram over full plates would add nothing and NPCs would stop taking rams.
- Blender is installed. Each new part needs a model in `tools/blender/`, a bake, an icon, English and Russian name and lore, a shop listing and a value inside its tier band.

## Design

Three layers on a truck: car parts inside, armor on the edge cells, and accessories over the armor on the edge cells. Rams become the first accessory, and spikes the second. Trucks with even fronts get one more inner column, and every armor type comes in 1 and 2-cell pieces.

### Accessory part kind

- New part kind `accessory`. Its def holds armor, blast armor, field repair, ram multiplier, a look (`ram` or `spikes`), the edge letters it mounts on and an optional claymore.
- `ram`, `plowRam` and `claymoreRam` become accessories with their stats unchanged. They mount on F and B only.
- New accessories `spikeCluster` (1 cell) and `spikeStrip` (2 cells), tier 1, mount on all four edges. Their ram multiplier is 1.5, half the plain ram's bonus. They are lighter, weaker and cheaper per cell than any ram.
- One function gives the mount letters of a def: an accessory's own list, otherwise `MOUNT_CELLS[kind]`. Every reader of `MOUNT_CELLS[kind]` goes through it.
- Accessories count as shielding everywhere armor does: chip share, field repair, wear, the hit log tone, fight odds, the condition portrait and the armor hp sum in the progression gear report. Claymore code reads accessories instead of armor.

### Layers on the grid

- An item is on the accessory layer when it is an accessory lying fully on its own mount letters. Every other item, a spare accessory included, is on the base layer.
- Two items collide only when they share a cell and a layer. `takenCells`, `placementError`, `mountSpots`, `findSpot` and `planItemMove` take the layer of the item being placed at that spot.
- An accessory over an edge cell does not use cargo room, so `freeCells` skips accessory-layer items.
- `installSpot` puts an accessory on the accessory layer at the spot closest to the middle of an edge, front first, then back, then sides.

### Hits and rams

- A lane walk meets the accessory first, then the base part on the same cell. A cell costs its penetration once, whichever layers it holds.
- `passShare`, `heldPart` and `blastCells` see both layers, outer first.
- The ram multiplier becomes lane based. A crash uses the best multiplier among working armor and accessories on the struck side whose lanes include a touched lane. This keeps a 1-cell spike from turning a whole side into a ram. The claymore keeps its side rule.

### Armor in 1 and 2 cells

- `plates` 3 to 2 cells, `spacedArmor` 4 to 2 and `reinforcedCage` 3 to 2. HP, mass and base price scale with cells, so armor per cell stays the same.
- New 1-cell pieces: `spacedTile`, `cageSection` and `reinforcedSection`. Each copies the per-cell stats of its 2-cell sibling, and its base price per cell follows the mean premium of the existing 1-cell pieces.

### Odd fronts

- Buggy, courier, jeep and niva go from 4 to 5 inner columns. Bus and carrier go from 6 to 7.
- Each gets one inserted column of plain cells, with F and B at its ends, at an index that splits no built-in part and keeps the transmission over the middle column. Plain cells hold cargo and spares but no guns, so the widened trucks gain room without gun slots.
- Each widened chassis lowers its base by the two added armor cells' price, so its value stays at the pinned number. Rated mass grows with the formula.
- The open seat rule lists its chassis by id, since no 4-column chassis remains.
- 3D models stay as they are. `body.ts` spreads the extra column over the same model.

### New wagon

- The wagon's model was built for a 5 by 7 grid while its game grid is 6 by 5, and at 7 columns its cells would fall under the width floor. The user chose to replace it with a new chassis based on a real car, 7 columns wide.
- The new wagon is a GAZ-66 gun truck: a Soviet cab-over 4x4 army truck with an open gun bed. Its real width, scaled by the scout's game-to-real ratio, gives cells about 0.85 of nominal width.
- It keeps the id `wagon`, its tier, its role as the gun platform and its pinned value, so NPC templates and saves keep pointing at it. Its model, physics body, layout, built-in parts and display name change.
- Its model is sized per axis against the scout by real ratios, wheels and cab included.

### Saves

- One tiny step shifts every item at or right of the inserted column by one cell on the six widened chassis. It covers every vehicle in the world, NPCs included, and cargo rows too. It holds its own copy of the insert columns.
- The same step re-seats a wagon's built-in parts on the new layout and puts each other item on the first free spot with its old mount letter. A player's item with no spot goes to storage, and an NPC's is dropped. The step holds its own copy of both wagon layouts.
- The step scales the HP of resized armor by the cell ratio, so a damaged plate stays as damaged as before instead of being clamped to full.
- A ram on a left or right edge stops fitting. Repair moves a player's ram to storage and drops an NPC's, as it does for any misfit part.

### NPC gear

- Gear moves add each accessory on F, B and, for spikes, the sides, like armor moves.
- Protection per side scores each edge cell by its layers combined, one minus the product of each layer's miss share. A ram over a plate then adds protection, so NPCs keep taking rams.
- NPC scoring does not value the ram multiplier. Loadout priorities have no ramming weight today.

### Inventory and shops

- An accessory on the accessory layer draws as a box on the outer half of its edge cells, above the armor box. The armor stays visible and clickable on the inner half.
- Drag, drop, rotate, double-click and touch go through the layer-aware placement. The shop hint outlines the def's own mount letters.
- Highway outposts stock 2 accessories, as DESIGN.md gives every other type. The hauler takes no accessories.

### Render and models

- A mounted accessory is drawn like mounted armor, pushed outward by the armor depth, so it sits in front of the plate under it.
- Blender rebuilds `arm_plates`, `arm_spaced` and `arm_reinforced_cage` at 2 cells and adds models for the three 1-cell armor pieces and the two spike pieces. Each goes through the bake and the icon build.

TDD: yes for the sim rules: layer collisions, lane walk order, the lane-based ram multiplier, NPC protection stacking and the save step. Data, models, UI and docs are checked by the existing content, render and layout tests and by screenshots.

### Invariants

- IV1 — Every armor part covers 1 or 2 cells, and every armor type has a 1-cell and a 2-cell piece.
- IV2 — Every chassis with a front or back edge has an odd number of cells on it.
- IV3 — Two items share a cell only when one is on the accessory layer and the other on the base layer. The accessory layer exists only on edge cells.
- IV4 — A lane walk hits the accessory before the base part on the same cell, and charges the cell's penetration once.
- IV5 — A ram multiplier applies only when the crash touches a lane its part covers.
- IV6 — Loading a save from before this change keeps every player part and every NPC, and gives the same world apart from the shifted columns and re-laid wagons.
- IV8 — `ram`, `plowRam` and `claymoreRam` keep their HP, mass, value, armor, blast armor and ram multiplier.
- IV7 — Every chassis keeps its pinned value.

### Principles

- PC1 — Layer is derived from part kind and position, never stored, so saves keep their shape.
- PC2 — Every place that treats armor as shielding treats accessories the same, through one helper, not by listing both kinds at each site.

### Assumptions

- AS1 — Physics crash lanes reach the middle lanes in most head-on crashes, so a centered 3-cell ram still lands most rams. Checked with `npm run combat` ram numbers before and after the lane rule.

### Unknowns

- UK1 — The exact insert column per widened chassis, picked against the chassis tests.
- UK2 — Whether NPC loadouts still carry rams and spikes at a sane rate after the change, measured with the roll script in `game/tmp/armor-sizes/`.
- UK3 — The new wagon's grid length, built-in part spots and deck layout, set from the GAZ-66 proportions against the chassis tests.

## Plan

Approach: land each concern green as its own run of commits. Two Sonnet implementers build the Blender models in parallel while the controller does the sim. All paths below are under `game/`.

### PH1 — Armor and spike models (implementer A)
- 1.1 `tools/blender/arm_plates.py`, `arm_spaced.py`, `arm_reinforced_cage.py` (modify): N to 2 cells, keep the look.
- 1.2 `tools/blender/arm_spaced_tile.py`, `arm_cage_section.py`, `arm_reinforced_section.py` (create): 1-cell rows built from the 2-cell scripts' parts.
- 1.3 `tools/blender/arm_spike_cluster.py` (1 cell), `arm_spike_strip.py` (2 cells) (create): welded spikes on a back rail, reaching past the outer edge like a ram, kept inside `check_fit`.
- 1.4 `public/models/<name>.glb` for all eight, then `npm run models:bake <name>`. Preview PNGs in `tmp/`.
- Owns: `tools/blender/arm_*.py`, `public/models/arm_*.glb`. Does not touch `src/`.
- Commit: Armor rows come in 1 and 2 cells and spikes get models

### PH2 — New wagon model (implementer B)
- 2.1 `tools/blender/base_wagon.py` (rewrite): GAZ-66 gun truck. About 6.1 m long, 2.8 m wide across the bed sides, 2.6 m tall. Grid 7 columns by 7 rows inside the armor ring. Cab over the front axle on rows 1 and 2, columns 3 to 5. Engine box rows 3 and 4, columns 3 and 4. Wheels on rows 1-2 and 6-7 in the outer columns. Open gun bed behind the cab.
- 2.2 `public/models/base_wagon.glb`, bake, `npm run models:shapes` to refresh `src/data/truck-shapes.json`.
- 2.3 `src/data/physics.ts:38` `PHYSICS.bodies.wagon`: half height, wheel spots, radius, engine spot and center of mass from the model.
- Owns: `tools/blender/base_wagon.py`, `public/models/base_wagon.glb`, `src/data/truck-shapes.json`, `src/data/physics.ts`.
- Commit: The wagon becomes a GAZ-66 gun truck model

### PH3 — Accessory kind, layers and lane rams (controller, TDD)
- 3.1 `src/data/parts.ts:6-133` (modify): `PartKind` gains `accessory`. `AccessoryDef = PartBase & { kind; blastArmor; fieldRepair; ramMult; look: 'ram' | 'spikes'; mounts: SideLetter[]; claymore? }`. `ArmorDef.look` drops `ram`. Rams move to accessory with `mounts: ['F','B']`. `MODIFIERS.accessory` and `scaleMass` treat accessories like armor (IV8).
- 3.2 `src/sim/grid.ts` (modify): `mountCellsOf(defId): Cell[]`; `layerOf(g: Grid, item): Layer` with `Layer = 'base' | 'accessory'`; `takenCells`, `placementError`, `mountSpots`, `findSpot` per layer; `freeCells` skips the accessory layer; `mountLetter` uses `mountCellsOf`. `isShield(def)` for armor or accessory (PC2).
- 3.3 `src/sim/inventory.ts:23-66,266-277` (modify): `installSpot` sends accessories to a centered spot, front first. `planItemMove` checks overlap on the mover's layer at the target.
- 3.4 `src/sim/armor.ts` (modify): `cellOwners` keeps parts per cell, outer first. `walkCells`, `laneOwners`, `heldPart`, `passShare`, `blastCells` read both layers (IV4). `ramMult(v, contact: CrashContact)` takes the best working shield part covering a touched lane (IV5). `shareOf` uses `isShield`.
- 3.5 `src/sim/crash-contact.ts:100-101` pass the contact to `ramMult`. `src/sim/claymore.ts`, `utility.ts:78,97`, `factory.ts:52`, `repair.ts:35`, `wear.ts:132`, `fight-odds.ts:42`, `progression/gear.ts:27`, `ui/format.ts:330,420`, `three/render/truckPortrait.ts:318`, `ui/cards.ts:627`, `wiki/wiki.ts:175`, the `MOUNT_CELLS[kind]` callers in `inventory.ts`, `salvage.ts`, `progression/bot.ts`, `ui/town.ts`, `ui/outpost.ts`, `ui/full-shop.ts`: switch to `isShield`, `mountCellsOf` or the accessory def.
- 3.6 `src/data/modes.ts:97` `stockPerKind.accessory = 2`. Kind label text for `accessory` in `src/text/en` and `ru`.
- 3.7 Tests first: `src/sim/grid.test.ts` layer collisions and `freeCells`; `src/sim/armor.test.ts` walk order and single penetration charge; `src/sim/crash-contact.test.ts` lane rule; `src/data/content.test.ts` ram stats pinned and the ram rules re-keyed to accessories.
- Commit: Rams become accessories on their own layer over the armor, and a ram counts only where the crash touches it

### PH4 — Armor table and spikes data (controller)
- 4.1 `src/data/parts.ts:326-525` (modify): resize `plates`, `spacedArmor`, `reinforcedCage` to 2 cells with HP, mass and base scaled. Add `spacedTile`, `cageSection`, `reinforcedSection`, `spikeCluster`, `spikeStrip`.
- 4.2 `src/render/partLooks.ts:113-124` map the five new ids. `npm run icons`.
- 4.3 `src/data/market.ts`, `start.ts`, `salvage.ts`: list the new ids where their siblings sell or drop. Spikes go to the salvage yard and tier 1 garages.
- 4.4 Text: English name and lore in `src/text/en/names.ts` and `lore.ts`. Russian through agy, fallback Codex, then Sonnet.
- 4.5 `src/data/content.test.ts` (modify): 1-cell line test covers every armor type (IV1).
- Commit: Every armor type comes in 1 and 2 cells, and spikes join as a weak ram

### PH5 — NPC gear (controller, TDD)
- 5.1 `src/sim/npc-loadout.ts:182-250`: `ACCESSORY` pool and moves per allowed side group.
- 5.2 `src/sim/npc-gear-score.ts:44-52` `armorValue`: per edge cell, one minus the product of each layer's miss share.
- 5.3 Test: a ram over full plates scores higher than full plates alone.
- 5.4 Rerun `tmp/armor-sizes/roll.ts` copied into the worktree for UK2.
- Commit: NPCs bolt rams and spikes over their plates

### PH6 — Inventory and render (controller)
- 6.1 `src/ui/inventory-draw.ts:71-100` `itemBox`: accessory boxes take the outer half of their cells, with a class for the layer. `src/ui/styles/inventory.css` z-order. `docs/ui.md` gets the layered cell pattern.
- 6.2 `src/three/render/vehicle.ts:570-577,924-957`: `placeAccessory` pushes the armor placement outward by the armor depth. `vehicleArmor.test.ts` covers accessories.
- 6.3 Check: `npm run shot` of a ram over plates and spikes on sides, and an inventory screenshot.
- Commit: Accessories draw over the armor in the inventory and on the truck

### PH7 — Odd fronts and the save step (controller, TDD)
- 7.1 `src/data/chassis.ts`: insert a deck column in buggy, courier, jeep, niva, bus and carrier (UK1). Lower each base by the added cells' price. New wagon layout and built-in parts from PH2, base set to keep its value.
- 7.2 `src/data/chassis.test.ts`: seat rule by id list, wagon out of `SEAT_CAB`, a test that every front and back edge is odd (IV2).
- 7.3 `src/three/save-migrations.ts` new tiny step: shift columns on the six chassis, re-lay wagons, scale resized armor HP. Fixture test with one truck per chassis and an NPC count check (IV6). `npm run save:shape`.
- 7.4 `npm run icons` for chassis portraits. Text: the wagon's new display name, Russian through agy.
- Commit: Every truck front is an odd number of cells, and the wagon becomes a GAZ-66 gun truck

### PH8 — Docs (controller)
- 8.1 `docs/wiki/mechanics/truck.md` grid and claymore paragraphs, `turns.md` ram paragraph, `docs/art/models.md` armor and accessory rules, `npm run wiki`.
- Commit: Docs describe the accessory layer

### Test strategy
- Sim rules test first in PH3, PH5 and PH7. Each phase runs only the test files it touches, plus `npm run typecheck` and `npm run quality`.
- After PH6 and PH7: `npm run playtest` and `npm run combat` ram numbers before and after (AS1).

### Order & dependencies
- PH1 and PH2 run in parallel with PH3.
- PH4 needs PH1's models and PH3's kind. PH5 needs PH4. PH6 needs PH3 and PH4. PH7 needs PH2.

### Risks / rollback
- RK1 — The lane rule makes rams miss on corner hits. Mitigated by the AS1 check and by centering rams.
- RK2 — Sonnet models miss the look. The user reviews shots, and each model is its own commit.
- RK3 — The wagon step loses NPC gear on re-laid wagons. Mitigated by re-placing on the first free spot with the old letter.

## Verify

- The user checked shots of the GAZ-66 wagon from every camera, and the courier with its moved transmission. Both look right.
- After merging dev's float fix, the user checked a courier with spikes from every camera and confirmed it looks right.
- `npm run playtest` passes: 12 turns at 60.5 fps, no errors.
- The NPC roll script over 225 rolled trucks puts a big piece beside a lone 1-cell piece on 0% of armored sides, down from 68%. 52% of sides carry an accessory.
- The `combat` harness cannot take an outfit with a ram, since `+` also joins trucks in a lineup. The `combat` kit hauler charging a buggy crashed 4 times in 8 fights on dev and 2 times on the branch, too few to judge ram lanes.

## Code smells

- `game/src/test/combat-harness.ts:93` `parseLineup` splits on `+` before `parseOutfit` can read `gun/armor+ram`, so the outfit form `docs/tools.md` shows always fails.
- `game/src/sim/armor.ts` `cabShieldWith` throws on an accessory, and armor and accessories rank mount spots by different rules.

- `game/src/data/chassis.ts` — hauler, longbed, tractor, loader and semi each have a column with no built-in part or engine bay, so front shots there hit nothing on an empty truck.
- `game/src/three/render/gunStand.ts` `heldOn` and `game/src/test/truck-support-kit.ts` judge support differently. The view draws a small part on an outer deck cell that the support test then calls half in the air. On `dev` it hits caltrops on scout cells 1,4 and 5,4, and on courier and carrier cells. Narrower cells on this branch add buggy 1,3 and six jeep cells.

## Conclusion

The Goal is met. Every truck has an odd front and back, rams sit centered over a full plate row, every armor type has 1 and 2-cell pieces, and spikes hurt a truck that rams them. The user confirmed the wagon, the courier and the spiked courier on screen.

- AS1 is not confirmed. The charge fights crashed too rarely to compare ram lanes.
- UK1 resolved: buggy, courier, niva and bus move a built-in part into the new column, and the jeep and carrier keep an open one.
- UK2 resolved: NPCs carry an accessory on about half their sides, with no lone 1-cell piece beside a big one.
- UK3 resolved: the GAZ-66 wagon is 7 wide, a broadside truck the user approved.
- Review: rams and spikes now count as shields in the field patch button, the condition view and the bare side lesson.

### Hands-off decisions

- make: size Large, full flow, since the change spans sim, data, saves, UI, render and models.
- make: branch `accessory-layer` in `.worktrees/accessory-layer`, from `dev`, as the user asked.
- udesign: bus and carrier become 7 wide. The user chose to replace the wagon with a new 7-wide chassis based on a real car.
- udesign: the new wagon is a GAZ-66 gun truck and keeps the id `wagon`, its tier, role and value.
- udesign: rams mount on front and back only, as bumpers. Spikes mount on all four edges.
- udesign: spike ram multiplier 1.5, half the plain ram's bonus of 2.
- udesign: the ram multiplier becomes lane based for every part, so spikes cannot cover a whole side with one cell.
- udesign: `reinforcedCage` keeps its 1.2 ram multiplier, now lane based.
- udesign: new 1-cell armor ids `spacedTile`, `cageSection`, `reinforcedSection`, and spike ids `spikeCluster`, `spikeStrip`.
- uexecute: inserted columns are plain cells, not deck cells. Deck cells would have pushed four bases below zero to keep values pinned, and added gun slots to small cars.
- uexecute: the new wagon keeps the old wagon's speed, mass and handling numbers. Its bigger grid raises its rated mass to 6990 kg by the formula.
- uexecute: auto-mounting armor now packs pieces against an edge end or a neighbor when the cab cover ties, since 2-cell plates otherwise left single-cell gaps.
- uexecute: the escort bot buys patch parts before refitting, as `docs/architecture/bots.md` already says, since rams over full plates left it no cargo room.
- udesign: player rams on side edges go to storage on load through the existing repair, with no extra step.
- udesign: NPC scoring stacks layer protection per cell and does not value the ram multiplier.
- udesign: highway outposts stock 2 accessories. The hauler takes none.
- uplan: plan auto-approved (hands-off).
- uplan: model work runs in two side worktrees, `.worktrees/acc-models` and `.worktrees/acc-wagon`, merged back, so their commits do not run the hook against half-done sim edits.
- uexecute: buggy, courier, niva and bus move one built-in part into the new column: the tank, or the transmission on the courier. A plain column with nothing built in let about one front shot in five pass through an empty truck. The jeep and the carrier keep an open column, since moving their tank would open the engine or the cab to rear fire. The new wagon's engine bay moves left and its tank right for the same reason. A chassis test lists the open ones.
- uexecute: auto-mounted armor takes the front edge when the cab cover ties, so the cab-over wagon still plates its front first.
- uexecute: the aim tests turn the shooting wagon to face its gun, since its gun no longer faces front.
- uexecute: the save step lives in `save-steps-late.ts`, since a file of its own broke the quality gate's file count.

### Deferred (needs user input)

Both answered: the user keeps the tougher fronts, and wants the wagon as a broadside truck whose cannon fires to the sides and back, with a machine gun forward.

- Small trucks got harder to kill from the front. The cab now takes one shot lane in five, not four, so widened trucks need 12 to 17 percent more front hits. A scout scavenger now picks a fight with a buggy raider in 13.5% of seeds, down from over 40%. A scout's win odds against a buggy fell from 0.23 to 0.16. About a quarter of front shots at an empty jeep hit nothing. Keep this, or lower their cab and transmission HP to undo it?
- The new wagon fights worse. Its cab-over cab blocks the front arc, so its 2x2 cannon now auto-faces right instead of front. A gunwagon raider's danger to the hunter bot fell to 0.70, and the test wants above 1. Should guns fire over the wagon's cab, as the reference picture shows, or is side fire fine?

### Red tests

All pass. The tests that met widened trucks or the broadside wagon were re-staged with foes of the old strength. The claims tests broke on the new world roll and were re-staged. The tests that failed on `dev` were fixed here too: `scan`, `story-wrecks`, `intro`, `npc-loadout-traffic` and the `npc-restraint` repair tests.
