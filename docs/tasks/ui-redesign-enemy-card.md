# Redesign the enemy card

Status: the phase 1 mockup is done, and its screenshots are in `ui-mockups/enemy-card/`. The user judged it a slight improvement, so it is the starting direction for issue #1507, not a settled spec.

## Context

`Hud.showInfo` in `game/src/ui/hud.ts` builds the card, `HitCard` in `game/src/ui/hitCard.ts` builds its gun lists and `TruckConditionView` draws the truck. `src/ui/npc-info*` is only a test of the text formatters. I verified these faults in `inspect.jpg`, `inspect-unarmed.jpg` and `menu.jpg` at 1280 by 720:

- The first complaint is partly true. Call, Look over and Mark sit under the name and above the state line, so the state line is between them and the drawing. The row splits the name from the state and takes the slot of a heading. Section 12 records this as a bend, so controls keep a fixed place.
- The second complaint is true and is half the fault. `--info-lists-height` fixes the lists at 100px. One gun leaves most of a well empty, while about 5 rows fill it and the rest scroll, although `SLOT_KEYS` allows 9 guns. A key fact can scroll away, against P2.
- The drawing box is 132px wide in 262px of room, which leaves a 65px empty gutter on each side.
- The card is 461px tall in one image and 488px in the other, against P14, since its height follows each truck's picture. It makes `coverUnder` hide the radio and the log, so aiming hides what just happened in a fight.
- A blocked gun prints name and reason in faint ink on two tight lines. "MG turret, out of arc" reads as a heading over "Rocket rack 57%".
- Look over takes a turn, since `LOOK_OVER.turns` is 1, and the card does not show it. The selected gun, which decides what a click aims, shows only in the weapons bar at the far bottom left.
- From the code, with no gallery image: `.info-column` keeps its empty 100px on the own truck, on the hauler and while a turn plays. The card also drops to its short slot and back on every turn.

## The question

I keep the question of section 13: fight, talk or leave, and if I fight, where do I aim.

- Key facts: who it is and its stance, my chance per gun, its chance per gun, and the drawing with damage and aim marks.
- Supporting: truck type and faction, motion, activity, states, the commands and the lines a perk reveals.
- Reference: the causes of a chance, a cut gun name, ammo and the reason a command is off.
- Cut the fixed strip, because its size follows neither its content nor the largest content.
- Cut the gutters beside the drawing, because they hold nothing.
- Cut the keycaps from the button faces, because the instruments already moved keys to hover and help. The keys keep working.
- Cut the faint dash, because it reads as a missing value. "No weapons" states a fact that decides a fight, and `hit.noWeapons` exists with no caller.
- Print a reason that every row shares once, as P12 asks. "Driver knocked out" on every row is noise.
- No other fact leaves the card.

## Desired design

The card stays at the top right edge and 282px wide at 1280. The drawing and the lists stand side by side, because a truck is tall and narrow. The commands stop being a heading and become the foot of the whole card. The log stays in view for 13 of the 17 chassis that can be aimed at. The drawing itself does not change, only the box around it. Game rules, saves, the simulation page cards, the radio and the log stay out of scope.

```
1280 by 720                                 top 55
+------------------------------------------------+
| Abe Brandt                          [hostile]  |
| Gunwagon, Scrapjaw                             |
| Parked. Feud with you, 10 turns                |
| +------------------------+ | You               |
| |                        | | 1 MG turret   16% |
| |                        |                     |
| |     truck drawing      | ! Them              |
| |     fixed column       | ! MG turret         |
| |     140px              | !   out of arc      |
| |                        | ! Rocket rack   57% |
| |                        |                     |
| +------------------------+                     |
| [ Call ]   [ Look over ] c 1   [ Mark ]        |
+------------------------------------------------+
                          bottom 454, log top 462
```

The `|` and `!` marks are the neutral and danger well edges, and `c 1` is the clock icon and one turn. Sizes are estimates from `chassisSize` and `boxFor`. The wagon estimate is 131 by 249, and `inspect.jpg` measures 132 by 245. At the 24px aim cell, trucks that can be aimed at run 96 to 136px wide and 169 to 421px tall, buggy to sorokonoga. The `semi` is 142 by 749, and only the hauler uses it. The width is 10 padding, 140 drawing, 8 gap, 114 lists and 10 padding. Everything but the drawing falls from about 216px tall to about 126px.

