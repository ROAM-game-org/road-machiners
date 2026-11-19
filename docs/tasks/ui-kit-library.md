# UI kit library and review sheet

**Status:** validating
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

- `.dialog`, `.panel` and `.dock-panel`: the `slate` piece, rebaked as a housing with a brass lip around a dark screen floor, so every word on a window sits on a dark screen and takes the amber inks. `.dialog` already draws `slate`, so its frame changes with the bake alone. The sheet shows two housing choices, olive metal and stitched leather, and the user picks one there. Panels of the HUD kit, `.hud-panel` and `.hud-frame`, keep their own art.
- `.well`, `.inset`, `.tooltip` and the confirm body: the recessed `screen` piece at window size.
- Text buttons in three heights, `.btn-s`, plain and `.btn-l`: the keycap piece stretched as a 9-slice, with engraved print. `.btn-danger` takes the red cap. `.on` and `.selected` take the pressed frame.
- `.tabs` and `.tabs.sub`: a row of keys, the picked tab pressed.
- `.option-switch`: a row of keys like `.tabs`, the picked value pressed.
- `.row`, `.stat-row`, `.meter-row`, `.tile`, `.chip`, `.tag`, `.meter` and `.gauge`: on the screen floor. The ink levels become amber steps, so the P11 hierarchy keeps its levels and the meter track still reads at full length. Item tones, the coin and the good and danger inks keep their meaning.
- Text inputs, text areas and `select`: a recessed input well with a live caret. Range sliders keep their drawing.
- Scroll bars: brass on the screen color through `scrollbar-color`. Screen files already set `scrollbar-width`, which turns off picture scroll bars in Chromium, so a bake would never show.
- `.icon`, `.key`, the coin and the item art keep their drawing and take the screen's ink.

Every state of section 6 shows on each control: rest, hover, focus, selected, planned, working, disabled, spent, seen, unaffordable and locked. A key has no hover look, per section 4.5. A clickable row or tile on a screen keeps its hover wash, since section 6 gives hover to things that react to a click. A disabled key keeps its cap and dims its print, as `setOff()` keys on the HUD do.

The crash screen and its notices keep a plain look with no baked art. They report files that did not arrive, so they must draw when no picture loads.

Principle change, approved by the user: P19 says every screen uses physical keys, and flat buttons are gone. Section 4.5 drops "on the game screen" and adds the accent for selection to the screen colors. ui.md and the sheet change in the same commit as the pieces.

The sheet renders in English, Russian and pseudo-long text through the existing `?lang=` switch of `loadLanguage()`. Its samples print real catalog entries, so the sheet needs no new Russian. It renders in the desktop and flat views, at full width and in the compact and narrow classes.

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
- UK3 — Whether the accent edge of a selection reads against amber text, or a selected row needs a stronger mark such as an amber fill with dark print. The sheet shows it.

## Plan

Approach: rebake `slate` as the window housing, retune the ink and surface tokens to the screen palette, and move the shared button rule onto the keycap art. Every screen changes through `tokens.css`, `base.css` and `components.css` alone. No Three.js code reads a surface, ink or line token, and `dash.css` reads none, so the 3D world and the baked HUD keep their look.

### PH1 — Baseline images
- 1.1 `game/docs/screens/*.jpg` (modify): run `npm run screens` on HEAD with the dev server up. The gallery dates from Nov 16, before the baked HUD, so the before set must come from this branch. The HUD change owes this re-render anyway.
- 1.2 Copy the result to `tmp/screens-before/`.
- Commit: Screens: re-render the gallery with the baked HUD

### PH2 — Bake the window pieces
- 2.1 `game/tools/hud-bake/parts/pieces.js:6-26` (modify) `CANVAS`, `BOXES`, `SLATE`: grow the canvas for the new boxes `slateLeather` and `input`, and replace the gray `SLATE` colors.
- 2.2 `pieces.js:49-68` (modify) `slateFrame()`: an olive housing slab from `olive.js` with a brass lip around a recessed floor in the screen brown. Delete `slateKey` from `BOXES`, `KEYS`, `keyZ()` and the bake loop, since a window closes with the `close` key.
- 2.3 `pieces.js` (modify) new `slateLeatherFrame()`: the same shape with a stitched leather housing from `dashlib.js` `stitch()`, `grain()` and `wear()`, matched to the leather of `stats.js`.
- 2.4 `pieces.js` (modify) new `inputWell()`: the `screen` recess with a deeper floor and no brass lip.
- 2.5 Run the full `npm run hud-bake`. It rewrites `public/hud/baked/pieces/` and `src/ui/dash/baked/pieces.*.json`.
- Respects: IV3, PC1. Check AS1 on a scratch page in `tmp/` by stretching `slate` to 1200 by 700 and the keycap to a 300px label.
- Commit: HUD bake: olive and leather window housings and an input well

