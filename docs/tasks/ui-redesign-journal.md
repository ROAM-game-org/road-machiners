# Redesign the journal

Status: the phase 1 mockup is done, and its screenshots are in `ui-mockups/journal/`. The user judged it a slight improvement, so it is the starting direction for issue #1507, not a settled spec.

## Context
- The journal is a centered modal, 640 by 470 at 1280 by 720, built in `JournalScreen`. See `journal-survey.jpg`, with `town-board.jpg` as its neighbor.
- Verified, the panel scrolls through prose. One survey fills it, and the third place is cut at "Who lives in the ruins now?". Wrecks, Notes and Past would sit below that with no sign they exist.
- Verified, most of that prose repeats. "From Bowl:" and "It lies in square" print once per place, and a surveyed place still prints its whole way and picture although nothing is left to do there.
- Verified, the head is off grid. The title icon pushes the title right, so "Work" sits under the icon and the rows start elsewhere.
- Verified from the code, the player cannot read and plan together. The modal covers the center of the screen, `canOrder` refuses ground clicks while a modal is open, and Space does not drive. The player opens J, memorizes a route, closes J, and repeats.
- Verified from the code, M closes the journal, since `toggleCharacter` calls `closeAll`. A way names a square, and the map that shows squares cannot sit beside it. J also does nothing while a turn plays.
- Verified from the CSS, the empty state is a blank box. `.modal` sets a fixed height, so one line sits in 640 by 470. The gallery has no image of it, so Phase 1 needs one.
- Every kind of entry the journal can hold is listed in the states below. The brief says quests, but the journal has no quest group. A quest appears only through the notes its ink writes with `note`.
- Measured with the real map and text, over 116 pairs of shop and survey site: a way has 3 to 8 steps with a median of 4. The longest is 457 characters in English and 492 in Russian, and its longest sentence is 101 characters. The 30 notes run to about 370 characters in both languages.

## The question
Where do I drive next, and how do I find it?
- Key facts: what each held job asks, its pay, its time left, and for the place I am after, the way as steps, its square and how it looks.
- Supporting facts: danger tag, the rival mark, found and surveyed tags, claim leads, what the shop wants to learn, wreck squares, notes.
- Reference: Past, since it answers no question about the next drive. Its facts stay, in their own tab.
- Cut "From Bowl:" on every place, since the shop is said once per contract.
- Cut "It lies in square B6, on flat ground" as a sentence, since square and ground become one fact row.
- Cut the way and picture of a surveyed place, since nobody drives there again. Its row and tag stay.
- Cut the title icon, the raised note surface and the left bar on notes, since none of them carries a fact.
- Cut the words "you heard of" from the Wrecks head, since a tab of squares says it.
- Refused on purpose: a tick on the step the truck has reached, a distance from the truck, and a map mark from a step. `economy.md` says no screen measures from the truck to the place, and P6 agrees.

## Desired design
The journal becomes a panel on the right edge that leaves the world live. The player reads the way and clicks the ground beside it, and Space drives with the panel open. One entry is open at a time, so only one way is on screen.

Scope: layout, input routing and text keys. No game rule, save field or sim query changes.

The window at 1280 by 720, the smallest supported:
```
+----------------------------------------------------------------------+
|                                                              [Menu]  |
|                                     +----------------------------+   |
|                                     | Journal             Close  |   |
|                                     | [Work][Wrecks][Notes][Past]|   |
|     the world, live                 | the open list, see below   |   |
|     the center is clear             | 396 wide, up to 402 tall   |   |
|     ground clicks plan a path       |                            |   |
|                                     +----------------------------+   |
| truck diagram                                   +-----------------+  |
| +-------------------------------+               | Log             |  |
| | instruments                   |               +-----------------+  |
| +-------------------------------+                       speed keys   |
| weapons                                                 [End turn]   |
+----------------------------------------------------------------------+
```
The panel with a survey open:
```
Journal                                             Close
[Work] [Wrecks] [Notes] [Past]
icon Survey homestead, hamlet [Risky]   +30  1 d 13:30 left
   A farmstead with a tall tower                      B6
   +-----------+ Square B6, on flat ground
   | picture   | Does anyone still work the farm?
   | 132 by 99 |
   +-----------+
   From Bowl
   1 Leave by the north gate.
   2 Take the road to Nose, heading north-east. It's a long haul.
   3 At the water tower, leave the road and head south-east
     and a touch east, a short way.
   A farmstead with a tall tower              D6  [found]
   A cluster of ruined houses                 D6  [surveyed]
icon Haul 6 crates of Meds to Dustwell  +984  5:00 left
icon Recover MG from an army truck in square C4  +90  8:00 left
```
1. The journal leaves the center for the right side zone, inside `.right-dock`. That zone's job is what the player is waiting on, and its cost is that the radio and the contracts panel hide while it is open.
2. The panel is 396 wide at 1280, the room left of the 444 wide call notice, and at most `--panel-l`. So a call never lies over it. It ends at x 868, and the instruments end at 829.
3. Height follows content, growing up from the log to `--modal-top`. It covers 17% of the window at most, against 33% today, and the empty panel covers far less.
4. The log, speed keys and End turn stay in view, since the player may drive with the panel open and must still see events.
5. Tabs are the four groups the journal already has: Work, Wrecks, Notes and Past, as `.tabs.sub`. A tab with nothing in it is absent. The panel keeps the last tab for the session.
6. The way prints as numbered steps through a new `.way-steps` piece. A numbered line lets the eye come back from the world to the same place, which a paragraph does not. "It's a long haul." stays on its step.
7. An entry opens with a click, one per tab. Work opens the first contract with something to show, on its first place not surveyed. Notes opens the newest.
8. A row with no detail, like a haul, takes no click and no hover, by section 6.
9. Contract rows use the short claim wording of `dockSummary`, and the full clue moves into the open entry. A full claim clue runs past 100 characters, which a row beside pay and clock cannot hold.
10. A note closes to its title and day, and opens to who told it and the text. Thirty notes become a list of titles instead of a wall.
11. A wreck row follows P22: the square as label and the count at the right edge.
12. Text uses `--text-dense`, the size of HUD panels. The title is `.panel-title`, since this is now a HUD panel.
13. J now works during a turn, since the panel holds nothing up.

