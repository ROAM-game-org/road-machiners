# Movement, routes and travel

## Map of owners

- `src/sim/ai.ts` issues NPC orders each turn and decides what NPCs drive around and when they stop for other trucks. `followsTraffic()` is true for NPCs and for the truck the player drives, and false for the Chaos Highway hauler, which keeps its lane rule in `hauler.ts`. Every `followsTraffic` truck on a route outside combat is covered by the rules below, the player included. `yieldsToTraffic()` is the player's brake: it holds the drive still for the turn when `trafficStops()` says so, and never touches the order, so automatic travel resumes. An NPC's yield is already its brake order. A moving truck counts as a conflict inside `RULES.traffic.crossCone` (parked trucks keep `parkedCone`), so a truck converging from the side is seen. They route around parked trucks and the path of a moving truck on a collision course, and the path of a truck with a stop order ends at its stop point. They stop only when that path blocks the way. Of two drivers closing on each other that both give way, the lower id goes around the other's swept path and the other holds its line (`givesWayTo()`), so they never swerve into each other. The meeting is a saved fact (`Vehicle.yieldsTo` on the giver) that `settleMeetings()` sets at the start of each turn, before orders are planned, and again at its end, from the first turn both would swerve for each other. It lasts until they pass, part, or one stops giving way, so the giver's own swerve never ends it. A giver that brakes in place (no move order, a `brake` order or `yieldsToTraffic()`) counts for the holder as a standing blocker: `standingBlockers()` adds its `stopTrack()`, its rig discs slid along its heading out to its stopping distance, each widened by `clearMargin`, and by the extra radius of the holder's rope client when the holder is a tower. So the holder routes around the spot or stops short of it. A truck on a rope never gives way (`givesWay()`), so every other driver keeps its sweep. The lower id brakes only when the way around is blocked or much longer. A stopped driver waits only for a closing truck whose path meets it. The roll counts a predicted moving truck only as a speed cap (`clearMoving`), and never one that gives way to it (`givesWayTo()`), so the holder keeps its line while the giver swerves, and backs out only from solid clearance (`clearAhead`: props, cliffs, parked trucks and ground fields). A parked truck ahead makes them wait only while it holds a move order, since its order is what it will do. Far NPCs skip the moving-truck check, since far travel holds short of any truck. A stop order in either movement layer arrives at the route's end, which is the closest point the planner reaches, and a goal to a point ends when its move arrives. `noteStuck()` is the catch-all: an NPC that stays put for `RULES.unstick.turns` turns with its goal point out of reach drives to a random free spot nearby. Recovery backing goes through `backsToDestination()`, which holds the player's cone and reach for recovering NPCs, so the driver goes nose first to a spot outside the cone.
- `src/sim/steering.ts` holds the shared driving rules, the route speed rule, the throttle zones, the set speed a manual driver keeps (`Vehicle.setSpeed`): `clickSetSpeed()` steps it once per click by the click's distance band in any direction, with anything past the reach counting as green, `setSpeedTarget()` gives physics and far travel their engine target from it, and `settleSetSpeed()` sets it to zero when a turn brings the truck to rest, `clickOrder()`, which turns a click into an order, and `playerOrder()`, which adds the route's held speed.
- `src/sim/path.ts` plans and caches routes. `src/sim/nav/` holds the grids and the search.
- `src/phys/` runs vehicle movement in Rapier and plugs into the turn pipeline.
- `src/sim/far.ts` and `src/sim/fidelity.ts` move and simplify NPCs that are far from the player.
- `src/three/travel.ts` owns automatic travel.
- `src/three/render/camera.ts` owns the view.

## Traffic rules

Every truck that `followsTraffic()` in `src/sim/ai.ts` obeys these rules on a route outside combat. That covers NPCs and the player's truck. The Chaos Highway hauler is excluded and keeps its lane rule in `hauler.ts`.

