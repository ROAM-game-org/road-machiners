# Town shell redesign

## Context

Every town page is one `.ink-page` box: a picture band with chips, a heading, a line of prose, a 680px text column and a foot with the way out. Sizes below are measured on the images at 1280 by 720 or computed from tokens.

- `town-front.jpg`, `town-board.jpg`, `shop.jpg`: the band is 1212 by 101. The art is 16:9, so the band shows 15% of the picture's height. In Bowl that is sky scribble and two tower tops, while the file holds gates, a market, trucks and terraces. The focus points in `quest-art.json` aim 6 of the 7 town pictures at their top 30%. The band costs 16% of the page and delivers almost none of the place.
- `trade.jpg`: `bowl_scale` reads better in the band, but it is the only section picture in the game.
- All town images: the chips print truck type, money, mass and power on every page. On People and Board only money could matter.
- `town-people.jpg`: a 213px void sits between the line and the list. The cause is `margin-top: auto` on `.quest-choices` in `shop.css`, which pushes the list down when a page has no panel. The quest page needs that rule, so the fix is scoped to the town.
- `town-board.jpg`, `town-people.jpg`, `town-front.jpg`: the 680px column leaves 266px empty on each side. `board-taken.jpg` cuts the taken contract at the fold beside that empty width.
- `shop.jpg`, `trade.jpg`: the wide panel is 1180 by 345. Height is the shortage on those pages, and width the waste on text pages. The band, heading, prose and foot take 45% of the inner height.
- `town-board.jpg`: Back sits about 65px below the last line, and every page pins it to the bottom however short its content is.
- `town-front.jpg`: the prices of the fuel and supply rows print as a bare 1 and 2 right above a numbered list, so they read as digit keys. The coin lives in `.cap`, which shows only inside the narrow `.town-shop` container.
- All town images: the log shows through the page at the bottom right and pokes out past the page edge. The rule in `modal.css` targets `#ui > .log`, but `log.ts` mounts it in `.right-column`, so `docs/ui.md` 4.1 is false today.

## The question

Where do I go next in this town, and what is left to do here before I drive on.

- Key on the front: which place this is, fuel and supplies against the tank with their buttons, money, the open ways with the reason a way is off, and the way out.
- Key on People and Bar: who is here. On Garage, Market and Board: whatever that page's own plan says.
- Key on every page: where I am, money, the refusal I got, the way out.
- Supporting: odd jobs pay and a local's role. Ambient: the picture and the prose.

Cut, with the reason:

- The band on Garage, Market and Board. It costs the height those pages lack and shows a slice of sky.
- Truck type chip. No town choice needs it, the Garage drawing shows the truck, and the inventory names it.
- Mass and power chips. They answer questions on Garage and Market only, so those pages show them as bars, as the inventory did.
- Prose on Garage, Market and Board. It is ambient and takes a row from working pages.
- The heading block and the foot. Their jobs move into the head row.

## Desired design

The shell becomes one head row over one room. A page is either a place page, with the town picture large enough to read, or a work page, which gets the entire room and no art. The town looks like a place on arrival and like a workbench once the player is working. Scope: `.ink-page` in town, the front page, People and Bar. The interiors of Garage, Market and Board belong to their own plans.

Front page at 1280 by 720, page box 1216 by 658:

```
+--------------------------------------------------------------------------------------+
| Bowl                                      refusal line here    M 333     [7. Drive on] |  head row, 48px
|                                                                                        |
| +------------------------------------------+  fuel   43 / 200 L    M 1   [+5 L] [Fill] |
| |                                          |  supply  3 / 20       M 2   [+1]   [Fill] |
| |                                          |                                           |
| |      town picture, 616 by 462, 4:3       |  [1. Go to the garage                   ] |
| |                                          |  [2. Go to the market                   ] |
| |                                          |  [3. Read the board                     ] |
| |                                          |  [4. Look for locals                    ] |
| |                                          |  [5. See who is parked                  ] |
| +------------------------------------------+  [6. Do odd jobs for 1 hour      55 M's ] |
| Six arrowhead bastions of colored salvage    |                                         |
| panels ring the crater rim, three lines...   |  list column 540px, space under it free |
+--------------------------------------------------------------------------------------+
```

People keeps the same picture in the same place, so only the right column changes. A work page gives the room to the page:

```
| People  Bowl                                               M 333           [5. Back] |
| +------------------------------------------+  [1. Ruben, Canal warden              ] |
| |      town picture, unchanged             |  [2. Hattie, Sells water at the gate  ] |

| Market  Bowl                 Need 12 M more                M 333           [1. Back] |
| +----------------------------------------------------------------------------------+ |
| |  page room, 1180 by 590. Today it is 1180 by 345, or 680 by 345 on the Board.    | |
```