### PH3 — Restyle the shared pieces
- 3.1 `game/src/ui/dash/skin.ts:239-243` `paintSkin()`: add `--hud-slate-leather-art` and `--hud-input-art`. Delete the two slate key variables.
- 3.2 `game/src/ui/tokens.css:52-81` (modify): `--surface-*` become the screen brown and its sunk and raised steps. `--line-*` become brass and dark bronze steps. `--ink`, `--ink-bright`, `--ink-title`, `--ink-label`, `--ink-muted` and `--ink-faint` become amber steps from `--hud-print` down to `--hud-amber-faint`. `--ink-overlay` and `--surface-overlay*` stay, since the in-world overlays keep their look. Add `--hud-input-edge` and the two scroll bar colors. Delete `--hud-slate-key-edge`.
- 3.3 `game/src/ui/styles/base.css:45-90` (modify): `.panel` takes the slate art in the rule that sets its surface today. Every rule that clears a panel's look with the `border` shorthand, like `.confirm-block` and `.new-game-block`, also clears the art. `button:hover` loses its look. `select`, text `input` and `textarea` take `--hud-input-art`. The page takes the scroll bar colors.
- 3.4 `game/src/ui/styles/components.css:35-62` (modify): the button rule behind the existing exclusion list takes the keycap 9-slice of `#ui button.key-cap` in `dash.css:843-852`, moved into one shared rule that both read. Print is `--hud-print` in `--font-engraved`, at the sizes the three button heights already set, with no uppercase so widths stay. `.btn-danger` takes `--hud-keycap-red-art`. `:active`, `.on` and `[aria-pressed="true"]` take the pressed art. `[aria-disabled="true"]` dims the print and keeps the cap. `.crash-reload` joins the exclusion list.
- 3.5 `components.css:63-290,491-606` (modify): `.tile`, `.chip`, `.well` and `.tooltip` take sunk screen surfaces. `.dialog button.close` takes the `close` piece. `.selected`, `.spent`, `.seen`, `.meter`, `.gauge` and the planned dashed look keep their meaning in the new palette.
- 3.6 `game/src/ui/styles/journal.css:17-30` (modify): delete the slate and slate key rules, so the journal side column takes the shared panel art and close key.
- 3.7 `game/src/ui/styles/boot.css` (modify): the crash screen keeps its old surface and ink through its own tokens, since it must draw without pictures.
- 3.8 Other files under `game/src/ui/styles/` change only to remove a color or frame that now fights a shared piece. The commit lists each removal.
- 3.9 `game/docs/ui.md` (modify): P19 says every screen uses physical keys. Section 4.5 drops "on the game screen", lists the window housing and adds the accent to the screen colors. Sections 6, 9, 10 and 12 describe the key hover rule, the inks, the housing and the input well.
- Respects: IV2, IV4, PC2. Run `npx vitest run src/ui/style-guard.test.ts src/ui/guide/guide.test.ts`.
- Commit: UI: every shared piece takes the baked HUD hardware

### PH4 — The review sheet
- 4.1 `game/src/ui/guide/page.ts:150-159` (modify): call `loadLanguage()` so `?lang=ru` and `?lang=pseudo` work, and add a control bar with links for the three languages, the desktop and flat views, the full, compact and narrow layer classes, and the olive or leather housing. The housing switch sets `--hud-slate-art` on the sheet root.
- 4.2 `game/src/ui/guide/pieces.ts:32-76` (modify) `PIECES`: add a states piece that draws a key, a tab row, an option switch, a row and a tile in each state of section 6. Add a window piece: a `.dialog` with a head row, tabs, a well of stat rows, an input and a row of keys. Samples print catalog entries through `t()`, never `verbatim()`.
- 4.3 `game/src/ui/guide/guide.test.ts` (modify): the states piece must name every state of the section 6 table.
- Respects: IV1.
- Commit: UI guide: states, a window, and language, view, layer and housing controls

### PH5 — After images and checks
- 5.1 Run `npm run screens`, then build `tmp/before-after.html` with each before and after image side by side, named by screen.
- 5.2 Run `npm run layout`, `npm run typecheck`, `npm test` for `src/ui/` and `npm run playtest`.
- 5.3 Look at every pair against IV4 and PC2, field screens first for RK2. List each broken screen as a follow-up under `## Conclusion`. This answers UK2.
- Respects: IV4, IV5, AS2.
- Commit: Screens: the gallery in the baked UI kit

