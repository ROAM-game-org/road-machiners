# Contract board redesign

Status: the phase 1 mockup is done, and its screenshots are in `ui-mockups/contract-board/`. The user judged it a slight improvement, so it is the starting direction for issue #1507, not a settled spec.

## Context

The board is a section of the town page. Images: `town-board.jpg`, `board-taken.jpg`, with `journal-survey.jpg` as its neighbor. It lists offers, then the contracts the player holds, one over the other in the 680px text column.

I checked the three starting complaints against the images and the code.

- Taken contracts fall below the fold: true. In `board-taken.jpg` the held row is cut at the foot, and its Deliver or Report button can sit out of view. The two survey rows and the haul take about 240px of about 350px of panel. The spent Taken row keeps its full prose height, and the new held row adds more under it.
- Rewards are hard to compare: partly true. Pay does line up in one column inside each list. The faults are elsewhere. Row heights differ, so pay figures sit 70px apart with prose between them. Offers and held rows are two separate grids. Nothing beside pay says how far the job goes.
- Pay also means different things. A procure reward holds the crate value, `units * cratePay`, and a claim reward holds the part's full value. Both read like clear pay next to a haul.
- The offers hold long prose: true. A survey names its kind three times: in the title, at the start of each clue and in the look line. A held survey prints the full journal directions on the board.

I also found these faults.

- Accept on a haul has no refusal for free cells or debt. `refusal` in `town.ts` never calls `haulBlocked`, though the radio path does. `loadHaul` throws a plain Error, so the player reads "That did not work." This is a bug, and the design fixes it.
- `contract.placeClue` has no closing period and `surveyPlaceLine` adds the look line after a space. So the row reads "in a hollow Rusted boats". Russian has the same fault.
- The clock column mixes meanings: a window counted from acceptance, an escort's "leaves in", and a held row's time left, Ready or bounty time. The window's meaning lives only in a title.
- `.ink-panel` has its own scroll inside `.ink-scroll`, and `town-board` has no `nestedScrollFaults` check.
- A survey of two boat wrecks reads "Survey boat wrecks", because the title removes duplicates. The place count shows only in the prose.

The seven contract kinds and what each needs from the player:

- Haul, also as a rush haul: free cells for the crates now, no debt, shop stock. Carry it to a named shop. Late pays nothing, and keeping the crates brings a bounty.
- Procure: bring crates from anywhere and hand them in here. Nothing is needed to accept. The offer must never say where the good is sold.
- Claim: find one named part in a wreck and bring it back. A rival may race the player. It cannot be dropped.
- Search: one free cell for the parcel and no other search held. The target moves, so no distance exists.
- Survey: one to three places, found by eye and surveyed while parked. No truck check.
- Escort: a win chance over the trader that meets the road's minimum, and no other escort held. It has no deadline, and the offer leaves with the trader.
- Rescue: a driver who needs fuel, repair or a tow, at a known place. Nothing is checked at accept.

## The question

Which of these jobs do I take with my truck, given what I already hold?

Handing in a contract is the action on a held row, not a second question. The three held slots limit the choice.

- Key facts on every offer row: a short title, pay, time, how far it goes when the board knows, and what it asks of this truck when the game has a query for it.
- Supporting facts: the danger tag, grid squares, trader name and speed, pay per crate on a procure, and a rival's name.
- Reference facts, in the tooltip: each survey place's full clue, the pay breakdown of a procure or claim, what a window counts from, and a haul's mass after loading.

Cut from the rows, each with its reason:

- The survey lay and look lines leave the row. The title names the kind and the square places it. Both matter once the truck is out there, and the journal holds them.
- The held survey's full directions leave the row. They help the drive, not this choice. They stay in the row's tooltip and in the journal.
- The heading Offers goes. The page title is Board, and the other list carries its own name.
- The repeated "from Bowl" and "of Bowl" go when the clue measures from this shop, since the player stands there.
- No pay per kilometer and no pay per hour. A window is not a trip, and procure pay is not net, so a rate would look exact and mislead.
- No sort. A town holds 3 slots and a stall holds 1, so a sort adds movement and no clarity.