- `yieldsToTraffic()` is the player's brake. It holds the drive still for the turn when `trafficStops()` says so. It never touches the order, so automatic travel resumes.
- An NPC's yield is already its brake order.
- A moving truck counts as a conflict inside `RULES.traffic.crossCone`. Parked trucks keep `parkedCone`. A truck that converges from the side is seen.
- Drivers route around parked trucks and around the path of a moving truck on a collision course. They stop only when that path blocks the way.
- When two drivers close on each other and both give way, the lower id goes around the other's swept path. The other holds its line. `givesWayTo()` decides this, so they never swerve into each other.
- The meeting is a saved fact, `Vehicle.yieldsTo` on the giver. `settleMeetings()` sets it at the end of each turn, from the first turn both would swerve for each other. It lasts until they pass, part, or one stops giving way, so the giver's own swerve never ends it.
- A giver that brakes in place counts for the holder as a standing blocker. That is a giver with no move order, a `brake` order or `yieldsToTraffic()`. `standingBlockers()` adds its `stopTrack()`: its rig discs slid along its heading out to its stopping distance, each widened by `clearMargin`, and by the extra radius of the holder's rope client when the holder is a tower. The holder routes around the spot or stops short of it.
- A truck on a rope never gives way in `givesWay()`, so every other driver keeps its sweep.
- The lower id brakes only when the way around is blocked or much longer.
- A stopped driver waits only for a closing truck whose path meets it.
- A parked truck ahead makes a driver wait only while that truck holds a move order, since its order is what it will do.
- Far NPCs skip the moving-truck check, since far travel never crashes.

## Order arrival and stuck recovery

- A stop order in either movement layer arrives at the route's end, which is the closest point the planner reaches. A goal to a point ends when its move arrives.
- `noteStuck()` is the catch-all. An NPC that stays put for `RULES.unstick.turns` turns with its goal point out of reach drives to a random free spot nearby.
- Recovery backing goes through `backsToDestination()`. It holds the player's cone and reach for recovering NPCs, so the driver goes nose first to a spot outside the cone.
- `watchStalls()` in `src/sim/npc-watchdog.ts` counts progress as a new goal or job, or a move of more than `NPC_BEHAVIOR.progressReach` tiles from the last progress point. A truck that swings back and forth against a wall raises a `stall` and takes a fresh goal.

## Physics turns

- `endTurn(world, physicsMove(...))` plugs physics into the turn pipeline in place of the sim's 2D movement.
- A turn restores the physics world from a snapshot and simulates one second.
- Physics numbers live in `src/data/physics.ts`.
- Oil patches and harpoon lines reach physics only at turn start. `src/phys/drive.ts` reads `oilPatches()` from `src/sim/hazards.ts` and `lineAnchors()` from `src/sim/harpoon.ts`. The steps never read the sim.
- A wheel whose hub is over oil loses grip.
- A stretched harpoon line pulls both bodies. A tear comes back in the turn result for `tearLine()`.
- A shut-down truck gets no engine force from `vehicleStats()` and coasts.
- `fieldBlockers()` gives every route planner, the player's and NPCs', the ground fields its driver sees or dropped, as parked obstacles.

## Turn preparation and the path preview

- `planTurns()` in `src/phys/plan.ts` is the preview. It runs up to three turns of a world clone, then the route on to the order point. The preview runs the same physics as the turn.
- `PlanPreparation` in `src/three/plan-preview.ts` runs the preview in its own instance of the turn worker, so a preview never freezes a frame or waits behind a turn.
- It keeps only the newest request. It hands an answer to `game.ts` only for the world it was asked for. The old path stays until the new one lands.

## Playback

- The turn hands the renderer one pose per physics step.
- `frameAt()` in `src/phys/frames.ts` blends the two nearest steps at the exact play time, so a truck moves evenly at any frame rate.
- Crashes and prop breaks fire on whole steps.

## Driver clearance

- `src/sim/clearance.ts` owns the body footprint test.
- At turn start `planTurn()` in `src/phys/drive.ts` builds a `Clearance` from the solid props, the route blockers and the cliffs.
- The driver rolls its own pure-pursuit steering forward with it. The roll caps speed and backs out of a nose-on contact until the way is clear.
- `Clearance` also owns the driver's back-up and turnaround room. Manual driving uses it too and skips only the speed roll.
- A move is clear when it takes the body no deeper into props than it already sits. `depth()` measures this, with `PHYSICS.driver.roomSlack` of slack. A truck pressed against a prop can back away from it.
- The roll checks `meetsMoving()` against each live truck that is not the driver's ram target or combat foe. It uses where that truck will be by then plus `PHYSICS.driver.moverSpread` per second, so a truck that turns into the driver mid-turn is braked for. Manual driving skips this check.
- The roll counts a predicted moving truck only as a speed cap, in `clearMoving`. It never counts one that gives way to it, so the holder keeps its line while the giver swerves.
- A driver backs out only from solid clearance in `clearAhead`: props, cliffs, parked trucks and ground fields.