The modal form stays for the places a side panel cannot work: over a scene, on a phone, on a layer of 1100 wide or less, and on a layer under 720 tall. It holds the same tabs and rows in 640 wide, and its height follows content, so the empty box goes away there too.

States, and how each holds:
- Empty, and always empty in Chaos Highway: head and one line, directly above the log.
- Rows with no detail: a haul, normal, rush or late with its bounty clock, a procure, a search, met or not, and an escort with each status and no deadline.
- Rescue: need tag on the row, where in the open entry, and the met wording with no detail.
- Claim: open entry with the full clue and 0 to many leads, with the rival mark on the row so it shows when closed.
- Survey: 1 to 3 places, each unfound, found or surveyed. A place with no told way keeps its compass clue as one line, and a met survey is a row saying where to report.
- Survey picture: loading or missing keeps the striped box at the same size.
- Wrecks and Notes: many squares and up to 30 notes, and the list scrolls.
- Past: up to 30, each of done, failed, late, lapsed and ended early, with money above, below or at zero.
- Longest way: 8 steps in Russian comes to about 11 lines by character count, so the open entry is about 313 tall. The list holds about 330, so the entry fits whole and closed rows scroll out. This is an estimate, and Phase 1 measures it.
- Three contracts with a survey open and a median way: about 330 in English, so it fits. Russian rows may wrap and scroll one row.
- Largest truck: no effect, since no truck is drawn. Smallest window, Russian and a refused action: above and in the form rules, and the journal has no action to refuse.
- Cursor on a truck: the card takes the column above the log and the panel hides until the card goes. `coverUnder` already does this for dock children, and `floorOfInfo` must stop reading the hidden radio.
- Wanted well: stays above the panel, since it is a state that must stay visible, and takes from the panel's height.
- Open call, knocked out, Menu panel open: the panel stays and takes no key, and J stays a look control.
- Town page, inventory or character screen opens: the panel closes through `closeAll`.

Principles applied: P1, P3 and P18 set the place. P7, P12 and P17 set the cuts. P6 sets the refusals. P8 keeps one contract row and P20 keeps Close on the title row.

Principles bent: P2, since notes and wrecks are one click away and an open way is one click from the next. The world in view is worth more than every way on screen at once. P14, since height follows content, because P18 forbids an empty block over the world. Width and edges stay fixed. P26, since a HUD panel takes `.panel-title`. Section 4.1 places a modal for a task that takes the whole attention, and this reading does not. P25 does not apply, since this is a reading list. The list may scroll, and the open entry may not.

## Cost
- The radio screen, its next key and the contracts panel are hidden while the panel is open. That panel is the only place a hired guard's row shows.
- Hovering a truck hides the directions until the cursor leaves it.
- Two ways or two pictures cannot be compared side by side, and notes take a click to read.
- Text drops from 14 to 12 and the column narrows, so the same way takes more lines. It reads smaller than today.
- A phone, a narrow or compact layer and a short layer keep the modal form, so they do not get reading beside the world. At 115% UI size on 1280 by 720 that form is 376 tall, so a long way scrolls there.
- Input gets more complex: two forms of one screen and a screen that holds no input.
- Numbered steps show an existing fault plainly: "At Nose, turn right. At Nose, turn left."

## Open decisions for the user
1. Side panel with a live world, or a wide modal with the list left and the way right? The modal is simpler and shows more, but the player still memorizes a route and closes it. I recommend the side panel. Phase 1 renders both, so the choice can be made by looking.
2. Keep the panel open over the Map tab? The player then reads a square and clicks that square, but the panel covers 396 of the map's width. I recommend yes, after the character plan settles the map.

