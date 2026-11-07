# Market redesign

## Context
- Code: `TownScreen.market` and `goodRow` in `src/ui/town.ts`, rows in `src/ui/shop-rows.ts`. Images: `trade.jpg`, `trade-shortage.jpg`, `charts.jpg`. Neighbor: `shop.jpg`.
- Two rows per good is confirmed, and it is an accident. The container rule at 620px in `shop.css` folds the row, since the truck and its boxes leave the shop column about 582px in `trade.jpg`.
- Buy and Sell far apart is confirmed. Buy ends near x 810 and Sell starts near x 1060. Stock sits above Sell, although stock limits buying.
- The scroll is worse than reported. `trade.jpg` shows 2 and a half goods at Bowl, which trades 12. Nose also trades 12.
- Road news is out of sight. The `trade-shortage` scene seeds 3 news rows, and all sit below the fold. The list holds up to 16 by `ROAD_NEWS.max`.
- Two empty boxes are confirmed. `sideList` in `inventory.ts` adds them at every shop. Garage storage holds parts, which no market choice touches. Crates here is a real store, with its own sell buttons.
- Room left is never printed. The player counts cells or meets the refusal No room.
- Bowl prints Buy, Sell, Stock and Held 12 times each. Those labels drift with their number: Stock starts near x 997, 1005 and 1012 across the images, against P13.
- The Rationing tag shortens the fuel bar by about 65px, against P14. `goodsHead` prints Profit/crate with no Acumen on a wide window, against P6.
- Charts: the map is capped at 260px, and no price shows until a click, against P2. The N plate and scale bar cover labels H and 8. The truck and boxes answer nothing there.

## The question
Which crates do I buy or sell here, and how many, with the money and room I have?

- Key: buy price, sell price, stock here, crates held, room left, money.
- Supporting: fuel and supplies, profit per crate and the tints under Acumen, crates stored here, cargo this shop does not trade, road news.
- Reference, in tooltips: lot totals of +5 and All, crates owed on a haul, why a button is off, a good's lore, a news row's age and cause.
- Where it sells better: the game holds no memory of prices elsewhere, and a search of `src/sim` and `src/ui` found none. What it knows stays on screen: the sell price on every row, also with 0 held, which the player can carry to the next town, plus tints, profit and road news.
- The Charts tab answers a smaller question: which square do I buy. Key facts: the map, a square's price, money.
- Cut the truck drawing and its grid. Its one market job is room left, and a number answers that better. The first open decision covers this.
- Cut Garage storage, since the Garage has it. Cut the drop target of Crates here, since no drawing means nothing to drag. Selling a stored crate stays.
- Cut repeated captions, since one head row carries them, and the word Good, since names plainly are goods.
- Cut the hours on a news row. Rows sit newest first, and the age stays in the title.
- Cut the tab name Market under the title Market. It becomes Goods.

## Desired design
The list fits with no scroll at 1280 by 720 at Bowl and Nose. Buy and Sell share one row, and each count sits beside the verb it limits. Out of scope: truck trade, the outpost, the front page, and any sim, data or save change.

Bowl with Acumen at 1280 by 720. Numbers below the third row are placeholders.

```
| band with chips: Scout pickup, 333 M, 1,680 / 4,240 kg, 1.5 / 6.6            town shell owns this |
| Market                                                                                           |
| Crates under awnings, a scale, and traders who look at your truck before they look at you.       |
|                                                                                                  |
| [Goods] [Charts]  Stock Buy            Held Sell           Profit/crate | Room                 8 |
| Sorgut              120   7 [+1] [+5]     0    4 [-1] [All]             |                        |
| Textiles            120  11 [+1] [+5]     0    7 [-1] [All]             | 43 L / 200 L           |
| Meds                120  21 [+1] [+5]     0   13 [-1] [All]             | =========------------- |
| Parts                90   9 [+1] [+5]     0    6 [-1] [All]             | 1 [+5 L] [Fill 155 L]  |
| Electronics          40  70 [+1] [+5]     0   44 [-1] [All]             | 3 / 20                 |
| Water                12  14 [+1] [+5]     6    9 [-1] [All]         +3  | ===------------------- |
| Scrap metal           0     [+1] [+5]     0    5 [-1] [All]             | 2 [+1] [Fill 17]       |
| Batteries             8  40 [+1] [+5]     0   26 [-1] [All]             | Crates here  12 / 95   |
| Salt                 30  22 [+1] [+5]     4   14 [-1] [All]         +8  | Salt  12  14 [-1][All] |
| Machine tools        16  60 [+1] [+5]     0   38 [-1] [All]             | Road news              |
| Rations              38  11 [+1] [+5]     0    7 [-1] [All]             | 14 Robbed Bowl to Nose |
| Diesel               50  15 [+1] [+5]     0    9 [-1] [All]             | 12 Knocked out Pump... |
| [1. Back]  status line                                                                           |
```