## Body and grip

- `brakeImpulse()` in `src/sim/steering.ts` gives each step's brake: the deceleration of the brake stat (`brakeDecel()`) times mass and ground grip, cut to what reaches the target speed. A full stop always gets the whole brake. `stopDistance()` gives the matching stopping distance, which the hauler adds to its gap before it waits, and the driver plans stops with `stopDecel`, which never exceeds `brakeDecel()`.
- `rideOf()` in `src/sim/body.ts` gives the collider center's height over flat ground at rest.
- Each look's `comHeight` puts the center of mass at a fixed height over the ground, as `comY` in the collider frame. A bigger tire lifts the body without lifting its weight.
- `applyTerrainGrip()` in `src/phys/drive.ts` sets wheel side friction per step from the ground and `rearSideGrip`. The rear tires hold less than the front.
- `holdStill()` in `src/phys/drive.ts` gives a braked, nearly stopped truck a brake hold. After the controller and the harpoon pull each step, it removes the slide along the ground and the yaw spin. It pulls back to an anchor kept in drive memory, capped by the ground grip. A truck holds on any slope its tires grip and slides past that. Trucks with no brakes are not held.

## Stranded trucks

`applyDriven()` in `src/phys/turn.ts` rescues a body that physics holds.

- It counts `strandedTurns` for a truck held on a turn. A truck is held when it is flipped or lifted.
- A truck that holds a move order that did not arrive or pass is also held when it hangs with a wheel off the ground.
- The same truck is held when every wheel is down, it pushed through at least `PHYSICS.driver.pinnedShare` of the turn's steps in `VehicleResult.pushedSteps`, and its body touches a static prop or cliff.
- The first held turn saves the truck's position as `Vehicle.strandedAt`. The run goes on while the truck stays within `RULES.stranded.reach` tiles of it and keeps that trouble. A truck that rocks on a low prop keeps counting.
- A turn that leaves reach, arrives, passes or drops the order ends the run and clears the anchor.
- After `RULES.stranded.turns` held turns, `setDown()` in `src/sim/steering.ts` places the truck on the nearest free ground. The front unit must lie in the nav component of the nearest site pad and on a cell whose `climbNeed()` is within the truck's own climb (a layer with no road cell skips the climb test). `setDownSpot()` finds the spot, with `reachesFrom()` in `src/sim/path.ts`, so a pocket of clear ground behind rocks never counts. A road fort on Chaos Highway anchors on the road outside its gate.
- `setDown()` also straightens the rig, zeroes speed and sets `strandedTurns` to `RULES.stranded.turns` and drops `strandedAt`. The next physics turn then re-seats the body. `placeBodies()` in `src/phys/units.ts` is the one placement of a truck body, for a re-seat, a teleport and a truck entering physics range. `seatUnits()` in `src/phys/seat.ts` seats each unit on the ground under its wheels, with pitch and roll from the heights there, and a rig's rear unit with its pivot anchor on the front unit's, so the body starts at rest on steep ground too.
- `getUnstuck()` in `src/sim/unstuck.ts` is the player's command for the same set-down. `unstuckBlock()` can refuse it. In a fight it refuses only a truck that is not held, with `strandedTurns` 0 or already set down. The game plays one turn after it.

## Route planning and caches

