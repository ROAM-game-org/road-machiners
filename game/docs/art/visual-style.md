# Visual style

This page holds the look of the main game: the 3D world under the isometric camera. That covers the ground, light, shade, shadows, trucks, props, effects and weather. Read it before any change to how the world looks, and judge every such change against it.

The HTML UI and the quest pictures have their own styles on purpose, and this page does not cover them:

- The HTML UI and the overlays follow the [UI design system](../ui.md): warm ink on dark metal, with its own fonts and tokens.
- Quest pictures follow [Quest art](quest-art.md): a coloured pencil drawing on cream paper.
- Neither style borrows from this page, and this page borrows from neither. Do not copy a UI token or a quest art trait into the world view, or the reverse.

## The look

The world looks like a calm, hand-inked landscape print. Land is broad flat planes of color, lit by one sun, with few dark lines, and each line means one thing. The model is Hiroshi Yoshida's woodblock landscapes, with stronger color than the prints. The player looks at it for hours, so it must stay easy on the eyes at noon, in the evening, at night and while driving.

Example: a dune at 17:00. The sunlit face is warm and bright sand. The far side is one flat plane of the same sand, cooler and darker, with a crisp edge to the lit face and no outline. A thin line in a darker sand color marks the crest and fades at both ends. At 10:00 the sun is on the other side, the shade falls elsewhere, and the line stays on the crest. The truck on the slope sits on the drawn ground and casts a flat cool shadow down it.

## Principles

Each principle has the reason behind it and a check you can run on a screenshot.

1. Calm first. A new effect starts weak, and the user raises it with the Look menu sliders. Why: the strong styles the user tried, such as linocut, graffiti, halftone dots and a phosphor CRT, felt like a bad trip. Check: watch it while driving for a minute, and nothing pulls the eye away from the trucks.

2. Flat planes, not noise. Areas are flat color with crisp, antialiased edges. Two materials differ by their own surface mark, such as cracks on asphalt, wheel ruts on a dirt track and wind ripples on sand, and not by color alone. A dirt track is a crisp flat plane like any other ground, and its edge never soft-blends into the ground beside it. Why: grain, speckle, per-stroke hue jitter and pixelated rendering read as noisy and tire the eyes. Check: every edge is smooth when you zoom in, and you can name every material without color.

3. Few lines, each with one meaning. The world uses only these lines: the thin outline on models, the road edge line, the crest hairline on ridge tops, dune brinks and cliff lips in the ground's own darker color, and short streaks down steep faces. With ink effects on, dust billows, smoke billows and the smoke screen bank add a thin streak just inside the sunlit top of each billow band, and a dirt track adds one more mark of its own, a pair of faint worn wheel ruts, besides its road edge line. Fire is one merged mass of flat red, orange and yellow layers with rising pointed tongues, and a thin dark line runs only on its inner layer edges, never on the outer red edge. Lines belong to the form, so they stay fixed while shade moves with the sun. The crest line sits on the drawn lip, so the shade edge meets it whenever the sun is across the ridge. Why: when a material border looked like a dark line, it read as a change in height, and a crest line a few meters off the lip read as a second edge. Check: each dark line on the screen belongs to one of these kinds, and a crest line lies on the edge of its ridge.

4. Few marks per plane. Lit faces carry the material marks. Shade carries its diagonal shadow strokes. Steep faces add sparse streaks down the fall line, in light and in shade. Why: dense streaks laid over shadow strokes crossed into a confusing hatch, and a steep face in shade with strokes alone read as a flat trench floor. Check: on a steep shaded face the streaks stay sparse enough that the strokes still read as one tone.

5. One sun, real light. Light and shadow come from the engine. The sun's shadow map falls on the one smooth ground surface and on every model. Ground is in shade where the shadow map blocks the sun, where the slope turns away from it, or where the lightly smoothed landform tilts away from it past the shade cut angle. Any one of them shades fully. The cut gives each ridge a crisp split into a lit face and a shade face, and since it reads the landform, small bumps never split into shade pools. Why: hand-made shadow rules drew double shadows, blobs and shadows of things nobody could see. Check: every shadow has a caster that the player can see, and it points away from the sun.