## Invariants and principles
- World state is untouched: same save shape, same `player.notes`, `pastContracts` and contracts. Check that `npm run save:shape` writes no change.
- `directionsText` output stays the same for the radio. Check with a test that the joined steps equal the old text.
- Space drives with the panel open, even after a click on a tab, and never presses the focused tab. Check by keyboard test.
- Escape closes the panel first and then does what it did. J toggles. Check both with the panel open and closed.
- Ground click, Shift-click, digits, Q, X and arrows work with the panel open, and work as before with the modal form. Wheel over the panel scrolls the list, since only the canvas zooms.
- A redraw while a turn plays keeps the open entry, the scroll position and the picture, and `surveyWay` runs only for the open place.
- Look mode: J over a scene opens the modal form at `--z-over-scene` with its scrim, and Escape leaves the scene on the same paragraph.
- Touch: 32 real pixels per target, and a tap on a row opens it. A phone keeps its head wrap in `phone.css`.
- Opening and closing still play `ui-open` and `ui-close`, which today come through `blockingOpen`.
- The opening tip stays at top center, since no modal is open. Check that it clears the panel at 1280.
- Nothing marks a place on the map or the ground.

## Implementation plan
Phase 1, mockup. Build it in `tmp/` per `docs/ui.md` section 13, with real pieces and captured data. Offer both forms from decision 1, each state above, English and Russian, and 1280 by 720, 1113 by 626 and 700 by 800. A script measures the open entry in the longest way. I need images the gallery lacks: the empty journal, Notes and Past full, and Russian.

Phase 2, the steps. In `src/ui/directions-text.ts`, add `directionsSteps`, which returns one Msg per step with its long-haul sentence, and build `directionsText` from it. Add `.way-steps` to `components.css`, `docs/ui.md` section 12 and `src/ui/guide/pieces.ts`.

Phase 3, the body, still as the modal. Rewrite `src/ui/journal.ts` with tabs, one open entry held per tab in the screen, and render skipped when content is unchanged. In `src/ui/contract-row.ts`, make `heldContractRow` use `dockSummary`. The contract board plan keeps this function for the journal and adds its own rows, so the journal owns it. Move the journal rules out of `shop.css` into a new `styles/journal.css`. In `src/ui/format.ts`, drop `surveyWayText` and `contract.surveyWay` if nothing else uses them. Add `journal.from`, `journal.tab.wrecks` and `journal.wreckCount` in English, with Russian from agy as `game/CLAUDE.md` requires, never from Claude.

Phase 4, the side panel. In `src/three/screens.ts`, make `blockingOpen` count the journal only in modal form, and move its root into `.right-dock` when it opens in side form. In `src/three/game.ts`, change KeyJ, Escape and `playPanelSounds`. In `src/ui/input-mode.ts`, add a `short` class for a layer under 720 tall. In `src/ui/hud.ts`, change `floorOfInfo`, and leave `journalButton` on while busy. Skip this phase if decision 1 picks the modal.

Phase 5, the map, only with yes on decision 2. It depends on the character plan.

Phase 6, the double turn. Read `src/sim/directions.ts` on the Nose route from the measure and fix the repeated "At Nose" in the same change, since the radio says it too. The follower test in `survey.test.ts` must stay green.

Phase 7, docs and images. Update `docs/ui.md` sections 4.1 and 4.2, the Wrecks and `.survey-picture` lines, and add a worked example. Update the journal paragraph of `docs/wiki/mechanics/social.md`. Add `journal-empty` and `journal-notes` to `docs/screens/README.md`, then run `npm run screens -- journal-survey journal-empty journal-notes`.

Layout checks: in `scripts/layout-check.mjs`, add `journal-empty`, `journal-longest`, with three contracts and the longest way found by search rather than by id, `journal-notes` with 30 notes, `journal-past` with 30 records, and `journal-over-scene`. Each fails when the open entry scrolls at 1280 by 720, or when the panel touches a call notice, the instruments or Menu.

Named dependencies: the contract board plan takes the full way off its held rows and points to the journal, so the journal is the one screen that prints it, and that plan may reuse `.way-steps` in its tooltip. The character plan owns the Map tab. Town shell shares nothing with this screen.

## Verification
- Test files: `src/ui/journal.test.ts`, `src/ui/contract-row.test.ts`, `src/ui/hud-contracts.test.ts`, `src/ui/format.test.ts`, `src/ui/style-guard.test.ts`, `src/ui/guide/guide.test.ts`, and the survey way block of `src/sim/survey.test.ts`.
- New tests: every kind of entry draws in its tab, a surveyed place has no way or picture, an empty tab is absent, joined steps equal the old text, and a redraw keeps the open entry.
- `npm run layout` states: `journal-survey` and the five new ones, in English, Russian and pseudo-long, at 1280 by 720, 700 by 800, 390 by 844 and 640 by 360.
- Manual try, positive: take a survey, drive out of town, press J, click the ground beside the panel and press Space. The truck drives, the way stays on screen, and the log still updates.
- Manual try, negative: with an empty journal press J, and only a small panel shows above the log. Hover a truck and the card replaces the panel. Press Escape during a quest scene and the scene stays on its paragraph.