- Route grids are built per 32-tile cell, the first time a search reads that cell. `src/sim/nav/cells.ts` owns the cells.
- A cell holds its blocked cells, breakable marks and coarse regions: the connected parts of each 8 by 8 block of half-tile cells, linked where they touch.
- A piece is the connected part of a cell. A crossing joins two pieces of neighbouring cells at their cheapest touching regions. Each piece keeps the cost between each pair of its crossings.
- Pieces, crossings and their costs for every chassis radius come baked in `public/maps/icarus.routes.bin`, from `npm run routes:bake`. The file stores a key per cell from its ground and solid props. A layer rebuilds only the cells whose key differs, such as the Hollow or another kit's props. A map with no baked file, like Chaos Highway, builds every cell when the layer is made.
- Boot sends the terrain to the turn worker as soon as the map loads. `prepareRouteTerrain()` builds the route ground and the cell keys there while the world is made. Layers load their baked pieces when a route first needs that chassis. While idle, each worker builds cells outward from the player in slices of `PERF.routes.idleSliceMs`.
- The layer cache keeps one layer per solid prop set and radius, up to 16.
- Wrecks and parked vehicles are stamped per query.
- Breakable props are not blocks. They are one byte per cell in `NavLayer.marks`. `slowAt()` multiplies those cells' cost by `BREAKABLE.routeCost`.
- A broken or new fence restamps the built cells around its own footprint. The result equals a fresh build.
- Connected areas come from the pieces, so `drivable()` and `reachesFrom()` build only the cells they read.
- Claim wrecks come from `claim-clues.json`, which holds every reachable remote wreck of the map, so a new game floods no climb map.
- `src/sim/prop-index.ts` indexes obstacles for sight lines, shade rays, breakable props on far walks and the free-spot test of spawns and woken trucks. It is keyed by each obstacle's id and place, since `update()` clones the world every turn. Route planning builds its static set the same way in `src/sim/nav/layer.ts`.

## Long routes

A route never searches every cell of the map.

- Long routes first search the crossings for a chain of cells, with the driver's taste at each crossing. The coarse search then runs only in those cells and `REGION.navigation.cellRing` cells around them. A try that avoids blockers widens that to `REGION.navigation.avoidCellRing`, since a wreck wall inside a cell does not show on its crossings.
- Long routes search a coarse corridor first, two coarse blocks to each side of the coarse path. One block missed narrow gaps through steep ground and gave paths 8% over the best.
- A physics driver plans a trip longer than `REGION.navigation.farWindow` one window at a time with `routeAhead()`. It keeps the trip as a `partial` route. It plans the next window once it is within `REGION.navigation.lookahead` tiles of the window end.
- A corridor that misses its goal is widened once. Then it is planned again with the regions that fresh wrecks or parked trucks cover made costly.
- The search for a free cell near a blocked target stays within the route's own span plus `REGION.navigation.nearSlack` tiles. A route with no such cell joined to its start stays put.

## Route tastes

Every taste is a cost and never a block, so components and reachability do not change. The route cache key tells the tastes apart. A kept route, in `continueRoute()` and in far travel's `farRoute`, records its tastes. It is planned again when the driver's style changes.