6. Shade is one flat cool plane. Shade is the ground's own color, a little cooler and darker, flat, with a crisp edge to the lit side. Faces turned toward the sun warm up and brighten. Cast shadows are flat, cool shapes with no ink line. Why: the user rejected purple shade, black shade and outlined shadows. Check: shade keeps the material's hue, and nowhere does it read as a hole.

7. What you see is what is there. A truck or prop sits on the drawn ground, because physics, placement and the mesh read one surface. Parts on a truck never float and never cut into the model. Cloud shadows show only under overcast, because a clear sky has no clouds. Why: a wheel sunk in the ground or a shadow with no cause breaks trust in the picture. Check: close-ups of trucks on slopes show every wheel on the ground.

8. Steady under the camera. Zoom and pan never change a shape, an edge or a shadow. Ground marks keep their size in meters and fade out when they get too small to draw. A mark line thinner than a pixel keeps part of one pixel's ink, so cracks, ripples and grass still read at mid zoom. The crest hairline keeps a full pixel far out and fades, so ridges still read. Detail changes only at whole zoom buckets. Why: shapes that shifted while zooming looked broken. Check: the same spot zoomed in and zoomed out, cropped to the same area, shows the same shapes.

9. Scale is real. One tile is 4 m, and trucks and buildings keep real proportions, as [Landmarks](landmarks.md) sets out. Ground decoration stays small next to a truck, because trucks drive through it. Check: an in-game screenshot with a known truck in frame.

10. Readable at a glance. The game shows state through the world, as [DESIGN.md](../DESIGN.md) principle 9 says. Faces turned to the camera get a fill light, so a truck never reads as a dark blob on bright sand. A truck's parts read by channel, as the next section sets out, and a hurt truck gets darker and dented. Lootable objects show brighter, richer color. A truck hidden behind terrain shows as a flat silhouette. Check: you can tell the player's truck, a wreck worth looting and a hurt truck apart without hovering.

11. World time. Smoke, dust, weather and scenery move only while a turn plays, on the play clock. Why: dust that kept moving while the paused truck stood still read as a second clock. Check: nothing in the world moves while the turn is paused.

12. Edges show what stands. Each material has a height. Grass stands tallest, then fields, gravel and sand. Bare ground is level, and mud and water sit below it. A thin shadow falls on the lower side of a visible edge, so grass casts a ragged little shadow onto sand and a bank shades the rim of a pool. It is a shadow on one side, not a border line, and it shows only where the heights differ. Each edge keeps the character of its material: grass breaks up into upright slivers, gravel crumbles at pebble size, and mud and water keep calm, round shores. Grass blades and pebbles stand up, so each one grows only on its own ground, they crowd toward its edge, and they draw over the neighbour and the road verge. Flat marks such as cracks and ripples stop at the border, and near it sand ripples and water lines run along the edge. Sand never dusts grass. Why: smooth round edges with no shadow made grass read as a stain and gravel as a spill. Blades cut off at the border looked clipped, and sand dust over grass put a pale band between the grass and its shadow. Check: at a grass edge the blades cross the edge and a thin shadow hugs its ragged line, with no pale band between them.

## Reading a truck

A player must tell at game zoom what a truck carries and how hurt it is, without hovering. Each fact has one channel, and no channel carries two facts.

