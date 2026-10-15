# Chaos Highway escort bot

**Status:** reviewing
**Branch:** escort-bot
**Worktree:** .worktrees/escort-bot
**Goal:** On today's balance, the escort bot plays competently and reaches stretch 10 on at least 9 of 10 seeds with `--physics true`. Today's balance is easy for a competent player, so 9 is the bar. `escort:report` keeps its own `BEATABLE_SEEDS` criterion for later balance tuning, and this task reports the count against 9 without changing it. The sprinter still loses every seed before stretch 10.
**Mode:** hands-off

## Context
- The user beat stretch 10 with little effort and full driver health. The wiki records 3 of 10 escort seeds reaching stretch 10.
- The escort bot lives in `game/src/sim/progression/runner.ts`. It steers at the foe nearest the hauler but aims at the foe nearest itself (`runner.ts:93`, `runner.ts:137`), so with two trucks its moves and its guns split.
- It never rams on purpose, never breaks off on damage, never body-blocks for the hauler and never uses utilities.
- At outposts it spends 85% of its gear money on its own refit before it looks at trucks (`runner.ts:185`, `runner.ts:221`), so it rarely leaves the scout. Its refit buys only guns, armor and engines.
- The user's run reached stretch 10 easily in a scout. It shows what is possible and is the bar to tune balance against later. The bot does not copy it.

## Design
Make the escort bot play competently, with no balance change. Balance tuning waits for this bot, so `FURY_ROAD`, `HIGHWAY` and every number in `src/data/` stay as they are.

Each behavior is a small pure function in the bot. A behavior stays only if batches show it improves survival or hauler protection, and it is cut if they do not. Each threshold is a named constant with its reason.

Candidates, each judged by its batch result:
- One target. Steering and guns use the same foe: the one hunting the hauler, nearest the hauler, kept while it lives, so fire is focused.
- Hold gun range. The bot keeps a stand-off distance and does not sit in contact.
- Break off. Below a condition threshold the bot leaves the fight and patches out of sight when it can.
- Ram, guard and body-block. Tried only if they measurably help.
- Shop. Repairs, fuel and patch goods first, then the purchases that win more fights, including a better truck when it pays off.

TDD: yes for the pure choices. The batch run checks the whole bot.

### Invariants
- IV1 — No file under `game/src/data/` and no `FURY_ROAD` or `HIGHWAY` number changes.
- IV2 — The bot issues only commands a player can issue.
- IV3 — The sprinter bot still loses every seed before stretch 10.

### Assumptions
- AS1 — A 10-seed escort batch with `--physics true` finishes within a few hours on the laptop, run in the background with a log.

### Unknowns
- UK1 — Whether `escort:report` should read the new diagnostic run log instead of `run.jsonl`. Decide after the run log task merges.

## Conclusion

### Hands-off decisions
- An earlier version of the bot read `brain.attackers` of hostile trucks, which is hidden NPC state. Review found it. Every result that used it is void. That key is set on every spawned group truck by its feud on the player, so it warned the bot of groups before it could see them. The bot now reads only its own trucks, the outpost stock and, in earlier versions, shots it saw.
- Branches run-log and hauler-stall were merged into escort-bot, local only. The recorder now writes `<bot>-<seed>.stream.jsonl` and `run:timeline` reads it.
- Behaviors were judged by 20-seed batches with `--physics true`, counting seeds that beat stretch 10. The score is noisy, about plus or minus 2 seeds, so a change counted only when it moved the score by more than that or fixed a named failure.
- Result on the judged seeds 1 to 20, by variant, with the same shop (tank first, truck first) unless noted. Run ahead after a shot, 15 of 20. Never fire and never run, 16 of 20. Fire and stand when a lone truck shot the gun truck, 9 of 20. Fire and run when the hauler is shot, 7 of 20 with the gun truck 4 tiles behind. Fight when the gun truck outguns a group by gear value, 8 of 20 and 11 of 20 in the two earlier forms. Never fire, all gear money to the hauler, 17 of 20. The same, saving for a better truck, 18 of 20.
- The shipped bot never fires and never runs. Every variant that made the gun truck fight, guard, duel or decoy scored lower than the variant that left it quiet, so the bot is not a competent fighter. The gun truck wins nothing by fighting at this skill, and the diagnosis table shows why: groups of two trucks out-damage a scout in a few turns.
- Shop: the bot spends the money after repairs, fuel and patch goods on a better truck first. It buys the most valuable truck it can pay that keeps pace with the hauler's top speed after damage. When a better truck is within reach of the next pay but not yet affordable, it saves and spends nothing on gear. It puts all remaining gear money on hauler armor (`HAULER_SHARE` is 1). Among runs that bought a truck by stretch 6, 15 of 16 beat stretch 10, against 90 of 121 that kept the scout.
- Repairs: auto repair is off while the tank is holed, and the bot patches the tank first. It parks to patch any broken core part out of combat. It douses a hot engine at the heat warning. Seeds 8 and 13 had lost the run to a leaking tank that auto repair ranks last.
- The gun truck rides 10 tiles behind the hauler in its lane. Riding beside the hauler was not tried after the hauler-stall merge. 40 tiles behind gave 16 of 20 and 14 of 20, no better than 10 tiles behind.
- Patch goods stay at 4. Eight goods cost enough gear money that every kit stayed at one MG.
- The sprinter path keeps its old shop order and behavior, and its batch gave 3 of 10 losing before stretch 10, as before the escort work.
- `BEATABLE_SEEDS` in `escort:report` is unchanged.
- The coordinator changed the goal: the bot must play competently, not copy the user's run. The user raised the target from 6 to 9 of 10 seeds, then to 18 of 20 on seeds 1 to 20.

