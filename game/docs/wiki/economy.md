# Economy

Items and goods are in [items.md](items.md). The owner code is `src/sim/economy.ts` for paid transactions, `src/sim/market.ts` for shops and contracts, `src/sim/wear.ts` for part condition and `src/data/market.ts` for shop profiles, the effort model and contract terms.

## Value and price

Every price derives from an item's value. A shop sells at value plus a spread of `ECONOMY.spread`, and buys at value minus it, before the Social skill. A truck on the road adds `ECONOMY.roadSpread` on top. Shops make some goods cheaply and need others: `PRICE_FACTOR.make` scales a made good's price. Distance from the source adds `DISTANCE_PREMIUM.perTile` per tile. A part's value is scaled by its wear step with `CONDITION.valueFactor`. The lowest price of a part is its scrap value, `ECONOMY.scrapPerKg` per kilogram.

## Effort model

A value should match the effort it takes to earn. `EFFORT.wage` is the money per turn at each tier and `EFFORT.bands` is the effort range in turns for each tier and item kind. The `npm run progression:record` and `progression:report` commands measure wages with bots.

## Goods pressure and drift

A good's price is its base price times one plus its pressure. Pressure comes from the shop's stock: `PRODUCTION.elasticity` times the share the stock is below its target, limited to `PRESSURE_MAX` on either side. A lot is priced one crate at a time through the stock. Fuel costs `ECONOMY.supplyPrice.fuel` and supplies `ECONOMY.supplyPrice.supplies` per unit, drawn from the shop's petrol and rations.

## Shops

A shop holds a finite, random stock of parts and restocks every so many turns. Only garages repair. Stalls trade, sell and fuel. The `src/sim/market.ts` rolls draw from a separate random stream, so a shop change never shifts combat.

<!-- wiki:shops -->
| id | kind | makes | needs | goods | supplies | stock size (parts) | staple parts | restock (turns) | contract slots |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| bowl | garage | grain, textiles, meds, parts, electronics | water, scrap, batteries, salt, tools, rations, fuelDrums | grain, textiles, meds, parts, electronics, water, scrap, batteries, salt, tools, rations, fuelDrums | fuel, supplies | 8 to 12 | stockEngine | 400 | 3 |
| nose | garage | salt, tools, batteries | scrap, fuelDrums, parts, rations, water, textiles, meds, electronics, relics | salt, tools, batteries, scrap, fuelDrums, parts, rations, water, textiles, meds, electronics, relics | fuel, supplies | 8 to 12 | stockEngine | 400 | 3 |
| salvage-yard | stall | scrap, parts, relics | tools, rations, fuelDrums | scrap, parts, relics, tools, rations, fuelDrums | fuel, supplies | 8 to 12 |  | 300 | 1 |
| granary | stall | rations | grain, salt, water, tools, fuelDrums | rations, grain, salt, water, tools, fuelDrums | fuel, supplies | 2 to 4 |  | 300 | 1 |
| pump-station | stall | fuelDrums | tools, batteries, rations | fuelDrums, tools, batteries, rations | fuel, supplies | 2 to 4 |  | 300 | 1 |
| dustwell | stall | water | tools, meds, rations, fuelDrums | water, tools, meds, rations, fuelDrums | fuel, supplies | 2 to 4 |  | 300 | 1 |
| green-pit | stall | water | salt, textiles, rations, fuelDrums | water, salt, textiles, rations, fuelDrums | fuel, supplies | 2 to 4 |  | 300 | 1 |
<!-- /wiki:shops -->

## Production

Sites run their recipes on the production clock, one cycle every `PRODUCTION.cycleTurns` turns. A target stock is the larger of the kind's minimum and `PRODUCTION.bufferDays` days of the site's flow of that good. Production stops at the full stock, `PRODUCTION.fullShare` of the target. Mechanics are in [mechanics/economy.md](mechanics/economy.md).

<!-- wiki:recipes -->
| site | recipe | inputs | outputs | every (production cycles) | without inputs | upkeep | upkeep crate per batches | worn every (cycles) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dustwell | well | - | 2 water | 3 | - | tools | 16 | 6 |
| green-pit | well | - | 1 water | 6 | - |  | 1 | 1 |
| bowl | sorgut | 1 water | 3 grain | 3 | 1 grain |  | 1 | 1 |
| bowl | weavers | - | 1 textiles | 8 | - |  | 1 | 1 |
| bowl | clinic | - | 1 meds | 12 | - |  | 1 | 1 |
| bowl | machinists | 1 scrap | 1 parts | 6 | - |  | 1 | 1 |
| bowl | workshop | 1 batteries, 1 scrap | 1 electronics | 24 | - |  | 1 | 1 |
| granary | rations | 2 grain, 1 salt, 1 water | 3 rations | 3 | - | tools | 24 | 6 |
| nose | pans | - | 1 salt | 2 | - |  | 1 | 1 |
| nose | forge | 2 scrap, 1 fuelDrums | 1 tools | 6 | - |  | 1 | 1 |
| nose | cells | 1 parts, 1 fuelDrums | 1 batteries | 8 | - |  | 1 | 1 |
| pump-station | pump | - | 12 fuelDrums | 2 | - | tools, batteries | 24 | 4 |
| salvage-yard | yard | - | 2 scrap, 1 parts | 3 | - | tools | 16 | 6 |
<!-- /wiki:recipes -->