The shell contract, for the market, shop and contract board plans:

- Room at 1280 by 720: 1180 by 590, against 1180 by 345 today. Computed from tokens: inner page 1212 by 654, head row 48, bottom padding 16. The page runs to `--space-4` from the window bottom, as the inventory does.
- Room at UI 130%, a layer of 985 by 554: 885 by 424, against about 885 by 202 today. At UI 80%: 1500 by 762. At 1440 by 900: 1340 by 770.
- The head row shows: section title, place name, money, the refusal line, the way out with its digit. A page draws none of these. A page has no heading, no prose and no error line of its own, and sets `this.error` as today.
- The head row does not show: truck type, load, power, fuel, supplies, the clock.
- Digits come from `TownChoice[]`. The last entry is the way out, so a page with no other choices has 1 for Back. A page wanting numbered rows adds them to the list.
- Escape goes back one page, then drives on. The page never handles it.
- The page fills the room edge to edge. Scroll stays inside `.shop-body` and `.truck-body`, and the room never scrolls as a whole on a desktop layer.

Named dependencies on siblings:

- The mass chip leaves, so `ui-redesign-market.md` takes its stated branch and its well adds a Load row. Its 344px and the board's 350px panel floors are met.
- Shop shows Load, Power and the speed cost of guns in the Garage. The shell phase adds `budgetGroup()` from `truck-panel.ts` to `.town-truck` so no fact is lost, and that plan may place it better. `budgetGroup()` does not carry the -5% speed cost, so that needs a row in the shop plan.
- Market owns the supply row, which the front page reuses. The front needs a coin on the price in any container. The shell phase turns `.cap` on in `.ink-panel.supplies`, and Market's row replaces that when it lands.
- Shop decides whether outpost, full shop and truck trade adopt the head row. They are `.town-screen` with their own `h3` and `truckChips()`, so the shell leaves them alone and `truckChips()` stays. The head row is a function in its own file, so they can reuse it.

Changes and reasons:

1. The way out moves to the top right of the head row. It is a window control by P20 and P21, and the inventory and character Close sit in that corner. Back and Drive on reserve one width through `stackedLabel()`, so the eye learns one spot and the button never resizes.
2. Money stays in the head row, alone. The town page hides the instruments and most pages spend or pay, so one spot across the visit beats a chip per page.
3. The refusal line sits between title and money, right aligned, on one line with an ellipsis and its full text in the title. It lands next to money, which is usually its subject, and it moves nothing.
4. Section titles add the place name in muted body size. It costs no height and it is the place cue left on a work page. P26 holds, since the title stays the only heading size.
5. The picture leaves the band for a left column on place pages. It keeps 4:3 and fits inside both the column width and the room height minus a four line prose block. Spare width goes to the list column, which grows from a floor of 540px, a new token `--town-list-width`. At 1280 by 720 the picture is 616 by 462, so it shows 75% of the width and all the height, against 15% of the height today. It stays fixed between front, People and Bar, so moving around town does not jump.
6. Prose sits under the picture on place pages, in `--text-lead`. It describes the picture, so it goes next to it, and it scrolls inside its block if it must.
7. By character widths the 540px floor holds the longest Russian choice and reason on one line, the supply rows and a Bar row with its name, truck, tag and Radio. The mockup script measures this. The list starts level with the picture's top, with no void.
8. The log is hidden under the page, as 4.1 already says. The bottom line it kept is no longer needed there. Only `.ink-page` takes the new height, and the standalone quest page keeps `--page-height`.
9. A quest in town keeps reading as the next page. `frame()` lends the head row and the picture column instead of the band, and `insetArt()` fills the column, so a quest's own picture goes from a 3:1 sliver to a real picture. The head row keeps the title and money, and its exit slot stays empty so money does not shift. Talk text takes the list column. On a quest page view the picture drops to 16:9 and `.ink-side` moves under it, since the room has no third column.
10. On a phone and a narrow layer, a place page keeps its 72px picture strip on top, a work page has none, the head row wraps with the chip whole, and the way out stays in the sticky foot under the thumb. One DOM node moves by grid area, so its Tab order stays last and nothing is built twice.

States, and how the layout holds each:

- All ways open, as sketched. A way off keeps its slot with its reason at the right end, and odd jobs show pay or their refusal in that same slot.
- A town selling no supplies: the block is absent and the list moves up. Rationing tag: it sits in the supply row. Full tank and no money give the off state with a reason.
- A refusal, by click or by a digit on an off row: the head row line. It moves nothing, and the longest gets an ellipsis.
- Work running, a queue, an open plan: none live in the shell. Odd jobs close the page, and the garage job and paint plan live in the room.
- One local to four locals. One local leaves the column mostly empty beside the picture.
- Bar with many drivers: 16 rows fit at 1280 by 720. Past that the list scrolls inside its column.
- Roadhouse desk: no picture exists for it, so its front is a work page holding the case rows. Its People page shows the local in the list column at the left of the room, with no picture box.
- A picture still loading or failed: the striped surface fills the same box.
- Quest in town: talk, page view with stats and facts, a term tip, look mode over it. The Bowl scale on entering Market and the Nose counter on leaving Garage each open from a work page into the picture layout.
- Reopen on the same turn: `townPageOnOpen` returns to the same page.
- Longest content: `green-pit` prose, 290 characters in English and 279 in Russian, takes 3 to 4 lines at 616 wide. Pseudo-long takes 5, which is 9px over, so it scrolls in its block.
- Money at -99 999: the chip grows left and the refusal line gives way. Largest truck: the shell draws no truck, and the sorokonoga gets more room in the Garage.
- Smallest windows: at 1280 by 720 the front uses 549 of 590 on the left and 320 on the right. At UI 130% the left column is 321 wide, the picture 241 high and the prose 6 lines, 403 of 424, with the list at 320. Pseudo-long there scrolls the prose only. At UI 80% the height cap gives a picture about 867 by 650 and a list column of 609. Below 481px tall the phone layout takes over.
- Images the gallery lacks, needed at the mockup: Bar, Roadhouse desk and its People page, quest in town as talk and as page, a town with no supplies, rationing, odd jobs off and paid, Russian `green-pit`, 700 by 800, phone, UI 130% and UI 80%.

## Cost

- Garage, Market and Board lose the art and their prose lines. A long shopping visit looks like a tool, not a town. The `bowl_scale` picture shows only when a scene or place page uses it.
- Drive on is digit 7 but sits above digit 1, so reading order and key order disagree on the front.
- The way out is in a fixed corner, not next to the list. On a work page it can be far from the row just used. This solves the void under the list but not mouse travel.
- People in five of the seven towns has one local, so a tall empty column stands beside the picture. This fails the literal P12 test.
- The truck type chip and the speed cost are gone from the front and People.
- A quest page view in town has less room for stats and facts than its column today.
- Phone keeps the foot, so desktop and phone differ on where the way out lives.

## Open decisions for the user

- Art on work pages. Option A is none. Option B paints the town picture behind the 48px head row under a scrim, at zero height cost. I recommend A, since 48px shows 7% of the picture behind text and it is wallpaper.
- Picture shape on place pages. Option A is 4:3 at 616 by 462, which fills the column and crops 25% of the width and the paper edge. Option B is the whole 16:9 at 616 by 346, leaving about 150px empty under the prose. I recommend A, and the mockup should show both.
- Drive on on the front. Option A puts it in the head row like Back. Option B puts it last in the list, in digit order, and the corner holds nothing on the front. I recommend A, because one exit spot beats digit order and Escape already works.
- Facts on front rows. The free right-end slot could show the repair-all price on Garage and the count of contracts ready to hand in on Board. They answer where to go next without a click, as P2 asks. They add two reads and a rule. I recommend adding those two only, as icon and number, with no new words.

## Invariants and principles

Applied: P1 and P2 for the question and what stays in view, P7 and P17 for the cuts, P20 for the way out, P25 for the room and P26 for the title.

Bent, each named in `docs/ui.md`:

- P21: the top row also holds money and the refusal line. The instruments are hidden here, and money belongs to no single page column.
- P13 and P14: two page kinds, where the worked example keeps one outline for all section pages. The outer box, head row and way out still stay fixed.
- P12: the empty column under a short list stays, since a list has nothing else to hold. It is the end of a group, which P14 allows.
- P25: the Bar list and the prose can scroll inside their blocks past their budget. No key fact scrolls out of its row.

Must stay true:

- Digits: `CHOICE_KEYS` and `TownChoice[]` order are unchanged, so on the front 1 to 7 mean what they mean today. Check: press each in the layout check.
- A digit on an off row shows its reason and does nothing else. Digits do nothing while a Menu panel, call or live quest is up. Check: `takesKeys()` is untouched.
- Escape is one page back and then Drive on, through `TownScreen.back()`. Check: press it from a section page and the front.
- I, C and J open over a scene as look screens at `--z-over-scene`. The `.quest-look` icons stay reachable on a phone and clear of the head row money. Check: `mobile-check.mjs` and a phone capture.
- Touch: exit and choices at `--touch-target`, long press and tap reasons work through `reasonButton()`.
- `data-town-go` ids stay, since `ui-playtest`, `mobile-check`, `shop-parts-check` and `garage-ui-check` click them.
- Town scenes fire on the same section moves. No change to `pickTownSection()`, sim state or the save shape.
- `rows.keepPlace` still finds its scroll boxes after the DOM change, in `scrollBoxes()` of `part-rows.ts`.

