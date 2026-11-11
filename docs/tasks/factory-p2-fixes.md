# Factory P2 fixes

**Status:** validating
**Branch:** factory-p2-fixes
**Worktree:** .worktrees/factory-p2
**Goal:** Fix factory issues #1272, #1503, #1458, #1463 and #1265. The factory owner uses the result to stop paying for fix loops and redundant suites, and the committee uses it to judge approval posts. Confirming it needs the merge into main and a week of ledger lines. Useless if: a bound lowers a budget or timeout instead of counting no-commit rounds, a same-head rerun lets a failure that reproduces pass, the rerun covers any number of files, Hardening skips its suite after a conflict resolution or any agent commit, the approval post only repeats the title or fills a template with generic words, the retry pattern catches 401, 403, schema errors or a missing run, or tests only assert that a mock was called.
**Mode:** hands-off

## Context

- Fix loops ran until the $5 budget. Merge logs from Nov 3 to Nov 7 show runs of 6 to 8 no-commit rounds in a row. Two no-commit rounds in a row were twice followed by a commit. Three in a row never were.
- Testing reran the full suite on an unchanged head. Log verify-1515 ran 7 suites on one head.
- The #1484 suite failure was one file over its CPU limit, recorded as a file-level entry.
- 49 of 114 Hardening suite runs since Oct 28 ran on a merge commit. Harden #1475 waited 23 minutes on a clean dev merge of green work.
- The post-only approval fallback had no record of the plan, since `.factory/` is reset after design.
- Tick crashes came from gh errors no retry pattern matched: `dial tcp ... network is unreachable`, `error connecting to api.github.com`, and GraphQL's `Something went wrong while executing your query`.

## Design

- #1272: `onceEachHead` in checkpoint.ts owns every check round for verify, harden, merge and ship. A round counts as stalled when it ends on the same head with the same kind of check failing: a first check, like the approval or an uncommitted fix, or the head's build and suite. `FACTORY_NO_COMMIT_ROUNDS=3` stalled rounds throw `StalledFixError`, with cause `decision` and no resume.
- #1503: `suiteVerdict` in baseline.ts reruns the failed files on the same head with the shard's own worker count. It does this only for a record with no unfinished file and no unhandled error, covering at most `FACTORY_SUITE_RERUN_FILES=5` files. A rerun that passes every file passes a card head, and cards record it in `suiteCleared`. Merge and ship run one new full suite first and push only on its pass. Each rerun writes a `rerun` ledger line.
- #1458: `cleanBaseHeads` walks back past merges of the base whose tree equals `git merge-tree --write-tree` with no conflict. Hardening skips the suite when that walk reaches a green commit.
- #1463: design writes `.factory/try.md`, and `.factory-tasks/issue-N.plan.json` keeps the plan. The post-only fallback shows that plan, or the changed files when no record exists.
- #1265: reads retry on the three error strings above. Writes never retry.

### Assumptions

- AS1: Vitest isolates test files, so a file that passes alone on the same head has no failure caused by other files. It held in config, since isolation is the default. A test that fails only under full-suite load can still pass the rerun. That is the trade #1503 asks for.
- AS2: Factory base merges use plain `git merge`, so `merge-tree` rebuilds the same tree. It held, as the real-git test in repo.test.ts shows.
- AS3: The factory app bypasses the dev ruleset. This is unchanged, since docs-only rechecks already push commits with no status.

## Verify

The 15 touched test files pass, 584 tests in all, with typecheck and the quality gate green. The independent review found that a dirty-clone round or a missing-approval round skipped the stall count. Commit 3ea83db55 fixed that, with tests. Its fourth finding, a guard reset after a moved base, holds no risk: each `fixUntilPasses` returns only on a pass, and a pass resets the count anyway.

## Code smells

- factory/src/repo.ts `baseMerge`, used by `ownWorkSettled`, counts conflict-resolved catch-up merges as base merges for the Merging entry check. Left as is, since the merge checkpoint tests the result.

## Conclusion

### Hands-off decisions

- make: size Medium, branch factory-p2-fixes from origin/main, worktree .worktrees/factory-p2.
- make: npm ci also ran in game/, because the pre-commit tsc covers game/.
- uexecute: I did the three suite issues myself. Two Sonnet implementers did #1265 and #1463 in their own worktrees, and I cherry-picked their commits.
- udesign #1272: the stall limit is 3 from the merge logs. A stall gets cause `decision` and no auto-resume.
- udesign #1503: the rerun is all or nothing, file-level entries count, the cap is 5 files, and it uses the shard's worker count.
- coordinator #1503: in merge and ship, a passing rerun dispatches one new full suite on the same head. The base takes the result only if that suite passes, and its failure takes the normal fix path. Testing and Hardening keep the rerun pass.
- udesign #1458: the strict walk applies only to Hardening.
- udesign #1463: the record sits beside the task file. With no record, the post lists the changed files.
- udesign #1265: dial errors, gh's connect error and GraphQL's internal error retry for reads only. JSON truncation and Actions polling are left to #1241 and #1390.
- ureview: a stalled round now counts any repeated failing check on one head, from the review.

### Deferred (needs user input)

- The merge into main deploys these changes to the factory server. The user does it.