<!-- wiki:site-stock -->
| site | good | target stock (crates) | production stops at | demand (one crate every N cycles) | service draw (crates per day) |
| --- | --- | --- | --- | --- | --- |
| dustwell | water | 30 | 48 | - | - |
| dustwell | tools | 30 | - | - | - |
| dustwell | meds | 30 | - | 24 | - |
| dustwell | rations | 30 | - | 12 | 1 |
| dustwell | fuelDrums | 30 | - | - | 10 |
| green-pit | water | 30 | 48 | - | - |
| green-pit | salt | 30 | - | 24 | - |
| green-pit | textiles | 30 | - | 24 | - |
| green-pit | rations | 30 | - | 12 | 1 |
| green-pit | fuelDrums | 30 | - | - | 10 |
| bowl | grain | 120 | 192 | - | - |
| bowl | textiles | 120 | 192 | - | - |
| bowl | meds | 120 | 192 | - | - |
| bowl | parts | 120 | 192 | - | - |
| bowl | electronics | 120 | 192 | - | - |
| bowl | water | 120 | - | - | - |
| bowl | scrap | 120 | - | - | - |
| bowl | batteries | 120 | - | - | - |
| bowl | salt | 120 | - | 12 | - |
| bowl | tools | 120 | - | 24 | - |
| bowl | rations | 120 | - | 2 | 1 |
| bowl | fuelDrums | 120 | - | - | 45 |
| granary | rations | 38 | 61 | - | 1 |
| granary | grain | 30 | - | - | - |
| granary | salt | 30 | - | - | - |
| granary | water | 30 | - | - | - |
| granary | tools | 30 | - | - | - |
| granary | fuelDrums | 30 | - | - | 10 |
| nose | salt | 120 | 192 | - | - |
| nose | tools | 120 | 192 | - | - |
| nose | batteries | 120 | 192 | - | - |
| nose | scrap | 120 | - | - | - |
| nose | fuelDrums | 120 | - | - | 45 |
| nose | parts | 120 | - | - | - |
| nose | rations | 120 | - | 4 | 1 |
| nose | water | 120 | - | 8 | - |
| nose | textiles | 120 | - | 12 | - |
| nose | meds | 120 | - | 24 | - |
| nose | electronics | 120 | - | 24 | - |
| nose | relics | 120 | - | 24 | - |
| pump-station | fuelDrums | 229 | 367 | - | 10 |
| pump-station | tools | 30 | - | - | - |
| pump-station | batteries | 30 | - | - | - |
| pump-station | rations | 30 | - | 12 | 1 |
| salvage-yard | scrap | 30 | 48 | - | - |
| salvage-yard | parts | 30 | 48 | - | - |
| salvage-yard | relics | 30 | 48 | - | - |
| salvage-yard | tools | 30 | - | - | - |
| salvage-yard | rations | 30 | - | 12 | 1 |
| salvage-yard | fuelDrums | 30 | - | - | 10 |
<!-- /wiki:site-stock -->

<!-- wiki:site-events -->
| site | kind | recipe | cadence scale | days | daily chance | repair with tools (turns) |
| --- | --- | --- | --- | --- | --- | --- |
| pump-station | surge | pump | 0.5 | 1 | 0.08 | - |
| pump-station | breakdown | pump | 4 | 2 | 0.05 | 90 |
| bowl | surge | sorgut | 0.5 | 1 | 0.08 | - |
| dustwell | breakdown | well | 4 | 2 | 0.05 | 90 |
| salvage-yard | breakdown | yard | 4 | 2 | 0.05 | 90 |
<!-- /wiki:site-events -->

## Repair and wear

Repair costs `ECONOMY.repairShare` of a part's value per share of HP restored. A part gains a wear step each time it drops to 0 HP, up to `CONDITION.maxWear`, and each step costs `CONDITION.stepLoss` of its max HP and of its job stats. Wear hits come at `WEAR.chancePerTile` per part per tile driven. A field repair never lifts a part above `REPAIR.fieldCapShare` of its max HP and takes `REPAIR.turnsPerPart` turns per unit of parts. A roadside patch gives `PATCH.share` of max HP.

## Contracts

