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
- An earlier version of the bot read `brain.attackers` of hostile trucks, which is hidden NPC state. Review found it. Every result that used it is void, including 18 of 20 and 20 of 20. That key is set on every spawned group truck by its feud on the player, so it warned the bot of groups before it could see them. Run with the key back in place it gave 20 of 20 seeds, so the hidden read was the whole gain. The bot now reads only the last turn's `shot` events aimed at its truck and the hostile trucks in sight.
- Behaviors were judged by 20-seed batches with `--physics true`. Stretch 10 reached: baseline bot 3 of 10 on 3 seeds with early losses, one target plus stand-off plus break-off about 9 of 20, the same bot standing to shoot 11 of 20, a bot that never fired 15 of 20 with the gun truck behind the hauler. Those used the old hidden read only in the sense that it was absent, so they stand.
- Visible rules, 20 seeds each: run ahead and fire after a shot, plus keep running while a hostile stays in sight, 15 of 20. The same with a longer reach 14 of 20. Run ahead whenever a hostile is in sight 11 of 20. Hauler armor share of 40% instead of 15%, 13 of 20 against 13 of 20.
- Cut for no measurable gain: ram opening, guard from the verge, body-blocking, break-off point, stand-off distance, saving for a truck, and odds or gear-value engage rules. Fighting groups the bot rated winnable lost more runs than holding fire. `fightOdds` rated 85 to 93 percent on fights the bot lost.
- Kept: one target for the guns (`pickTarget`), the truck-first shop with a pace check (`bestTruck`, `keepsPace`), the engine douse at the heat warning, and the ride 10 tiles behind the hauler in its lane.
- The gun truck rides behind the hauler in its lane and not beside it. Beside the hauler, the physics hauler stalls for good on 2 of 10 seeds (a sim defect, see Deferred).
- Patch goods stay at 4. Eight goods cost enough gear money that every kit stayed at one MG and 10 of 10 runs died by stretch 8.
- The sprinter path keeps its old shop order, so its results did not move.
- `BEATABLE_SEEDS` in `escort:report` is unchanged, as the coordinator asked. The report counts the seeds against 6, and this task judges against 9.
- The coordinator changed the goal: the bot must play competently, not copy the user's run. The Goal, the last Context bullet and the Design were rewritten. Ram-opening, verge guarding and saving for a truck are no longer required, and each behavior is kept only if batches show it wins more.
- The user raised the target from 6 to 9 of 10 seeds. The Goal says so, and the final 10-seed batch is judged against 9.

### Deferred (needs user input)
- The bot misses the 9 of 10 bar: 6 of 10 on seeds 1 to 10 and 15 of 20 on seeds 1 to 20, with no hidden read. The hidden read gave 20 of 20, so early warning of a group decides the run. A player sees a group only at the sight radius. Decide whether the bar needs a scanner purchase, a bot that reads the hauler's alarm, or a balance change.
- Game design: a gun truck that never fires is barely punished. Hostile groups shoot only the hauler, and a bot that never fired beat stretch 10 on 15 of 20 seeds.
- Sim defect: with the gun truck beside the hauler, the physics hauler stops against the ground at the start of some bends and raises `stall` (seed 4 at turn 20, seed 9 at turn 438, window 0 and later). Alone or with the gun truck far behind it passes. Not fixed, since sim rules are out of scope.
- The Not sprintable criterion already failed before this work: 3 of 10 sprinter seeds lost before stretch 10. IV3 cannot hold on today's balance. Not touched.
- The Choice criterion fails (55 of 161 outposts): the escort spends money on repairs and a truck, so fewer outposts show more useful parts than money. It is a balance criterion for later tuning.
- The wiki defines the danger's gear share as what the escort spends on parts. The old bot measured 0.31 against the 0.3 `gearShare`. The new bot measures 0.43, so balance tuning must re-measure `gearShare`.
- UK1 stays open: `escort:report` still reads `run.jsonl`.

## Verify

Final batch: `--physics true`, 1600 turns, seeds 1 to 10, with no hidden read. Logs: `game/tmp/final3/`. Visible-state version at the commit "Escort bot keeps running ahead while a hostile that shot it stays in sight".

Escort, last stretch beaten per seed: 10, 16, 11, 9, 8, 5, 12, 17, 15, 7. Seeds 1, 2, 3, 7, 8 and 9 beat stretch 10, which is 6 of 10 against the bar of 9. Seeds 11 to 20 gave 9 of 10 beating it, so 15 of 20 in all.

Sprinter, last stretch beaten per seed: 8, 11, 6, 15, 7, 16, 11, 8, 10, 10. Seeds 1, 3 and 8 lost before stretch 10 (3 of 10). The sprinter bot is unchanged, and the batch before the escort work gave the same 3 of 10.

`escort:report` on the final batch: Beatable PASS (6 of 10, need 6), Damage PASS, Variety PASS, Choice PASS, Rise PASS, Fight FAIL (67 of 110), React FAIL (2 of 3), Not sprintable FAIL (3 of 10). The analyzer shows no stall, tow or dry tank.

Tests: `escort-tactics.test.ts`, `runner.test.ts`, `bot.test.ts`, `escort-report.test.ts` and `recorder-mover.test.ts` pass, and `npm run typecheck` passes.