- Shape names the gun. Each gun has a look no other gun can roll, mostly through a signature part only it draws, so an mg and a gatling never look alike. Why: an mg and a gatling mean very different fights, and same-looking guns hid that.
- Size follows the gun's footprint, which mostly grows with tier. Most tier 1 guns take 1 by 2 cells, and most tier 3 guns take 2 by 2 or more.
- One accent color gives the gun role. Gun bodies are gunmetal, and one block on each gun is chip orange, damager red or precision pale. No other part carries orange, red or pale gray: red and rust parts and pale part metal are drawn gray. Why: when the engine was red, it read as a damager gun.
- The barrel shows where the gun faces.
- Gun bases stay quiet. Mounts, risers and legs are a mid gray tinted a little by the body paint, so they never draw the eye from the gun.
- Each armor family has its own color. Steel is gray, spaced armor is blue panels, scrap is rust brown, ceramic is an even pale checkerboard and cage is brown bars. Rams carry a muted ochre strip and sit at bumper level, centered on the wheel hubs and against the body.
- The faction line is one straight line in the body paint across the middle of the side armor.
- Cargo parts are olive crate wood, so cargo space reads apart from the body and goods stand out in it.
- Wear darkens paint and rust toward char, one step at a time, never lighter. At 25% HP a part is 60% of the way to char. A broken part chars further on every material, loses its role color and smokes from its own place.

Check: a sheet of trucks at game zoom, where you can name each gun's role and family, each armor family and the most hurt part.

## Do

- Draw what the surface is made of: cracked dark asphalt, ripples on sand, tufts on scrub, pebbles on gravel.
- Let landforms show through light: a warm lit face, a flat shade plane with a crisp edge, and a cast shadow.
- Give shade its shadow strokes, and add sparse streaks on steep faces in light and shade.
- Give each edge its material's character, and let blades and pebbles spill over it.
- Keep shade the material's own color.
- Use the engine's lights and shadows, and give them the right input, such as a mesh that casts.
- Keep strokes and marks at a fixed size in meters, and set stroke directions by how they look on screen.
- Keep color between pastel and comic, at moderate strength.
- Start new effects at the weakest strength that still shows.
- Check every change at noon, at 17:00 and at night, while driving, and at close and far zoom.
- Check the exact spots the user reported, close up.
- Show labeled before and after sheets, and let the user pick the strength.

## Do not

- Do not add grain textures, speckle, halftone dots, random color patches or per-stroke hue jitter.
- Do not pixelate the scene or the trucks, and do not add screen-space edge passes. They drop antialiasing and ruin truck detail.
- Do not outline shade or cast shadows, and do not draw material borders as dark lines.
- Do not make shade purple, black or a hue apart from its material.
- Do not trace or paint shadows by hand where the engine can cast them.
- Do not draw a shadow, patch or mark that nothing in the scene causes.
- Do not let zoom, pan or the camera's coarse draw while zooming change a shape.
- Do not split shade into flat steps by height. That look was tried and rejected as buggy.
- Do not lay dense streaks or other texture strokes over shadow strokes.
- Do not draw crest lines in black, at a fixed full width, or off the drawn lip.
- Do not draw grass or gravel as a photo-like texture. Draw them with ink marks at a believable size next to a truck.
- Do not clip blades or pebbles at a border, and do not dust grass with sand.
- Do not mark a town, site or crater with a painted disc or round clearing.
- Do not ship a new effect at full strength and wait for the user to ask for less.
- Do not give a part a gun role color or an armor family color it does not mean, and do not make a worn part lighter.

## How to change the look

- Tune live in the Look menu. Open it with `tune` in the URL, or toggle it with the `shaders` console command. The knobs live in `KNOBS` in `src/three/render/inkTuning.ts`. Their start values are the approved look, so change a start value only with the user's approval.
- The code owners are `src/three/render/inkPaint.ts` for the ink paint, `src/three/render/groundShader.ts` for the ground, `src/sim/surface.ts` for the ground surface, `src/three/render/daylight.ts` for sun and shadow, and `src/three/render/models.ts` with `modelFill.ts` for trucks and props. The truck reading channels live in `gunLook.ts`, `armorLook.ts`, `armorCut.ts`, `kindLook.ts` and `truckMesh.ts` in `src/three/render/`, and the gun shapes in `WEAPON_POOLS` in `src/render/partLooks.ts`. [Rendering](../architecture/render.md) has the technical detail.
- A model change also follows the [Art pipeline](models.md) and [Asset review](asset-review.md).
