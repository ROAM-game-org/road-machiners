# Chaos Highway

An endless highway combat run north-east, with outposts as milestones, picked at New game. The principles and the exceptions to Roaming are in [DESIGN.md](../../DESIGN.md#game-modes). The numbers live in `FURY_ROAD`, `HAZARDS` and `HIGHWAY` in `src/data/modes.ts`. The land comes from `src/sim/highway.ts` and `src/sim/road-hazards.ts`, the run rules from `src/sim/fury-road.ts`, `src/sim/fury-road-director.ts` and `src/sim/outposts.ts`, and the hauler's driving from `src/sim/hauler.ts`.

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
- `run`: the world plays a run of stretches between outposts, with hostile groups and payouts.

A mode that turns on `traffic` or `rescue` needs a map with towns, so a new world throws on any other. The world settings apply as in Roaming.

## The highway

Chaos Highway plays on its own generated map, never on Icarus. The world seed builds the land. The road runs map north (−y), which the compass calls north-east, and the fixed camera draws it toward the top right of the screen.

Each stretch between two outposts has its own length, drawn from the seed: any whole number of tiles from 230 to 310. The next stretch cannot be guessed from the last one. The range lives in `HIGHWAY`.

The road winds, so a sprinter has no long straight run. It runs straight for 40 tiles after each outpost and before the next one. Between them it is cut into bend cells of at least 40 tiles, 3 on the shortest stretch and 5 on the longest. At each cell end it swings 4 to 7 tiles off its line, to alternating sides, starting on a side drawn from the seed. One stretch in ten stays straight. Every bend keeps a radius of at least 22 tiles. The heading stays within 35° of north-east. The bend numbers live in `HIGHWAY`.

- The road is one carriageway of four northbound lanes, 2 tiles each, with a 1-tile shoulder on each side, 10 tiles of asphalt in all. It carries no lane paint.
- A flat verge of hardpan and sand runs 13 tiles beside the asphalt on each side, so the drivable corridor is 36 tiles wide. The verge and badlands cut top speed by 10%, so the asphalt is the fast lane.
- Past the verge come badlands of gravel, scrub and scree with rocks, crags and dead trees, then a ridge too steep to climb.
- Poles, the odd ditched car and billboards stand near the road. An Old World power line runs along one verge of each stretch.

## The hauler

The player owns two trucks in a run: the gun truck, and the hauler, an 18-wheeler that the player's hired driver drives north-east by itself. `playerTrucks()` names both, and `haulerOf()` the hauler. The hauler is a normal vehicle of faction `player` with its own driver resources and no brain. Steering, physics, wear, damage, fuel and supplies are the shared rules.

- Chassis: `semi`, a long-nose tractor and a box trailer on a pivot, a rig as in [Truck](truck.md). The trailer bends behind the tractor on lane changes, crater dodges and the roadblock detour, and it hits props and trucks as a body of its own. It tops out at 6 tiles a turn. It is in no truck offer and no NPC template.
- Parts: its grid has an engine bay, an armor ring, core cells and cargo bay cells. A cargo bay cell takes a cargo frame or anything stowed. So a gun, scanner, utility or store part never mounts on the hauler, and a stowed gun never fires. Only armor, engine and cargo parts can be bought for it.
- Start: the same every run. A workhorse diesel, a full tank, base supplies and a full-health driver. It starts in the inner left lane, ahead of the player by both trucks' radii plus the yield gap.
- Lane: it aims at the center of one of the four lanes, 12 tiles ahead. Its lane is the lane center nearest to it, so nothing about the lane is saved.
- Hazards: when its lane is blocked within the 12 tiles ahead, by a prop, a wreck, a hazard or a truck of the run that is parked or slower than its pace, it takes the nearest clear lane. On a tie it takes the lane toward the road middle.
- No clear lane: it keeps its lane and aims past the last prop or wreck within 32 tiles, so the router threads the gap on one route. It never aims off the asphalt, and only the router uses the shoulder or verge.
- Stuck: when a turn on a drive order, or on its way in to the yard, moves it less than a quarter tile, it backs out to the first free spot behind, behind-left, behind-right, left or right of it, 2.5 tiles away, and then drives on. It keeps backing while it moves and drops the back-out when that also goes nowhere. `backOutSpot()` in `src/sim/back-out.ts` picks the spot, and the escort bot uses the same rule.
- Craters: a crater dip of 0.1 or more under the hauler's width in its lane, within 32 tiles ahead, also blocks the lane. A semi that crosses a deep dip can bottom out on the rim and stop.
- Flank trucks: a group truck that is not beaten, abeam within 6 tiles and closing across, sends it one lane away from that side. With threats on both sides, or no lane left on the far side, it holds its lane.
- Speed: 4.5 tiles a turn, and the same 4.5 for 4 turns after it takes damage, since `hurry` equals `cruise`, so it never outruns a fight. When the gun truck's top speed without overdrive is lower, the hauler drives at that speed instead, so a slow gun truck keeps the hauler beside it. While the gun truck's tank is under the low-fuel mark, the hauler keeps to its halved top speed. While its engine runs hot (the gauge's warning mark), the hauler drives no faster than the gun truck can drive without heating its engine further in that sun, and crawls at 1.5 tiles a turn while the hot gun truck stands still, back to its pace once the engine cools under the mark. A stranded, stalled or shut-down gun truck sets no limit. Apart from heat and fuel the limit reads the truck's top speed, not its speed this turn, so the hauler does not slow for a fight or a turn.
- Waiting: on the road the hauler brakes to a stop on its lane once the gun truck trails it by more than the longest gun reach (20 tiles), and drives on from a stop once the gun truck is within 12. It waits at any distance while the gun truck is stranded, stalled, shut down, in timed work like a patch, or in a fight. It drives on alone only from a gun truck that is ahead of it, or more than 40 tiles away while it is free to drive and out of a fight. The wait reads only saved facts, so a saved wait loads as the same wait.
- Outpost: within 25 tiles of the next outpost's yard it drives to its park spot in the yard, the left of the road's center, and parks there. Between levels it keeps driving to that spot until it is parked on it, so it clears the gateway.
- It draws no random number. A stretch it drives alone replays exactly. A hauler that makes under a tile of road progress for 12 turns, while it is not stranded, parked at an outpost, parked on its spot in the next yard waiting for the gun truck, waiting on the road for the gun truck, or pinned nose to nose by a group truck that is not beaten, raises the `stall` event, which is always a bug.

## Scenes

A stretch alternates open arenas of at least 36 tiles, where fights start, with hazard scenes. Stretches 1 and 2 aim for 3 scenes, and later stretches aim for 4. The first 24 tiles after an outpost and the last 30 before the next one stay clear. Scenes are drawn one after another, and a scene that leaves less than 36 tiles for any arena is drawn again. A short stretch that runs out of room holds fewer scenes, down to none, and is never refused. Each scene but the roadblock always leaves a way through on the road:

- Pileup: 3 to 6 car wrecks and burnt truck hulks over 1 or 2 lanes, slewed 20° to 80° off the road, with drums and junk spilled ahead.
- Jackknife: a bus or hauler hulk across two lanes at 60° to 90°, with 1 or 2 cars rear-ended behind it.
- Checkpoint: 2 or 3 barrier lines, each across two lanes and a shoulder on alternate sides, 10 tiles apart, so the road becomes a chicane. Sandbags sit behind each line, tank traps on its verge and an army truck beside one.
- Tank line: a dead tank on a verge and 6 to 10 tank traps in two staggered rows over 1 or 2 lanes.
- Rockfall: a crag on the badlands edge and 6 to 12 rocks fanning onto the verge and the outer lane.
- Roadblock: one solid line of barriers, sandbags, tank traps and wrecked cars and trucks across all four lanes and both shoulders, and on into the verge of one side, all the way to the badlands. On the other side it stops 2 to 5 tiles past the asphalt. The only way round is the verge on that open side. The gap there is at least 3 tiles wider than the semi, so the semi passes without touching a prop. The roadblock is the one scene that blocks the asphalt, and no lane limit applies to it.
- Craters: 2 to 4 gravel dips on the lanes, with junk at their rims. They slow and jolt a truck but block nothing. The hauler still changes lane around them.
- Ramp: a Fallen Sun hull plate in one lane, 3 tiles wide, rising 0.35 over 5 tiles toward the north-east, sometimes just before a crater. A truck at speed flies off it. It is never the only way through.

Early stretches lean to pileups, rockfalls and craters, later ones to checkpoints and tank lines. Roadblocks start on stretch 2 and grow more common later, up to about one a stretch. The hauler plans its own way round one: no lane is clear, so it aims past the block and the router takes it over the verge. A scene that leaves the asphalt open covers at most 2 of the 4 lanes up to stretch 2, then at most 3.

## Windows

The land is generated as you go, in windows of 410 by 410 tiles. Each window is further north-east than the last by the length of the stretch it opens, so 230 to 310 tiles.

- Milestone 0 is the start, and each next milestone stands one stretch length (230 to 310 tiles, drawn from the seed) further up the road. A window holds two milestones on its middle column: the one the player last reached, 50 tiles from its south-west edge, and the next outpost, one stretch length further north-east. The window is 410 tiles tall, so the next outpost always stands at least 50 tiles inside its north-east edge.
- Every height, ground type, prop and ramp is a pure function of the seed and its place along and across the road. So two windows agree exactly where they overlap, and a reload rebuilds the same land.
- Driving on from a paid outpost needs the gates shut: both trucks parked with their whole bodies inside its yard. It opens the window beyond it. The world moves south-west under the trucks by the length of the stretch just won, so they stand in the same spot of the same fort on the same ground, now as the last outpost of the new window. The wrecks, smoke, craters and states left behind are gone.
- In the game Drive on autosaves and reloads the page onto the new window, with the boot step "Opening the road north-east".
- Each window's road is shut at both ends. Window 0 keeps a burnt pileup of two staggered rows of hulks and cars 26 tiles behind its start. Every outpost fort carries a barricade line on its center line: two staggered barrier rows from its side walls to the ridges, with sandbag nests on the verges. The next outpost's line and its closed north-east gate shut the window to the north-east. From window 1 the last outpost's line and its closed south-west gate shut it to the south-west. The line belongs to its outpost, so the two windows that hold a fort lay the same line. There is no way back past the last outpost.

## Outposts

An outpost stands at each milestone from 0 on: a road fort across the highway, centered on the road with its walls square to it. Its yard is about 14 tiles (56 m) square, floored in asphalt in the lanes and concrete outside them, on the road's own grade. The kit is its own, `fort_outpost_*`: heavy welded road-plate walls with hazard bands, corner towers with a floodlight and a gatehouse with a lintel and a slide rail over a 6-tile opening, in the road's south-west wall and in its north-east wall. The yard holds a few drums, crates, a shed and a parts rack on the concrete strips and a work light, and nothing on the lanes. Each gate has two leaves that slide sideways on the rail and rest behind the wall beside the opening when open, so a moving leaf never sweeps ground a truck stands on. Its label shows `???` until the player sees it, then "Outpost N", and discovering it gives XP as any site does. The log shows no discovery line for it, since the label and the pay line already name it.

The gates follow the fort's place in the window. The next outpost's north-east gate is closed for good, and its south-west gate stands open until both trucks are parked with their whole bodies inside the yard, when it slides shut behind them. The last outpost's south-west gate is closed for good and its north-east gate open, so a window's trucks start in its yard and leave through the north-east gate, which slides open when the new window loads. A run starts parked in the yard of outpost 0 with the gates shut, and Drive on opens its north-east gate. The closed gates are baked props that block like walls. The shut state is derived from the trucks and saved nowhere.

The level is won in the turn both the hauler and the gun truck are in the yard of the next outpost, at any speed, in combat or out. Either truck in the yard alone wins nothing, and the groups keep fighting it. The outpost pays 250 M's for stretch 1 and 100 M's more for each later stretch. Pay has no cap, and a beaten truck adds nothing, so neither the wrecks nor the hauler's condition change it. A truck is beaten when it is knocked out or wrecked, and each truck is still counted once for the death screen and the logs. The group keeps the ids it counted in the save. The outpost is marked paid, so it never pays again, even after a reload. The other trucks of the stretch, standing or knocked out, leave the road and their fights end, so the trucks are out of combat at once.

Between levels nothing spawns. The paid next outpost is a garage, as a town garage is: `atGarage()` in `src/sim/garage.ts` says yes for a truck parked in its yard, and each outpost and garage command names the truck it acts on, which must be one of the player's two trucks, parked in the yard. Every install, removal and swap on the truck grid, and every move to or from garage storage, applies at once with no refit timer, and the screen shows the storage list beside the grid. Storage is the player's one garage storage, shared with every garage and carried from window to window. The outpost screen shows the truck and the hauler as a switch above the grid, and the grid, the repair bar, the supplies and the Buy parts tab act on the one chosen. The hauler is chosen only while it is parked in the yard. Both trucks pay from the one wallet and share the one storage. The hauler takes armor, engine and cargo parts only: a gun on its Buy button is refused. The outpost screen has three tabs:

- Market: repair all, the basics (the built-in parts and the engine) or one part at the garage price, fuel and supplies at the town price, and parts for field patching at 1.5 times their value.
- Buy parts: each outpost stocks five guns, six armor parts, three engines, three cargo parts, three utility parts, both store parts and the scanner. No part appears twice. The stock is rolled from the seed and kept in the save. A part goes onto the truck's cargo cells if it fits, and into storage if not. The hauler refuses a gun.
- Trucks: three chassis, drawn without repeats from every player chassis but the scout. The offer is a pure function of the seed and the milestone, and a bought truck leaves the offer. The price is the chassis value less the trade-in of the truck the player drives, or a payout when the trade-in is worth more. The swap is the town's, `swapChassis()`: the new chassis brings its own built-in parts, every fitted part is fitted again where it fits, then stowed, then stored, and the goods go back in cargo. Swap is disabled with the reason when the money is short or the goods would not fit the new truck. Fuel and supplies clamp to the new tanks.

Outposts buy nothing. Once the gates are shut the trucks cannot move, the outpost screen opens by itself when the leaves stop, and it has no Leave button and does not close on Escape. The next level starts only when the player presses Drive on. Then the shop is gone: the last outpost sells nothing, and driving back into its yard through the open north-east gate opens no shop.

Parked inside the shut gates of the paid first outpost with both trucks, a hired run plays the story scene of that outpost once. It is a page in the quest window that pays nothing and changes no rule of the run. [The road story](../../architecture/quests.md#the-road-story) has the rules.

The run has no end. The HUD's run readout shows the stretch and the distance to its outpost, like `3: 640 m`, and its tooltip reads "Stretch 3: 640 m to Outpost 3". Between levels it shows the next stretch at its full length.

## Hostile groups

A director plans each stretch's groups when the road opens, in `src/sim/fury-road-director.ts`. Danger rises every stretch with no end, on five separate lines:

- Groups: 2 on stretch 1, a quarter more each stretch, never more than one per 60 tiles of the stretch, so a short stretch holds fewer. A fraction rolls up or down, so stretches of one level differ.
- Group size: 1 truck on stretch 1, 0.2 more each stretch, from 1 to 5 trucks, rolled the same way.
- Truck budget: 2 trucks on stretch 1, 2 more each stretch. An elite truck costs 2. When the groups ask for more trucks than the budget, the largest group loses a truck first. Budget left over turns groups elite.
- Gear money: each truck's gear money is 16% of the expected player gear, or its card's floor if that is more. The expected player gear is the money and parts of both start kits plus a quarter of all the pay earned before the stretch, since most pay goes to repairs. The Enemy growth world setting scales how fast it grows, as [world-settings.md](world-settings.md) describes.

Elite groups start on stretch 3. A stretch has at most one, and one more every 4 stretches. An elite truck has twice the gear money, buys armor before any gun past its first. A blocker is never elite.

The gear level sets only the wear of the parts and the amount of cargo: light on stretches 1 to 3, standard on 4 to 6, heavy on 7 and loaded from 8. Every group truck carries a gun, picked before its utility part, and never a cargo part. A plain truck has no armor, mounted or spare. Guns follow the stretch: stretches 1 and 2 carry only tier 1 guns, stretches 3 to 7 up to tier 2, and from stretch 8 any gun.

Each group draws one card by weight from the cards open at its stretch, so its trucks share a template. Each truck takes its own template's loadout.

- From stretch 1: buggies, couriers and roamers.
- From stretch 2: scavengers, traders and mercs join.
- From stretch 3: Bowl farmers join.
- From stretch 6: vultures, gunwagons, Nose army trucks, convoys and convoy guards join.

A card is a chaser or a blocker. A chaser's truck keeps 5.5 tiles a turn loaded, a tile faster than the hauler, on a chassis at least 15% faster than that, so it can always catch the hauler. A blocker is a slow, heavy card that always comes from ahead: Bowl farmers, gunwagons, Nose army trucks and convoys. A new template must get a card in `FURY_ROAD`, and a test fails until it does.

A group of chasers comes from ahead, the left or the right, never from the side of the group before it. It never comes from behind.

- ahead: 45 tiles ahead of the hauler, on the hauler's line across the road.
- left or right: 36 tiles ahead and 22 tiles across, in the badlands, with more trucks 3 tiles apart along the road.

Both are past the sight radius of 20 tiles from the hauler. A spot must also lie more than the gun truck's sight radius, without the night factor, plus 6 tiles from the gun truck, so a group never appears in sight and shows first as a dust or engine contact. A group whose free spots are all in sight waits for the next turn with no failure clock.

Spawn spots and the encounter test measure from the hauler and never from behind it, so a player who drives ahead leaves the hauler alone with the groups. Every spot is inside the window and between its two milestones. No more than 8 group trucks are on the road at once, and a group waits until it fits. A group with no free spot tries again each turn and fails loudly after 20 turns.

Encounters are paced by place. The places share the road from 24 tiles after the last outpost to 75 tiles before the next one, so even the last group spawns 30 tiles short of the next outpost and never at its fort. Each group has a place at the middle of its share, moved up to 15% of that share either way. A group spawns once the hauler reaches its place, whether or not the last fight is over, so holding back from a fight never holds the next group back. Groups spawn in plan order, so a fight may meet a scene.

Group trucks spawn out of sight with full tanks and no cargo, parked and heading north-east along the road, and pick up speed from their first turn. Each holds a feud on both player trucks until the level ends, so the player's guns see it as hostile.

- Each turn a group truck picks its prey. It picks the gun truck while it is in danger from it: one of the gun truck's working guns can hit it now, or the gun truck shot it or crashed into it so that it took damage. Otherwise it picks the nearer of the two trucks, and the hauler counts as nearer only when it is more than 8 tiles nearer, so a tie goes to the gun truck. `groupPrey()` in `src/sim/combat.ts` holds the rule.
- Its drive hunts its prey. While its moving prey is behind it on the road by more than its longest gun reach (at least 6 tiles) and has not hit it, it rolls north-east toward the prey's lane instead. It nearly waits while the prey is far back and speeds up as the prey closes, up to 60% of the prey's speed, so the prey always gains on it. Once the prey is in reach or has hit it, the fight drive takes over and keeps up with the prey. While its moving prey is ahead of it beyond its gun reach, it drives at its full speed for a point 12 tiles ahead of the prey. `rollingOrder()` in `src/sim/hunters.ts` holds both rules.
- Each gun fires on the prey when it can hit it now, in range, in arc and with a line of fire, and otherwise on the nearest player truck it can hit.
- A hunter drives to where its target will be when it gets there, at most 30 tiles ahead of it and never past the flank spawns.
- A group truck never drives into a fort. Its drive goal stops 3 tiles short of the fort's wall, the same reach its spawn keeps, and beside the gate lane, so the gate stays open for the convoy. It brakes there and keeps fighting with its guns, and hunts on as soon as its prey is back on the stretch. `holdOnStretch()` in `src/sim/hunters.ts` holds the rule.
- A group truck that turns to flee is brought back to the fight on the next turn.
- A group truck never parks on a halt whim, the fight whim that parks a roaming truck for a few turns. It keeps its fight drive instead.
- Group trucks are never hostile to each other, whatever their factions, so they never fight among themselves.
- A group truck always drives at its own speed and never overdrives. A truck with no gun rams.

## Defeat

A beaten group truck is knocked out or wrecked by the normal rules. A group truck also gives up and is knocked out once it has lost 20% of its full HP, counting every mounted part. A beaten truck is one that is knocked out or wrecked, and each is counted once for the death screen and the logs. A knocked-out one stops, holds no encounter on, frees its place under the cap of 8 and is never hunted back into the fight. Nobody can loot it. When it wakes, it leaves the road that turn, since the highway has no home to retreat to.

A player truck knockout ends the run as Wrecked, and a hauler knockout ends it as Hauler lost. The gauge in the HUD is the hauler's part HP, armor included, as a share of its full HP. The hauler is never knocked out and woken. The knockout test reads its own driver's health and cab, with the same roll as the player's. A stranded truck of the two can end the run from the stranded panel. That is the only way out of an empty tank or a broken drive with no parts to patch. The panel also shows while the hauler stands still with a prop inside its radius, off the next pad and outside a wait between levels.

The death screen names the mode, the last outpost reached and how far north-east the truck got. It offers Load save, Restart run with the same settings and a new seed, and New game.

## Start

The run starts parked in the yard of outpost 0, at milestone 0, with the hauler and the gun truck side by side across the road, both heading north-east. Outpost 0 starts paid and known, so it gives no XP and pays nothing. It is a shop like every outpost, and the run waits there until the player presses Drive on. That opens stretch 1 on the same window, with no window move. Nothing spawns before it. The Chaos Highway kit is a scout with one MG, a stock engine, no armor, a full tank, base supplies, 1 part for field patching and 80 M's to spend at outpost 0, enough for one better gun or a piece of armor. It is the same every run. Every skill starts at rank 1, so every basic technique works from the first stretch.

A new game with the intro on opens the hiring scene `chaos_highway_intro` at once, before the first turn: the driver is hired by the hauler's driver Ala at the southern outpost. The scene has no choices and always ends with the hire. A new game with the intro skipped has no story for the run.
