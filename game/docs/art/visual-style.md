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

2. Flat planes, not noise. Areas are flat color with crisp, antialiased edges. Two materials differ by their own surface mark, such as cracks on asphalt and wind ripples on sand, and not by color alone. Why: grain, speckle, per-stroke hue jitter and pixelated rendering read as noisy and tire the eyes. Check: every edge is smooth when you zoom in, and you can name every material without color.

3. Few lines, each with one meaning. The world uses only these lines: the thin outline on models, the road edge line, the crest hairline on ridge tops, dune brinks and cliff lips in the ground's own darker color, and short streaks down steep lit faces. Lines belong to the form, so they stay fixed while shade moves with the sun. The crest line sits on the drawn lip, so the shade edge meets it whenever the sun is across the ridge. Why: when a material border looked like a dark line, it read as a change in height, and a crest line a few meters off the lip read as a second edge. Check: each dark line on the screen belongs to one of these kinds, and a crest line lies on the edge of its ridge.

4. One kind of mark per plane. Lit faces carry the material marks and the cliff streaks. Shade carries only its diagonal shadow strokes, and streaks never enter it. Why: streaks laid over shadow strokes crossed into a confusing hatch. Check: no plane on the screen shows two kinds of strokes.

5. One sun, real light. Light and shadow come from the engine. The sun's shadow map falls on the one smooth ground surface and on every model. Ground is in shade where the shadow map blocks the sun, where the slope turns away from it, or where the lightly smoothed landform tilts away from it past the shade cut angle. Any one of them shades fully. The cut gives each ridge a crisp split into a lit face and a shade face, and since it reads the landform, small bumps never split into shade pools. Why: hand-made shadow rules drew double shadows, blobs and shadows of things nobody could see. Check: every shadow has a caster that the player can see, and it points away from the sun.

6. Shade is one flat cool plane. Shade is the ground's own color, a little cooler and darker, flat, with a crisp edge to the lit side. Faces turned toward the sun warm up and brighten. Cast shadows are flat, cool shapes with no ink line. Why: the user rejected purple shade, black shade and outlined shadows. Check: shade keeps the material's hue, and nowhere does it read as a hole.

7. What you see is what is there. A truck or prop sits on the drawn ground, because physics, placement and the mesh read one surface. Parts on a truck never float and never cut into the model. Cloud shadows show only under overcast, because a clear sky has no clouds. Why: a wheel sunk in the ground or a shadow with no cause breaks trust in the picture. Check: close-ups of trucks on slopes show every wheel on the ground.

8. Steady under the camera. Zoom and pan never change a shape, an edge or a shadow. Ground marks keep their size in meters and fade out when they get too small to draw, and they never grow with the zoom. The crest hairline is the one exception: far out it keeps one pixel and fades, so ridges still read. Detail changes only at whole zoom buckets. Why: shapes that shifted while zooming looked broken. Check: the same spot zoomed in and zoomed out, cropped to the same area, shows the same shapes.

9. Scale is real. One tile is 4 m, and trucks and buildings keep real proportions, as [Landmarks](landmarks.md) sets out. Ground decoration stays small next to a truck, because trucks drive through it. Check: an in-game screenshot with a known truck in frame.

10. Readable at a glance. The game shows state through the world, as [DESIGN.md](../DESIGN.md) principle 9 says. Faces turned to the camera get a fill light, so a truck never reads as a dark blob on bright sand. Worn parts turn dusty gray and dented. Lootable objects show brighter, richer color. A truck hidden behind terrain shows as a flat silhouette. Check: you can tell the player's truck, a wreck worth looting and a hurt truck apart without hovering.

11. World time. Smoke, dust, weather and scenery move only while a turn plays, on the play clock. Why: dust that kept moving while the paused truck stood still read as a second clock. Check: nothing in the world moves while the turn is paused.

## Do

- Draw what the surface is made of: cracked dark asphalt, ripples on sand, tufts on scrub, pebbles on gravel.
- Let landforms show through light: a warm lit face, a flat shade plane with a crisp edge, and a cast shadow.
- Give each plane one kind of mark: streaks on steep lit faces, shadow strokes in shade.
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
- Do not lay streaks or other texture strokes over shadow strokes.
- Do not draw crest lines in black, at a fixed full width, or off the drawn lip.
- Do not mark a town, site or crater with a painted disc or round clearing.
- Do not ship a new effect at full strength and wait for the user to ask for less.

## How to change the look

- Tune live in the Look menu. Open it with `tune` in the URL, or toggle it with the `shaders` console command. The knobs live in `KNOBS` in `src/three/render/inkTuning.ts`. Their start values are the approved look, so change a start value only with the user's approval.
- The code owners are `src/three/render/inkPaint.ts` for the ink paint, `src/three/render/groundShader.ts` for the ground, `src/sim/surface.ts` for the ground surface, `src/three/render/daylight.ts` for sun and shadow, and `src/three/render/models.ts` with `modelFill.ts` for trucks and props. [Rendering](../architecture/render.md) has the technical detail.
- A model change also follows the [Art pipeline](models.md) and [Asset review](asset-review.md).
