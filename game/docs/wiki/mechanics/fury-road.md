# Chaos Highway

An endless highway combat run north, with outposts as milestones, picked at New game. The principles and the exceptions to Roaming are in [DESIGN.md](../../DESIGN.md#game-modes). The numbers live in `FURY_ROAD`, `HAZARDS` and `HIGHWAY` in `src/data/modes.ts`. The land comes from `src/sim/highway.ts` and `src/sim/road-hazards.ts`, the run rules from `src/sim/fury-road.ts`, `src/sim/fury-road-danger.ts` and `src/sim/outposts.ts`, and the hauler's driving from `src/sim/hauler.ts`.

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

Each stretch bends once. The road runs straight for 60 tiles after each outpost and before the next one. Between them it swings to one side and back, 16 to 36 tiles off its line, to a side drawn from the seed. One stretch in five stays straight. The heading stays within 35° of north. The bend numbers live in `HIGHWAY`.

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
- Speed: 4.5 tiles a turn, and its top speed for 4 turns after it takes damage. It never brakes for a fight and never stops on the road.
- Outpost: within 25 tiles of the next outpost pad it drives to the pad and parks there. Between levels it stays parked.
- It draws no random number. A stretch it drives alone replays exactly.
- A hauler that makes under a tile of road progress for 12 turns, while it is not stranded or parked at an outpost, raises the `stall` event. A `stall` event is always a bug.

## Scenes

A stretch alternates open arenas of at least 36 tiles, where fights start, with hazard scenes. Stretches 1 and 2 have 3 scenes, and later stretches have 4. The first 24 tiles after an outpost and the last 30 before the next one stay clear. A draw of scenes that leaves less than 36 tiles for any arena is drawn again. A stretch that never fits throws. Each scene always leaves a way through on the road:

- Pileup: 3 to 6 car wrecks and burnt truck hulks over 1 or 2 lanes, slewed 20° to 80° off the road, with drums and junk spilled ahead.
- Jackknife: a bus or hauler hulk across two lanes at 60° to 90°, with 1 or 2 cars rear-ended behind it.
- Checkpoint: 2 or 3 barrier lines, each across two lanes and a shoulder on alternate sides, 10 tiles apart, so the road becomes a chicane. Sandbags sit behind each line, tank traps on its verge and an army truck beside one.
- Tank line: a dead tank on a verge and 6 to 10 tank traps in two staggered rows over 1 or 2 lanes.
- Rockfall: a crag on the badlands edge and 6 to 12 rocks fanning onto the verge and the outer lane.
- Craters: 2 to 4 gravel dips on the lanes, with junk at their rims. They slow and jolt a truck but block nothing. The hauler still changes lane around them.
- Ramp: a Fallen Sun hull plate in one lane, 3 tiles wide, rising 0.35 over 5 tiles toward the north, sometimes just before a crater. A truck at speed flies off it. It is never the only way through.

Early stretches lean to pileups, rockfalls and craters, later ones to checkpoints and tank lines. A scene covers at most 2 of the 4 lanes up to stretch 2, then at most 3.

## Windows

The land is generated as you go, in windows of 410 by 410 tiles, each 310 tiles further north than the last.

- Milestone 0 is the start, and each next milestone stands 310 tiles further up the road. A window holds two milestones: the one the player last reached, 50 tiles from its south edge, and the next outpost, 50 tiles from its north edge.
- Every height, ground type, prop and ramp is a pure function of the seed and its place along and across the road. So two windows agree where they overlap, and a reload rebuilds the same land.
- Waiting for the road at a paid outpost needs both trucks parked on the pad and no group truck alive. It opens the window beyond it. The world moves 310 tiles south under the trucks, so they stand on the same pad on the same ground. The wrecks, smoke, craters and states left behind are gone. The game autosaves and reloads onto the new window, with the boot step "Opening the road north".
- Two closures shut each window's road from ridge to ridge. One is a burnt pileup of hulks and cars 26 tiles behind the last outpost. The other is the next outpost's checkpoint, with sandbags and tank traps, 16 tiles past it. There is no way back past the last outpost.

## Outposts

An outpost stands at each milestone from 1 on. It is a walled fort with the Salvage Yard's walls, corner towers, gate and yard, set beside the road on a side drawn from the seed, with its gate facing the road. A concrete spur runs from the asphalt across the town pad to the gate. Its label shows `???` until the player sees it, then "Outpost N". Discovering it gives XP as any site does.

The hauler reaching the pad of the next outpost wins the level in that turn, at any speed, in combat or out. The gun truck on the pad alone wins nothing. The outpost pays 120 M's for stretch 1 and 50 M's more for each later stretch. Pay has no cap, and neither the wrecks nor the hauler's condition change it. The outpost is marked paid, so it never pays again, even after a reload. The other trucks of the stretch leave the road and their fights end.

Between levels nothing spawns. A paid outpost is a garage, as a town garage is. `atGarage()` in `src/sim/garage.ts` says yes for a truck parked on its pad. Every install, removal and swap on the truck grid, and every move to or from garage storage, applies at once with no refit timer. Storage is the player's one garage storage, shared with every garage and carried from window to window. Both trucks pay from the one wallet.

The outpost screen shows the truck and the hauler as a switch above the grid. The grid, the repair bar, the supplies and the Buy parts tab act on the one chosen. The hauler is chosen only while it is parked on the pad. The screen has three tabs:

- Market: repair all or the basics at the garage price, fuel and supplies at the town price, and parts for field patching at 1.5 times their value.
- Buy parts: each outpost stocks five guns, six armor parts, three engines, three cargo parts, three utility parts, both store parts and the scanner. No part appears twice. The stock is rolled from the seed and kept in the save. A part goes onto the truck's cargo cells if it fits, and into storage if not. The hauler refuses a gun.
- Trucks: three chassis, drawn without repeats from every player chassis but the scout. The offer is a pure function of the seed and the milestone, and a bought truck leaves the offer. The price is the chassis value less the trade-in of the truck the player drives, or a payout when the trade-in is worth more. The swap is the town's, `swapChassis()`: the new chassis brings its own built-in parts, every fitted part is fitted again where it fits, then stowed, then stored, and the goods go back in cargo. Swap is disabled with the reason when the money is short or the goods would not fit the new truck. Fuel and supplies clamp to the new tanks.

Outposts buy nothing. The next level starts only when the player, parked on the pad, presses Wait for the road on the outpost screen.

The run has no end. The HUD's run readout shows the stretch and the distance to its outpost, like `3: 640 m`. Between levels it shows the next stretch at its full length.

## Hostile groups

Danger rises every stretch with no end. It is measured against the expected player gear: the parts of both start kits, plus 30% of all the pay earned before the stretch. Parts here leave out the chassis, since enemy chassis come from random templates.

- Danger is 45% of the expected player gear on stretch 1 and grows by 6 points every stretch. The Enemy growth world setting scales the 6 points, as [world-settings.md](world-settings.md) describes.
- One truck is never worth more than 45% of the expected player gear, and a stretch adds a truck only when every truck still gets at least 35% of it. So the stretches have 1 truck up to stretch 5, 2 from stretch 6, 3 from stretch 11 and 4 from stretch 17.
- The danger is split evenly over the trucks as their gear money, capped at the 45%, with a floor per pool tier. The floor is 200 M's in stretches 1 to 5 and 450 M's from stretch 6.
- The trucks go in the fewest groups of at most 3, as even as they go.

Gear money grows until a truck's rated mass is full. Past that, danger grows as more trucks. The gear level sets only the wear of the parts and the amount of cargo:

- Stretches 1 to 3: light.
- Stretches 4 to 6: standard.
- Stretch 7: heavy.
- Stretch 8 and on: loaded.

Every group truck carries a gun. It picks its gun before its cargo and utility parts, so they cannot take every gun spot. The truck of stretch 1 has no armor, mounted or spare. Guns follow the stretch: stretches 1 and 2 carry only tier 1 guns, stretches 3 to 5 up to tier 2, and from stretch 6 any gun, mounted or spare.

The pool holds NPC templates, so a group mixes kinds of vehicle and driver. Each truck takes its own template's loadout at the group's gear level.

- Stretches 1 and 2: buggies, couriers, scavengers, roamers and traders.
- Stretches 3 to 5: those plus mercs and Bowl farmers.
- From stretch 6: vultures, gunwagons, Nose army trucks, convoys and convoy guards join.

A new template must join the pool in `FURY_ROAD`, and a test fails until it does.

A group comes from ahead, the left or the right, never from the side of the group before it. It never comes from behind, since group trucks have no boost and could not catch a faster player.

- ahead: 22 tiles ahead of the hauler, on the hauler's line across the road.
- left or right: 22 tiles ahead and 22 tiles across, in the badlands, with more trucks 3 tiles apart along the road.

Spawn spots and the encounter test measure from the hauler and never from behind it, so a player who drives ahead leaves the hauler alone with the groups. Every spot is inside the window and between its two milestones. No more than 8 group trucks are on the road at once, and a group waits until it fits. A group with no free spot tries again each turn and fails loudly after 20 turns.

Encounters are paced in time. An encounter is on while a group truck that is not beaten is within 30 tiles of the hauler. The next group spawns after 20 quiet turns, and a level's first group 20 turns after the level starts. Groups spawn in plan order, where the player is, so a fight may meet a scene.

Group trucks spawn with full tanks and no cargo. Each holds a feud on the hauler and hunts it every turn until the level ends. Each also holds a feud on the player, so the player's guns see it as hostile.

- A group truck fires on any player truck it sees. Each gun picks the nearest one it can hit now, in range, in arc and with a line of fire. `canNpcEngage()` in `src/sim/combat.ts` holds the rule.
- Its drive hunts the hauler. It hunts the gun truck only while the gun truck is in its attackers, after the gun truck shot it or crashed into it so that it took damage. It goes back to the hauler when the gun truck leaves its sight.
- A hunter drives to where its target will be when it gets there, at most 30 tiles ahead of it and never past the flank spawns.
- A group truck that turns to flee is brought back to the fight on the next turn.
- A group truck always drives at its own speed and never overdrives. A truck with no gun rams.

## Defeat

A beaten group truck is knocked out or wrecked by the normal rules. A beaten truck is one that is knocked out or wrecked, and each is counted once for the death screen and the logs. A knocked-out one stops, holds no encounter on, frees its place under the cap of 8 and is never hunted back into the fight. Nobody can loot it. When it wakes, it leaves the road that turn, since the highway has no home to retreat to.

A player truck knockout ends the run as Wrecked, and a hauler knockout ends it as Hauler lost. The hauler is never knocked out and woken. The knockout test reads its own driver's health and cab, with the same roll as the player's. A stranded truck of the two can end the run from the stranded panel. That is the only way out of an empty tank or a broken drive with no parts to patch.

The death screen names the mode, the last outpost reached and how far north the truck got. It offers Load save, Restart run with the same settings and a new seed, and New game.

## Start

The run starts at milestone 0, the gun truck in the inner right lane and the hauler level with it in the inner left lane, heading north. The Chaos Highway kit is a scout with one MG, a stock engine, a Rebar cage on the front and another on the back, a full tank, base supplies, 4 parts for field patching and 200 M's. It is the same every run.