- Noise. Each NPC driver scales route cost by its own smooth noise field, so drivers between the same points take different ways.
- Route style. `routeStyle()` in `src/sim/off-road.ts` is the one owner of a driver's route style, and `route()` asks it. `hidden` is for raiders that retreat, flee or are stranded, raiders on a raid, a patrol or an investigation (`huntsOffRoad()` in `src/sim/hunt-style.ts`), Sunward members by day (`keepsToItself()` in `src/sim/sunward.ts`) and Sunward cars on the ride to the light or home (`rideVigil`, `rideHome`), so they travel unseen by road traffic. It plans with an off-road taste (`offRoadTaste()` in `src/sim/nav/layer.ts`) that multiplies road tiles away from sites by `REGION.navigation.roadShyCost`. The multiplier falls linearly to 1 at `REGION.navigation.roadShyBand` tiles from the nearest road tile, from the distance field in `TerrainNav.roadShy`. Routes keep a band away from the road and still cross it where they must.
- `cut` is for every driver with the `scavenger` or `roamer` trait that is not hidden. It plans with `cutTaste()` in the same file, which multiplies each open tile (not road, not by a site, `TerrainNav.openTile`) by `REGION.navigation.shortcutCost`, so the driver leaves the road when open ground is much shorter and stays on it when the gain is small. `shortcutCost` must stay at least the highest non-road terrain speed's cost and below `offRoadCost`, or a cut route would cost more than the road it replaces. `road` is everyone else, the player included. A kept route, in `continueRoute()` and in far travel's `farRoute`, records its style and is planned again once the driver's style changes.
- The coarse corridor search applies the same multiplier on road tiles only, so a long off-road route is not planned down the road and then pushed off it cell by cell.
- Night. A driver that `avoidsCrater()` in `src/sim/sunward.ts` holds is planned with `nightTaste()` in `src/sim/nav/layer.ts`. It multiplies the cost of every tile in the Fallen Sun's night zone by `SUNWARD.avoidCost`, from a mask built once per terrain.
- Berth. A driver that remembers a truck it ran from is planned with a berth: `berthsOf()` in `src/sim/tracks.ts` gives one disc per flee track still within `fleeMemory`, at the track's last sensed point, as wide as the driver's sight radius plus `NPC_BEHAVIOR.berthMargin`, and leaves out the truck its top goal targets. `berthTaste()` in `src/sim/nav/layer.ts` multiplies the cost of tiles inside a disc by `NPC_BEHAVIOR.berthCost`, and `route()` skips its straight-line shortcut when the line crosses a disc. It is a cost, never a block, so a stop inside a disc is still reached. The berth is rebuilt from the saved tracks on every plan, and the discs are part of the route cache key. A Sunward car riding to or from the light also gets `rideBerths()` from `src/sim/off-road.ts`: one disc round every town and raider camp, as wide as the site's radius, the gray vision and `SUNWARD.rideBerthMargin`, so every car's ride keeps out of their sight, not only the rider the Hollow picker tried.
- Climb. Every driver, the player included, plans with a climb limit. `climbGrade()` in `src/sim/stats.ts` is the steepest grade the truck climbs with its current load. It uses the same constants as `climbForce()` in `src/phys/drive.ts`, times `PHYSICS.truck.climbPlanShare`. `route()` rounds it down to `REGION.navigation.climbStep`.
- `climbTaste()` in `src/sim/nav/layer.ts` multiplies the cost of every tile steeper than the limit by `REGION.navigation.overClimbCost`. `TerrainNav.steep` holds the steepness. The coarse corridor search scales each step by the share of such tiles in its blocks.
- A kept route is planned again at the next stop, when the load can change. A truck in a true pit takes the cheapest wall.
- A kept route that trucks cut short of its goal is planned again once the driver reaches its short end, so a driver whose stop was crowded drives on to it after the crowd leaves.
- `climbNeed()` in `src/sim/nav/layer.ts` is the grade reach field. It gives the least climb step that joins each cell to a road over free cells, from the same `steep` data. Survey and old spot picks read it.
- Each NPC keeps its own spot on the pad it uses, so drivers do not stack.

## Decks

- Deck rails and lips, `Deck.rails` and `Deck.lips` in `src/sim/bridge.ts`, block routes like walls through `nearRail` and `crossesRail`.
- A route gets onto a deck only over an end on the ground. It never plans a jump off a lip.

## Far NPCs

- `src/sim/fidelity.ts` sets `LIVE_REACH`, the base far sight radius plus `PERF.liveMargin`. An NPC farther than that from the player has no physics body.
- Every truck in far sight drives with physics, in fast travel too.
- `src/sim/far.ts` moves bodiless NPCs along stored routes. They never crash or ram.
- The physics ground is a square heightfield patch around the player. It reaches `LIVE_REACH` plus `PHYSICS.propLiveMargin` plus `PHYSICS.groundPatchSlack` tiles to each side. `syncDrive()` moves it once the player is more than half the slack from its center, so a physics snapshot never carries the whole map.
- A truck wakes `PERF.liveMargin` tiles outside far sight, so the wake is never seen.
- `settleWoken()` runs before physics gives a far NPC its body. An NPC that wakes inside a prop, on a cliff or on another truck steps out to the nearest clear spot with `spotNear()` in `src/sim/free-spot.ts`, with a still trail there.

## Far trips

- A far NPC plans its whole trip once on the coarse grid with `coarseTrip()` in `src/sim/path.ts`. The route runs through the center cells of the coarse regions on the corridor. It uses the same costs and tastes as a full route, and has no cell search, no blockers and no shortcut pass.
- A goal the NPC reaches within the turn's drive needs no plan. It drives there straight. This covers most escorts that trail their leader.
- Nobody sees a far truck. It drives through other trucks, props and breakable props and breaks nothing.
- It holds short only of a truck that stands on its goal, so two trucks never park on one point.
- A truck on a tow rope has no body, so it does not block the tower's route.
- Driving through props can leave a far truck in a walled pocket of ground. A trip that starts in a pocket begins at the nearest cell that joins the goal, within `REGION.navigation.nearSlack` tiles.
- A trip whose goal lies in a pocket drives a straight last leg to it when the goal is within `nearSlack` tiles of the closest reachable cell. A helper can reach a truck stranded inside.

