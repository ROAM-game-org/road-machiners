# HUD bake

Every piece of HUD hardware is a three.js scene in `tools/hud-bake/parts/`, rendered in Chromium to pictures. The game shows the pictures and lays live HTML on top, so the hardware has real depth and the text stays live for Russian and long text. [The HUD skin](../ui.md#45-the-hud-skin) has the look rules.

## What a part makes

A part file builds its scene, then calls `installBake()` from `tools/hud-bake/core.js` with a function that renders at a scale and returns its files and box data:

- `housing` is the whole part in its rest state.
- Sprites are crops of the picture, one file per frame, such as `key0-up` and `key0-down`. A key, a toggle, a knob or a lamp that changes gets a sprite with one frame per state.
- Zones are the quads where live nodes go: text, icons, hit areas. Each zone has a `quad`, its four corners in picture pixels, and a `size`, its width and height in face pixels. A zone on a key gets a second zone at the pressed depth, such as `icon0` and `icon0Down`, so the label sinks with the key.
- `face` is the quad of the part's front face. The game maps it onto the part's layout box, so the face's top left and width set where the picture sits.

`npm run hud-bake` writes `public/hud/baked/<part>/<view>/<file>@<scale>x.webp` and `src/ui/dash/baked/<part>.<view>.json`. It bakes 2x and 4x for the desktop view and 2x for the flat view. A bake that would pass 8192 pixels a side or 30 million pixels steps down a scale, since the graphics card cannot render it.

## Views

`window.bakeView` is `desktop` or `flat`, from `part.html?view=`. Take the eye from `eyeFor()` and the vanishing point from `vanishFor()` in `core.js`, never a constant, so the flat view sees the part straight on. Geometry that leans toward the eye, like the drive toggles, uses the same eye.

## Rules for a part

- Model the hardware. Recesses are cut holes with a floor, never painted rings. Keys sit sunk in their holes. Lamps are flat domes lying on the panel.
- Use the shared kits: `parts/olive.js` for olive housings, keycaps, brass lips and wear, `parts/dashlib.js` for leather plates, and `parts/slate.js` for slate windows.
- Wear is light scratches and small edge chips from `mottle()`, never soft blotches.
- Print on olive panels is dark coal, `rgb(36, 28, 20)`, with a light lower edge.
- Bake no words. Text that the player reads goes in a zone as live HTML.
- A shared piece, such as a keycap, the lamp or a panel frame, belongs in `parts/pieces.js`, on a transparent background with a tight crop. The game frames the panel and keycap pieces as 9-slice border images, so they fit any size.

## Wiring a part in the game

Build the part with `new BakedPart(name, BAKED.name, className, layout)` from `src/ui/dash/baked.ts`. `layout` is the part's layout box, in the same units as its old plate. Then:

- `zone(node, name)` puts a live node on a zone.
- `follow(node, up, down)` returns a function that moves a node between the up and the pressed zone.
- `sprite(name, firstFrame)` returns the frames. `show(frame)` shows one and `hide()` hides them all.
- `place()` and `pin()` put a node in layout units, for live drawings like the speed dial.

## Review loop

1. Run `npm run hud-bake -- <part>` while nothing else heavy runs.
2. Run `npm run hud-bake:sheet` with the dev server up, and open the printed sheet.
3. Compare every element live against baked, zoomed in, and press every key. `node tools/hud-bake/smoke.mjs` lists each key's frames before and after a press.
4. Run the full `npm run hud-bake` before you commit, since every part's box data carries one hash of all the bake sources.