1. The lists move beside the drawing. They get the drawing's height, and each chance sits near the part it aims at.
2. The wells hug their rows and stack, You over Them, in key order. P15 stays, and spare height lies at the end of the column, as P14 asks.
3. The drawing column has a fixed width, as P13 asks. A short truck fills it at cells above 24px.
4. The card has one height from a new token, 399px, or ends one gap above the log when the log comes first. Two enemies then share one outline at any window. At 1280 by 720 that is down from 461 to 488px.
5. A truck that needs more room grows the card to the log's bottom edge, as `growForAim` does today. The lincoln, longbed, bus and sorokonoga do this. The sorokonoga gets about 23px cells, up from about 18px.
6. Overflowing rows also grow the card before the lists scroll. About 16 rows fit at base height and about 25 fully grown.
7. The commands become one row at the foot of the card, in the order Call, Look over, Mark, one verb each at its own width. The inventory shares one width because its buttons stack, and a row has no column to line up. They act on the whole truck, so they sit under both columns. The place stays fixed because the card's bottom is fixed, which keeps the reason for the old bend.
8. Look over shows the clock and 1 beside it. A refused command stays dimmed with its reason in the shared tooltip, as no room remains beside it.
9. On touch, Close moves to the name row after the tag, since P20 lets a window control share only the title row.
10. The head takes two fixed rows: name and tag, then type and faction. A long name ends in an ellipsis with its full text in the title.
11. A blocked row gets a normal row gap, and its reason wraps and is not cut, because it tells the player what to fix.
12. The selected gun's row in You takes the `.selected` look, so the card shows whose aim the next click sets. With none selected, a click aims all guns and no row is marked.
13. A chance tooltip opens left of its row, over the drawing and past the card's edge when long, never over the lists, as P16 asks.
14. An enemy card keeps its height while a turn plays and while the player cannot act. The lists hide as today, and the commands stay in place.
15. The own truck and hauler card has no lists or commands. The drawing takes the full width at the dock width and short slot.

States from step 3 of section 13:

- Nothing picked: no card, and the radio and log return.
- Stance and pin: hostile, neutral, friendly and allied change only the tag. Hovered and pinned cards look the same.
- A truck with no brain: no type, Call or activity, on the same edges.
- Guns: none prints "No weapons". Up to 9 on You and every NPC gun on Them fill the column and then grow the card.
- Refusals: every block reason, with turns. The Russian "обзор закрыт своим грузовиком" is the longest and takes two lines.
- Knocked out, given up, shut down or on the radio: a shared reason prints once.
- Aim set: number marks on the drawing, chances at the new aim.
- Work running: a Look over in progress refuses a second one, and the state line shows it.
- Unlocks and modes: fewer commands leave the row shorter, from the left edge. Chaos Highway has no Call, and its hauler takes the own truck card.
- Longest content: many states plus Lets you pass, Traits, long Cargo, Marked and Wanted take the drawing's room, and then the card grows. Past the log's bottom edge, the cells fall under 24px. Section 6 sets that minimum, and the sorokonoga bends it today too.
- Dock: held contracts, the Wanted well and an expanded log hide under the card as today and return when it closes.
- Picture not built: the box stays empty at chassis size and clicks wait. Readback refused: the plan drawing fits the same column.
- Compact, 721 to 1100 wide: the card keeps 282px and grows left by 36px. At UI size 130% the layer is about 985 by 554, and nearly every truck grows over the log.
- Narrow desktop, 700 by 800: top center notices reach the card, since a 410px tip spans x 145 to 555 and a 282px card starts at x 402. So `#ui.narrow:not(.phone)` stacks the card at the 200px dock width: drawing, then hugging wells, then a wrapped command row. This keeps today's footprint.
- Phone: two columns, with the drawing column about 181px for the 32px touch cell. The card takes about 323px of 374px in portrait, and a 320px layer leaves about 95px for lists. Tips already hide under an open card. It scrolls inside when short, as today.
- Russian and pseudo: the three Russian buttons and the cost take about 256px of 262px by estimate. A longer language wraps the row to a second line, and the cost stays beside its button. Gun names get about 7px less than today.

Principles: this applies P2, P3, P13, P14, P15, P16, P18, P20, P21 and section 5's slot order. It bends P18, since a short truck gets a taller card to keep one outline. It bends P22 for the state line, since nothing there is compared and rows would cost the height that keeps the log.

## Cost

- Gun names lose about 7px, so more end in an ellipsis until hovered.
- The radio stays hidden under any enemy card at 1280 by 720. Only the 4 shortest chassis could have kept it.
- A truck with few guns leaves up to about 200px empty at the end of the list column.
- A new player finds T, B and N only on hover or in help.
- Between 721 and about 1006 wide, a top center tip overlaps the card by 36px more than today. It draws above the card and is short-lived.
- The narrow desktop keeps a second, stacked form of the card to test.
- The lincoln, longbed, bus, sorokonoga and large UI sizes still hide the log. The list column option of decision 1 would keep the lincoln and the longbed above the log.
- A refused command's reason stays one hover away, unlike the inventory, and a long tooltip can cover the world while it is open.

## Open decisions for the user

