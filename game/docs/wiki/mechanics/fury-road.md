# Chaos Highway

An endless highway combat run north, with outposts as milestones, picked at New game. The principles and the exceptions to Roaming are in [DESIGN.md](../../DESIGN.md#game-modes). The numbers live in `FURY_ROAD`, `HAZARDS` and `HIGHWAY` in `src/data/modes.ts`. The land comes from `src/sim/highway.ts` and `src/sim/road-hazards.ts`, the run rules from `src/sim/fury-road.ts`, `src/sim/fury-road-director.ts` and `src/sim/outposts.ts`, and the hauler's driving from `src/sim/hauler.ts`.

## Mode rules

Each mode is a row of `GAME_MODES` in `src/data/modes.ts`. The row holds the rule flags, the start kit and the map a new world is laid on, `icarus` or `highway`. `src/sim/settings.ts` is the only reader. Each gate reads one flag, and no code outside the mode table and the mode picker tests a mode's id. Roaming sets every flag on but `run`. Chaos Highway sets only `run` and `npcKnockouts`:

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

Chaos Highway plays on its own generated map, never on Icarus. The world seed builds the land. North is map north, which the fixed camera draws toward the top right of the screen.

Each stretch turns four times, so a sprinter has no long straight run. The road runs straight for 40 tiles after each outpost and before the next one. Between them it swings 4 to 5.3 tiles off its line to one side, then the same to the other, and so on, starting on a side drawn from the seed. One stretch in ten stays straight. Every bend keeps a radius of at least 40 tiles, and that limit sets how far each swing can go. The heading stays within 35° of north. The bend numbers live in `HIGHWAY`.

- The road is one carriageway of four northbound lanes, 2 tiles each, with a 1-tile shoulder on each side, 10 tiles of asphalt in all. It carries no lane paint.
- A flat verge of hardpan and sand runs 13 tiles beside the asphalt on each side, so the drivable corridor is 36 tiles wide. The verge and badlands cut top speed by 10%, so the asphalt is the fast lane.
- Past the verge come badlands of gravel, scrub and scree with rocks, crags and dead trees, then a ridge too steep to climb.
- Poles, the odd ditched car and billboards stand near the road. An Old World power line runs along one verge of each stretch.

## The hauler

The player owns two trucks in a run: the gun truck, and the hauler, an 18-wheeler that the player's hired driver drives north by itself. `playerTrucks()` names both, and `haulerOf()` the hauler. The hauler is a normal vehicle of faction `player` with its own driver resources and no brain. Steering, physics, wear, damage, fuel and supplies are the shared rules.

- Chassis: `semi`, a long-nose tractor and a box trailer drawn as one rigid model. It tops out at 6 tiles a turn. It is in no truck offer and no NPC template.
- Parts: its grid has an engine bay, an armor ring, core cells and cargo bay cells. A cargo bay cell takes a cargo frame or anything stowed. So a gun, scanner, utility or store part never mounts on the hauler, and a stowed gun never fires. Only armor, engine and cargo parts can be bought for it.
- Start: the same every run. A workhorse diesel, a full tank, base supplies and a full-health driver. It starts in the inner left lane, ahead of the player by both trucks' radii plus the yield gap.
- Lane: it aims at the center of one of the four lanes, 12 tiles ahead. Its lane is the lane center nearest to it, so nothing about the lane is saved.
- Hazards: when its lane is blocked within the 12 tiles ahead, by a prop, a wreck, a hazard or a truck of the run that is parked or slower than it, it takes the nearest clear lane. On a tie it takes the lane toward the road middle.
- No clear lane: it keeps its lane and aims past the last prop or wreck within 32 tiles, so the router threads the gap on one route. It never aims off the asphalt, and only the router uses the shoulder or verge.
- Craters: a crater dip of 0.1 or more under the hauler's width in its lane, within 32 tiles ahead, also blocks the lane. A semi that crosses a deep dip can bottom out on the rim and stop.
- Flank trucks: a group truck that is not beaten, abeam within 6 tiles and closing across, sends it one lane away from that side. With threats on both sides, or no lane left on the far side, it holds its lane.
- Speed: 4.5 tiles a turn, and the same 4.5 for 4 turns after it takes damage, since `hurry` equals `cruise`, so it never outruns a fight. It never brakes for a fight and never stops on the road.
- Outpost: within 25 tiles of the next outpost pad it drives to the pad and parks there. Between levels it stays parked.
- It draws no random number. A stretch it drives alone replays exactly.
- A hauler that makes under a tile of road progress for 12 turns, while it is not stranded or parked at an outpost, raises the `stall` event. A `stall` event is always a bug.

## Scenes

A stretch alternates open arenas of at least 36 tiles, where fights start, with hazard scenes. Stretches 1 and 2 have 3 scenes, and later stretches have 4. The first 24 tiles after an outpost and the last 30 before the next one stay clear. A draw of scenes that leaves less than 36 tiles for any arena is drawn again. A stretch that never fits throws. Each scene but the roadblock always leaves a way through on the road:

- Pileup: 3 to 6 car wrecks and burnt truck hulks over 1 or 2 lanes, slewed 20° to 80° off the road, with drums and junk spilled ahead.
- Jackknife: a bus or hauler hulk across two lanes at 60° to 90°, with 1 or 2 cars rear-ended behind it.
- Checkpoint: 2 or 3 barrier lines, each across two lanes and a shoulder on alternate sides, 10 tiles apart, so the road becomes a chicane. Sandbags sit behind each line, tank traps on its verge and an army truck beside one.
- Tank line: a dead tank on a verge and 6 to 10 tank traps in two staggered rows over 1 or 2 lanes.
- Rockfall: a crag on the badlands edge and 6 to 12 rocks fanning onto the verge and the outer lane.
- Roadblock: one solid line of barriers, sandbags, tank traps and wrecked cars and trucks across all four lanes and both shoulders, and on into the verge of one side, all the way to the badlands. On the other side it stops 2 to 5 tiles past the asphalt. The only way round is the verge on that open side. The gap there is at least 3 tiles wider than the semi, so the semi passes without touching a prop. The roadblock is the one scene that blocks the asphalt, and no lane limit applies to it.
- Craters: 2 to 4 gravel dips on the lanes, with junk at their rims. They slow and jolt a truck but block nothing. The hauler still changes lane around them.
- Ramp: a Fallen Sun hull plate in one lane, 3 tiles wide, rising 0.35 over 5 tiles toward the north, sometimes just before a crater. A truck at speed flies off it. It is never the only way through.

Early stretches lean to pileups, rockfalls and craters, later ones to checkpoints and tank lines. Roadblocks start on stretch 2 and grow more common later, up to about one a stretch. The hauler plans its own way round one: no lane is clear, so it aims past the block and the router takes it over the verge. A scene that leaves the asphalt open covers at most 2 of the 4 lanes up to stretch 2, then at most 3.

## Windows

The land is generated as you go, in windows of 410 by 410 tiles, each 310 tiles further north than the last.

- Milestone 0 is the start, and each next milestone stands 310 tiles further up the road. A window holds two milestones: the one the player last reached, 50 tiles from its south edge, and the next outpost, 50 tiles from its north edge.
- Every height, ground type, prop and ramp is a pure function of the seed and its place along and across the road. So two windows agree where they overlap, and a reload rebuilds the same land.
- Waiting for the road at a paid outpost needs both trucks parked on the pad and no group truck alive. It opens the window beyond it. The world moves 310 tiles south under the trucks, so they stand on the same pad on the same ground. The wrecks, smoke, craters and states left behind are gone. The game autosaves and reloads onto the new window, with the boot step "Opening the road north".
- Two closures shut each window's road from ridge to ridge. One is a burnt pileup of hulks and cars 26 tiles behind the last outpost. The other is the next outpost's checkpoint, with sandbags and tank traps, 16 tiles past it. There is no way back past the last outpost.

## Outposts

An outpost stands at each milestone from 0 on. It is a walled fort with the Salvage Yard's walls, corner towers, gate and yard, set beside the road on a side drawn from the seed, with its gate facing the road. A concrete spur runs from the asphalt across the town pad to the gate. Its label shows `???` until the player sees it, then "Outpost N". Discovering it gives XP as any site does.

The level is won in the turn both the hauler and the gun truck are on the pad of the next outpost, at any speed, in combat or out. Either truck on the pad alone wins nothing, and the groups keep fighting it. The outpost pays 250 M's for stretch 1 and 100 M's more for each later stretch. Pay has no cap, and neither the wrecks nor the hauler's condition change it. The outpost is marked paid, so it never pays again, even after a reload. The other trucks of the stretch leave the road and their fights end.

Between levels nothing spawns. A paid outpost is a garage, as a town garage is. `atGarage()` in `src/sim/garage.ts` says yes for a truck parked on its pad. Every install, removal and swap on the truck grid, and every move to or from garage storage, applies at once with no refit timer. Storage is the player's one garage storage, shared with every garage and carried from window to window. Both trucks pay from the one wallet.

The outpost screen shows the truck and the hauler as a switch above the grid. The grid, the repair bar, the supplies and the Buy parts tab act on the one chosen. The hauler is chosen only while it is parked on the pad. The screen has three tabs:

- Market: repair all or the basics at the garage price, fuel and supplies at the town price, and parts for field patching at 1.5 times their value.
- Buy parts: each outpost stocks five guns, six armor parts, three engines, three cargo parts, three utility parts, both store parts and the scanner. No part appears twice. The stock is rolled from the seed and kept in the save. A part goes onto the truck's cargo cells if it fits, and into storage if not. The hauler refuses a gun.
- Trucks: three chassis, drawn without repeats from every player chassis but the scout. The offer is a pure function of the seed and the milestone, and a bought truck leaves the offer. The price is the chassis value less the trade-in of the truck the player drives, or a payout when the trade-in is worth more. The swap is the town's, `swapChassis()`: the new chassis brings its own built-in parts, every fitted part is fitted again where it fits, then stowed, then stored, and the goods go back in cargo. Swap is disabled with the reason when the money is short or the goods would not fit the new truck. Fuel and supplies clamp to the new tanks.

Outposts buy nothing. The next level starts only when the player, parked on the pad, presses Wait for the road on the outpost screen.

The run has no end. The HUD's run readout shows the stretch and the distance to its outpost, like `3: 640 m`. Between levels it shows the next stretch at its full length.

## Hostile groups

A director plans each stretch's groups when the road opens, in `src/sim/fury-road-director.ts`. Danger rises every stretch with no end, on five separate lines:

- Groups: 2 on stretch 1, a quarter more each stretch, never more than one per 60 tiles of the stretch. A fraction rolls up or down, so stretches of one level differ.
- Group size: 1.5 trucks on stretch 1, 0.15 more each stretch, from 1 to 5 trucks, rolled the same way.
- Truck budget: 4 trucks on stretch 1, 2.5 more each stretch. An elite truck costs 2. When the groups ask for more trucks than the budget, the largest group loses a truck first. Budget left over turns groups elite.
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

- ahead: 22 tiles ahead of the hauler, on the hauler's line across the road.
- left or right: 22 tiles ahead and 22 tiles across, in the badlands, with more trucks 3 tiles apart along the road.

Spawn spots and the encounter test measure from the hauler and never from behind it, so a player who drives ahead leaves the hauler alone with the groups. Every spot is inside the window and between its two milestones. No more than 8 group trucks are on the road at once, and a group waits until it fits. A group with no free spot tries again each turn and fails loudly after 20 turns.

Encounters are paced by place. Each group has a place along the stretch, at the middle of its share of the stretch, moved up to 15% of that share either way. A group spawns once the hauler reaches its place, whether or not the last fight is over, so holding back from a fight never holds the next group back. Groups spawn in plan order, so a fight may meet a scene.

Group trucks spawn with full tanks and no cargo, already rolling north along the road at the hauler's cruise speed. Each holds a feud on both player trucks until the level ends, so the player's guns see it as hostile.

- Each turn a group truck picks its prey. It picks the gun truck while it is in danger from it: one of the gun truck's working guns can hit it now, or the gun truck shot it or crashed into it so that it took damage. Otherwise it picks the nearer of the two trucks, and the hauler counts as nearer only when it is more than 8 tiles nearer, so a tie goes to the gun truck. `groupPrey()` in `src/sim/combat.ts` holds the rule.
- Its drive hunts its prey. While its moving prey is more than 6 tiles behind it on the road, it rolls north toward the prey's lane instead. It waits while the prey is more than 36 tiles back and speeds up as the prey closes, so it reaches the prey's speed as the prey reaches it. While its moving prey is ahead of it beyond its gun reach, it drives at its full speed for a point 12 tiles ahead of the prey. `rollingOrder()` in `src/sim/hunters.ts` holds both rules.
- Each gun fires on the prey when it can hit it now, in range, in arc and with a line of fire, and otherwise on the nearest player truck it can hit.
- A hunter drives to where its target will be when it gets there, at most 30 tiles ahead of it and never past the flank spawns.
- A group truck that turns to flee is brought back to the fight on the next turn.
- Group trucks are never hostile to each other, whatever their factions, so they never fight among themselves.
- A group truck always drives at its own speed and never overdrives. A truck with no gun rams.

## Defeat

A beaten group truck is knocked out or wrecked by the normal rules. A group truck also gives up and is knocked out once it has lost 20% of its full HP, counting every mounted part. A beaten truck is one that is knocked out or wrecked, and each is counted once for the death screen and the logs. A knocked-out one stops, holds no encounter on, frees its place under the cap of 8 and is never hunted back into the fight. Nobody can loot it. When it wakes, it leaves the road that turn, since the highway has no home to retreat to.

A player truck knockout ends the run as Wrecked, and a hauler knockout ends it as Hauler lost. The gauge in the HUD is the hauler's part HP, armor included, as a share of its full HP. The hauler is never knocked out and woken. The knockout test reads its own driver's health and cab, with the same roll as the player's. A stranded truck of the two can end the run from the stranded panel. That is the only way out of an empty tank or a broken drive with no parts to patch.

The death screen names the mode, the last outpost reached and how far north the truck got. It offers Load save, Restart run with the same settings and a new seed, and New game.

## Start

The run starts parked on the pad of outpost 0, at milestone 0, with the hauler just ahead of the gun truck, both heading north. Outpost 0 starts paid and known, so it gives no XP and pays nothing. It is a shop like every outpost, and the run waits there until the player presses Wait for the road. That opens stretch 1 on the same window, with no window move. Nothing spawns before it. The Chaos Highway kit is a scout with one MG, a stock engine, no armor, a full tank, base supplies, 1 part for field patching and 80 M's to spend at outpost 0, enough for one better gun or a piece of armor. It is the same every run.
