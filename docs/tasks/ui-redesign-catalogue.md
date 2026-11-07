# UI redesign catalogue

This lists the game's screens by how much they need a redesign. It comes from reading every image in `game/docs/screens/` at 1280 by 720, built on the `inventory-redesign` branch. Each plan named here is in `docs/tasks/`.

## Needs a redesign

- Enemy card, `ui-redesign-enemy-card.md`, images `inspect`, `inspect-unarmed`. Commands sit above the drawing and read as its title. The You and Them boxes are half empty.
- Market, `ui-redesign-market.md`, images `trade`, `trade-shortage`, `charts`. Each good takes two rows with Buy and Sell far apart. The list scrolls, and two empty boxes sit beside the truck.
- Shop, `ui-redesign-shop.md`, images `shop`, `shop-row-open`, `shop-sell`, `garage`, `paint`, `full-shop`. The truck is small, the rows scroll and cut off, and storage boxes sit empty. It also covers the outpost and truck trade, which share its code.
- Character, `ui-redesign-character.md`, images `character`, `world-map`. The Machining row and the Buy buttons clip, and the columns are far apart. Standing is squeezed at the left over an empty panel. The map lives under the title Character with an empty column.
- Contract board, `ui-redesign-contract-board.md`, images `town-board`, `board-taken`. Taken contracts fall below the fold. Rewards are hard to compare, and the offers hold long prose.
- Journal, `ui-redesign-journal.md`, image `journal-survey`. A narrow panel scrolls through long prose, and the empty state leaves a large blank box.

## Small fixes, no redesign

- The town keeps its frame, with the art band at the top of every page. The people list hangs under a void, and the log shows through town pages.

- Options covers the opening tip and the instruments, and the layout check reports the overlap.
- The start menu stays visible behind its options and new game panels, and the layout check reports overlaps there. It is unclear whether a player can press through.
- Radio calls change panel size between steps, against P14.

## Leave alone

- HUD, instruments and minimap: settled physical controls.
- Truck drawing on the enemy card: the condition view is settled.
- Inventory: settled in this branch.
- Help, saves, start menu, new game, death and quest pages read clearly.

## Not reviewed

The outpost, trade with a truck, a downed truck, phone layouts and Russian are not in the gallery.

## Mockup verdict

The user reviewed the first mockups in `game/tmp/ui-mockups/`, which is gitignored. None are great. Journal, enemy card, contract board and market are slight improvements. The rest failed: shop and the first character mockup. The town keeps its frame and art band, and the town shell plan is dropped. The later character mockup is much better: Skills and Standing as switches, a tab per skill with its rank and next cost, a table with effect totals on top and each rank's gain in the same columns, Buy on the next rank, and perks as cards. The character plan's table design is replaced by it.
