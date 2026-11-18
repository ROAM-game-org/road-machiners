# UI kit library and review sheet

**Status:** planning
**Branch:** hud-dashboard
**Worktree:** /Users/boris/Documents/Korovan/.worktrees/hud-dashboard
**Goal:** Every shared UI piece of `game/docs/ui.md` section 12, in every state of section 6, has a version in the baked HUD look, and every screen in `docs/screens/` wears it with its layout unchanged. The user signs both off on the `ui.html` sheet and on a before and after pair of every screen image. The sheet is what later screen-replacement tasks build from, one screen family each. Confirming the goal needs the user's sign-off on the sheet. Useless if: the sheet draws mockup markup that real screens never call; a piece clips in Russian, pseudo-long text or on a narrow layer; the hardware look breaks the grayscale hierarchy of P11 on a dense list; a piece exists only for the sheet; a screen counts as done because old flat markup sits inside a new frame.
**Mode:** interactive

## Context

- The HUD on this branch is baked 3D hardware: olive housings, leather trays, brass lips, recessed amber screens and physical keys. `src/ui/dash/skin.ts` has a small panel kit for it: `panelHead()`, `screen()`, `screenLine()`, `controls()`, `textKey()`, `closeKey()`.
- Only the dialogue, tips, death box, confirm dialog and HUD readouts use that kit.
- Every window is still the old flat look: gray slate surface, thin gray edge, flat text buttons. The journal, inventory, shop, town, character, options, menu panels, saves, new game and start menu all use it, through `.panel`, `.dialog`, `.btn-*`, `.tabs`, `.row`, `.well` and the rest of `src/ui/styles/components.css`.
- The journal's slate frame is baked by `tools/hud-bake/parts/journal.js`, but it copies the flat gray look, so a window next to the new HUD still reads as another game.
- `game/ui.html`, built by `src/ui/guide/pieces.ts`, already draws every shared piece with the real CSS, and `guide.test.ts` fails when a piece in `components.css` is missing from it.
- `ui.md` has two rules that disagree for windows. P19 says flat buttons are for one-time actions and screens that are not the truck. Section 4.5 says every button on the game screen is a physical key and screen text uses four amber colors, while section 9 gives selection to accent mustard.
- The character, journal, enemy card and contract board redesigns of issues #1506 and #1507 are merged to dev. The market and shop layouts had mockups the user rejected, per `docs/tasks/ui-redesign-catalogue.md`.

## Design

The hardware look reaches every screen, the start menu included, as the user chose. Layouts stay as they are. Only the material of each shared piece changes, so a screen gets the new look without its own change. The shared classes of `components.css` take baked art in place. There is no second set of pieces beside the old ones. A screen whose layout breaks under the new look gets a follow-up task, one screen family each, in the catalogue's order.

The user reviews two things on this branch:

- The `ui.html` sheet: every shared piece in every state. The old flat look shows in the before images.
- A before and after pair of every image in `docs/screens/`. Before is the image on dev. After is `npm run screens` on this branch, with the new art from `npm run hud-bake`.

Every new picture comes from the bake. Each new piece is a three.js scene in `tools/hud-bake/parts/pieces.js` on a transparent background with a tight crop, and the game draws it as a 9-slice border image, as the frame, screen, slate and keycap pieces already are. Words stay live HTML.

Map of shared pieces to hardware, the core of the sheet:

- `.dialog` and the window frame: a large olive housing with a brass lip, from a new `window` piece. The sheet shows two body choices, olive metal and stitched leather, and the user picks one there.
- `.panel` and `.dock-panel`: the existing baked olive `frame` piece.
- `.well`, `.inset`, `.tooltip` and the confirm body: the recessed `screen` piece at window size.
- Text buttons in three heights, `.btn-s`, plain and `.btn-l`: the keycap piece stretched as a 9-slice, with engraved print. `.btn-danger` takes the red cap. `.on` and `.selected` take the pressed frame.
- `.tabs` and `.tabs.sub`: a row of keys, the picked tab pressed.
- `.option-switch`: a row of keys like `.tabs`, the picked value pressed.
- `.row`, `.stat-row`, `.meter-row`, `.tile`, `.chip`, `.tag`, `.meter` and `.gauge`: on a screen surface, in the four screen colors and the accent, so the meter track still reads at full length.
- Text inputs of the save name and the feedback form: a recessed screen with a live caret.
- Scroll bars: brass on the screen color through `scrollbar-color`. Screen files already set `scrollbar-width`, which turns off picture scroll bars in Chromium, so a bake would never show.
- `.icon`, `.key`, the coin and the item art keep their drawing and take the screen's ink.