### PH6 — The user's pick
- 6.1 After the user picks the housing and answers UK3 on the sheet, delete the losing housing from `pieces.js`, `skin.ts` and the sheet control. Rebake, rerun the screens and commit.
- Commit: HUD bake: keep the <olive|leather> window housing

### Order and dependencies
- The phases run in order. PH1 needs the HEAD look before any change. PH3 needs the baked art from PH2. PH6 waits on the user.

### Risks and rollback
- RK1 — A keycap on every button crowds dense rows like the shop list. Heights stay at the `--btn-h-*` tokens, and a crowded row becomes a follow-up task instead of a new size.
- RK2 — A HUD panel that clears its gray box with `border-color` or `background` alone, not the `border` shorthand, would show the slate art. The field screen pairs catch it, and the fix clears the art in that panel's rule.
- RK3 — The ink page and the quest page carry art and their own surfaces. Their pairs are checked first, and a fight with the housing is listed as a follow-up.
- Rollback: each phase is one commit on `hud-dashboard`, and nothing reaches dev until the user lands it.

## Verify

- Style guard, guide test, gallery test, `src/ui` Vitest, typecheck and the quality gate pass.
- `src/ui` Vitest passes, 1563 tests. `npm run playtest` passes on the GPU at 60.5 fps after two fixes outside the kit: Playwright's Firefox was not installed, and the dead-corner check looked only for `.key-cap`, which the baked HUD no longer draws. The second failure also hit the commit before the kit.
- Layout check over 351 captures, before the kit against after: 266 faults gone, 99 new. The new ones come from three causes. Some text differs from run to run, like the radio line, the build hash and the gun card status. The town truck drawing grows, because narrower keys let the yard head fit on one row, and this squeezes the shop truck card and moves wheel hit cells. Long test text makes the start Options panel overlap.
- The before and after pairs of all 67 surveyed screens are in `game/tmp/kit/before-after.html`. Panels, the ink page and inputs keep their old border boxes, so column lines stay in place (IV4). The one exception is the yard head reflow above.
- The sheet `ui.html` renders in English, Russian and pseudo text, with olive or leather housings and at the full, compact and narrow widths, with no page errors. It threw on load before this work, because `--engraved-stroke` belonged to no token group.
- AS1 held: both housings and the key cap stretch to 1200 by 600 and to a long Russian label with no seams. AS2 held: the playtest frame rate stays at 60.

## Conclusion

The first kit was rejected. It stretched one big brown screen piece, `slate`, across every window, and amber text sat everywhere. The redo writes the hardware grammar into ui.md section 4.6 first. It says which surface each kind of content sits on, which inks and fonts each surface allows, and how each hard case is solved. Windows are now olive metal with one screen per block of content, engraved coal titles, tape for game names and keys on the metal. `scripts/ink-check.mjs` checks the grammar in every layout-check run: it reports text in an ink its surface does not allow, a window that is mostly screen, and a screen inside a screen. On branch `kit-grammar` it finds zero such faults in all 67 states, in English and in Russian. The goal waits on the user's sign-off on `ui.html` and on `game/tmp/kit/before-after.html` in the hud-dashboard worktree.

### Deviations from plan

- The olive or leather housing pick, PH6, is dropped. Section 4.6 decides olive metal for windows and keeps leather for the HUD dash only.
- The before set is dev at bd834d46e, the last dev commit merged into the HUD branch, not origin/main. The HUD branch is built on dev, and main lacks dev's game changes, such as the semi's deck cells.
- Read quest and call choices are `.screen-line`s now, so `.seen` is faint screen ink instead of the pressed cap. UK3 is closed: selection on a screen is inverse print, not hue.
- Keys have no hover look, no lit wash and no focus ring. They show only their baked art.

### Assumptions and unknowns

- UK1 is closed by section 4.6.
- UK3 is closed by inverse selection.
- Coal on olive measures 3.8 to 1, so print on metal is at least `--text-lead` and limited to short fixed words.

### Follow-ups

- `slate` and `slateLeather` still exist in `tools/hud-bake/parts/pieces.js` and the baked files. Removing them needs a pieces re-bake.
- `createSwitch` in `src/ui/switch.ts` has no caller left except its test, since the Options mute is now a lit key.
- Fixed inventory items like the Wheel overlap and cannot be reached on many screens. The HUD branch had this before the kit.
- The help notes line in Russian still reports a leak fault. The text is fully visible.
- The inspect card header is built in `hud.ts` as engraved text, not tape.

## Code smells

- `game/src/ui/styles/components.css:35` — the key rule's exclusion list names 18 classes, and `style-guard.test.ts:58` reads only its first match (GPC4).
- `game/src/ui/styles/dash.css` — the hud-armed state prints "Guns, page 1 of 2" over the gun cards, before and after the kit.