## Desired design

The player sees every offer and every held contract at once, with pay and time in straight columns. They can tell whether the truck can take each job before clicking. Offers sit on the left. Your contracts sit in a fixed right well. Scope is this panel only. No rule, save field or contract kind changes.

Sketch at 1280 by 720, Bowl, one contract taken. The band, chips, heading and Back belong to the town shell.

```
Board
A plank wall of notes nailed over older notes.
                                 need       far            time            pay  action     | Your contracts 1 / 3
[i] Survey boat wrecks                      east 2.1 km    6 h            +779  [Taken ]   |
    D6, C6  [Safe ground]                                                                  | [i] Survey boat wrecks
-------------------------------------------------------------------------------------------|     0 of 2 surveyed
[i] Haul 6 crates of Meds to     [#] 6 / 12 north 3.4 km   5 h            +984  [Accept]   |     6:00 left       +779
    Dustwell  [Risky road]                                                                 |     Report at Bowl
-------------------------------------------------------------------------------------------|
[i] Escort a trader to Nose      72 / 65%   north 4.0 km   leaves in 0:30 +458  [Accept]   |
    Hester Kessler, 40 km/h  [Risky road]                                                  |

[1. Back]  status line
```

The words need, far, time, pay and action mark columns for this sketch only. The screen prints no column heads, since icons and units name them.

Each change and its reason:

1. The panel uses the existing `.ink-panel.wide`, with offers left and a fixed-width well right. Five value columns and a title do not fit 680px in Russian. Two lists side by side put held rows above the fold in every state.
2. Your contracts sit in a `.well`, per P15. A held row and an offer look alike and mean different things. The heading keeps its count, since that count limits the choice.
3. The offer row has one form for all seven kinds: icon, title with caption under it, need, far, time, pay, Accept. Pay sits next to Accept like a shop price. Values share grid columns, so the eye runs down one edge.
4. The title is one short phrase. A claim uses the short `dockSummary` form, and its territory and piece move to the caption. Long titles wrap and never clip.
5. The need column prints what the job asks of this truck, from existing queries only. A haul prints the cells icon and needed against free, as `6 / 12`, using `freeCells`, the count `haulBlocked` checks. Over the limit prints in danger ink. A search prints the cells icon and 1, in danger ink when `searchRefusal` says no room, since a parcel needs a fitting spot and not just a free count. A procure prints spare crates against wanted, as `2 / 6`, with the `cargo` icon and no danger ink, since accepting is allowed. It uses `spareGoods`, because crates owed to a haul cannot serve an order at hand-in. An escort prints win against need from `escortFit`, as `72 / 65%`. Rescue prints its existing need tag, which moves here from before the name. Claim and survey leave the slot empty.
6. The far column prints a compass word and a distance. Haul and escort measure from this shop to the destination. Claim and rescue use the numbers their clue already has. Survey prints its farthest place only when the clue's landmark is this shop. Otherwise the slot stays empty, because a clue measured from another place would read as from here. Procure and search stay empty, because the first is secret and the second moves. Nothing measures from the truck, per P6.
7. A survey caption prints one square per open place, such as `B6, B6`, so the place count shows. The whole clue opens in a tooltip on the caption.
8. A procure caption adds the pay per crate. A dotted underline on pay opens a Base and step breakdown for procure and claim, per P5.
9. Accept gains the missing refusals through a reason function that follows `haulBlocked`: too few cells names the shortfall, and debt names the debt. The sim checks stay as they are.
10. A held row prints title, then clock and pay, then its action or status. A survey adds `surveyProgress`. The full directions go to the tooltip.
11. The placeClue period bug is fixed in English and Russian.
12. A spent row keeps its slot through `RowSlots`, and with short rows it no longer pushes anything out of view.

States and how the layout holds each:

- Each of the seven kinds, a rush haul, and a claim with a rival: one row form, with empty slots kept. The rival line joins the caption.
- Refusals on Accept: three held contracts, too little stock, cells short, in debt, already escorting, truck too weak, already searching, no cargo room for the parcel. Each is one short reason in the shared tooltip, and need turns danger where it names the cause.
- Held, here and ready: Deliver, Claim or Report as a button. Held, here and not ready: a disabled button with its reason. Held elsewhere: "Deliver at X" as a note that wraps.
- Late haul: Late replaces pay, and bounty time replaces time left. Met contract: Ready. Escort: Waiting, Holding, Apart or Stuck with turns left, and No deadline in the title.
- No offers: "No offers." sits on the first row, and the well stays. A stall with one slot: one row, and space stays at the end of the list, per P14.
- No held contracts: the well shows only its heading. All three held plus three spent offers: about 200px of well and 170px of list, inside about 350px.
- More escorts than slots: `postEscortOffer` pushes past `contractSlots`, so no cap exists. Only the offer list scrolls, and the foot never moves.
- A refused command: the status line in the foot, as today.
- Longest content: Russian `contract.salvageAt` and the pseudo-long check. Size from them. A row takes three lines at most at the desktop width, and the three held rows fit at that height.
- Largest truck: only the band chips and the `/ free` figures change. No drawing lives here.
- Smallest window, 1280 by 720: as sketched. UI size 130% gives a layer of about 985 by 554 and about 280px of panel. The two columns stay there, with the well at `--inv-side-width` and about 660px of offers, since stacking would drop every offer below the fold. Each list then scrolls alone if Russian overflows it.
- `narrow`, meaning 700 by 800, and the phone stack with your contracts first, in one scroller. A phone row moves the value columns to a line under the title.
- Nothing picked and each kind of pick: the board has no selection, and each row carries its own action.
- Work running, a queue and an open plan: these do not apply. No timed work or plan lives on this page.
- Look mode: this page does not open as a look screen. Under a live quest the town page hides as today.

## Cost

- The panel gets wider, so the board no longer shares the text column of the Bar and People. This widens the bend of P13 and P14 already recorded for Garage and Market.
- A survey's lay and look, and a held survey's directions, are one hover away on the board. On touch they are one long press away.
- Row height follows wrapping, so rows are not one size in Russian. The columns stay put.
- Showing distances and win chances on every row gives away more than today, when the win chance prints only on refusal.
- The far column is empty for procure and search, so those offers are harder to compare. The rules require that.
- At UI size 130% a list may scroll in Russian, and the narrow layouts scroll, so P25's no-scroll test holds only at 100% and below on a desktop.

## Open decisions for the user

1. Should a haul or escort show distance to a place the player has not found? Recommendation: yes. Claims, surveys and rescues already tell a direction and distance from the shop, and a job poster would say where to go. The other choice is an empty far slot until the place is known.
2. Should hauls, claims and rescues also carry the danger tag? Recommendation: yes, through `routeThreat` and `threatAt`. An escort offer already names the same road, and danger is what a driver weighs next to pay. The other choice keeps danger on escorts and surveys only, and leaves discovery to the road.
3. Should your contracts sit in a right well, or on top across the full width? Recommendation: right well. The top form lines up all columns, but it pushes the offers down and puts title and pay far apart. The mockup offers both.

## Invariants and principles

- Applied: P1, P2 and P5, since each row answers the question and each number and refusal explains itself. P6, since nothing measures from the truck and procure stays secret. P7, P12 and P17, which cut repeats and headings. P15, for two lists and one well. P22 and section 5, for one row form and fixed slots. Section 8, for one verb on the button.
- Bent: P2 for a survey's lay and look. They are reference at this point, and the squares answer the choice.
- Bent: section 8 asks that an off action shows its reason beside the button. Pay holds that place, since pay must stay in view to compare. The reason stays in the tooltip, and the need cell shows its cause in danger ink where it can.
- Bent: P25 at UI size 130% and on narrow layouts, as stated under Cost.
- Bent: P5 for the escort win chance. `fightOdds` returns one figure and no causes, so its tooltip gives the road's minimum and no steps. Adding steps would be new sim work, outside this redesign.

