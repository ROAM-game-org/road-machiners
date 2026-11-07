# UI redesign catalogue

This lists the game's screens by how much they need a redesign, from the images in `game/docs/screens/` at 1280 by 720. A redesign follows `game/docs/ui.md`, its "How to build a screen" steps and its worked examples of the inventory and the character screen.

## In progress

- Character: built as skill tabs with a rank ladder, issue #1506.
- Journal, enemy card and contract board: issue #1507, from the plans `ui-redesign-journal.md`, `ui-redesign-enemy-card.md` and `ui-redesign-contract-board.md` and their mockup screenshots. The user judged those mockups a slight improvement, so they are a starting direction.

## Needs a new design

Their first plans led to mockups the user rejected, so each needs a fresh design before any build.

- Market, images `trade`, `trade-shortage`, `charts`. Each good takes two rows with Buy and Sell far apart. The list scrolls, and two empty boxes sit beside the truck.
- Shop, images `shop`, `shop-row-open`, `shop-sell`, `garage`, `paint`, `full-shop`. The truck is small, the rows scroll and cut off, and storage boxes sit empty. The outpost and truck trade share its code.

## Small fixes, no redesign

- The town keeps its frame, with the art band at the top of every page. The people list hangs under a void, and the log shows through town pages.
- Options covers the opening tip and the instruments, and the layout check reports the overlap.
- The start menu stays visible behind its options and new game panels, and the layout check reports overlaps there.
- Radio calls change panel size between steps, against P14.

## Leave alone

- HUD, instruments and minimap: settled physical controls.
- The truck drawing on the enemy card: the condition view is settled.
- Inventory: settled.
- Help, saves, start menu, new game, death and quest pages read clearly.

## Not reviewed

The outpost, trade with a truck, a downed truck, phone layouts and Russian are not in the gallery.