Fit, measured on `trade.jpg`: the panel is 344px tall, y 266 to y 610. A 28px head and 12 rows of 25px take 328px. The panel is about 1180px wide, so a 300px well and a gap leave 856px. The longest row needs about 704px, with находки со звездолета, Acumen and Russian heads. The mockup must confirm these numbers.

1. Each good is one row: name, Stock, Buy price, +1, +5, Held, Sell price, −1, All, Profit. The eye compares Buy and Sell on one line, and a limit sits beside its verb.
2. Row height falls to the 24px button plus the hairline, with a `--icon-l` icon, so twelve goods fit.
3. One head row holds the tabs at the left and the captions over their columns, since a separate tab row breaks the height budget. Buy and Sell captions keep the coin and say per crate in a tooltip.
4. Numbers end on fixed right edges and the label leaves the cell, which fixes the drift.
5. The Profit column exists only under `knowsMarket`, head included, as P6 asks. Tints stay as ui.md describes them.
6. A side `.well` of `--panel-m` holds what the rows do not: Room, Fuel, Supplies, then a lower part.
7. Room is one stat row from `cargoRoom`, the number the buy check reads. For the player that is free cells, since mass never refuses a buy. `freeCells` ignores gun barrels, so the mockup must check that Room equals the crates a buy really places.
8. Fuel and Supplies keep `shopSupplyRow` and `supplyLine`, so they match the front page. Market CSS folds the bar over its price and buttons, and Rationing sits on the number line, so no bar changes length.
9. The lower part stacks three groups, each shown when it has rows: Crates here with its fill count, goods aboard that this shop does not trade, and Road news. Only this part may scroll.
10. A stored crate row is icon, name, count, sell price, −1, All, through `sellStoredGood`. A sold-out row stays spent through `RowSlots`, as section 6 asks. Today's chip vanishes and the next row slides under the pointer.
11. A news row is crate icon with count, verb and route, under the existing danger edge. It ends in an ellipsis, and its title holds the full text and the age.
12. Charts: the map grows to about 312px. The pick block beside it shows the hovered or picked square with its price and the priced Buy. With nothing hovered it shows the price range of the squares on sale, or one number when all cost the same.
13. Below a panel width of about 940px the well stacks above the list and the row folds to today's two lines with captions.

States, and how the layout holds each:

- 6 goods at a stall: spare height stays under the list, and the head is blank over the names. 12 goods with tabs: the budget above.
- Acumen on or off: the Profit column appears or leaves, and the names column absorbs it.
- Stock 0 or Held for an order: the price cell stays empty, and buy buttons are off with the reason. Stock under 5: +5 is off with its reason.
- Held 0: −1 and All are off, and the sell price stays. Owed crates: Held takes a dotted underline and tooltip, and All sells only spare crates.
- Room 0: Room reads a faint 0, and buy buttons give No room. No money or debt: prices turn danger ink, and buttons give Need N M more.
- A refusal: the existing status line in the foot, so no row moves. Rationing: the tag, and Fill shows the rationed amount. Full tank: Fill and + are off.
- 16 news rows with stored crates: the lower part scrolls inside the well. Refit running or an open plan: both leave this screen with the drawing, and the Garage still shows them.
- Charts: no pick, a hovered square, a picked square and an unaffordable one all use the pick block. Nothing left to chart: no squares, and one short dim line says so.
- Largest truck: the drawing is gone, so the semi and the sorokonoga hold the same outline as the scout.
- Russian and pseudo-long: names end in an ellipsis, and the item tip's name line gives them in full.
- 700 by 800 and phone: stacked, and the body scrolls as today. UI size above 100%: the panel gets shorter, and `.shop-body` scrolls with the head pinned.
- Look mode: the town page hides under a scene, so the market has no look state. See-all debug: `recipeLine` adds a row and the list may scroll.

Applied: P1, P2, P6, P12, P13, P20, P25. Bent, each with its reason:

- P21, one subject per column: the well mixes truck, store and road, since each is too small for a column and the list needs the height.
- Section 8, one verb on a button: +1, +5, −1 and All stay amounts under one Buy or Sell caption, since two verbs on 12 rows repeat the head.
- Section 12, no free cell count on the player's truck: its reason is that the grid shows it, and here no grid is drawn.
- Section 8, after value before a choice: the mass chip updates only after a buy, and town shell owns it.
- P25, never scroll: the well's lower part scrolls in its extreme state, since those rows are supporting.
- P1 on Charts: the well stays, so a tab switch moves nothing, and fuel and road news bear on where to drive.

Dependencies:

- Town shell, `ui-redesign-town-shell.md`: keep the money and mass chips in view and a panel of at least 344px at full page width. If the mass chip leaves, the well adds a Load row.
- Shop, `ui-redesign-shop.md`: the Garage keeps store and take for crates at every shop. It owns truck trade, which keeps `.good-row` and the 620px rule untouched here.

