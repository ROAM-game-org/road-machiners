# Shop redesign

## Context

- The family is the Garage tabs in `TownScreen`, `OutpostScreen`, `TruckTradeScreen` and `FullShopScreen`. All four host `InventoryView` beside a `.town-shop` column. Images: `shop`, `shop-row-open`, `shop-sell`, `garage`, `paint`, `full-shop`. Neighbor: `inventory-gun`.
- The truck is small, confirmed, and height is the cause. The scout's cells are 18px in `shop.jpg` and 31px in `inventory-gun.jpg`. The town panel is 345px. The other three screens are plain `.modal`, 470px tall at 720 because of `--modal-reserve`.
- The largest grid is the semi hauler, not the sorokonoga. It is 48 rows by 9, and the outpost's truck switch draws it. By arithmetic it gets about 6px today.
- Rows cut off, confirmed. `shop.jpg` shows 6 and a half of 10 rows, and a garage stocks up to 12. An outpost starts at 25 by `stockPerKind` and grows. `docs/DESIGN.md` has drifted from that table.
- Rows differ in height, 30px for Rebar and 42px for Smoke mortar, and stats share no edge. `--col-name` leaves about 120px between a price and its Buy. One open row pushes 3 rows off in `shop-row-open.jpg`.
- Rows compare against nothing by default. `compareBase` is null until the player picks a part on the grid, so no row in the gallery shows a delta. The inventory card already falls back to `baselinePart`.
- Empty boxes, confirmed in every image. They cannot simply go, since a bought part lands in storage in town and at an outpost.
- The Repair complaint is half right. The bar sits 50px above the truck, on no named subject. The worse gap is per-part Repair, under both boxes, with about 98px left in a column that scrolls. Repair basics and Repair all both print 21, which is one choice shown twice.
- Swap, both Repairs and Paint's Buy hold their cost inside the button. `ui.md` section 8 has a `pricedEl` bullet that contradicts its own one-verb rule.
- Trucks: `garage.jpg` shows 1 and a third of up to 11 cards. A swap sends guns and armor to storage through `SWAP_KEEPS`, and no screen says so. Paint: `paint.jpg` clips the 6th scheme and the 9th swatch.
- `onHover` listens to `mouseenter` only, so the mount wash never shows on touch or keyboard.

## The question

What do I spend my money on for this truck, set against what it already has?

- What the player compares when buying: this part against the best mounted part of its kind, and against other stock of that kind, by price, wear, the one stat the part exists for, and footprint.
- What the drawing must show meanwhile: the cells the part can mount on, the part it is compared with, the room left and the damage. It needs its largest cells for installing, not for comparing, so it gets all the height and only the width it needs.
- Key: money, price, wear, headline stat with delta, footprint, mount cells.
- Supporting: Load and Power with what the part would add, top speed, the part's other stats, the ability.
- Reference: lore and name in the item tip, reasons, what a swap moves to storage, the crate store's fill.
- Trucks ask the same question about a whole chassis. Paint has no comparison: how will it look, and for how much.

Cuts, with a reason for each:

- The two storage boxes, since an empty box answers nothing. A thin strip replaces them.
- The accordion on desktop and its chevron, since it moves the rows being compared.
- Chips for chassis, ability, load and power, since each fact moves to the column it describes.
- Repair's wrench, since the verb says it. Repair basics when its cost equals Repair all, and both when nothing is damaged, as with any verb with no use in `.action-rows`.
- Prices inside buttons and the 130px action column, since a cost sits beside its verb.
- The truck card as a list item, since it fits one chassis on screen and comparing needs them all.

## Desired design

Outcome: at 1280 by 720 every garage stock fits with no scroll, rows have one height, the card never moves the list, and the truck grows. Scope ends at the UI. Goods and supply rows stay as the market plan leaves them.

Bowl garage, scout, pointer on Autocannon, at 1280 by 720. Card numbers are placeholders:

```
| Garage  Bowl             refusal line here                       M 333         [1. Back] |
| Scout pickup         | Load  1,680 / 4,240 kg | [Buy parts] [Sell parts] [Trucks] [Paint] |
|    F F F F           | =======---------       | [All 10][gun 4][eng 1][arm 1][crg 3][...] |
|   +-------+          | Power  1.5 + 2.5 / 6.6 |                                           |
|   | green |          | ===- - -------         | Gatling MG  rebuilt x2 12x4 +32 [] 112 [Buy]|
|   | wash  |          | Top speed      81 km/h | Autocannon *pristine   3x29 +64 [] 151 [Buy]|
|   | on    |          |                        | Rebar cage section x1     2 +1  [] 35  [Buy]|
|   | mount |          | Autocannon *pristine   | Light cargo frame x2    +30     [] 84  [Buy]|
|   | cells |          | Condition 40/40  ====  | Cargo box x1            +30     [] 101 [Buy]|
|   | MG    |          | Against MG turret x2   | Enclosed cargo frame x1 +30     [] 112 [Buy]|
|   | edged |          | Mass      180 kg  +70  | Smoke mortar x2         10 t    [] 71  [Buy]|
|   +-------+          | Damage    3x29    +64  | ...16 rows of 32px are in view...         |
|    B B B B           | Penetration  9    +4   |                                           |
| [][][][][][] cargo   | Range       60 m  +15  |                                           |
| [][][][][][] cargo   | Cooldown, Magazine,    |                                           |
| [i][i] storage tiles | Reload, Arc, Spread,   |                                           |
| [Repair basics] M 21 | Recoil, Power          |                                           |
| [Repair all]    M 40 |                        |                                           |
```

Widths: 272px truck, 235px card, 625px list, 24px gaps, in the shell's room of 1180 by 590.

Cells at 1280 by 720, by arithmetic for the mockup to confirm: garage scout 28px, up from 18. Garage sorokonoga 18px, up from 11. Outpost semi about 10px, up from about 6.

1. Three zones: truck, card, list. The list is widest, since it is the task. The card sits between, so the eye goes from row to card to wash.
2. The outpost, truck trade and full shop adopt the shell's head row and page box of 1216 by 658, and the instruments and log hide as under the inventory. The game waits there, so nothing on the HUD is live.
3. One card on a `.well`. Load, Power and Top speed stay at its top, since every part spends that budget. Load and Power show the part's addition as a dashed span. Below them it shows the row under the pointer or focus, else the pinned row or picked item, else stores and ability rows from `truckGroups`.
4. A row is one 32px line: icon, name, wear, headline stat with delta on a fixed edge, footprint scaled into a 24px box, price, Buy beside it.
5. Rows compare by default. The base is the picked part, else `baselinePart` of that kind on the shown truck.
6. Hover shows the mount wash and puts the hover edge on the base part. A click pins the row, so the pointer can move over the truck and keep both.
7. Stock sorts by kind, then price, so like sits next to like. `RowSlots` still holds slots until the player leaves the list.
8. Storage is one row of 32px icon tiles after the cargo, holding parts and stored crates. Tiles do not follow the truck's cells, since storage is not on the truck. The row scrolls sideways. Empty, it draws nothing and its room stays reserved. During a drag it shows as a drop target with the word Storage.
9. In town and at an outpost, a Buy leaves the row spent and lands its tile in the strip, already picked. The wash stays and a double click installs it. No new verb. In truck trade the part stows on the grid as today.
10. Repair is two `.action-rows` at the bottom of the truck column, under the drawing they change. Per-part Repair stays in the card. The fit reserves their room, so a repair never resizes the truck.
11. Trucks tab: one 32px row per chassis with name, speed, cargo cells, rated load, swap cost, then Swap. The card shows portrait, chassis map, ability rows and all seven stats with deltas. Your row is `.selected` with Yours in the action slot. Swap's tooltip says guns and armor go to storage.
12. Paint tab: the card shows the portrait in the planned paint, with Buy and its cost as an action row. Rows get the list's width, which ends the clipping.
13. Outpost: the switch takes one 32px row with names over the truck, and Buy parts gains the filter. Drive on moves to the head row's way-out slot. `outpostControls` makes Leave and Drive on exclusive, so that slot holds exactly one, as the shell's front page does. The Goods tab spans card and list.
14. Truck trade: the head holds the title, your money, then Them with money and free cells, since those limit a sale. Parts lists theirs then yours under the heads Them and You. Goods and Supplies span card and list.
15. Full shop drops `partCard` for these rows, with Take and no price.
16. Reflow: at `compact`, 1100px or less, the card column leaves. A row opens in place as today, and a truck pick shows the card over the list until unpicked. Narrow and phone stay stacked and scroll, with the strip in place of the boxes.

States:

- Nothing hovered or picked: stores and ability rows fill the card, so no void.
- Row hovered, row pinned, or a part picked with a row hovered: the card shows the row, against the pick.
- Mounted, spare and core part, crate, stored tile: as the inventory's card, with its action rows. Stored items have none.
- Fullest card, a damaged spare gun: about 540px of 590px, and the mockup measures it with a long job queue.
- Unaffordable: price in danger ink, Buy off with Need N M more.
- Refusal: it prints on the shell's line, so no row moves.
- Spent row: it keeps its slot and tag.
- Empty stock, empty kind, nothing to sell, sold out: the existing dim line, with truck facts in the card.
- Stall: 2 to 4 rows, no Trucks or Paint, spare height under the list.
- Longest list: 12 garage rows fit in 16 slots, and past 16 `.shop-body` scrolls in whole rows, as at an outpost, in Sell and in the 61 rows of the full shop.
- Work running, a queue, an open plan: `jobBlock` sits in the card under the budget, and in truck trade a plan keeps its Refit row.
- Largest truck: the sorokonoga's cargo and tiles sit beside it in the 272px column, and the semi at about 90px wide stays left in that fixed column, per P14.
- Hauler shown: the budget reads the hauler, and a refused row keeps its reason.
- Hauler away: the switch is off with its reason.
- Gates shut: Drive on is the way out, and Escape does nothing.
- Under a quest: the page hides, as the shell plan says.
- Look mode and knocked out: `lookReason()` turns every world control off with one reason.
- Longest content and Russian: names end in an ellipsis with the full name in the item tip, and Починить основное fits since each Repair has its own row.
- UI 115%: the room is about 1013 by 498 and the list about 458px, so cells shrink and the fullest card alone scrolls.
- UI 130%: `compact`. 700 by 800 and phone: stacked.

Dependencies:

- Town shell, `ui-redesign-town-shell.md`: this plan needs its work page, a room of 1180 by 590, and its head row with title, refusal line, money and way out. At today's 345px this design does not fit. The shell adds `budgetGroup()` to `.town-truck`, and this plan moves it to the card. The speed cost it asks about becomes the Top speed row, with causes in its tooltip.
- Market, `ui-redesign-market.md`: that plan removes the drawing from the Market and needs store and take for crates at every shop. The strip keeps both by drag and double click, and selling a stored crate lives in the Market's well. If the user keeps the Market's drawing, it reuses this truck column.
- Goods and supply rows on the outpost and truck trade stay the market plan's `supplyLine`, `goodsHead` and `countCell`.

## Cost

- The largest trucks stay under the 24px click minimum, the semi by far. It is hard to aim a drag on, so double click carries it.
- The truck stays smaller than in the inventory, since the list and card take the width.
- A one-line row holds one stat, so the player reads a kind's other stats one row at a time in the card.
- Top speed shows only its current value. Its after value needs a sim query on a truck that does not exist yet, so the Power span stands in for it.
- A card that follows hover changes under a moving pointer, which can read as busy.
- The base is the best mounted part. On a truck with several guns, the player must pick a gun to compare against a lesser one.
- The HUD hides under the outpost, truck trade and full shop.
- An outpost's long list still scrolls, since no layout holds 25 rows and their facts at this height.
- The drawing on the Paint tab keeps the old paint, since rendering each pick is too costly.
- Stored parts show as icons, with no names until hover or a pick.

## Open decisions for the user

1. Does the card follow hover, or only a click? Recommendation: hover, since flicking down the list is the comparison. Click only is calmer, but makes each compare a press.
2. Which column order? Recommendation: truck, card, list, which keeps the truck where the player has seen it. List, card, truck puts the rows first in reading order.
3. Should a kind filter turn the rows into a table? Recommendation: not now. A table reads down columns and compares better, but needs a column set per kind and more than 625px. The mockup can show guns alone.

## Invariants and principles

- No file under `src/sim`, `src/data` or the save schema changes. Check with `git diff --stat` and a clean `npm run save:shape`.
- Commands stay the same: `buyStockPart`, `sellPart`, `buyChassis`, `repaint`, `repairAll`, `repairBasics`, and every outpost and truck trade command. Prices match by test.
- Drag, double click, R, right click during a drag and the drop on storage keep working. Check with `inventory-look.test.ts` and a manual drag.
- `data-key`, `data-garage-tab`, `data-tab` and `data-truck` stay, and `.town-shop > .shop-body` stays the list's one scroller.
- Keyboard: focus on a row does what hover does, and Enter pins it. Digits pick the way out, Escape goes back a page, and the Menu takes every key while open.
- Touch: the first tap on a row pins it, with wash and card, and Buy is its own tap. Long press opens a reason. Hold drag still works from the strip.

Applied: P1, P2, P8 through shared rows and cards, P12, P13, P14, P20, P21, P22, P25, and section 8's one verb with its cost beside it.

Bent:

- P25: lists past 16 rows scroll, since hiding a part is worse. The filter shrinks them.
- P2: a part's other stats sit one hover away. Price, wear and the headline stay on the row.
- P8: the hover edge also marks the base part, away from the pointer. It means "this part is in question", and a new mark would be one more thing to learn.
- P14: on goods tabs the list takes the card's width, since a goods row has no card subject. The frame stays fixed.
- P21: the card shows the truck at rest and a part on hover. One place to look beats two half-empty columns.

