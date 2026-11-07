# Character screen redesign

## Context

- `character.jpg` at 1280 by 720: the frame is 470 tall, since `--modal-reserve` keeps 250 for the instruments. Standing takes about 225, so the skill table gets about 150 and scrolls inside.
- The clipping complaint is true and understated. Machining cuts off, and Toughness and Social are not on view at all. That breaks P25, and `npm run layout` passes it because one scroll area is not a fault.
- The Buy clip is true. Three 260 tracks, the content columns and six 16 gaps are wider than the 1200 inside the frame.
- The far apart complaint is true. Perk tracks are 276 apart and hold names about 60 wide, and a third 260 track holds one small meter.
- The standing complaint is true: a 300 wide list with an empty block of about 900 by 225 beside it.
- A locked or picked perk has its rule only in a title. "Buy 200 XP" holds its cost inside the button, against section 8 of `docs/ui.md`.
- Real content: 5 skills of 5 ranks, 5 basics, 10 perk pairs of 20 perks, and 7 factions. The data has 8 organized factions, and `standingBands` keeps the 7 a driver can join. The longest perk rule is Bounty hunter, 114 characters in English and 133 in Russian. The longest basic rule is Overdrive, 135 and 140.
- `world-map.jpg`: the map sits under the title Character, with health, knockouts and XP chips that do not help choose where to drive.
- The empty column is not a layout column. It is the area off the map sheet, and its width follows the truck. `clampPan` lets the view centre reach the sheet edge and the view opens on the truck, so this seed shows about 300 of void.
- Bugs found by reading the code, not yet seen on screen. C uses `toggleCharacter`, which never sets `over-scene`, so the screen does not lift over a scene as section 4.1 says. A Map tab click checks `playerCanAct`, which ignores a live scene. `docs/ui.md` says the map opens on the truck and also that "Each open starts at the whole map", and the code opens on the truck.
- Knockouts is a counter that no rule reads. Each rank grows numbers in `SKILL_EFFECTS` that no screen names, and ranks 3 and 5 buy only those.

## The question

- The question: what do I spend my XP on, and if a pair is open, which perk do I take?
- Key facts: the XP pool, each skill's rank and next cost, and the effect of every perk the player can still get.
- Supporting: each skill's basic, XP earned today per skill with its cap, and which perks were picked.
- Second subject, the record: health and standing. They answer no XP choice, but no other screen lists standing and the new frame hides the health readout.
- Reference, on hover: a basic's rule, a passed-over perk's rule, a skill's XP sources, the causes of a standing score.
- Cut the knockouts chip, since nothing depends on it. Cut the head chips, since P21 keeps that row for the title and the way out.
- Cut the words Skill, Rank and Rank 1 basic, since icon, pips and position show them. Cut the heading Standing, since faction names with neutral or wary tags show what the list is.
- Cut the tabs, since each screen now has one subject. Cut the accent on the XP number, since accent means the player's choice.
- Cut a passed-over perk's sentence, since a pick is permanent and it can never be taken.

## Desired design

The player presses C and reads all 5 skills, all 20 effects and the record at once, with no scroll at 1280 by 720, in English and Russian. The map becomes its own screen. Scope is the character screen, the map's frame and the map's void. Rules, save shape and the map's look stay as they are.

Sketch at 1280 by 720. `[x]` is a picked perk, `| |` is an open pair of two buttons, and a name alone is a passed-over perk.