1. Where do the commands go? I recommend the foot row. It keeps a fixed place, keeps spare height at the end of a group and does not read as acting on a gun. It takes about 32px from the drawing. The bottom of the list column saves those 32px and keeps two more chassis above the log, but it leaves a gap between groups, and Mark can read as acting on the gun above it. Directly after the lists fits P14 but moves with the gun count, and it has the same problem with Mark.
2. Does the card keep one height or hug each truck? I recommend one height, for one outline and larger aim targets. Hugging shows the radio on 4 chassis, but the outline jumps as the cursor crosses trucks.
3. Do the keycaps leave the buttons? I recommend yes, to match the instruments. Keeping them forces the row onto two lines in Russian.

## Invariants and principles

- T, B, N, the digit keys, Escape and the 400ms hover hold behave as today. Check with `hud.test.ts` and a manual try.
- A click on a part aims the selected gun or all guns, and a click on an aimed part clears it. Check with a manual try.
- On touch, the first tap shows a part's tip and the second aims. A tap that pins never clicks the card, and a tap on a disabled command shows its reason. Check at phone sizes.
- Aim targets stay at least `--btn-h-s` tall, and `--touch-target` on a phone, except the bend named under the longest content.
- A chance's rows still add up to it. Check with `hitCard.test.ts`.
- While the player is knocked out or a scene is open, commands stay off with their one reason and the card takes no aim.
- `coverUnder` restores all it hid. The card's left edge stays at 982px at 1280, so the center stays free.
- A diff under `src/sim/`, `src/data/` or `src/three/render/` means the work left its scope.

## Implementation plan

Sibling dependencies: none. `.cost` and `.selected` already exist on this branch.

Phase 1, mockup per section 13 of `docs/ui.md`, in gitignored `tmp/enemy-card-mockup/`:

- Render the real card CSS with data captured from the real game. It needs a browser, so it waits for the user's go. The gallery lacks Russian, the larger trucks and the phone, and this phase renders them.
- Offer the states above and the three decisions' alternatives on a floating control, at 1280 by 720, 1100 wide, 700 by 800 and a phone. Include buggy, gunwagon, sorokonoga, 9 guns against 6 and all perks.
- A script measures the sizes this plan estimates. Write down what the user settles, and only then build.

Later phases:

- `src/ui/hitCard.ts`: `render` takes the selected gun from `refreshInfo` in `src/three/game.ts`. `well` prints `hit.noWeapons` and a shared reason once. Update `.hc-*` in `styles/panels.css`.
- `src/ui/hud.ts` and `styles/panels.css`: `.info-body` takes two columns from new tokens `--info-draw-w`, `--info-lists-w` and `--info-card-h`, which replace `--info-lists-height`. `inspectedAimable` means the truck is not the player's, and the lock stops clicks only.
- `placeInfo` and `floorOfInfo` take the height from `--info-card-h`, capped at the log top for an enemy on a desktop layer. `growForAim` counts the lists' height and sets the width. Update `phone.css` and `responsive.css`, and `.info` shows overflow on a desktop layer for the tooltip.
- `infoHead` makes the two rows and takes the touch Close. `cardActions` moves to the end of `showInfo` and adds `costItem` from `LOOK_OVER.turns`. Buttons drop `keyCap` and put the key in the title through `keyLabel()`.
- Text: no new words are planned. A new word ships in English and Russian together, with agy writing the Russian. Remove the dead `hit.mine`, which holds an arrow, `hit.theirs` and `hit.slot` from both catalogs, and the unused `.info-part` and `.info-hp` CSS.
- Docs: rewrite the `.info-actions` entry of section 12, steps 3 to 5 of the truck hover card example and the cursor card line in 4.4 of `docs/ui.md`, and update `src/ui/guide/pieces.ts`.
- `scripts/layout-check.mjs`: `inspectNpc` takes a chassis, gun counts and perks, with new states for the sorokonoga, the longest content and the own truck. Add faults for differing outlines between two enemies at base height, a list scroll while the card can grow, a tooltip over the lists and a moved list column edge.
- Run `npm run screens -- inspect inspect-unarmed` and read the images next to `menu.jpg` and `log.jpg`.

## Verification

- Tests: `src/ui/hitCard.test.ts`, `src/ui/hud.test.ts`, `src/ui/truck-condition-css.test.ts`, `src/ui/style-guard.test.ts`, `src/ui/guide/guide.test.ts` and the catalog tests in `src/text/`. `hud.test.ts` must change, as it expects the labels `CallT` and keycaps.
- New tests: a shared reason prints once, an empty list prints "No weapons", the selected gun's row is marked and Look over shows its turn.
- `npm run layout`: `inspect`, `inspect-unarmed` and the new states, in en, ru and pseudo, at 1280 by 720, 700 by 800 and 1440 by 900.
- Manual try, positive: inspect a hostile gunwagon at 1280 by 720, press 1 and click a part. The row is marked, the number lands on the part, the chance updates and the log stays in view. End the turn, and the card keeps its outline.
- Manual try, negative: inspect a sorokonoga with 9 guns on the player's truck, in Russian at UI size 130%. Nothing clips, the commands stay reachable and off commands show their reason. Then hover the own truck, and no empty strip remains.