The player holds at most `CONTRACTS.maxActive` contracts. A contract's window counts from the turn the player accepts it. A haul has a window of `CONTRACTS.haul.durationFactor` times its estimated travel, and pays `CONTRACTS.haul.rewardFactor` tier wages. A share `CONTRACTS.haul.rush.chance` of hauls are rush jobs: their window is `CONTRACTS.haul.rush.durationFactor` times the estimated travel, and they pay `CONTRACTS.haul.rush.premium` times the standard reward. A supply order asks for `CONTRACTS.procure.units` crates, pays each at the shop's standing price at posting, plus `CONTRACTS.procure.travelFactor` times the rush pay of the round trip to the nearest shop that makes the good, and gives the rush window of that trip plus `CONTRACTS.procure.slackTurns` turns. A survey pays the estimated turns of the loop from the shop through its places nearest first and back, plus `CONTRACTS.survey.surveyTurns` per place and `CONTRACTS.survey.searchTurns` per place for the search around its clue, at `CONTRACTS.survey.rewardFactor` tier 1 wages, with the haul's standard window. A shop offers one when a free survey site lies within `CONTRACTS.survey.range` tiles, and no site is named by two live contracts. A clue states its distance rounded to `CONTRACTS.survey.clue.roundTiles` tiles from a named place within `CONTRACTS.survey.clue.range` tiles, and the bake keeps it only when no other old place of the same kind more than `CONTRACTS.survey.clue.nearby` tiles from the site lies in its compass eighth within `CONTRACTS.survey.clue.band` tiles of that distance.

## Upkeep

The player's truck pays no upkeep. NPC drivers pay under `NPC_UPKEEP`.

## Numbers

<!-- wiki:numbers -->
| path | value |
| --- | --- |
| `ECONOMY.spread` | 0.2 |
| `ECONOMY.roadSpread` | 0.3 |
| `PRICE_FACTOR.make` | 0.75 |
| `DISTANCE_PREMIUM.perTile` | 0.0021 |
| `CONDITION.valueFactor` | 1, 0.7, 0.55, 0.45, 0.35 |
| `ECONOMY.scrapPerKg` | 6.33 |
| `EFFORT.wage` | {"1":12.33,"2":33.33,"3":73.33} |
| `EFFORT.bands` | {"1":{"weapon":[250,700],"engine":[250,700],"armor":[250,700],"accessory":[250,700],"cargo":[250,700],"scanner":[250,700],"store":[250,700],"utility":[250,700],"chassis":[5000,7500],"good":[40,100]},"2":{"weapon":[180,480],"engine":[180,480],"armor":[180,480],"accessory":[180,480],"cargo":[180,480],"scanner":[180,480],"store":[180,480],"utility":[180,480],"chassis":[2800,4200],"good":[50,100]},"3":{"weapon":[180,380],"engine":[180,380],"armor":[180,380],"accessory":[180,380],"cargo":[180,380],"scanner":[180,380],"store":[180,380],"utility":[180,380],"chassis":[1900,2800],"good":[40,80]}} |
| `PRODUCTION.elasticity` | 0.6 |
| `ECONOMY.supplyPrice.fuel` | 100 |
| `ECONOMY.supplyPrice.supplies` | 167 |
| `PRODUCTION.cycleTurns` | 19 |
| `PRODUCTION.bufferDays` | 1.5 |
| `PRODUCTION.fullShare` | 1.6 |
| `ECONOMY.repairShare` | 0.85 |
| `CONDITION.maxWear` | 4 |
| `CONDITION.stepLoss` | 0.027 |
| `WEAR.chancePerTile` | 0.00055 |
| `REPAIR.fieldCapShare` | 0.7 |
| `REPAIR.turnsPerPart` | 2 |
| `PATCH.share` | 0.25 |
| `CONTRACTS.maxActive` | 3 |
| `CONTRACTS.haul.durationFactor` | 2.5 |
| `CONTRACTS.haul.rewardFactor` | 24 |
| `CONTRACTS.haul.rush.chance` | 0.25 |
| `CONTRACTS.haul.rush.durationFactor` | 1.5 |
| `CONTRACTS.haul.rush.premium` | 1.75 |
| `CONTRACTS.procure.units` | 3, 12 |
| `CONTRACTS.procure.travelFactor` | 0.5 |
| `CONTRACTS.procure.slackTurns` | 6 |
| `CONTRACTS.survey.surveyTurns` | 10 |
| `CONTRACTS.survey.searchTurns` | 20 |
| `CONTRACTS.survey.rewardFactor` | 15 |
| `CONTRACTS.survey.range` | 234 |
| `CONTRACTS.survey.clue.roundTiles` | 25 |
| `CONTRACTS.survey.clue.range` | 234 |
| `CONTRACTS.survey.clue.nearby` | 40 |
| `CONTRACTS.survey.clue.band` | 40 |
<!-- /wiki:numbers -->
