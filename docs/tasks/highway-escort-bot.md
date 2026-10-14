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
- Behaviors were judged by 20-seed batches with `--physics true`. Stretch 10 reached: baseline bot 3 of 10 on 3 seeds with early losses, one target plus stand-off plus break-off about 9 of 20, the same bot standing to shoot 11 of 20, a pacifist that never fires 15 of 20, fire only when a truck attacks it, riding beside the hauler, 14 of 20, riding behind the hauler 15 of 20, and the same with a run toward the next pad on attack 18 of 20. The shipped bot gave 10 of 10 on seeds 1 to 10.
- Cut for no measurable gain: ram opening, guard from the verge, body-blocking, break-off point, stand-off distance, saving for a truck, and odds or gear-value engage rules. Fighting groups the bot rated winnable lost more runs than holding fire. `fightOdds` rated 85 to 93 percent on fights the bot lost.
- Kept: one target for the guns (`pickTarget`), the truck-first shop with a pace check (`bestTruck`, `keepsPace`), the engine douse at the heat warning, and the ride 10 tiles behind the hauler in its lane.
- The gun truck rides behind the hauler in its lane and not beside it. Beside the hauler, the physics hauler stalls for good on 2 of 10 seeds (a sim defect, see Deferred).
- Patch goods stay at 4. Eight goods cost enough gear money that every kit stayed at one MG and 10 of 10 runs died by stretch 8.
- The sprinter path keeps its old shop order, so its results did not move.
- `BEATABLE_SEEDS` in `escort:report` is unchanged, as the coordinator asked. The report counts 10 of 10 against 6, and this task judges against 9.
- The coordinator changed the goal: the bot must play competently, not copy the user's run. The Goal, the last Context bullet and the Design were rewritten. Ram-opening, verge guarding and saving for a truck are no longer required, and each behavior is kept only if batches show it wins more.
- The user raised the target from 6 to 9 of 10 seeds. The Goal says so, and the final 10-seed batch is judged against 9. `BEATABLE_SEEDS` in `escort:report` stays unchanged.

### Deferred (needs user input)
- Game design: a gun truck that never fires is not punished. Hostile groups shoot only the hauler, so the escort holds fire, runs when attacked and still beats stretch 10 on 10 of 10 seeds. The Fight criterion fails (28 of 161 stretches had a player shot). Balance tuning should decide whether groups must punish a quiet gun truck.
- Sim defect: with the gun truck beside the hauler, the physics hauler stops against the ground at the start of some bends and raises `stall` (seed 4 at turn 20, seed 9 at turn 438, window 0 and later). Alone or with the gun truck far behind it passes. Not fixed, since sim rules are out of scope.
- The Not sprintable criterion already failed before this work: 3 of 10 sprinter seeds lost before stretch 10. IV3 cannot hold on today's balance. Not touched.
- The Choice criterion fails (55 of 161 outposts): the escort spends money on repairs and a truck, so fewer outposts show more useful parts than money. It is a balance criterion for later tuning.
- The wiki defines the danger's gear share as what the escort spends on parts. The old bot measured 0.31 against the 0.3 `gearShare`. The new bot measures 0.43, so balance tuning must re-measure `gearShare`.
- UK1 stays open: `escort:report` still reads `run.jsonl`.

## Verify

Final batch: `--physics true`, 1600 turns, seeds 1 to 10, code of the commit before the `keepSwitches` split, which does not change behavior. Logs: `game/tmp/final/`.

Escort, last stretch beaten per seed: 19, 16, 19, 20, 19, 13, 12, 14, 10, 19. 10 of 10 seeds beat stretch 10, against the bar of 9 of 10. Seeds 1, 2, 3, 4, 5 and 10 were alive at the turn limit. Seeds 6, 7 and 8 ended abandoned and seed 9 ended wrecked, all after stretch 10.

The same code on seeds 11 to 20 beat stretch 10 on 10 of 10 seeds: 19, 20, 19, 15, 16, 10, 19, 19, 13, 20. Together that is 20 of 20.

Sprinter, last stretch beaten per seed: 8, 11, 6, 15, 7, 16, 11, 8, 10, 10. Seeds 1, 3 and 8 lost before stretch 10 (3 of 10). The sprinter bot is unchanged, and the batch before the escort work gave the same 3 of 10.

`escort:report` on the final batch: Beatable PASS (10 of 10, need 6), Damage PASS, React PASS, Variety PASS, Rise PASS, Fight FAIL (28 of 161), Choice FAIL (55 of 161), Not sprintable FAIL (3 of 10).

Tests: `escort-tactics.test.ts`, `runner.test.ts`, `bot.test.ts`, `escort-report.test.ts` and `recorder-mover.test.ts` pass, and `npm run typecheck` passes.