## Cost
- The drawing leaves the Market. The Garage or the I key shows which cells crates take, and I leaves the town page.
- Storing and taking crates moves to the Garage, a Back and a digit away. No crate can be clicked, dragged or dumped here.
- The screen still does not say where a good sells better. That needs a new saved price memory, which is out of scope.
- Lot totals stay in a tooltip, and a big sale pays less per crate than the row shows.
- On touch the small button is 32px, so 12 rows need 396px and the list scrolls there.
- Charts leaves about 300px empty at 1280 by 720, since a square map sits in a wide frame.

## Open decisions for the user
1. Cut the truck drawing, or keep it? Recommendation: cut. Keeping it without its boxes gives one-row goods only on the scout, since a wider chassis squeezes the list toward its 420px floor. A head, 2 supply rows and 12 goods also need 378px against 344px, and news has no place. It would need town shell to drop the prose line. The mockup shows both.
2. Keep fuel and supplies on the Market, or leave them on the front page only? Recommendation: keep, since the last money is split between crates and fuel here. Cutting gives the lower part about 110px.
3. Where do store and take live? Recommendation: Garage only. The other choice is Store and Take verbs on Market rows, which adds a column.
4. How does Charts show price? Recommendation: the range in the pick block, with the exact price on hover or tap. Printing a plate on every square meets P2 better, but a fresh game prints 34 about 30 times.

## Invariants and principles
- No file under `src/sim` or `src/data` changes, and the save shape stays. Check with `git diff --stat` and `npm run save:shape`.
- The commands stay `buyGood`, `sellGood`, `buySupply`, `sellStoredGood` and `buyChart`. A test checks that lot titles match `getLotTradePrice`.
- Every reason stays one short fact in the shared tooltip, and a disabled button keeps hover, focus and tap.
- `data-key` values stay, so `keepFocus` holds focus across a redraw. `data-market-tab`, `.town-shop > .shop-body` and `.trade.buy` stay, since the layout and mobile checks use them.
- Digits still pick Back, and Escape still goes back one page. Menu still takes every key while open.
- A tap on a chart square picks it, and a long press opens a reason. Phone keeps its stacked form. `InventoryView` keeps its look state.

## Implementation plan
Phase 1, mockup per docs/ui.md section 13, since the screen drops a drawing:

- Build `game/tmp/market-mockups/` from the real row pieces and captured worlds. A floating control picks Bowl, Nose or Granary, Acumen, 16 news, stored crates, fresh or explored charts, drawing cut or kept, language and window.
- A script presses each button and measures row height, overflow, the 344px budget and Room against real placements. Stop for the user's verdict.
- Images the gallery lacks and the mockup needs: Acumen, Nose, Russian, the larger trucks, phone.

Phase 2, goods: in `town.ts`, `drawPage` passes no truck for the market page, and `sectionPanel` builds a split of list and well. In `shop-rows.ts`, add `marketRow` and `marketHead`. Add `src/ui/styles/market.css` after `components.css`, scoped to the market.

Phase 3, the well: in `shop-rows.ts`, add `roomRow`, `storedCrateRow`, `foreignCargoRow` and a well form of `newsRow`. Stored rows go through `RowSlots.place`.

Phase 4, charts: add the pick block with hover preview, range and empty line beside `chartsMap`. In `map.css`, size `.ink-page .charts-map` from the column height.

Phase 5, text, docs and images:

- English and Russian entries for Room, per crate, not traded here and nothing to chart. The Goods tab reuses `trade.tradeTab.goods`. agy writes the Russian, per `game/CLAUDE.md`.
- Update the town page and Charts text in `game/docs/ui.md`, and the "says so above its rows" line in `game/docs/wiki/mechanics/economy.md`.
- `scripts/layout-check.mjs`: add state `trade-longest` with Nose, Acumen, 16 news and stored crates. Add a fault when `.shop-body` scrolls at 1280 by 720. Allow the well's lower part in `nestedScrollFaults`, and point its tab check at the new head row.
- Run `npm run screens -- trade trade-shortage charts`.

## Verification
- `npx vitest run src/ui/town.test.ts src/ui/style-guard.test.ts`, with new cases: lot titles match, Profit is absent without Acumen, and a sold-out stored row stays spent.
- `npm run layout` on states `trade`, `trade-shortage`, `charts`, `trade-longest` and `town-nav`.
- Manual try, positive: at Nose with Acumen and a full hold at 1280 by 720, sell all of one good, buy +5 of another and buy a chart. Nothing scrolls, the pointer's row never moves, and money and Room change at once.
- Manual try, negative: with money and Room 0, press +1. Room reads 0, the button gives No room, and focus stays. With no money, a chart's Buy gives Need N M more and nothing changes.
