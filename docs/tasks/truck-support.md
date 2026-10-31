# Every truck piece stands on the truck

## Context

- Truck pieces floated or cut into the body: antennas beside the roof, gun mount plates half in the air, a tow chain hanging below the rear, rams on long stems away from the body, goods and utilities over the nose edge.
- The cause was placement from the height map in `truck-shapes.json`, which keeps only the highest point of each 10 cm column and misses overhangs, slopes and glass.
- Mounted parts that could not stand were hidden, which the committee rejected for parts the player bought.

## Desired design

Every drawn piece stands on the real base mesh. `game/src/three/render/gunStand.ts` casts rays at the base's triangles, with an index of faces per 10 cm column cached per base model. Glass, lamps and the radio light never hold anything up.

- Antenna: the highest flat spot of the cab, at least 12 cm from any edge.
- Gun mount plate: moves within its cells, at most half its own size, to the nearest level spot on the body, then to the nearest spot fully over the body, then shrinks toward the riser top. A corner more than 2.5 cm over the body gets a `wmount_leg` leg. A corner with nothing below gets a brace to the nearest body wall under it. The head, the muzzle, `partPoint()` and every shot effect follow the moved mount.
- Goods and parts: a piece stands where 90% of its real bottom face touches the body and nothing pokes through it. Else it moves within its cells to such a spot. Else a part stands on legs and braces at the corners of its bottom face, and a good is not drawn. A mounted part is never hidden.
- Mounted armor keeps its height and moves in until it touches the body behind it. Rams hold their blade close on short arms.
- The tow chain hangs from the real rear underside.
- A dent never moves a triangle under a standing piece.

## Invariants and principles

- `game/src/three/render/truckSupport.test.ts` checks every piece of every truck in the seed-1337 world against the real triangles. A bottom face must have 90% of its area within 5 cm of support. Every plate corner region must rest on a leg or the body, and every leg tip on the body. No mounted part may be hidden. It has no exception list.
- Thresholds reuse `CLIP_TOLERANCE`, `MIN_SUPPORT` and `MAX_SLOPE` from `game/src/sim/body.ts`.
- Firing arcs come from the sim cells and do not change. Only the drawn gun moves.
- Truck build time stays near its old cost: the face index, footings, item spots and body faces are cached per base model.
- Approved look: the committee reviewed renders of the mounts, legs, braces, rams, chain and every part on legs, and approved them.

## Plan

Done in 9 commits on this branch:

1. The antenna stands on the cab's highest flat spot.
2. Gun mounts inset, reshape and stand on legs or braces, and shots leave the drawn barrel.
3. The tow chain hangs from the real underside.
4. The Blender ram scripts were rebuilt with shorter arms, and mounted armor touches the body.
5. Armor with no body behind it at its height moves to the nearest height that has some.
6. The icons were redrawn.
7. Goods and utilities stand on the real body, and dents pin the triangles under standing pieces.
8. Mounted parts move or get legs instead of hiding, and the audit test checks it all.
9. The docs in `game/docs/art/models.md` were updated.

## Result

- `truckSupport.test.ts` passes. With legged parts forced hidden, it fails and names all 9.
- The touched render tests pass: `armorCut`, `gunClearance`, `gunClearanceNpc`, `gunInset`, `gunRisers`, `truckSupport`, `turretAim`, `vehicleArmor`, `vehicleCargo`, `vehicleCut`, `vehicleRadio`, `vehicleWear` and `partLooks`.
- `npm run playtest` passes at 60 fps, and `npm run quality` passes.
- A truck build takes a median of 19 ms cold and 8 ms warm.
- Open for hardening: widen the audit to more seeds and random loadouts, and add a contact check for the tow chain.
