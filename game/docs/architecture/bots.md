# Bots

The playtest bots drive the player truck through the real turn pipeline, so economy, progression and fight changes can be measured without a human. The code is in `src/sim/progression/`. The commands that run bots are in [Tools](../tools.md).

## Rules every roaming bot follows

- A bot reads the world like a player. It sees what the player sees and hears what the player hears.
- A bot keeps auto repair on.
- A bot answers radio calls with fixed replies. A demand or a surrender is answered with a refusal, or with the cargo when the foe outmatches the bot and the bot cannot outrun it.
- A bot parks and cools its engine at the heat warning. It drives again when the engine is at half of the warning, unless it is in combat or sees a hostile.
- A bot with a broken drive and no money calls a tow when a shop it can afford is on the map. It leaves the beacon off in combat.
- A bot judges whether it outruns a foe by its truck speed as it stands. A stranded or crippled truck outruns nothing.
- In town a bot repairs, stocks fuel, supplies and repair parts, re-arms and then buys gear by the style of its archetype.

## Roaming archetypes

- `trader` buys goods where they are cheap and sells them where they are dear. It takes a haul contract only when trade has nothing to do.
- `fastTrader` trades like the trader, buys no armor and picks the fastest chassis.
- `hauler` takes the best haul contract on every board it reads, by pay per estimated turn. It trades only when no contract fits, so it measures contract pay against open trade.
- `scavenger` scavenges first, then trades, then takes hauls.
- `hunter` seeks fights. It starts from the snowball kit unless `--kit` names another.
- `climber` plays the trader until it mounts three guns, then plays a hunter.
- `markov` plays a random one of trader, scavenger, hunter and fastTrader, and holds each choice for `--markov-turns` turns.
- `robber` and `convoyRobber` belong to the income harness, not to the recorder. They demand cargo from traders, and `convoyRobber` also takes on convoys.

## Hunter

- A hunter with no guns plays the scavenger.
- It picks a fight only with a foe whose worst-case danger times 4 is within its own strength. It also accepts a bounty and chases a foe it only hears under that rule.
- It refuses truces and mercy pleas, and it asks weak foes to yield.
- It buys gear while it keeps free the cells of the biggest part and the top speed of the fastest raider it would fight.
- While no raider in the world is weak enough, it scavenges instead.
- When attacked, it fights a foe within the same rule and flees any other.
- It hands its cargo to a demand only when the foe outmatches it and it cannot outrun the foe.

## Climber

- It buys fighting gear and keeps money for loads.
- With three guns or more it hunts weaker prey, accepts truces and mercy to limit repair costs, and collects knocked-out trucks near it before it leaves for repairs.
- Between fights it trades.

## Escort and sprinter

Both play a Chaos Highway world with the Chaos Highway kit and follow the hauler from outpost to outpost. They read only what a player sees: their own trucks, the outpost stock and the pads.

The escort plays as an NPC guard would.

- Auto fire is on while no hostile is in sight.
- With no hostile in sight, it holds the escort spot beside the hauler. `followSpot()` in `src/sim/tow.ts` gives the spot.
- With a hostile in sight, it fights the deadliest one with the NPC merc fight code. `fightPoint()` and `fightOrder()` in `src/sim/ai.ts` hold that code. The deadliest is the one with the most working gun damage per cab HP, weighed down when it is out of its own range of the escort and the hauler. It keeps its target until another is half again as deadly.
- It focuses fire: every gun that reaches the target shoots it, and the others shoot the nearest hostile they reach.
- It stands just outside the range of the foe's deadliest gun when its own guns reach further, and at 60% of its own range when they do not. It never drives into the foe.
- It drives back to the escort spot when it falls behind the hauler along the road by more than its longest gun range.
- It douses a hot engine at the heat warning.
- It turns auto repair off while the tank is holed. It parks and patches the tank first, since auto repair ranks the tank last.
- It parks out of combat to patch any broken core part.
- It ends the run when it is stranded and cannot patch.
- It backs out like an NPC. After `RULES.npcStuckTurns` turns held in place away from its order point, it reverses behind itself for `RULES.npcRecoveryTurns` turns.
- Once the hauler heads in to the pad, it parks on the side of the pad away from the hauler. It keeps fighting while a foe is on it, and backs out of a stall on the way in as on the road.

At each outpost the escort does this in order.

- It repairs both trucks. It tops up fuel and supplies and buys parts until it holds 4 for patching.
- It refits its own truck by the merc loadout, never below the hauler's hurry pace.
- It spends a share of the money left on hauler armor. The share is the hauler's part of the two trucks' repair bills on arrival, so it armors the truck that took the fire.
- It buys the most valuable truck on offer that it can afford and that keeps its parts count. The truck must keep the hauler's hurry pace as its top speed. Money it cannot spend on gear builds up toward that truck.

The sprinter turns auto fire off, drives ahead to the next pad and never fires. At an outpost it repairs, refits for any speed and buys a truck. It measures whether the run can be sprinted. The hauler must lose it.

## Reading a run

- Each bot writes the logs described in [Tools](../tools.md#progression-bots).
- A Chaos Highway run waits for the road after its outpost services, so it plays on the generated highway, through its hazard scenes, whose windows move at each outpost.
- A Chaos Highway run also writes `<name>.run.jsonl`. It holds each group as it spawns, each outpost reached with its pay and the truck condition, the player kit as it leaves each outpost, every beaten group truck, and the trucks ranked by damage dealt at a lost run.
- `npm run escort:report` judges the run logs against the checks in `src/sim/progression/escort-report.ts`. The play check fails the whole report as VOID when the escort did not fight, since a bot that does not play measures nothing.
- The balance checks are hauler damage on most stretches, no fresh hauler lost in under 10 turns, a changing enemy mix, a real choice at the outposts, damage that rises, 6 of 10 escort seeds beating stretch 10 and every sprinter seed losing the run before it.