```
Character                                                                        [Close C]

1,240 XP                 Rank 2 perk: pick one                 Rank 4 perk: pick one
Since 7:00, max 55 XP
Driving       #....      Rammer            Cold running        Steady aim       Dust screen
[Buy] 400 XP             A ram on a hostile Below half speed,  Your own speed   At top speed on
Overdrive  ===-- 32      truck stalls its  your engine is      adds no scatter  dusty ground, your
                         engine one turn.  heard only by ...   to your shots.   dust blocks sight.
Perception    ##...    | Read the driver | Spotter          |  Cargo eye        Night eyes
[Buy] 1,200 XP         | You see the     | Mark a seen      |  You see the      Night does not
Look-over  ----- 0     | traits of other | truck, tracked   |  goods in any     halve your sight.
                       | drivers.        | for 2 hours.     |  seen truck.
Machining     ###..    [x] Welder          Teardown            Rebuild          Road mechanic
[Buy] 2,200 XP         A field job turns 3                     A town garage    Drivers pay double
Roadside patch == 18   scrap metal into a                      can repair a ... for your patches.
Toughness     #....      Desert rat        Storm rider         Fight through    Long haul
[Buy] 400 XP             Noon sun heats    Dust storms do not  A broken cab ... You heal while
First aid  ----- 0       your engine ...   cut sight or aim.   does not knock.. driving ...
Social        #####      Market ears     [x] Rumor mill        Paid truce     [x] Bounty hunter
Max                                      A driver you call                    You see the bounty
Acumen     ===== 55                      tells you of a ...                   on a wanted truck ...

Health            89 / 100   Bowl         5 neutral   Nose        5 neutral   Guidestar Guild 10 neutral
Scrapjaw        -30 wary     Kiln       -30 wary      Sunward   -20 wary      Marshalls        0 neutral
```

1. The frame takes the full height from `--modal-top` to the bottom edge, like the inventory, capped at `--modal-height`. Reason: 20 sentences cannot fit in 470. The body becomes about 1200 by 550, measured from `inventory-empty.jpg`.
2. Height check for the worst state, every pair open in Russian. A 12px line is 17 tall and a perk cell is about 243 wide, or about 42 Russian characters. That width comes from about 4.7 pixels per character in the gallery, and the mockup must measure it. Rows come to 420, the head 34, the record 48 and gaps 20, so 522 of 550.
3. One row per skill and four perk cells across, sharing the body in `1fr` rows. Reason: the player compares across skills, and a pick never moves another row.
4. The skill block is three lines: icon, name and pips, then Buy and its cost, then the basic and the daily meter. Reason: all of one skill sits where the eye starts its row, and the separate meter track goes away.
5. Buy becomes one verb with the cost beside it, and Max takes the slot at the top rank. Reason: section 8, and one Buy width in each language.
6. XP sits above the Buy column in value ink, with "Since 7:00, max 55 XP" as its caption. Reason: the budget sits over the buttons that spend it.
7. "Rank 2 perk: pick one" heads each pair, from the existing `character.pick`. Reason: it says once that a pair is one or the other.
8. A pair is locked, open or picked. Locked is both names and sentences in muted ink. Open is two `button.perk` with an accent edge on the pair, not a wash on the row. Picked is the selected look with its sentence, beside a faint name with its rule on hover.
9. The record is a pinned strip of one form rows in four columns: label, value at the right edge, tag. Reason: P12, a panel that cannot scroll grows sideways, and 48 replaces 225. Its tooltip opens upward inside the frame, and the right column's tip aligns right, since a tip can reach 12 rows.
10. The opening tip hides on this screen and returns on close. Reason: the frame leaves no margin and no tip names this screen.
11. The map becomes `MapScreen`: title Map, then − and +, then Close [M]. Reason: P21, since where to drive is another question. C and M stay separate toggles, and each switches from the other screen.
12. The map keeps today's frame, so the instruments stay in view. Reason: fuel and the clock tell whether a place is in reach.
13. `clampPan` holds the view edge at the sheet edge on any axis the view cannot hold whole. Reason: this removes the void. The bars at whole map zoom stay, since a square sheet in a wide frame has to leave them.
14. Fit ladder, sized for the largest content per P14. On open, and when the room or language changes, a hidden draw with every sentence sets the row heights and `.tight`. Both hold across buys and picks, the way `chooseLayout` holds its fit, so a click never moves a row. Tight moves the Since caption to XP's title, folds the skill block to two lines and takes the wide gaps down. A window that still overflows scrolls the table only, with head and record pinned. No step hides a perk's sentence, since those are key facts.
15. A phone or `narrow` layer stacks each skill with every sentence and scrolls, as the inventory does there.
16. M does nothing while a scene is live, and a map click refuses while `lookReason` is set. Reason: routing C through `toggle` makes `lookOver` true, so `quest-screen.ts` lets M through, and section 4.1 names only I, C and J as look keys.