Every state of section 6 shows on each control: rest, hover, focus, selected, planned, working, disabled, spent, seen, unaffordable and locked. Hover stays absent on HUD hardware, per section 4.5, so a window key shows hover only as its tooltip.

Principle change, approved by the user: P19 says every screen uses physical keys, and flat buttons are gone. Section 4.5 drops "on the game screen" and adds the accent for selection to the screen colors. ui.md and the sheet change in the same commit as the pieces.

The sheet renders in English, Russian and pseudo-long text, in the desktop and flat views, at full width and in the compact and narrow classes.

TDD: no. The work is CSS and baked art, judged by eye. The checks are the existing style guard, guide test and `npm run layout`.

### Invariants

- IV1 — Every shared piece in `components.css` shows on the `ui.html` sheet through the same class or builder a screen uses. `guide.test.ts` already enforces it.
- IV2 — No screen file under `src/ui/styles/` sets a frame, color or button size. The style guard enforces it.
- IV3 — Every HUD picture comes from `npm run hud-bake`, and no picture holds a word.
- IV4 — No screen changes its layout grid in this task. Column lines in a before and after pair stay in place, give or take the frame's thickness.
- IV5 — `npm run layout` passes on every surveyed screen in English, Russian and pseudo-long text.

### Principles

- PC1 — A piece picks an existing baked piece first and gets a new bake only when no piece fits, as section 4.5 asks of controls.
- PC2 — Dense lists stay readable before they look like hardware. A row's ink, size and weight keep the P11 hierarchy on a grayscale screenshot.

### Assumptions

- AS1 — A 9-slice of the keycap and screen pieces stretches to the width of a long Russian label and to a full window without visible seams.
- AS2 — The added border images keep the shop and inventory at their frame rate on the playtest.

### Unknowns

- UK1 — Which body the window frame takes, olive or leather. The user picks it on the sheet.
- UK2 — How many screens break in the after images and need a follow-up layout task.

## Plan

Approach: retune the surface tokens to the hardware palette and point the shared classes at baked 9-slice pieces, so every screen changes through `tokens.css`, `base.css` and `components.css` alone. The window housing is the existing `slate` piece rebaked, so no new art variable reaches the screens.

### PH1 — Baseline images
- 1.1 `game/docs/screens/*.jpg` (modify): run `npm run screens` on HEAD with the dev server up. The gallery is from Nov 16 and predates the baked HUD, so the before images must come from this branch.
- 1.2 Copy the result to `tmp/screens-before/`.
- Commit: Screens: re-render the gallery with the baked HUD

### PH2 — Bake the window pieces
- 2.1 `game/tools/hud-bake/parts/pieces.js:9-21` (modify) `BOXES`: grow the canvas for the new boxes `slateLeather` and `input`.
- 2.2 `pieces.js:24,49-68` (modify) `slateFrame()`: rebuild as an olive housing with a bevelled slab from `olive.js`, a brass lip and a recessed screen floor, replacing the gray `SLATE` rings. Delete `slateKey` from `BOXES`, `KEYS` and `keyZ()`, since windows close with the `close` key.
- 2.3 `pieces.js` (modify) new `slateLeatherFrame()`: the same housing with a stitched leather body from `dashlib.js` `stitch()`, `grain()` and `wear()`, matched to `stats.js`.
- 2.4 `pieces.js` (modify) new `inputWell()`: the `screen` recess with a deeper floor, for text inputs and `select`.
- 2.5 `game/tools/hud-bake/parts/journal.js` (modify): drop the gray `rings`, `body` and `key` colors so the journal part uses the new slate look.
- 2.6 Run the full `npm run hud-bake`. It rewrites `public/hud/baked/pieces/` and `src/ui/dash/baked/pieces.*.json`.
- Respects: IV3, PC1, AS1. Check AS1 on the bake sheet by stretching each piece to 1200 by 700 and to a 300px Russian label.
- Commit: HUD bake: olive and leather window housings and an input well