## The player's far travel

- The player always drives with physics in the game.
- In headless runs the player moves by the far rules on fine routes.
- A far trip of the player longer than `REGION.navigation.farWindow` tiles plans the coarse corridor of the whole trip. It then searches cells only up to the corridor region one window ahead, with `routeAhead()`.
- The kept route is `partial`. At its end the truck plans the next window instead of arriving.
- The route steers around parked trucks, around moving trucks slower than its own top speed and around trucks heading at it, within a turn's drive. A faster truck heading away pulls clear, but an oncoming one does not, so two trucks meeting head on pass each other. It holds short of any other truck and breaks the breakable props it crosses.
- Every turn, fast or not, samples the player's sight along the drive once in `physicsMove()`, every `LIVE_SIGHT_STEP` tiles and at the end pose. That one track marks the explored tiles and is the playback fog.

## Cheap far rules

- A meeting where neither point lies within `LIVE_REACH` of the player plays by cheap rules. A meeting with the player always uses the full rules.
- `canVehicleSee()` is the sight radius alone, with no props, hills or dust screens.
- `cloudsSeenBy()` skips risen clouds seen over hills.
- Heat and the shade search treat the ground as open sun.
- `setHeadless()` is a process-level switch that the progression recorder sets. It counts every truck as far, so the player bot meets the cheap rules too and keeps its far route between turns. It is never saved on the World.
- `setThinning()` is the other process-level switch. The game's turn worker and every `playTurns()` run turn it on. Unit tests leave it off.
- With thinning on, an NPC farther than `PERF.lone.playerReach` tiles from the player, with no state and no attacker, plans only every `PERF.lone.every` turns, on a turn set by its id. Another truck nearby does not change that, so two far NPCs meet on their own planning turns.

## Rigs

A chassis with a `coupling` is a rig: a driven front unit and a towed rear unit on one pivot. The semi and the sorokonoga are rigs. Every rule below reads the coupling, so a new rig is a data entry and two models.

- `src/sim/rig.ts` owns unit poses. `Vehicle.pos` and `heading` are the front unit's. The saved `bend` is the front heading minus the rear heading.
- `unitPoses()`, `cellWorld()`, `rigBoxes()` and `rigDiscs()` give every other rule the rear unit, so no caller works out a trailer pose on its own.
- `bodyOf()` in `src/sim/body.ts` throws on a rig, so a caller that needs a box has to pick a unit.
- Routes plan with the chassis `radius`. Parked, wrecked and moving rigs give one disc per unit through `rigDiscs()`.
- The hauler's lane, along-road and yard rules read `rigMiddle()`, the middle of the straight rig. The yard spot is shifted forward by `frontAhead()` so the whole rig sits in the yard.

## Rig physics

- Each unit is its own Rapier body. `addCoupling()` in `src/phys/units.ts` joins them with a generic joint at the pivot.
- The joint locks the three linear axes and roll. It leaves pitch free like a fifth wheel. It limits yaw to the coupling's `bendLimit`.
- Contacts between the two units are off.
- The rear unit has two braked, unpowered wheels.
- Each unit's wheel rays skip the other unit's colliders in `rollUnits()`, since the sorokonoga's bed reaches under its tractor's drive axle.
- The turn writes the bend of the two bodies back to the truck and checks it against the limit.
- `wheelLoads()` splits the rear unit's mass between its own axle and the pivot, and the pivot share between the tractor's axles. Suspension stiffness and brake force scale with each wheel's load, so both units sit level.
- Far rigs, rigs on a tow rope and the driver's clearance roll have no body. They move the rear unit with `bendStep()`, the tractrix rule the tow bar uses. The rear axle follows the pivot, clamped at the bend limit.
- Backing runs the bend away, as on a real rig. The driver steers against the bend with the coupling's `backGain`. A backing leg is capped at `backCap` tiles.

## Player travel