States and how the layout holds them. The gallery holds only the first one, so the mockup has to render the rest.

- No XP at rank 0: Buy is off with its `needsXp` reason, and the cost stays, since it is the reason. With XP: Buy is on and the HUD Driver mark is unchanged.
- One pair open, both pairs of a skill open, all 10 open: item 2 is the worst case, and open cells keep the size of locked ones.
- All picked and all ranks at 5: passed-over sentences go, so rows gain space. XP over the daily cap: the bar stays full and the number prints above 55.
- Knocked out: Buy and perks are off with the reason from `lookReason`. Towed or on the radio, buying stays on, as today.
- Over a scene: look state with "Not during a scene" and the scrim, after the bug fix.
- Chaos Highway: no map and no factions, and every skill starts at rank 1. The record holds Health alone and the rows take the room.
- Bands: hostile keeps danger ink on the tag and the other four stay dim. A score runs from −100 to 100. A long tooltip has 12 rows: Base, 10 deed kinds and Earlier.
- An eighth faction: 9 cells give the record a third row, and the table gives up 24.
- Russian: "Гильдия Путеводной звезды" and "насторожены" fit a cell of about 290, and a cut name has its title. Pseudo text goes to tight.
- UI size 115% and 130% at 1280 by 720, layers of about 1113 by 626 and 985 by 554: tight. At 130% the body is about 410 tall, so the table scrolls in every state. At 115% it can scroll in Russian.
- 1024 by 768: the mockup decides whether it fits in full. 700 by 800, phone and slim stack and scroll. The largest truck does not apply, since no truck is drawn here.

## Cost

- At full content the screen is a wall of 20 small sentences. It gets quieter only as picks are made.
- A basic's rule is one hover away. Rank 1 is the cheapest rank and has no pick, so this is where height is given up.
- The instruments and the log hide under the character screen, so fuel, money and the purchase's log line are out of view while it is open.
- A mouse player here reaches the map with Close and then Map, one click more than the tab.
- At UI size 130% on 1280 by 720, the table scrolls, and it can at 115%. The 700 by 800 window also scrolls. Near a sheet edge the truck is no longer at the centre of the opening map. The knockout count leaves the UI.

## Open decisions for the user

- All 20 sentences on view, or one selected skill's detail beside a short list of 5? Recommendation: all on view. The detail form is calmer, but it hides four skills during a choice between skills. The mockup can show both.
- Does the map leave Character? Recommendation: yes, as its own screen with today's frame, since it answers another question.
- Show what a rank grows? Recommendation: yes, in the skill name's tooltip, as rows per rank from `SKILL_EFFECTS`. Ranks 3 and 5 buy nothing else and spent XP never comes back. It needs new English and Russian text and no rule change. The argument against is DESIGN.md's no hand-holding.
- Standing here or in the journal? Recommendation: here. It costs 48 of height and it is a glance. The journal would make it a dependency on that plan.
- Keep the knockout count? Recommendation: cut it. As a memento it would take one cell in the record.

## Invariants and principles

- `buyRank` and `choosePerk` keep their refusals. Check with `character.test.ts`.
- C, M, Escape and the Driver and Map buttons behave as before, including `!anim` and the Menu taking every key. A minimap click opens the map. M does nothing on Chaos Highway or during a scene. Check with `scripts/ui-playtest.mjs`.
- Map click, Shift click, drag, wheel and zoom limits stay. With a live scene, a map click sets no order. Check with the map tests.
- Focus reaches every Buy, perk and score in reading order. Touch keeps `--touch-target` on perk buttons, and a long press opens a title. `mobile-check.mjs` selectors `.skill-buy`, `.perk-cell`, `.skill-level`, `.skill-today` and `.skill-table` keep their names.
- Applied: P2 for perks, P12, P21, P22, P25, P26 and section 8. P24 holds as written, since a perk's effect is what no number can say.
- Bent: P2 for basics, as above. P25 at UI sizes above 100% and at 700 by 800, where the inventory's stacked form in section 12 is the precedent. P1 for the record, which answers no XP choice and sits apart by space. P21 on the map head, since − and + act on the map the title names, so P20 still reads true and no overlay covers place names.
- Not taken from the inventory: three columns, wells, a job block and a shrink to fit frame. This screen has no subject to work on and no selection.
- Dependency: the town shell plan owns the town frame. `ui-playtest.mjs` asserts that town and character share one frame, and after this change the map holds that frame. If town shell changes its frame, that plan owns the assertion.

