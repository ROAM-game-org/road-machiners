# Quest art

Quest pictures set the mood of a scene. They do not need to show every detail the text names. Every picture shares one painted style, so the pictures read as one set and not as generic AI art. A picture is made in two steps: an image model draws it from a fixed style block and a scene block, then `npm run quest-art` runs one fixed post-process that pulls its colors toward the others.

## Prompt

A prompt is the style block, word for word, followed by a scene block. Attach `docs/concepts/quest-art-style.jpg` as a style reference when the image model takes one. It holds the look better than words.

```
Style: a matte plein-air painting study in thin dry-brush gouache on canvas-textured paper. Short, flat, angular strokes follow the forms, and the canvas weave shows through the thin paint. Edges are loose, and detail is suggested more than rendered. Earthy palette of ochre, rust, burnt sienna and warm browns, with cool blue-violet shadows.
```

The style block names only the medium, the brushwork and the palette. Light, mood, time of day and framing belong to the scene block, so a night or indoor scene can set its own.

Rules for the scene block:

- Describe the place, the light and the mood. Name only the few objects that carry the scene.
- Prefer plain views at eye level. Stock shots, like a hero on a cliff with binoculars, read as AI art.
- Say what is missing when the model would add it. A roofless room needs "nothing is left overhead", or the floor gets beam shadows.
- Keep words like "oil", "impasto" or "photo" out. They pull the picture away from the dry gouache look.

The scene block for the farmhouse in `intro_arrival`:

```
Scene: inside a small abandoned farmhouse whose roof is gone. Hard midday sun falls straight in and cuts sharp shadows from the bare wall tops across the floor. Nothing is left overhead, so only the broken walls cast shadows. Wind-blown sand has drifted into the corners. Only a few things are left: a plain wooden table, a cold iron stove, and a narrow metal cot with no blanket. No people. The view is from the doorway, at standing eye height. Quiet, lonely mood.
```

## Post-process

`npm run quest-art -- <source image> <key>` writes `public/quest-art/<key>.webp`. It needs `uv`, which fetches Pillow and NumPy on the first run. The script is `tools/quest-art/post.py`.

The post-process maps the picture's light and dark onto a fixed rust-to-cream ramp in 12 steps, keeps part of the original color, and mixes half of the original picture back in. Then it adds a light grain. It unifies color only. It cannot turn a render into a painting, so a picture that looks like a 3D render needs a new generation, not a stronger post-process.

The constants at the top of the script apply to every picture. Change them only when you are ready to rerun every picture in `public/quest-art/`.

## Add the picture to a quest

Add the key to `QUEST_ART` in `src/data/quest-art.ts` and tag the line with `# img: <key>`. [Writing quests](quest-authoring.md) has the tag rules.
