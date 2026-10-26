# Quest art

Quest pictures set the mood of a scene. They do not need to show every detail the text names. Every picture shares one painted style, so the pictures read as one set and not as generic AI art. A picture is made in two steps: an image model draws it from a fixed style block and a scene block, then `npm run quest-art` runs one fixed post-process that pulls its colors toward the others.

## Prompt

A prompt is the style block, word for word, followed by a scene block. Attach the rim picture `public/quest-art/arrival_rim.webp`, saved as PNG, as the style reference. It holds the look better than words.

```
Style: a matte plein-air painting study in thin dry-brush gouache on canvas-textured paper. The canvas weave shows through the thin paint. Edges are loose, and detail is suggested more than rendered. Earthy palette of ochre, rust, burnt sienna and warm browns, with cool blue-violet shadows.
```

The style block names only the medium, the brushwork and the palette. Light, mood, time of day and framing belong to the scene block, so a night or indoor scene can set its own.

Rules for the scene block:

- A place from the game must look like it does in the game. Take a screenshot with `npm run site:shot` first and describe what it shows. The quest text, the picture and the game look must agree in broad strokes, so fix the text when it describes a different place.
- Paint the place at its real scale. The map is a tabletop miniature, as [Design](../DESIGN.md) principle 10 says, so a few models stand for a settlement of hundreds or thousands. A place picture shows people, buildings, work under way and the place's trade at working scale, like a line of pumps and a few water trucks waiting. One pump, one table and five people is a lonely outpost, and no place in the game is one. A site of a few hundred is still a small town, so a crowded city or a field of hundreds of pumps is wrong too. Only Bowl and Nose read as towns of thousands. [People and scale](../lore/world.md#people-and-scale) has the numbers.
- Describe the place, the light and the mood. Name only the few things that carry the scene, and write them as many: rows, lines, crowds, crews.
- Prefer plain views at eye level. Stock shots, like a hero on a cliff with binoculars, read as AI art.
- Say what is missing when the model would add it. A roofless room needs "nothing is left overhead", or the floor gets beam shadows.
- Truck guns sit on motor-driven turrets that are fired from the cab. Say that nobody stands at the gun, or the model draws a gunner holding the grips.
- Keep words like "oil", "impasto" or "photo" out. They pull the picture away from the dry gouache look.
- Keep the scene block short.
- Say that the subject fills the middle of the frame, with open ground and sky toward the edges. In a place picture the town may run on to the edges. Each extra demand makes the model garble another one.
- Show guns in plain side profile. A barrel aimed at the viewer comes out as two barrels.

The scene block for the farmhouse in `intro_arrival`:

```
Scene: inside a small abandoned farmhouse whose roof is gone. Hard midday sun falls straight in and cuts sharp shadows from the bare wall tops across the floor. Nothing is left overhead, so only the broken walls cast shadows. Wind-blown sand has drifted into the corners. Only a few things are left: a plain wooden table, a cold iron stove, and a narrow metal cot with no blanket. No people. The view is from the doorway, at standing eye height. Quiet, lonely mood.
```

## Composition

The page crops every picture to a frame between 3:4 and 3:1, and a talk shows it whole at 260px wide. One safe zone holds in all of them: the middle 40% of the width and 55% of the height, around the focus point. Put the subject and every face, gun or truck the text names inside it, big enough to read at 260px. Let only sky, ground, buildings, walls and mood reach the edges.

## Generate

Codex draws the picture with gpt-image through the ChatGPT login, so it needs no API key. Pipe a request to `codex exec -s workspace-write -i <style reference png> -` that asks for one 16:9 image from the prompt and names the PNG to save under `tmp/`. Run two takes in parallel and show the user both.

Check every take in close crops before anyone sees it. Guns, hands and anything seen through bars or slats break most often, and a thing behind bars can come out painted over them.

Every round makes a new image from the style reference only. Never attach, describe or edit an earlier take, since edits drift and break layering. Write the scene block fresh each round. Small additions to the last prompt are fine only when the picture is almost right, because a prompt grown by patches gets long and garbled.

## Post-process

`npm run quest-art -- <source image> <key>` writes `public/quest-art/<key>.webp`. It needs `uv`, which fetches Pillow and NumPy on the first run. The script is `tools/quest-art/post.py`.

The post-process maps the picture's light and dark onto a fixed rust-to-cream ramp in 12 steps, keeps part of the original color, and mixes half of the original picture back in. Then it adds a light grain. It unifies color only. It cannot turn a render into a painting, so a picture that looks like a 3D render needs a new generation, not a stronger post-process.

The constants at the top of the script apply to every picture. Change them only when you are ready to rerun every picture in `public/quest-art/`.

## Add the picture to a quest

Add the key to `src/data/quest-art.json` as `{ "file": "<key>.webp", "focusX": 50, "focusY": 50 }`, before the sheet below can draw it, and tag the line with `# img: <key>`. [Writing quests](../writing/quests.md) has the tag rules.

## Crop sheet

`npm run quest-art` also writes `tmp/quest-art/<key>.png`, and `npm run quest-art:crops -- [key ...]` rewrites it. It shows the talk picture at 260px with the safe zone and the focus point, then the narrowest column crop (3:4), the widest (1:1) and the widest band crop (3:1), each zoomed like the page's slow zoom. It reads the focus points from the JSON and its ratios and zoom match `src/ui/tokens.css`, and a test keeps them equal.

Look at the sheet of every take. Set `focusX` and `focusY` until the subject and its faces are inside all four views. Heads and faces matter most, so a face near the top asks for a low `focusY`. When no point fits, draw a new take.