## Implementation plan

Phase 1, mockup per `docs/ui.md` section 13:

- Build `game/tmp/shop-mockups/` from real rows, the real card and captured worlds. A floating control picks: scout, sorokonoga, semi; each tab; nothing, hover, pin, pick; fullest gun; hover or click; column order; English, Russian, pseudo-long; 1280 by 720, UI 115%, 1440 by 900.
- A script presses every button and measures row height, overflow, cell size and card height. Images missing now and needed: outpost, hauler, truck trade, sorokonoga garage, phone, Russian. Stop for the user's verdict.

Phase 2, frame, truck column, card, rows:

- `src/ui/styles/modal.css`: a class on the three plain screens takes the shell's box, and they join the `:has(.inventory-screen)` rules that hide the instruments and log. New `src/ui/styles/shop-screen.css` holds the zones.
- `src/ui/inventory.ts`: on desktop, `hostedEl` loses `.inv-side`, and `storageEl` and `cratesEl` become `storageStrip()`. `hintMounts` marks the base part. `src/ui/inventory-draw.ts`: `chooseLayout` counts the strip and repair room.
- New `src/ui/shop-card.ts` holds the hovered and pinned rows and draws the card. `src/ui/truck-panel.ts`: `loadRow` gains the after span.
- `src/ui/part-rows.ts`: desktop rows pin, and hover, focus and tap share one callback. `src/ui/cards.ts`: add `rowBase`, and `footprint` scales. `src/ui/styles/shop.css`: fixed stat edge, price beside the action.

Phase 3, tabs and screens:

- `src/ui/shop-rows.ts`: `repairBar` becomes `repairRows`, `truckCards` becomes `truckRows`, `swapButton` drops its price, `paintTab` moves portrait and Buy to the card, and the filter moves here from `town.ts`.
- `src/ui/outpost.ts`: head row, Drive on in the way-out slot, slim switch. `TruckTradeScreen`: head row, two part groups. `src/ui/full-shop.ts`: `PartRows`, with `price` nullable in `PartRow`. `town.ts`, `outpost.ts`: pass the base, sort, pick the tile after a Buy.

Phase 4, text, docs, checks:

- English and Russian entries: Load after a part, what a swap moves. Remove `inv.storageEmptyCrates`, `trade.nothingToRepair` and any key left unused. agy writes the Russian, per `game/CLAUDE.md`.
- `game/docs/ui.md`: fix section 8's `pricedEl` bullet. Update `.town-shop`, `.truck-switch`, `.chassis-feature`, the item tip's open detail line, the Paint piece and the wash paragraph. New pieces go in `src/ui/guide/pieces.ts`. Match `docs/DESIGN.md`'s outpost line to `stockPerKind`.
- `scripts/layout-check.mjs`: add `shop-sorokonoga` with the `randomKit` loop, `outpost`, `outpost-hauler`, `truck-trade-parts` and `shop-gun-card`. Add faults for unequal row height, for `.shop-body` scrolling with 12 rows at 1280 by 720, and for action buttons of unequal width. Allow the strip in `nestedScrollFaults`.
- Rewrite `scripts/shop-parts-check.mjs`, `scripts/garage-ui-check.mjs` and the parts of `scripts/mobile-check.mjs` that read the accordion, `.town-repair` or `.truck-card`.
- `npm run screens -- shop shop-row-open shop-sell garage paint full-shop outpost outpost-hauler truck-trade-parts`, with the new ones added to `docs/screens/README.md`.

## Verification

- `npx vitest run src/ui/part-rows.test.ts src/ui/town.test.ts src/ui/outpost.test.ts src/ui/cards.test.ts src/ui/inventory-draw.test.ts src/ui/inventory-look.test.ts src/ui/style-guard.test.ts src/ui/guide/guide.test.ts src/ui/screens-gallery.test.ts`. Tests check the default base, that a Buy keeps the slot and adds a tile, and that equal costs hide Repair basics.
- `LAYOUT_STATES=shop,shop-sell,shop-row-open,garage,garage-paint,full-shop,shop-sorokonoga,outpost,outpost-hauler,truck-trade-parts,shop-gun-card,town-nav npm run layout`, in all three languages at both window sizes.
- Manual try, positive: at Bowl at 1280 by 720, flick down 12 rows and watch the card and wash change with no row moving. Buy a gun, double click its tile, then repair it from its card. Money, Load and the truck update at once, and the grid keeps its size.
- Manual try, negative: with no money on a sorokonoga, press Buy, Repair all and Swap. Nothing changes, each gives its one reason, and focus stays. At an outpost, show the hauler and press Buy on a gun. It stays off with its reason.