- `src/three/travel.ts` owns automatic order advancement and held-Space state.
- A click sets a drive-through order. A click on its point switches it between drive-through and stop-at. Shift-click sets stop-at. A click on a site stops at its nearest pad.
- `TruckControls.order()` gives every player move order through `playerOrder()` in `src/sim/steering.ts`, which wraps `clickOrder()`. In route mode a click inside the zones' fan, `zoneAt()` and `zoneHalfAngle()`, puts the band's pace on the order and keeps a point beyond the zones' reach. `zonePace()` gives the pace: crawl, the speed now, or none. Any other click keeps the current order's pace.
- `orderThrottle()` gives the band an order shows for the hover ring and the first turn's color. The pace lives only on the order, so it ends with it, and `setDirect(true)` drops it.
- `orderSpeed()` in `src/sim/steering.ts` is the one rule for a move order's target speed, in physics, in far travel and in the fuel check. A paced order, through or stop, holds its pace within a turn's accel and brake, and a stop point still slows onto the point. The escort bot's orders carry no pace.
- `src/three/render/path.ts` draws the order point with an icon for its kind, also while turns play.
- `TruckControls.order()` gives every player move order through `playerOrder()` in `src/sim/steering.ts`, which wraps `clickOrder()`.
- In route mode a click inside the zones' fan (`zoneAt()`, `zoneHalfAngle()`) puts the band's pace on the order and keeps a point beyond the zones' reach. `zonePace()` gives the pace: crawl, the speed now, or none. Any other click keeps the current order's pace.
- `orderThrottle()` gives the band an order shows for the hover ring and the first turn's color.
- The pace lives only on the order, so it ends with it, and `setDirect(true)` drops it.
- `orderSpeed()` in `src/sim/steering.ts` is the one rule for a move order's target speed, in physics, in far travel and in the fuel check. A paced order, through or stop, holds its pace within a turn's accel and brake, and a stop point still slows onto the point. The escort bot's orders carry no pace.
- Space starts automatic travel outside combat.
- While turns run on their own, the turn button reads Auto. A tap of Space or a click stops them. A hold fast-forwards them. A held run plays at up to `travelFastSpeed`: `Travel` eases the speed toward it while the next turn is prepared, and back toward normal speed while it is not, so playback never outruns the turn worker.
- Travel pauses on Space, danger, arrival, panels and focus loss. A truck that shows in far sight does not stop the run.
- Danger is combat, a new hostile in sight, and any event that `src/three/travel-stops.ts` marks as a stop. That table has one entry per event kind, so a new kind must decide. It stops on a crash into a truck, a crash that damaged a part, a shot, a lost or broken part, spilled cargo, an engine warning or overheat, an overdrive cut-out, starvation, lost stores, bad contract and escort ends, and the player's `hazard` or `core` note. A smashed breakable prop does not stop it. Overheat and starvation repeat each turn, so Space cannot restart automatic travel while they last. A held Space still runs. The `hazard` and `core` notes cover entering a reactor's drain zone or its core, as [turns](../wiki/mechanics/turns.md) lists. `updateWorld()` also lets go of a held Space on those notes, so a hold never plays across either edge.
- Knocked-out, towed and beacon turns use the same chaining. Panels, a focused text control and a hidden tab hold them back.

## Turn worker

- `TurnPreparation` prepares the next turn in the dedicated worker entry point `src/phys/turn-worker.ts` while the current turn plays. The worker uses the same turn pipeline and portable physics snapshots.
- Only that entry calls `startTurnWorker()`. `src/phys/turn.ts` exports and starts nothing on import, since `plan.ts` imports it and the dev server would otherwise load it twice in a worker and start two Rapier instances.
- `initPhysics()` hands every caller one Rapier init.
- Each turn request carries the active quest language. The worker sets it before the turn, so a scene the turn opens plays in the player's language.
- At boot `main.ts` builds the `Travel` as soon as the world exists. It runs one warm-up turn through it while models and sounds load, and drops the turn. The boot's scene step waits for that answer, so the first real turn finds its grids, compiled code and routes ready.
- `game.ts` commits a prepared turn only after playback finishes and while advancement is still requested. Replanning invalidates stale results.
- The next turn is prepared during playback and begins in the frame the last one ends, with the leftover time carried over.

## Travel speed