## Implementation plan

Phase 1: mockup per `docs/ui.md` section 13, since this shell sets the room for three other plans. In gitignored `tmp/town-shell-mock/`, render the real CSS and pieces with captured data, with a floating control for each state and window listed above, on the real window, muted and hidden when a script drives it, after checking free memory. A script measures room and overflow in each state. The user settles the open decisions on it, and the verdicts get written down.

Phase 2: log fix, which stands alone. In `styles/modal.css`, change the rule to reach `.right-column > .log`. Check the log on the field is unchanged.

Phase 3: head row, room, picture column and quest in town, landed together, since `drawInTown` builds on the band and foot until it moves.

- New `src/ui/page-head.ts`: `pageHead({ title, place, status, money, exit })`, with `exit` empty in a quest.
- `src/ui/town.ts`: `drawPage`, `drawDesk` and `bodyOf` build head row plus room, `bandOf` goes, the exit goes to the head slot, `heading()` returns title and place, `proseOf` is only for place pages, and `drawPage` adds `budgetGroup()` to `.town-truck` where the page has one. Front, People and Bar add the picture column through `ArtBand`, which keeps the zoom running. No art means no column.
- `src/ui/quest-screen.ts`: `TownFrame` carries the head row and picture column. `drawInTown`, `townPageParts`, `townTalkParts` and `insetArt` draw into them, and `.ink-side` moves under the picture. Money prints once in talk. A page view keeps its stat row with the delta, so it prints twice there, as today.
- `styles/components.css` and `styles/town.css`: `.ink-page` becomes a grid of head row and room. Drop `.ink-band`, `.ink-chips`, `.ink-foot` on desktop and the `.front-page` band growth. Scope the `margin-top: auto` of `.quest-choices` in `shop.css` away from the town page, and turn `.cap` on in `.ink-panel.supplies`.
- `tokens.css`: `--town-list-width`, `--town-page-height`. `styles/phone.css` and `styles/responsive.css`: strip, wrap and sticky exit.

Phase 4: text. Remove `town.line.garage`, `town.line.market` and `town.line.board` from `src/text/en/story.ts` and `src/text/ru/story.ts`. The shell needs no new strings in English or Russian, so no Russian writer run.

Phase 5: checks and docs.

- `scripts/layout-check.mjs`: `townMarks` reads the head row, `navDiffs` checks the exit's right edge, top and height, and `frontBandFaults` goes. Add a room check against the contract figures, a check that the first list row starts within `FRONT_GAP` of the column top, a check that the picture box is equal on front, People and Bar, and digit and Escape presses. Add states `town-bar`, `town-desk`, `town-talk` and `town-scene`, and `town-front` to `SIZE_STATES`. `scripts/garage-ui-check.mjs` reads `.ink-chips .chip`, so it moves to the new rows.
- `src/ui/guide/pieces.ts`: `inkPage()` and its note, with `guide.test.ts`. `docs/ui.md`: `.art-band`, `.ink-page`, the town page paragraph, the worked example, 4.4 and the bends above, with the two page kinds as a pattern.
- `npm run screens -- town-front town-people town-board board-taken trade trade-shortage charts shop shop-row-open shop-sell garage paint`, plus new `town-bar` and `town-desk` entries in `docs/screens/README.md`.

## Verification

- Vitest, touched files only: `src/ui/town.test.ts`, `src/ui/quest-screen.test.ts`, `src/ui/quest-screen-sync.test.ts`, `src/ui/style-guard.test.ts`, `src/ui/guide/guide.test.ts`, `src/text/catalog.test.ts`, `src/text/coverage.test.ts`.
- `LAYOUT_STATES=town-front,town-people,town-bar,town-desk,town-board,town-nav,town-talk,town-scene,shop,trade,charts,garage,paint npm run layout`, which covers English, Russian and pseudo. Add `LAYOUT_SIZES` runs for phone and landscape phone.
- `scripts/mobile-check.mjs`, `scripts/shop-parts-check.mjs` and `scripts/garage-ui-check.mjs`, since they click and read the shell.
- Manual try, positive: in Bowl press 4. The list starts at the picture's top and the picture does not move. Press 5 to return, press 2, buy a crate, and see money change in the head row and Load change on the page. Press Back, then 7, and the page closes.
- Manual try, positive: start a talk with Ruben, read it beside the picture, press I, press Escape, and the talk is on the same paragraph.
- Manual try, negative: with no drivers parked press 5. The reason shows in the head row, the page does not change and nothing moves. Press 8, and nothing happens. Open the Menu, press 1, and nothing happens under it.
