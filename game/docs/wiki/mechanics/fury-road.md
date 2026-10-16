# Chaos Highway

An endless highway combat run north, with outposts as milestones, picked at New game. The principles and the exceptions to Roaming are in [DESIGN.md](../../DESIGN.md#game-modes). The numbers live in `FURY_ROAD` and `HIGHWAY` in `src/data/modes.ts`. The land comes from `src/sim/highway.ts`, the run rules from `src/sim/fury-road.ts` and `src/sim/outposts.ts`, and the hauler's driving from `src/sim/hauler.ts`.

## Mode rules

Each mode is a row of `GAME_MODES` in `src/data/modes.ts`: its rule flags, its start kit, the map a new world of it is laid on, `icarus` or `highway`, and the quest a new game with the intro on opens when the kit has no arrival, `opening`. `src/sim/settings.ts` is the only reader: `modeRules()` for a world, and `modeRulesOf()`, `modeMap()` and `modeOpening()` for a setup with no world yet. Each gate reads one flag, and no code outside the mode table and the mode picker tests a mode's id. Roaming sets every flag on but `run`. Chaos Highway sets only `run` and `npcKnockouts`:

- `traffic`: no starting traffic, no spawn timers and no shops.
- `looting`: no salvage at start or on renewal, no old-world loot spots, no salvage on a wreck, no story wrecks, no cargo handovers, and spilled or dumped cargo is gone.
- `npcKnockouts` stays on: a beaten NPC is knocked out or wrecked by the same roll as in Roaming.
- `playerKnockouts`: a player knockout ends the run.
- `yielding`: no NPC flees, offers or takes a truce, begs, spares, offers or takes surrender, complies, gives up a fight, backs off or leaves a fight for service. A truck with no gun keeps its fight and rams.
- `radio`: no calls, hails, horn or pleas.
- `rescue`: no beacon, tows or scrap patches. A stranded truck waits for good.
- `roadWrecks`: no random road wrecks.
- `run`: the world plays a run of stretches between outposts, with hostile groups and payouts. The run's own rules act only on the trucks of its groups and on the hauler, so they need no other check.

A mode that turns on `traffic` or `rescue` needs a map with towns, so a new world throws on any other. The world settings apply as in Roaming.

## The highway

Chaos Highway plays on its own generated map, never on Icarus. The world seed builds the land. North in this mode is map north, which the fixed camera draws from the bottom left of the screen toward the top right, about 27° above the horizontal. The road's height rises and falls under the road grade.

Each stretch bends once. The road runs straight for 60 tiles after each outpost and before the next one, so the forts, closures and window overlaps stand on straight road. Between them it swings to one side and back: 16 to 36 tiles off its line, to a side drawn from the seed, over two cosine ramps of about 95 tiles each. One stretch in five stays straight. The heading stays within 35° of north, so on screen the road always climbs to the right, between about 8° and 60° above the horizontal, and no bend is tighter than a radius of 40 tiles. The bend numbers live in `HIGHWAY`.

- The road is one carriageway of four northbound lanes, 2 tiles (8 m) each, with centers 1 and 3 tiles each side of the middle and a 1-tile shoulder, 10 tiles (40 m) of asphalt in all. It carries no lane paint.
- A flat verge of hardpan and sand runs 13 tiles beside the asphalt on each side, so the drivable corridor is 36 tiles (144 m) wide: room for a full-speed U-turn and for a fight at gun range. The verge and badlands cut top speed by 10%, so the asphalt is the fast lane. Only poles, the odd ditched car and billboards stand near it. Past the verge come badlands of gravel, scrub and scree with rocks, crags and dead trees, then a ridge too steep to climb.
- An Old World power line runs along one verge of each stretch.

## The hauler

The player owns two trucks in a run: the gun truck, and the hauler, an 18-wheeler the player's hired driver drives north by itself. `playerTrucks()` names both, and `haulerOf()` the hauler. The hauler is a normal vehicle of faction `player` with its own driver resources and no brain, so steering, physics, wear, damage, fuel and supplies are the shared rules, and its defeat follows the player truck's rule. It is saved as the vehicle and `FuryRoadRun.hauler`, its id and the turn its alarm ends.

- Chassis: `semi`, a long-nose tractor and a box trailer drawn as one rigid model about 13 m long, with 18 wheels on 5 axles: the steering pair, two drive axles and two trailer axles, each with dual wheels. It weighs about four scouts and tops out near 6 tiles a turn, and it is in no truck offer and no NPC template. Its grid has the engine bay and the armor ring, core cells and cargo bay cells (`C`) and no deck cells. A cargo bay cell takes a cargo frame or anything stowed, so a gun, scanner, utility or store part never mounts on the hauler: the grid refuses them, and a stowed gun never fires.
- Start: the same every run: semi cores, a workhorse diesel, two plates, a full tank, base supplies and a full-health driver. It starts level with the player in the inner left lane.
- Lane: it aims at the center of one of the four lanes, 12 tiles ahead. Its lane is the lane center nearest to it, so nothing about the lane is saved.
- Hazards: when its lane is blocked within the 12 tiles ahead, by a prop, a wreck, a hazard or a truck of the run that is parked or slower than it, it takes the nearest clear lane, and on a tie the lane toward the road middle. With no clear lane it keeps its aim and the router threads the gap. It never aims off the asphalt, and only the router uses the shoulder or verge.
- Flank trucks: a group truck that is not beaten, abeam within 6 tiles and closing across, sends it one lane away from that side. With threats on both sides, or no lane left on the far side, it holds its lane.
- Speed: 4.5 tiles a turn, and its top speed for 4 turns after it takes damage. It never brakes for a fight and never stops on the road.
- Outpost: within 25 tiles of the next outpost's yard it drives to its park spot in the yard, the left of the road's center, and parks there. Between levels it keeps driving to that spot until it is parked on it, so it clears the gateway.
- It draws no random number. A stretch it drives alone replays exactly. A hauler that makes under a tile of road progress for 12 turns, while it is not stranded or parked at an outpost, raises the `stall` event, which is always a bug.

## Scenes

A stretch alternates open arenas of at least 36 tiles, where fights start, with hazard scenes: 3 in stretches 1 and 2, then 4. The first and last 24 and 30 tiles by the outposts stay clear. Each scene is laid from a recipe with a cause, and always leaves a way through on the road:

- Pileup: 3 to 6 car wrecks and burnt truck hulks over 1 or 2 lanes, slewed 20° to 80° off the road, with drums and junk spilled ahead.
- Jackknife: a bus or hauler hulk across two lanes at 60° to 90°, with 1 or 2 cars rear-ended behind it.
- Checkpoint: 2 or 3 barrier lines, each across two lanes and a shoulder on alternate sides, 10 tiles apart, so the road becomes a chicane. Sandbags sit behind each line, tank traps on its verge and an army truck beside one.
- Tank line: a dead tank on a verge and 6 to 10 tank traps in two staggered rows over 1 or 2 lanes, 3 to 4 tiles apart.
- Rockfall: a crag on the badlands edge and 6 to 12 rocks fanning onto the verge and the outer lane, smaller toward the road. The rocks keep 0.6 tiles apart, so they stay apart on the inside of a bend.
- Craters: 2 to 4 gravel dips on the lanes, with junk at their rims. They slow and jolt a truck but block nothing.
- Ramp: a Fallen Sun hull plate in one lane, 3 tiles wide, rising 0.35 over 5 tiles toward the north, sometimes just before a crater. A truck at speed flies off it. It is never the only way through.

Early stretches lean to pileups, rockfalls and craters, later ones to checkpoints and tank lines. A scene covers at most 2 of the 4 lanes up to stretch 2, then at most 3.

## Windows

The land is generated as you go, in windows of 410 by 410 tiles (1.64 km), each 310 tiles further north than the last.

- Milestone 0 is the start, and milestone `j` stands 310 tiles (1.24 km) further up the road for each `j`. A window holds two milestones on its middle column: the one the player last reached, 50 tiles from its south edge, and the next outpost, 50 tiles from its north edge.
- Every height, ground type, prop and ramp is a pure function of the seed and its place along and across the road. So two windows agree exactly where they overlap, and a reload rebuilds the same land.
- Driving on from a paid outpost needs the gates shut: both trucks parked with their whole bodies inside its yard. It opens the window beyond it. The world moves 310 tiles south under the trucks, so they stand in the same spot of the same fort on the same ground, now as the last outpost of the new window. The wrecks, smoke, craters and states left behind are gone.
- In the game Drive on autosaves and reloads the page onto the new window, with the boot step "Opening the road north".
- Each window's road is shut at both ends. Window 0 keeps a burnt pileup of two staggered rows of hulks and cars 26 tiles behind its start. Every outpost fort carries a barricade line on its center line: two staggered barrier rows from its side walls to the ridges, with sandbag nests on the verges. The next outpost's line and its closed north gate shut the window to the north. From window 1 the last outpost's line and its closed south gate shut it to the south. The line belongs to its outpost, so the two windows that hold a fort lay the same line. There is no way back past the last outpost.

## Outposts

An outpost stands at each milestone from 1 on: a road fort across the highway, centered on the road with its walls square to it. Its yard is about 14 tiles (56 m) square, floored in asphalt in the lanes and concrete outside them, on the road's own grade. The kit is its own, `fort_outpost_*`: heavy welded road-plate walls with hazard bands, corner towers with a floodlight and a gatehouse with a lintel and a slide rail over a 6-tile opening, in the road's south wall and in its north wall. The yard holds a few drums, crates, a shed and a parts rack on the concrete strips and a work light, and nothing on the lanes. Each gate has two leaves that slide sideways on the rail and rest behind the wall beside the opening when open, so a moving leaf never sweeps ground a truck stands on. Its label shows `???` until the player sees it, then "Outpost N", and discovering it gives XP as any site does. The log shows no discovery line for it, since the label and the pay line already name it.

The gates follow the fort's place in the window. The next outpost's north gate is closed for good, and its south gate stands open until both trucks are parked with their whole bodies inside the yard, when it slides shut behind them. The last outpost's south gate is closed for good and its north gate open, so a window's trucks start in its yard and leave through the north gate, which slides open when the new window loads. The closed gates are baked props that block like walls. The shut state is derived from the trucks and saved nowhere.

The hauler reaching the yard of the next outpost wins the level in that turn, at any speed, in combat or out. The gun truck in the yard alone wins nothing. It pays 120 M's for stretch 1 and 50 M's more for each later stretch. Pay has no cap, and a beaten truck adds nothing, so neither the wrecks nor the hauler's condition change it. A truck is beaten when it is knocked out or wrecked, and each truck is still counted once for the death screen and the logs. The group keeps the ids it counted in the save. The outpost is marked paid, so it never pays again, even after a reload. The other trucks of the stretch, standing or knocked out, leave the road and their fights end, so the trucks are out of combat at once.

Between levels nothing spawns. The paid next outpost is a garage, as a town garage is: `atGarage()` in `src/sim/garage.ts` says yes for a truck parked in its yard, and each outpost and garage command names the truck it acts on, which must be one of the player's two trucks, parked in the yard. Every install, removal and swap on the truck grid, and every move to or from garage storage, applies at once with no refit timer, and the screen shows the storage list beside the grid. Storage is the player's one garage storage, shared with every garage and carried from window to window. The outpost screen shows the truck and the hauler as a switch above the grid, and the grid, the repair bar, the supplies and the Buy parts tab act on the one chosen. The hauler is chosen only while it is parked in the yard. Both trucks pay from the one wallet and share the one storage. The hauler takes armor, engine and cargo parts only: a gun on its Buy button is refused. The outpost screen has three tabs:

- Market: repair all, the basics (the built-in parts and the engine) or one part at the garage price, fuel and supplies at the town price, and parts for field patching at 1.5 times their value.
- Buy parts: each outpost stocks five guns, six armor parts, three engines, three cargo parts, three utility parts, both store parts and the scanner. No part appears twice. The stock is rolled from the seed when the outpost is made and kept in the save. Any part the player can afford can be bought, armor too. It goes onto the truck's cargo cells if it fits, and into storage if not. Buying never fits it.
- Trucks: three chassis, drawn without repeats from every player chassis but the scout, from the stretch's own `trucks` stream. The offer is a pure function of the seed and the milestone, so only the bought ones are saved, in the outpost's `trucksSold`, and a bought truck leaves the offer. The price is the town's: the chassis value less the trade-in of the truck the player drives, or a payout when the trade-in is worth more. The swap is the town's, `swapChassis()`: the new chassis brings its own built-in parts, every fitted part is fitted again where it fits, then stowed, then stored, and the goods go back in cargo. Swap is disabled with the reason when the money is short or the goods would not fit the new truck. Fuel and supplies clamp to the new tanks.

Outposts buy nothing. Once the gates are shut the trucks cannot move, the outpost screen opens by itself when the leaves stop, and it has no Leave button and does not close on Escape. The next level starts only when the player presses Drive on. Then the shop is gone: the last outpost sells nothing, and driving back into its yard through the open north gate opens no shop.

Parked inside the shut gates of a paid outpost 1, 4, 8 or 12 with both trucks, a hired run plays the story scene of that outpost once. It is a page in the quest window that pays nothing and changes no rule of the run. [The road story](../../architecture/quests.md#the-road-story) has the rules.

The run has no end. The HUD's run readout shows the stretch and the distance to its outpost, like `3: 640 m`, and its tooltip reads "Stretch 3: 640 m to Outpost 3". Between levels it shows the next stretch at its full length.

## Hostile groups

Danger rises every stretch with no end. It is measured against the expected player gear: the parts of both start kits, plus the gear share of all the pay a winning player has earned before the stretch. The share is what the escort bot puts into parts for both trucks after repairs, fuel and trucks. Parts here leave out the chassis, since enemy chassis come from random templates.

- Danger is 45% of the expected player gear on stretch 1 and grows by 6 points every stretch. The Enemy growth world setting scales the 10 points, as [world-settings.md](world-settings.md) describes.
- One truck is never worth more than 45% of the expected player gear, and a stretch adds a truck only when every truck still gets at least 35% of it. So two weak trucks never stand in for one fair one: 1 truck up to stretch 5, 2 from stretch 6, 3 from stretch 11 and 4 from stretch 17.
- The danger is split evenly over the trucks as their gear money, capped at the 45%, with a floor per pool tier: 200 M's each in stretches 1 to 5 and 450 M's from stretch 6. A floor is the least that buys every template of its tier an engine and a gun.
- The trucks go in the fewest groups of at most 3, as even as they go.

Gear money grows until a truck's rated mass is full. Past that, danger grows as more trucks.

| Stretch | Gear level |
|---|---|
| 1 to 3 | light |
| 4 to 6 | standard |
| 7 | heavy |
| 8 and on | loaded |

The gear level sets only the wear of the parts and the amount of cargo. Every group truck carries a gun. It picks its gun before its cargo and utility parts, so they cannot take every gun spot. The truck of stretch 1 has no armor, mounted or spare.

The pool holds every NPC template, so a group mixes every kind of vehicle and driver. Stretches 1 and 2 draw buggies, couriers, scavengers, roamers and traders. Stretches 3 to 5 add mercs and Bowl farmers, and from stretch 6 vultures, gunwagons, Nose army trucks, convoys and convoy guards join. A vulture or a convoy needs up to 375 M's to fit an engine and a gun, more than stretches 3 to 5 give. Each truck takes its own template's loadout at the group's gear level. Its guns follow the same steps: stretches 1 and 2 carry only tier 1 guns, stretches 3 to 5 up to tier 2, and from stretch 6 any gun, mounted or spare. A new template must join the pool in `FURY_ROAD`, and a test fails until it does.

A group comes from ahead, the left or the right, never from the side of the group before it. It never comes from behind, since group trucks have no boost and could not catch a faster player.

- ahead: 36 tiles ahead of the hauler, on the hauler's line across the road;
- left or right: 30 tiles ahead and 22 tiles across, in the badlands, with more trucks 3 tiles apart along the road. A truck as fast as the hauler reaches the road before the hauler passes.

An ahead truck stands within 13 tiles of the player's line, and never farther out than the flank spawns. Spawn spots and the encounter test measure from the hauler and never from behind it, so a player who drives ahead leaves the hauler alone with the groups. Every spot is inside the window and between its two milestones. No more than 8 group trucks are on the road at once, and a group waits until it fits. A spot must lie more than the gun truck's sight radius, without the night factor, plus 6 tiles from the gun truck, so a group never appears in sight and shows first as a dust or engine contact. A group whose free spots are all in sight waits for the next turn with no failure clock. A group with no free spot at all tries again each turn and fails loudly after 20 turns. Spawning a group starts the quiet clock.

Encounters are paced in time. An encounter is on while a group truck that is not beaten is within 30 tiles of the hauler. The next group spawns after 20 quiet turns since the last spawn or encounter, about 20 seconds of driving, and a level's first group 20 turns after the level starts. Groups spawn in plan order, where the player is, so a fight may meet a scene.

Group trucks spawn with full tanks and no cargo. Each holds a feud on the hauler and hunts it every turn until the level ends, and holds a feud on the player too, so the player's guns see it as hostile. It fires on the hauler only. It fires on the gun truck, and hunts it, while the gun truck is in its attackers: after the gun truck shot it, or crashed into it so that it took damage. It drops the gun truck again when the gun truck leaves its sight, and goes back to the hauler. A hunter drives to where its target will be when it gets there, at most 30 tiles ahead of it and never past the flank spawns. A group truck that turns to flee is brought back to the fight on the next turn. A group truck always drives at its own speed and never overdrives. Out of sight of the player, it drives at full speed toward its hunting point and never slows to stop there. A truck with no gun rams.

## Balance evidence

`npm run escort:report` reads the escort and sprinter recorder logs. The last 10-seed batch, 1600 turns each, gave the numbers below. They predate the spawn lines of 36 and 30 tiles and the sight rule, and no batch has run since:

- Measured gear share of pay on both trucks: median 0.31 over 69 outposts, which is the 0.3 `gearShare` the danger uses.
- Fight 66 of 72 beaten stretches had a player shot and an encounter, short of the 95% asked for. Damage 53 of 82 stretches hurt the hauler. Variety, Choice and Rise pass: the enemy mix changed on 8 or 9 of 9 transitions, 45 of 72 outposts offered a useful part to afford and more useful parts than the money buys, and the mean hauler damage rose from 5 on stretches 1 to 3 to 121 on stretches 8 to 10.
- Beatable fails: 3 of 10 escort seeds beat stretch 10, where 6 are asked for. The escort bot loses its own truck, mostly a scout, in a fight with one or two trucks.
- Not sprintable misses by one seed: 9 of 10 sprinter seeds lost the run before stretch 10, and one carried the hauler through 16 stretches.

## Defeat

A beaten group truck is knocked out or wrecked by the normal rules. A knocked-out one stops, holds no encounter on, frees its place under the cap of 8 and is never hunted back into the fight. Nobody can loot it. When it wakes, it leaves the road that turn, since the highway has no home to retreat to. A player truck knockout ends the run as Wrecked, and a hauler knockout ends it as Hauler lost. The hauler is never knocked out and woken: the knockout test reads its own driver's health and cab, with the same roll as the player's. A stranded truck of the two can end the run from the stranded panel, which is the only way out of an empty tank or a broken drive with no parts to patch. The death screen names the mode, the last outpost reached and how far north the truck got, and offers Load save, Restart run with the same settings and a new seed, and New game.

A carried-over Chaos Highway save starts a fresh run at stretch 1 with its truck and a new hauler. So does a save from a build whose highway or escort rules changed. Migration 59 to 60 sets a run with no hauler to `null`, and load sends the save to the rescue.

## Start

The run starts at milestone 0, the gun truck in the inner right lane and the hauler level with it in the inner left lane, heading north toward the top right of the screen. The Chaos Highway kit is a scout with one MG, a stock engine, a Rebar cage on the front and another on the back, a full tank, base supplies, 4 parts for field patching and 200 M's. It is the same every run.

A new game with the intro on opens the hiring scene `road_hire` at once, before the first turn: the driver is hired by the hauler's driver Ala at the Keepers' southern outpost. Signing on is the scene's only end. A new game with the intro skipped has no story for the run.