Invariants, each with its check:

- Accept and hand-in call the same sim commands: `acceptContract` and `deliverContract`. A diff of `src/sim` is empty, apart from at most one new read-only query.
- No field is added to `Contract`, so `npm run save:shape` reports no change.
- A survey's way and clue text stay reachable on the board and in the journal. `journal-survey.jpg` keeps all its facts.
- The HUD dock also prints `surveyClueLines`, so it gains the placeClue period and nothing else. `hud-contracts.test.ts` passes.
- Digits still pick the foot choices, and Back stays 1. Accept and hand-in take Tab and Enter, and `keepFocus` holds focus across a redraw. Touch keeps tap and long press through the shared tooltip.
- No raw value in CSS: `style-guard.test.ts` passes.

Dependencies on sibling plans:

- Town shell owns the band, chips, heading, line, Back and the wide panel slot. The board asks for a panel of at least 350px high at 1280 by 720. A shorter one needs this plan reread.
- Journal: `heldContractRow` and `.jobs` also build the journal rows. This plan leaves that function's output as it is and adds new functions. If the journal plan changes it, the two plans must agree on one row form.

## Implementation plan

Phase 1, mockup per `docs/ui.md` section 13. Render the real row pieces in `tmp/` with data captured from the game: all seven kinds, three held, Russian and pseudo-long, at 1280 by 720, UI size 130% and 700 by 800. Offer the two forms of decision 3 on the floating control. Iterate with the user, then write down what was settled.

Phase 2, row builders:

- `src/ui/contract-row.ts`: add `offerRow` and `boardHeldRow`, with one cell function per column. Keep `heldContractRow` for the journal and retire `contractRow`.
- `src/ui/format.ts`: add `offerFar`, `offerNeed`, `offerCaption` and a pay breakdown. Pay steps count travel as the reward minus the goods, so the rows add up.

Phase 3, the page:

- `src/ui/town.ts`: `contracts` returns the two lists, `refusal` adds the haul reasons in the order `haulBlocked` uses, and `sectionPanel` marks the board wide.
- New `src/ui/styles/board.css`: the grid, the well and the `narrow` and `phone` stacking.

Phase 4, words and docs:

- Add English and Russian keys for far, crate pay, cells short and the debt reason, plus the placeClue period. agy writes the Russian, per `game/CLAUDE.md`.
- Update `docs/wiki/mechanics/economy.md`, which says the board shows one clue line per place.
- Update `docs/ui.md` sections 12 and 13 and `src/ui/guide/pieces.ts` with the offer row.

Phase 5, checks and images:

- `scripts/layout-check.mjs`: add `nestedScrollFaults` to `town-board` and `board-taken`, and add a state `board-kinds` with all seven kinds and three held contracts, built the way `openSurveyJournal` builds its survey.
- Run `npm run screens -- town-board board-taken journal-survey`, and add `board-kinds` to the gallery README.

## Verification

- Tests, smallest files: `src/ui/contract-row.test.ts`, `src/ui/town.test.ts`, `src/ui/journal.test.ts`, `src/ui/hud-contracts.test.ts`, `src/ui/row-slots.test.ts`, `src/ui/style-guard.test.ts`.
- New tests: a haul with too few cells and a haul in debt give a named reason and no sim call. A survey whose clue names another landmark prints no far value. A procure row prints no maker or source. Pay steps add up to the reward.
- `npm run layout` states: `town-board`, `board-taken`, `board-kinds` and `journal-survey`, in English, Russian and pseudo-long, at 1280 by 720 and 700 by 800, plus the phone.
- Images needed that the gallery lacks: Russian, the phone, and every kind other than survey and haul.
- Manual try, positive: at Bowl, accept a haul. It shows as spent on the left and held on the right, with nothing moving under the pointer. Drive to the destination, and Deliver is in view without a scroll.
- Manual try, negative: fill the truck until a haul needs more cells than are free. Its need prints in danger ink, Accept is off with the named shortfall, and clicking changes nothing. Then hold three contracts and check that every Accept is off with its reason.
