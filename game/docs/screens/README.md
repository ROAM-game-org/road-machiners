# Screens

Read these images to see how a screen looks. Render the game only when you need a state this gallery does not hold.

Every image shows a new game on seed 4242, in English, at 1280 by 720, the smallest supported window, with the scout pickup.

`npm run screens -- <name> [name ...]` rewrites the named images from a running dev server. With no names it rewrites all of them. Set `SCREENS_URL` when the server is not on port 5173. It also prints the layout faults of those screens.

## Field

- `menu.jpg`: the field with the HUD and an opening tip.
- `overheat.jpg`: the field with the engine overheating, its red lamp lit above the heat gauge.
- `run-hot.jpg`: the field with the engine running hot but not yet overheating, its red lamp lit above the heat gauge.
- `log.jpg`: the field with a full log.
- `minimap.jpg`: the field with the minimap on.
- `inspect.jpg`: the card of an armed enemy under the cursor.
- `inspect-unarmed.jpg`: the card of an unarmed enemy.
- `call-hub.jpg`: a radio call, first choices.
- `call-group.jpg`: a radio call, one group of choices.
- `call-directions.jpg`: a radio call, directions.
- `call-deal.jpg`: a radio call, a deal.

## Truck and driver

- `inventory-empty.jpg`: the inventory with nothing picked.
- `inventory.jpg`: the inventory with the first part picked.
- `inventory-gun.jpg`: the inventory with a mounted gun picked.
- `loot.jpg`: the inventory with a salvage source.
- `look-over.jpg`: the inventory looking another truck over, its driver's name on tape over its own screen.
- `downed.jpg`: the inventory on a truck that gave up or was knocked out, with the state as the first line of its screen.
- `character.jpg`: the character screen, skills.
- `world-map.jpg`: the character screen, map.
- `journal-survey.jpg`: the journal with a survey contract.
- `full-shop.jpg`: the debug shop that holds every part.

## Town

- `town-front.jpg`: the town front page.
- `town-people.jpg`: the people page.
- `town-board.jpg`: the contract board with offers.
- `board-taken.jpg`: the contract board with one contract taken.
- `trade.jpg`: the market, goods.
- `trade-shortage.jpg`: the market in a shortage.
- `trade-untraded.jpg`: the market at Bowl with Ship Metal held, its sale off.
- `charts.jpg`: the Guidestar post page, with map squares for sale.
- `shop.jpg`: the garage, buy parts.
- `shop-row-open.jpg`: the garage, buy parts with one row open.
- `shop-sell.jpg`: the garage, sell parts.
- `garage-storage.jpg`: the garage, trucks, with stored parts on their own screen beside the picked part.
- `garage.jpg`: the garage, trucks.
- `paint.jpg`: the garage, paint.

## Pages and menus

- `quest-page.jpg`: a quest page with its picture.
- `quest-inventory.jpg`: the inventory opened from a quest page.
- `help.jpg`: the help panel.
- `options.jpg`: options in the field.
- `saves.jpg`: the save panel.
- `start-menu.jpg`: the start menu.
- `start-load.jpg`: the start menu, load.
- `start-options.jpg`: the start menu, options.
- `new-game.jpg`: the new game panel.
- `death.jpg`: the death screen.

## Not in the gallery

These need a render: the Chaos Highway outpost, trade with a truck, a downed truck, a landscape phone, Russian, the larger trucks and other windows.

## Example

`examples/` holds the [inventory before and after](../ui-redesign-example.md).
