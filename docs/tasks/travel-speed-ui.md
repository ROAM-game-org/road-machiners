# Travel speed control built to the UI design system

**Status:** validating
**Branch:** vast-travel-ui
**Worktree:** /Users/boris/Documents/Korovan/.worktrees/vast-travel-ui
**Goal:** The travel speed control (1, 4, 16, 64 turns per second) is built from the design system's hardware pieces and tokens, drives `Travel`, steps with `[` and `]`, reads right in English, Russian and pseudo text on desktop and phone, and ui.md documents it. Players use it to skip long auto-travel without boredom. Useless if: a restyle that invents its own look, a control that no longer drives `Travel`, text without Russian, screenshots taken and not looked at, a new pattern missing from ui.md.
**Mode:** hands-off

## Context

- The first version was a row of four `OptionSwitch` buttons with `>` to `>>>>` labels above End turn.
- `OptionSwitch` is for settings in Options (ui.md `.option-switch`). On the play screen, P19 says truck controls are hardware: a level is a knob, a readout is a display, a one-time action is a flat button.
- The labels are four arrow strings in the catalog, a P7 miss: the count of arrows is the only meaning, and the number is the real fact.
- On the phone the row sits over End turn and crushes it to the word "turn" (baseline screenshot `game/tmp/speed-ui/base-en-390x844-auto.png`).
- `[` and `]` are free: no `BracketLeft` or `BracketRight` binding exists in `src/`.
- `play.coast(realMs, wanted, speed)` multiplies the speed per frame, and `advanceTurn` reads `travel.getSpeed` every frame, so a new speed already applies on the next frame.

## Design

The control is a hardware strip in the `.turn-control` stack right above End turn, zone Bottom right "Events and commit" (4.1: an action sits at the end of the line it changes, and the commit is at the bottom right). It answers the always-on question "what will this turn do" (4.3).

- Two black plastic transport keys, the `.radio-next` piece, one with a rewind mark and one with a fast-forward mark, around one LCD readout. P19 and 12 `.radio-next`.
- The LCD uses `--font-lcd` and `--lcd`, like the clock and the readouts (11 Type). It shows the picked speed as `{n}x`, the fact itself (P7), so no arrows and no label word.
- Picked and playing: the LCD is lit while automatic travel plays at the pick and faint while the pick waits (P9, 6 states). Held Space fast-forward is a transient press and does not move the readout.
- A key at the end of the range is `aria-disabled` with the reason Slowest or Fastest in the shared tooltip (P5, 6).
- Keys `[` slower and `]` faster, by `KeyboardEvent.code` (12 `.key`). The key leaves the face and shows on hover through `keyLabel()`, and in the help panel (P7, 12 instrument button).
- Phone: same strip, `--touch-target` high, in the log strip's row in portrait and above End turn in landscape, so it never covers End turn (4.4). `--phone-speed-w` 128px is wider than End turn because the LCD needs room beside two touch-size keys.
- The LCD shows the speed actually playing while automatic travel runs (capped by `TurnPreparation.keptSpeed()`, so it can read lower than the pick) and the pick in dim ink otherwise (`--lcd-ink-dim`, a new LCD token).
- One shared piece `.speed-keys` goes in components.css or drawings.css, 12 of ui.md and `src/ui/guide/pieces.ts` (13 step 5). The `.option-switch` sentence about `.travel-speed` is removed.

### Invariants

- IV1: `Travel` owns the index and the clamp. The UI only steps it.
- IV2: A new speed applies on the next frame, mid-turn included, with no easing.
- IV3: No `→ ← ⇒`, no middle dot, no bold, no comments in code.
- IV4: Every new string ships English and Russian.

### Principles

- PC1: Use existing pieces before new looks (P19, 12).
- PC2: Fewest words (8, P17).

### Assumptions

- AS1: A UI sound for a speed step is not wanted, since the game has no click sounds on switches. Key and click share one code path.

### Unknowns

- UK1: Strip width on a phone beside End turn. Resolved by screenshot: 128px wide, End turn stays 96px, landscape instruments stop at the strip.

## Plan

1. `Travel.stepSpeed(delta)` clamps. Host hook `stepTravelSpeed(delta)` replaces `setTravelSpeedIndex`. Keys `BracketLeft` and `BracketRight` in `game.ts`.
2. `src/ui/travel-speed.ts` builds the strip. `WeaponPanel` renders it. Remove the OptionSwitch row and the `turn.speed.0..3` strings.
3. CSS in drawings.css (hardware) and layout in hud.css, phone.css. Tokens only.
4. Text in en and ru. Help panel entry. ui.md and pieces.ts.
5. Tests: Travel step and clamp, instant speed mid-turn, weapon panel strip, help entry.
6. Screenshots.

## Verify

- Typecheck passes.
- Vitest: `weapons.test.ts`, `travel.test.ts` (step, clamp, instant speed on a running automatic turn), `travel-speed.test.ts` (key codes step `Travel`, clamp, help row in English and Russian), `style-guard.test.ts`, `guide/guide.test.ts`, `game-menu.test.ts`, `src/text`.
- Screenshots in `game/tmp/speed-ui/` (gitignored), taken with `game/tmp/speed-shot.mjs` against a dev server on port 5196, seed 7, with a long waypoint, `]` twice and Space. Looked at: `v4-{en,ru,pseudo}-1280x720-auto.png`, `v4-{en,ru,pseudo}-1600x1000-auto.png`, `v4-{en,ru,pseudo}-390x844-auto.png`, idle shots `v4-*-idle.png`, landscape `v6-{en,ru}-844x390-auto.png`, baseline `base-*`.
- Faults found and fixed: the strip hid behind the log strip on a phone, the idle LCD was unreadable (25 percent ink), and in landscape the instruments covered the slower key.
- Seen live: the Russian run played at 1x with 16x picked because the worker cap applies, and the LCD showed 1x. This is the intended speed actually playing.
- `npm run layout` was not run. The design system does not require it for this change.

## Code smells

## Conclusion

### Hands-off decisions

- host hook: removed `setTravelSpeedIndex` from `UiHost` and added `stepTravelSpeed` and `travelPlaySpeed`. `Travel.setSpeedIndex` stays.
- sound: a speed step makes no sound. The game has no click sounds on switches, and key and click share one code path.
- help: the keyboard help lists `[` and `]` under Drive. The touch help is unchanged, since the keys are on screen.
- LCD text `{n}x` is the same in Russian. The other Russian lines came from agy.
- Russian help row reads "Скорость" as agy wrote it. A longer "Скорость пути" may read clearer.
- tooltip: with the shared `[{key}]` cap the key tooltips read "Slower [[]" and "Faster []]". Left as is.
- `vast-travel` was merged into this branch before the work, as a fast-forward.

- size: Medium, full flow. A design change across UI, docs and tests.
- worktree: used the existing worktree `/Users/boris/Documents/Korovan/.worktrees/vast-travel-ui` on branch `vast-travel-ui` as the caller instructed, and created no other worktree.
- keys: `[` and `]` from the caller, replacing my own pick.

### Deferred (needs user input)

- Whether the LCD should also show held Space fast-forward. It does not now.
- Whether the help row should say more than "Скорость".