### Deferred (needs user input)
- The bar holds on the judged seeds and not on fresh ones. The shipped bot beat stretch 10 on 18 of 20 on seeds 1 to 20 and on 14 of 20 on seeds 21 to 40, which is 32 of 40 pooled. Of the 8 failures, 3 are sim defects (a hauler stall and two scene errors) and 5 are the gun truck wrecked by one or two trucks. Without the sim defects the pooled rate is 32 of 37.
- Game design: the bot wins by holding fire and putting its money on the hauler. Hostile groups shoot only the hauler unless the gun truck shoots first or crashes into them, so a quiet gun truck is barely punished. The Fight criterion reads 0 of 302. Decide whether groups must punish a quiet gun truck, since any bot that fights scored lower here.
- Sim defect, hauler `stall`, which raises the recorder error. The hauler sits at speed 0 on a `through` order with 74 to 95 percent hp and 15 to 17 tiles off the road. Seen after the hauler-stall merge: seed 19 at T753 near (186.6, 238.5); seed 28 at T841 near (205.3, 299.0); seed 25 at T301 near (239.0, 213.4); seed 31 at T673 near (195.6, 265.5); seed 6 at T193 near (206.8, 281.1); seed 10 at T1159 near (199.3, 190.1); seeds 1 and 3 at T1532 and T1574. In seed 6 the hauler hit barriers 147 and 148, drove off the road and rammed deadTruck-155 for 12 turns. Not worked around.
- Sim defect, scene generation: `Stretch N has no room for 4 scenes between arenas of 36 tiles` ends the run for seed 34 at stretch 8 (T473), seed 38 at stretch 11 (T719) and seed 15 at stretch 20 (T1444).
- The gear share the danger rule assumes (0.3) differs from what the bot spends: 0.56 over 301 outposts. Balance tuning must re-measure `gearShare`.
- The Not sprintable criterion already failed before this work and still reads 3 of 10. IV3 cannot hold on today's balance.
- UK1 stays open: `escort:report` still reads `run.jsonl`.

### Diagnosis of the lost runs (seeds 1 to 20, no hidden read, after merging run-log and hauler-stall)

Batch `game/tmp/d1/` (the bot before the shop and repair changes): 13 of 20 beat stretch 10. Read with `run:timeline --by stretch` and the turn logs. The seven runs that ended before stretch 10:

| Seed | Stretch | Lost | Enemy kit | Damage | Fight length | What the bot did | What a competent player does |
|---|---|---|---|---|---|---|---|
| 2 | 6 | gun truck | scout (mg), carrier (mg, grenade launcher) | scout 157, carrier 113 on the gun truck | 14 turns | Quiet until shot, then traded point blank with 2 MGs against two trucks | Focus the carrier first, keep range, buy plates for the gun truck |
| 3 | 9 | hauler | longbed (autocannon), scout (mg, harpoon) | longbed 343 on the hauler | 90 turns | Gun truck with 6 guns (gear 1210) stayed quiet 30 tiles behind, fired only at T827 after a shot | Engage at the first hit on the hauler, since one slow longbed loses to 6 guns |
| 5 | 9 | gun truck | two vans (flechette, mg), vulture | vulture 517 in 4 turns | 4 turns | Fired 14 rounds, 5 hits, then wrecked | Engage with 3 guns at range, or break away before the vulture closes |
| 7 | 6 | gun truck | van (grenade launcher), bukhanka (amRifle) | 134 and 153 | 8 turns | Scout with mg and slug cannon traded at close range | Same as seed 2 |
| 8 | 1 | stranded, run abandoned | scavenger van (mg) | 6 of 6 hits on the start truck | 15 turns | Patched wheels and transmission first, tank at 0 hp leaked all fuel | Patch the tank first, since auto repair ranks it last |
| 13 | 3 | stranded, run abandoned | buggy (slug cannon) | tank holed in the fight | 40 turns | Fled with a leaking tank, fuel 11 to 0 in 11 turns, then abandoned with 4 patch parts | Break away sooner and patch the tank the moment combat ends |
| 15 | 3 | hauler | lincoln (battle rifle) | 277 on the hauler over 36 turns | 36 turns | Fired 20 rounds with 2 hits, then ran ahead; the lincoln stayed on the hauler | Stay with the hauler and keep firing, or ram the lincoln |

