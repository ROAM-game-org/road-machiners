# Asset review

How a model gets from a Blender script to the game without a visible fault. The fault classes come first, then the steps with their commands, then the review that a builder cannot do on their own work. [Art pipeline](models.md) says how to build a model. This page says how to check one.

Issue 1052 wrote it after the Longbed's hood showed a dashed line that two rounds of fixes did not remove. The rounds hid each other's causes because nobody had one list of what can go wrong and one way to look.

## What goes wrong

Three faults are known, and each has a cause that a test or a command finds.

- **Sliver butt joint.** Two separate solids meet back to back in one plane, and their outlines differ by a few millimeters. Each surface ends at the plane with a step too small to see, and the end caps are seen edge on through it. It shows as a dashed or doubled line across the join. The Longbed's hood and nose were two lofts that met this way at X = 3.31 m, with the nose 1.9 mm lower on top and 6 mm narrower at the panel corner. The rule: a surface that carries on past a join is one mesh with the rings continuing, and a real step is at least `MIN_LIP` tall, which is under one pixel at the closest zoom. [`surfaceFaults.test.ts`](../../src/three/render/surfaceFaults.test.ts) finds the rest.
- **Coplanar overlap.** Two faces that face the same way lie in one plane and overlap. The depth test picks one per pixel, and the pick changes as the camera moves, so a patch shimmers or crawls. The crease mask and the edge wear differ per face, so two panels of the same paint still flicker. The rule: the smaller piece stands `PROUD` (`parts_common_core.py`) out of its panel, or ends inside the solid it meets, and a skin laid over a panel of the same material is merged into it or lifted. Box-built frames need care here: a rail, a rib and a post that share a width share a face, so give each family of bars its own size.
- **Sub-pixel mask islands.** The crease mask bake gives each UV island a share of the mask. A piece too small for its share leaves blotches where the shadow is wrong. The bake throws on one, so a rebuilt truck model cannot ship it. [Art pipeline](models.md#trucks) has the bake.

Two causes sit under several faults and are worth knowing first:

- A polygon with points on one line, or one that crosses itself, makes the editor's triangulation overlap its own triangles. `corners_only()` in `shapes.py` drops repeated and collinear points before `prism()` builds a cap. A profile that crosses itself needs a fix in its points.
- An offset along a wrong normal sinks a plate into its hull. The carrier's rear door and silencer straps were skewed this way and lay in the stern plane.

## The steps

Run these from `game/`, in this order, for every new or rebuilt model. A step that cannot be run is a step that has not been done.

1. **Build and look.** `blender --background --python tools/blender/<name>.py -- public/models/<name>.glb tmp/<name>.png`. Read the preview.
2. **Bake a truck model.** A name in `SURFACE_MODELS` takes `npm run models:bake <name>`. It writes the crease mask into the file in place. Rebuilding without baking leaves a file that boot rejects.
3. **Regenerate what reads the file.** `npm run models:shapes`, then `npm run icons`. Both write checked files, and a test fails when they are stale.
4. **Run the surface check.** `npx vitest run src/three/render/surfaceFaults.test.ts -t <name>`. A failure names the model, the class, the materials, the plane and the box in model meters (X forward, Y up, Z across). Find the two pieces in the script that meet in that box. A sliver fault lists the corners that sit between `WELD` and `MIN_LIP` from the other solid's outline. Fix the script, never the tolerances: they come from the camera and from the weld step, and the test fixture `surface-fault-fixtures/longbed-931.glb` is the Longbed as it shipped with the fault, so the check stays red on a real case.
5. **Take the sheets.** `npm run shot -- --truck <chassis> --camera all` gives the 3/4, front, back, top, side and bottom views. `npm run shot -- --truck <chassis> --camera game --zoom 1` and `--zoom 4` draw at the size a player sees. A model that is not a truck takes `--model <name>`. Read every sheet.
6. **Take the in-game frames.** A still from `shot` has no outlines, no terrain and no motion. For anything a committee image shows, or any report of motion, write a Playwright script in `tmp/` after [Browser scripts](../tools.md#browser-scripts): put the truck on the chassis, move the camera to the bearing and zoom of the image, and save a still. For a shimmer or a crawling line, save a strip of 20 frames while the truck drives and while the camera pans. Read the strip frame by frame. A still cannot show a line that crawls.
7. **Look at the icons.** `npm run icons` redraws the inventory atlases and portraits from the model. Open them and check the model is there and unobstructed.
8. **Review it independently.** Someone who did not build the model reads the sheets and the frames against the checklist below, and writes each mismatch as a measurement or a plain description ("a dark dashed line crosses the hood 0.3 m behind the nose"). In the factory that is a fresh reviewer agent, never the builder. The builder fixes each item and the reviewer reads the new images. Stop after three rounds or when nothing differs that a player would see.

## The checklist for what tests cannot judge

The surface check finds geometry that fights for a pixel. It cannot see these, so the review looks for each one by name.

- No dashed, doubled or stepped line at a seam, at any of the four views and both closest zooms.
- No shimmer while the camera moves or the truck drives.
- Crease shadow only in real creases, and edge wear only on real outer edges. A shadow along a flat panel or a wear mark across a flat face is a false fold: the bake read two pieces as one fold.
- No detail removed to hide noise. A fault is fixed at its cause in the script. Deleting a louver, flattening a nose or turning off the mask, the wear or the outlines is not a fix.
- The icon and the portrait match the model, and show the bare body without a part in the way.
- Nothing the issue's image shows is missing from the new shot. Write the named features of the image down first, and tick them off one by one.

## Why the test has the shape it has

- The faces of every model in `NAMES` go into buckets by plane, so each face is compared only with the faces on its own plane. A truck model takes the strict rule, which counts any two materials, since mask and wear differ per face. Any other model counts only different materials, since two flat faces of one color draw the same pixel either way.
- A pair of faces counts only when it can be seen. The test casts a ray from the pair, 3 mm out along the normal and lifted 0.6 toward the sky, and ignores a pair that another face blocks, or that faces down. The game camera looks down at 30 degrees, so a downward face and a face inside a solid never reach the screen.
- `MIN_LIP` is the size of one pixel at the closest zoom in a tall window: `VIEW_METERS / ZOOM.max / 2000`, about 9 mm. A step taller than that is a real step. `PLANE_TOLERANCE` and `WELD` are 1 mm. The camera's depth range gives a depth step of about 0.1 mm, so any two planes more than 1 mm apart resolve.
- Models that are not truck models carry a counted allowance for the faults that were found but not fixed: `DEFERRED_FAULTS` in the test. The test fails when a count is wrong in either direction, so a fix lowers it and nothing raises it.