### PH3 — Restyle the shared pieces
- 3.1 `game/src/ui/dash/skin.ts:240-243` `paintSkin()`: add `--hud-slate-leather-art` and `--hud-input-art`, and delete `--hud-slate-key-art` and `--hud-slate-key-down-art`.
- 3.2 `game/src/ui/tokens.css:52-81` (modify): retune `--surface-*`, `--line-*` and `--ink-*` to the screen brown `#342013`, the olive and the amber of the HUD screens. Set `--hud-slate-edge` and add `--hud-input-edge`. Delete `--hud-slate-key-edge`.
- 3.3 `game/src/ui/styles/base.css:45-90` (modify): `.panel` takes `--hud-frame-art`. `button` takes the keycap 9-slice with `--font-engraved` print and no hover look. `:active`, `.on` and `[aria-pressed="true"]` take `--hud-keycap-down-art`. `select`, `input` and `textarea` take `--hud-input-art`. Scroll bars take `scrollbar-color` from two tokens.
- 3.4 `game/src/ui/styles/components.css:4-62` (modify): `.dialog` keeps `--hud-slate-art`. `.dock-panel` and `.notice` take the frame art. `.btn-danger` takes `--hud-keycap-red-art`. Button heights keep `--btn-h-*`.
- 3.5 `components.css:63-290,491-606` (modify): `.tile`, `.chip`, `.well`, `.tooltip` and `.option-switch` take the screen art and the four screen colors plus the accent. `.dialog button.close` takes the `close` piece. `.selected`, `.spent`, `.seen`, `[aria-disabled]`, `.meter`, `.gauge` and the planned dashed look keep their meaning in the new palette.
- 3.6 `game/src/ui/styles/journal.css:17-30` (modify): delete the slate and slate key rules, so the journal uses the shared `.dialog` and close key.
- 3.7 Every other file under `game/src/ui/styles/` stays as it is, apart from removing any color or frame that now fights the shared piece. Each removal is listed in the commit.
- 3.8 `game/docs/ui.md` (modify): P19 says every screen uses physical keys. Section 4.5 drops "on the game screen" and adds the accent to the screen colors. Sections 9, 10 and 12 describe the new frames.
- Respects: IV2, IV4, PC2. Run `npx vitest run src/ui/style-guard.test.ts src/ui/guide/guide.test.ts`.
- Commit: UI: every shared piece takes the baked HUD hardware

### PH4 — The review sheet
- 4.1 `game/src/ui/guide/page.ts` (modify): add a control bar with text in English, Russian and pseudo-long, the desktop and flat views, the full, compact and narrow layer classes, and the olive or leather window body. The body switch sets `--hud-slate-art` on the sheet root.
- 4.2 `game/src/ui/guide/pieces.ts:32-76` (modify) `PIECES`: add a states piece that draws a button, a tab row, an option switch, a row and a tile in each section 6 state. Add a window piece: a `.dialog` with a head row, tabs, a well of stat rows and a row of keys. Each sample takes its words from `sampleText(en: string, ru: string): string`, which the text control switches.
- 4.3 `game/src/ui/guide/guide.test.ts` (modify): the states piece must name every state of the section 6 table.
- Respects: IV1.
- Commit: UI guide: states, a window and text, view and layer controls

### PH5 — After images and checks
- 5.1 Run `npm run screens`, then build `tmp/before-after.html` with each before and after image side by side, named by screen.
- 5.2 Run `npm run layout`, `npm run typecheck`, `npm test` for `src/ui/` and `npm run playtest`.
- 5.3 Look at every pair against IV4 and PC2, and list each broken screen as a follow-up under `## Conclusion`. This answers UK2.
- Respects: IV4, IV5, AS2.
- Commit: Screens: the gallery in the baked UI kit

### PH6 — The user's pick
- 6.1 After the user picks the body on the sheet, delete the losing housing from `pieces.js`, `skin.ts` and the sheet control. Rebake, rerun the screens and commit. This answers UK1.
- Commit: HUD bake: keep the <olive|leather> window housing

### Order and dependencies
- The phases run in order. PH1 needs the HEAD look before any change. PH3 needs the baked art from PH2. PH6 waits on the user.

### Risks and rollback
- RK1 — A keycap on every button crowds dense rows like the shop list. The heights stay at the `--btn-h-*` tokens, and a row that crowds becomes a follow-up task instead of a new size.
- RK2 — The token retune changes the drawn hardware of `drawings.css` that reads `--surface-*`. The before and after pairs of the field screens catch it.
- RK3 — The ink page and the quest page carry art and their own surfaces. Their pairs are checked first, and a fight with the slate frame is listed as a follow-up.
- Rollback: each phase is one commit on `hud-dashboard`, and nothing reaches dev until the user lands it.