Across those 20 seeds the bot sat about 18 tiles behind the hauler for most of every run, past the 12 tile range of an MG. Later batches showed the same shape for the gun truck: one truck that fires at it for 15 to 30 turns wrecks it, and it does not fire back. The causes by count over the failed runs of the later batches: gun truck wrecked by one or two trucks (most), hauler lost to a group of two or three trucks in one or two turns, tank leak or broken wheel left unpatched, and hauler or scene sim defects.

## Verify

Final bot, `--physics true`, 1600 turns. Logs: `game/tmp/final4/` for seeds 1 to 20 and `game/tmp/o0/` for seeds 21 to 40 of the same bot.

Escort, last stretch beaten per seed 1 to 20: 14, 15, 17, 15, 2, 20, 13, 14, 14, 20, 20, 20, 16, 20, 12, 18, 15, 13, 9, 15. 18 of 20 beat stretch 10, which meets the bar. Seed 5 was wrecked at stretch 3 and seed 19 raised a hauler stall at stretch 9.

Seeds 21 to 40: 14 of 20, with two scene errors and four wrecked gun trucks among the 6 misses. Pooled, 32 of 40.

Sprinter, last stretch beaten per seed 1 to 10: 10, 7, 14, 14, 8, 8, 11, 16, 10, 16. Seeds 2, 5 and 6 lost before stretch 10.

`escort:report` on seeds 1 to 20 and the sprinter batch: Beatable PASS (18 of 20, need 6), Damage PASS, Variety PASS, Choice PASS, Rise PASS, Fight FAIL (0 of 302), React FAIL (1 of 2), Not sprintable FAIL (3 of 10).

Tests: `escort-tactics.test.ts`, `runner.test.ts`, `run-timeline.test.ts`, `hauler.test.ts`, `hauler-drive.test.ts`, `escort-report.test.ts` and `record.test.ts` pass, and `npm run typecheck` passes.

## Fight bot (branch fight-bot)

The escort bot now fights the way an NPC fighter does and adds only what a player must do. Auto fire stays on, so each gun takes the nearest hostile it can hit, as `autoOrders()` does for an NPC. The gun truck drives at the visible hostile nearest the hauler with the NPC maneuver scoring of `fightPoint()` in `src/sim/ai.ts`, rebuilt in `escort-brain.ts` from the same exported pieces (`exposure`, `afterTurn`, `leadOf`, `ramValue`), and charges when it has no working gun. With no hostile in sight it rides 10 tiles behind the hauler. Shop, repairs, tank first patching and the engine douse are unchanged, except gear money now splits half to hauler armor and half to the gun truck, by gain per cost.

Run once on the merged enemy-fire rules, seeds 1 to 40, `--physics true`, 1600 turns (`game/tmp/fin1`, `game/tmp/fin2`): 0 of 40 beat stretch 10. Last stretch beaten per seed: 5 4 0 0 5 2 0 1 2 2 1 3 0 2 4 4 1 2 5 0, then 0 3 4 5 0 0 6 2 5 4 1 0 2 1 1 1 0 1 0 0. Losses: 40 runs, 35 gun truck wrecked, 5 abandoned after a drive or tank loss. 13 ended in stretch 1, 15 in stretches 2 and 3, 12 later. No run won, so the check that a won run was won by fighting has nothing to read; the lost runs do show fighting (20 to 120 player shots per run).

Why, from the timelines: the start gun truck (one MG, two cages) trades at point blank with a stretch 1 truck of 150 to 200 M of gear (a slug cannon niva, a double MG jeep). The NPC maneuver closes to the smallest ring, as it does for an NPC with a matching gun, and the foe out-damages it in 5 to 10 turns (seed 3: wrecked at T38 by a jeep with two MGs, seed 1: a buggy dealt 347 damage in 5 turns at stretch 6 against 114). Past stretch 3 the same duel is lost to groups of two trucks of 450 M each. Tuned variants earlier in this task (hold at the escort spot, leashed orbit, bigger gun truck share) reached 9 of 20 at best and were dropped by instruction, so the number above is the untuned result.

Findings for the balance work:
- A quiet gun truck 40 tiles behind the hauler, hauler armor only, still beat stretch 10 on 12 of 20 seeds on the enemy-fire rules (tmp/q40), and a quiet one 10 behind on 1 of 20. Groups left behind stop near the road and fire on the gun truck as it passes.
- Gear is the limit. The gun truck had 244 to 900 M of gear at stretch 6 against groups of two at 450 M each. A scout has 6 deck cells, so the bigger guns in the outpost stock do not fit until it buys a truck of 400 to 800 M, which the pay does not allow before stretch 4.
- Money: repairs took about 35 percent of pay and a truck swap costs 400 to 800 M against a pay of 120 to 470 M.

### Deferred bugs found
- `fightOdds()` returns NaN for the gun truck with two slug cannons and a heavy MG against a van with a flamer and 4 armor parts (seed 2 at T753 in a tuned variant). Escape XP then throws `XP source escape needs a difficulty in [0, 1], got NaN` and the recorder ends the run.
- Hauler stall (`stall` event, hauler v35) on seed 6 at T212 near (206.9, 250.7) in two tuned variants. Not worked around.