- `Travel` holds the picked travel speed as an index into `CONFIG.travelSpeeds`. The speed control beside the turn button sets it through the `UiHost` hooks `travelSpeedIndex()`, `travelPlaySpeed()` and `stepTravelSpeed()`.
- `Travel.getSpeed()` returns `CONFIG.travelFastSpeed` while Space is held fast. Else it returns the picked speed while waypoint travel runs. Else it returns 1.
- Playback always runs at that step. A turn the worker has not finished in time shows as a short hitch, never as a slower step.
- The knocked-out, towed and beacon runs are not waypoint travel, so they play at 1.
- The pick survives pauses and is never saved, like all travel state.

## Waiting on the player

- While a call is open or a scene is on view, `waitsOnPlayer()` in `src/sim/world.ts` is true for the committed world.
- `Travel` then takes, chains and prepares no turn and pauses, so a held Space or automatic travel ends there. `game.ts` holds the next turn on the same check.
- `Travel.beginPlayback()` throws on a turn that would start from such a world.

## Eased stops

Trucks ease to a stop when travel pauses. That motion is real physics.

- Every turn the worker also runs a tail. The tail is a few physics steps past the turn end, with the same orders and no world rules. It covers the world time of one eased stop, from `easedStopSteps(PLAY_EASE)`.
- A tail with a crash, a break, a landing, a torn line, a passed order point or a truck on a rope is dropped, since those need the rules. That turn stops dead.
- When a turn's movement ends and travel does not go on, `Travel.stopAt()` commits the tail at once. The world takes its end poses and `game.ts` takes its end snapshot, so the plan preview, the next turn and a save all start where the trucks come to rest.
- A stop that comes after the movement ended but before the next turn began commits the same tail through `Travel.settleStop()`. That covers a call, a tap or a click while the next turn is still being prepared. It skips a truck that a rule moved in the wait. The world clock keeps its pace while such a stop is open.
- A next turn waits while the tail still plays. The clock speeds back up once that turn is ready, easing in over `playEaseMs`. The turn starts from the tail end with the time past it carried over.
- A turn asked for after the trucks came to rest starts from where they rest.
- A vehicle that a rule moves off its tail end leaves the slowdown.

## World clock

- The game's one `PlayClock` in `src/three/play-clock.ts` plays the tail on the world clock. It runs everything in the world: trucks, rounds, casings, particles, smoke, weather, world sounds, the engine sound and the camera follow.
- Information for the player runs on real time. That covers the HUD, damage number fades, music and camera panning.
- After a move the clock slows over `turnStopMs` on an exponential curve, fast at first and slow at the end. `stopWithin()` makes it reach rest exactly at the tail end.
- Panels, the menu, a focused text control and a hidden tab hold the clock at zero, also mid-turn. A frame adds at most `playbackFrameMs`.
- A radio call is no hold, and neither is a scene the turn opens. The turn plays to its end and the world eases to rest.

## Camera

- `src/three/render/camera.ts` owns the view.
- The rig opens at `DEFAULT_ZOOM` from `src/data/view.ts`, 1.15, and wheel and pinch zoom stay within `ZOOM`.
- The canvas fills `#game`. `Game.fitView()` sizes the renderer from `#game` on window resize and on any change to its size. The camera measures the canvas for its frustum, rays, `screenOf()` and pans, so the drawn picture and the tap ray share one box.
- `TruckFollow` decides when the camera follows the truck.
- A pan stops following until F, the recenter button, danger in sight, or the truck driving out of view.
- F and the recenter button put the truck at the screen center by dropping the look-ahead. The look-ahead grows back while turns play in auto mode.
- Danger in sight and the truck leaving the view resume following and keep the look-ahead.
- In auto mode the camera leads toward the order point.
- The follow chase runs on the world clock, so it slows and stops with the world instead of halting in one frame. Recentering and pans run on real time.
- Auto or Centered is the camera setting in Options, owned by `src/ui/camera-setting.ts`. V flips it.

## Touch

- `src/three/touch-map.ts` turns the canvas's touch pointers into intents.
- A drag of more than 10px pans through `TruckFollow.pan`, the same as a right-drag.
- Two fingers zoom by the ratio of their distances through `CameraRig.zoomByFactor`, which holds the same limits as the wheel.
- A tap acts at the point where the finger pressed. A hold of 500ms sets a stop point, the touch twin of Shift-click.
- A first tap on a truck only pins its card. `src/three/touch-tap.ts` decides between showing and acting.