## Implementation plan

1. Mockup per section 13 in `tmp/character-mockups/`, from real pieces and captured worlds: rank 0, mid game, all pairs open, all picked, Chaos Highway and knocked out. A floating control picks state, language and window, and a script presses every button and measures overflow. Settle the open decisions here.
2. Split the map. Add `src/ui/map-screen.ts`, and rename `MapTab` to `MapBody` with its test. In `src/three/screens.ts`, add the map to `all`, drop `CharacterTab` and route C through `toggle`, which fixes the scene bug. Change `KeyC`, `KeyM` and `openMap` in `src/three/game.ts`, with `KeyM` off during a scene. Add the `lookReason` check to the map click. Remove the tabs and `map-open` from `src/ui/character.ts`. Update `src/ui/styles/map.css`, the head selectors in `inventory.css` and `phone.css`.
3. Fix the void. Change `clampPan` in `src/ui/map-geometry.ts`, and update the `map-geometry.test.ts` case "keeps the view centre inside the map square". `fitted` and the follow view stay.
4. Build the body. Rewrite `skills`, `row`, `buy`, `perkCell` and `standingGroup` in `src/ui/character.ts`, with the fit measure on draw and resize. Move the rules from `shop.css` to a new `src/ui/styles/character.css`. Rewrite the stacked rules in `phone.css` for `narrow` too. Add `.character-screen` to the rules in `modal.css` that hide the instruments, log and tip.
5. Text in `src/text/en/` and `src/text/ru/`. Add a one word Buy key, and remove `character.buyShort`, `colSkill`, `colRank`, `colBasic`, the knockouts keys and `character.tab.skills`. Rank effect words go here if approved. agy writes the Russian per `docs/writing/russian.md`, never Claude.
6. Docs. In `docs/ui.md`, update 4.4, the map entry with the "whole map" sentence removed, the minimap entry and `.standing`, and add a worked example. Update `docs/wiki/mechanics/character.md` on the Rank 1 and XP columns, `docs/wiki/mechanics/economy.md` line 85 and `docs/screens/README.md`.
7. Checks. In `scripts/layout-check.mjs`, add `character-open`, `character-picked`, Chaos Highway and over-scene states with seeded ranks. Add `characterFaults`, modelled on `inventoryBenchFaults`, which fails on any desktop scroll at 1280 by 720 and on any row, Buy, perk cell or record row out of view, in en and ru. Add `character` to `SIZE_STATES`, with a scroll of the table allowed only under `.tight`. Change `scripts/ui-playtest.mjs` lines 697 to 710 and its `[data-tab=map]` check.
8. Images. Run `npm run screens -- character character-open character-picked world-map`.

## Verification

- Test files: `src/ui/character.test.ts`, the renamed `src/ui/map-tab.test.ts`, `src/ui/map-geometry.test.ts`, `src/ui/quest-keys.test.ts`, `src/ui/style-guard.test.ts`, `src/text/coverage.test.ts`, `src/text/catalog.test.ts`.
- New cases: M opens a screen titled Map with no Skills tab, C over a scene sets `over-scene`, a map click during a scene sets no order, a passed-over perk prints no sentence, and the view edge stays on the sheet.
- `LAYOUT_STATES=character,character-open,character-picked,world-map npm run layout`, in en, ru and pseudo at 1280 by 720 and 700 by 800, then phone and the UI size passes. Then `npm run ui-playtest` and `npm run mobile`, one at a time and muted.
- Try positive: with XP cheated, press C at 1280 by 720 in Russian with all pairs open. Read Bounty hunter in full, buy a rank, pick a perk and see no row move. Press M, click the ground, press M, and Space drives there.
- Try negative: knocked out and over a scene, Buy and perks stay off with the reason, a click changes nothing, and Escape returns to the same paragraph. With 0 XP, Buy spends nothing. Near the west sheet edge the map opens with no void.
