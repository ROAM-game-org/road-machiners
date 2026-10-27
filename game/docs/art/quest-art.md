# Quest art

Quest pictures set the mood of a scene. They do not need to show every detail the text names. Every picture shares one coloured pencil style, so the pictures read as one set and not as generic AI art. A picture is made in two steps: an image model draws it from a fixed style block and a scene block, then a saturation filter softens its colours.

## Prompt

A prompt is the style block, word for word, followed by a scene block. Attach a crop of the Green Pit picture `public/quest-art/town_green_pit.webp`, saved as PNG, as the style sample. It holds the look better than words. Use a crop with no people, such as the water tower corner, so its content does not leak in.

```
Style: a coloured pencil drawing on warm cream paper, drawn exactly like the attached image, which is only a style sample. Loose diagonal pencil hatching fills the sky. Simple flat low-poly shapes with clean straight edges, broad soft planes of colour and gentle shading, almost no texture, grime or fine detail. Warm, soft, low-contrast light. Few shapes and calm empty space. At the edges the picture fades out into ragged hatched strokes on bare paper. Not realistic, not painterly, not gritty, no photo look.
```

The style block names only the medium, the strokes and the light. Light, mood, time of day and framing belong to the scene block, so a night or indoor scene can set its own.

Rules for the scene block:

- A place from the game must look like it does in the game. Take a screenshot with `npm run site:shot` first and describe what it shows. The quest text, the picture and the game look must agree in broad strokes, so fix the text when it describes a different place. Read the map like tabletop miniatures: a few models stand for a bigger, busier place, so paint the place they stand for, not a one to one copy.
- Describe the place, the light and the mood. Show the place's real buildings and trades at their size, never one of each: a market is many stalls, a garage several bays.
- A town picture shows the place, not the people of its quests. Named locals stay out of it.
- Prefer plain views at eye level. Stock shots, like a hero on a cliff with binoculars, read as AI art.
- Say what is missing when the model would add it. A roofless room needs "nothing is left overhead", or the floor gets beam shadows.
- Truck guns sit on motor-driven turrets that are fired from the cab. Say that nobody stands at the gun, or the model draws a gunner holding the grips.
- Keep words like "oil", "impasto", "realistic" or "photo" out. They pull the picture away from the pencil look.
- Keep the scene block short.
- Say that the subject fills the middle of the frame, with open ground and sky toward the edges. Each extra demand makes the model garble another one.
- Show guns in plain side profile. A barrel aimed at the viewer comes out as two barrels.

The scene block for the farmhouse in `intro_arrival`:

```
Scene: inside a small abandoned farmhouse whose roof is gone. Hard midday sun falls straight in and cuts sharp shadows from the bare wall tops across the floor. Nothing is left overhead, so only the broken walls cast shadows. Wind-blown sand has drifted into the corners. Only a few things are left: a plain wooden table, a cold iron stove, and a narrow metal cot with no blanket. No people. The view is from the doorway, at standing eye height. Quiet, lonely mood.
```

## Town pictures

A town picture is a panorama of the place: its own scene, its own palette and one landmark view, with little clutter. Set the focus so the band keeps the tops of towers, cranes and ships, at the cost of ground.

## Composition

The page crops every picture to a frame between 3:4 and 3:1, and a talk shows it whole at 260px wide. One safe zone holds in all of them: the middle 40% of the width and 55% of the height, around the focus point. Put the subject and every face, gun or truck the text names inside it, big enough to read at 260px. Let only sky, ground, walls and mood reach the edges.

## Generate

Codex draws the picture with gpt-image through the ChatGPT login, so it needs no API key. Pipe a request to `codex exec -s workspace-write -i <style reference png> -` that asks for one 16:9 image from the prompt and names the PNG to save under `tmp/`. Run two takes in parallel and show the user both.

Check every take in close crops before anyone sees it. Guns, hands and anything seen through bars or slats break most often, and a thing behind bars can come out painted over them.

A new scene starts from the style sample only, never from an earlier take of another scene. Only a final remake or a restyle edits its own take. Write the scene block fresh each round. Small additions to the last prompt are fine only when the picture is almost right, because a prompt grown by patches gets long and garbled.

## Post-process

The model draws these pictures too bright and too saturated. Soften the finished picture with `ffmpeg -i in.png -vf eq=saturation=0.7 out.png`, then write `public/quest-art/<key>.webp` with `cwebp -q 85`. A prompt that asks for darker colours overshoots, so lift such a picture with `eq=saturation=0.7:gamma=1.3`. Fix tone with the filter, never with a new generation, so an approved composition stays.

`npm run quest-art` and its rust-to-cream ramp in `tools/quest-art/post.py` belong to the old gouache style. Do not run it on pencil pictures, since the ramp turns the blue skies brown.

## Add the picture to a quest

Add the key to `src/data/quest-art.json` as `{ "file": "<key>.webp", "focusX": 50, "focusY": 50 }`, before the sheet below can draw it, and tag the line with `# img: <key>`. [Writing quests](../writing/quests.md) has the tag rules.

## Crop sheet

`npm run quest-art` also writes `tmp/quest-art/<key>.png`, and `npm run quest-art:crops -- [key ...]` rewrites it. It shows the talk picture at 260px with the safe zone and the focus point, then the narrowest column crop (3:4), the widest (1:1) and the widest band crop (3:1), each zoomed like the page's slow zoom. It reads the focus points from the JSON and its ratios and zoom match `src/ui/tokens.css`, and a test keeps them equal.

Look at the sheet of every take. Set `focusX` and `focusY` until the subject and its faces are inside all four views. Heads and faces matter most, so a face near the top asks for a low `focusY`. When no point fits, draw a new take.
