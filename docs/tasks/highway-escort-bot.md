# Chaos Highway escort bot

**Status:** executing
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
- The coordinator changed the goal: the bot must play competently, not copy the user's run. The Goal, the last Context bullet and the Design were rewritten. Ram-opening, verge guarding and saving for a truck are no longer required, and each behavior is kept only if batches show it wins more.
- The user raised the target from 6 to 9 of 10 seeds. The Goal says so, and the final 10-seed batch is judged against 9. `BEATABLE_SEEDS` in `escort:report` stays unchanged.

## Verify

Pending: the final 10-seed escort batch and the sprinter batch, judged against 9 of 10.
