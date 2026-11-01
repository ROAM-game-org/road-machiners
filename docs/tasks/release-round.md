# Release round

**Status:** executing
**Branch:** release-round
**Worktree:** .worktrees/release-round
**Goal:** A member gets any card into the next release by landing it on `dev`, with no hand merge, cherry-pick or state edit. The factory playtests the `dev` tip on its own, ships the last commit that passed, and never ships a branch that holds another base's commits. Members use it to ship a release a day after its last wanted card lands, instead of cutting, dropping and recutting. Confirming it needs one real release shipped by the server from a `dev` commit the playtest passed. Useless if: a hotfix branch can still carry unreleased `dev`; the playtest passes by skipping plays, seeds or features; balance numbers stop being reported; a dead playtest still loses its fixes; hand-written decisions still pile up for the next job; a member still needs the five-step routine to bring a laptop branch in.
**Mode:** interactive

The round has six changes, designed here one by one and built in parallel. Code facts are from `origin/main` at c1729ed04.

## 1. Branch base guard

### Context
- Triage makes every card's work clone from `dev`: `prepareWorkClone(BRANCH(issue), BASE_BRANCH, clone)` at `factory/src/stages/triage.ts:27`. It deletes that clone only when its own verdict makes the card a hotfix or release fix, at `triage.ts:91`.
- `prepareClone` in `factory/src/repo.ts:126` reuses an existing clone as it is, so design and implement keep triage's `dev` clone.
- #1294 was filed with the `hotfix` label, and triage's verdict was a plain pass. Its branch started at the `dev` tip 2a2432be2 and held 3932 commits that `main` lacks.
- `approve` in `factory/src/stages/approval.ts` ships a hotfix build into `main` with no check of what the branch holds. The approve job for #1294 had started when the owner stopped it by hand.
- `guardedHead` in `factory/src/stages/common.ts:258` runs the diff guard before every push of a card branch.

### Design
- Triage makes its clone from the card's base, from `baseBranchFor` with the issue's labels, so a card filed as a hotfix starts from `main`.
- A lineage check refuses a hotfix commit that holds a commit on `dev` but not on `main`. It runs in `guardedHead` before every push, and in `approve` on the build before `shipHotfix`. It fails with a typed error that names the base, the other branch and the commit count.
- On that error the factory rebuilds the card the way Remove does: it deletes the branch and the work clone, comments the count on the issue and moves the card to Design, which starts a clean branch from `main`. This was decided with no answer from the owner and can be changed.

### Invariants
- IV1.1 — No hotfix push and no hotfix ship carries a commit that is on `dev` and not on `main`.
- IV1.2 — A card filed with the `hotfix` label gets its first clone from `main`.

## 2. Release from dev

### Context
- The release is a branch cut from `dev`. Only `release-task` cards, playtest fixes and Remove change it, through `baseBranchFor` at `factory/src/stages/common.ts:20` and `land` at `factory/src/stages/playtest.ts:270`.
- No step adds a card that is on `dev` or in work for `dev`. #1276 and #1297 reached the release only through a hand merge of all of `dev` in 025a3aa1c, and #1294 through a hand-placed commit.
- 10-11 is the last ship. Releases 10-20 and 10-26 were closed unshipped so a newer `dev` could be cut, and 10-26 needed a Hermes cron script to cut once seven cards landed. Their playtests and #1280's ran 25 jobs, 66 hours and $414.
- Every reader of the release head calls `headHash(release.branch)`, among them `tick.ts:511`, `playtest.ts:43`, `candidate.ts:77` and `ship.ts:40`. `dropStaleCandidate` at `tick.ts:515` drops the post when that head moves.
- Features come from `release.merges` minus `removed`, in `factory/src/stages/release-common.ts:60`. The cut copies them from `devMerges`, and each `IssueMerge` holds its merge `sha`. Ship closes the features of that list and never clears `devMerges`.
- Since c1729ed04 every card runs the full suite at Testing and Hardening, and GitHub refuses a push to `dev` without a green suite on that commit.

### Design
- No release branch, no cut and no release task. A release is a `dev` commit the playtest passed.
- The playtest starts on the `dev` tip when `dev` moved past the commit it last started on and no playtest started in the last `FACTORY_PLAYTEST_HOURS`. `factory playtest` orders one now. Its baseline is the commit it last passed, or `main` before the first pass.
- The features of a playtest are the `devMerges` entries whose `sha` the start commit contains. The playtest record stores that list with the start commit, so the candidate, the changelog and Ship read it and never recompute it.
- A clean play with no fixes passes the start commit. A clean play with fixes passes the reviewed fix commit, after the suite on it, as `checkFixes` does today. The fix commit then lands on `dev` through the merge queue as a source of its own, so the next playtest has the fixes.
- The candidate builds the passed commit and records it. A `dev` move no longer drops the post. A newer pass replaces the candidate and its post while no Ship runs.
- Ship merges the candidate commit into `main` and `main` into `dev`, as today. It closes the candidate's features and drops them from `devMerges`.
- Remove reverts the feature's merge on `dev` and drops the candidate, so the next pass lacks it.
- A tracking issue labeled `release` opens after each Ship, and on the switch. It carries the playtest comments and the candidate post, and Ship closes it.
- Ship opens the two cleanup tasks as ordinary `dev` cards, so they land before the next playtest instead of after a freeze.
- A reply on the candidate post other than `ship` or `remove N` opens an ordinary `dev` issue.
- Gone: `release-task`, triage's release fix, `cut`, `pendingCut`, `release.branch`, `release.merges`, `release.tasks` and `dropStaleCandidate`. `release-candidate` stays on every merged card until its release ships.

### Invariants
- IV2.1 — Every read of the release commit reads the stored candidate or playtest commit, never a branch head.
- IV2.2 — The candidate post and Ship name the same commit the playtest passed, and the changelog names exactly its stored features.
- IV2.3 — A `dev` merge never drops a posted candidate.
- IV2.4 — Ship drops exactly the shipped features from `devMerges`, so the next candidate lists none of them.

## 3. Playtest keeps its work

### Context
- `playtest` in `factory/src/stages/playtest.ts:45` deletes `work/release-playtest` at every start, and `factory/src/cleanup.ts` keeps `release-playtest` and `release-baseline` for no state.
- Each job opens a new agent session, `playtest-<runs + 1>`, in `openSession`.
- On release #1280, 8 of 16 playtest jobs died. One death on 10-31 lost the hauler targeting fix, which survived only as a patch saved by hand under `salvage/`.
- Merge and Ship keep their clone, session and spend across a failed, dead or timed-out job through `factory/src/landing-work.ts`, keyed by the branch heads they started from.

### Design
- The playtest keeps its work the same way. A `playtest` record holds the start commit, the baseline commit, the session id and the plays so far. A job that starts on the same start and baseline resumes the clone with its uncommitted changes and the same session. Its agent gets a note that the earlier job died and where it stopped.
- A different start commit moves the old clone to the clone backups, as `setAside` does for Merge, and starts fresh.
- Cleanup keeps the clone while the record exists. A clean pass or a block drops the record.
- The play limit `FACTORY_PLAYTEST_RUNS` counts plays across the resumed jobs of one record, so a death never adds plays.

### Invariants
- IV3.1 — A playtest job that dies keeps its clone, its uncommitted changes and its session for the next job on the same start commit.
- IV3.2 — Resumed jobs of one record play at most `FACTORY_PLAYTEST_RUNS` times in total.

## 4. Playtest decisions

### Context
- `retry N [decision]` in `factory/src/ctl.ts:319` appends the decision text to `release.playtest.notes`, and `history` in `playtest.ts:336` shows every note to the next job under "Decisions of the committee".
- Release #1280 holds 15 notes. Hermes wrote most of them, two were sent twice, and older ones name commits the release has moved past.
- `retry` takes no `--by`. It joins every argument into the decision, so one note reads `--by btseytlin --reason Restarted on purpose...`.

### Design
- `retry` takes `--by` like every write command, and a decision as its own argument.
- A decision is a record with the author, the time and the text. The newest decision replaces the one before, and the next job sees only it, under "Decision for this playtest" with its author.
- `retry` also comments the decision on the tracking issue, so the history stays readable there.

### Invariants
- IV4.1 — The playtest prompt shows at most one decision, and names who wrote it.
- IV4.2 — No decision text holds a command flag.

## 5. Balance reports, never blocks

### Context
- The review rules in `factory/prompts/release-playtest-review.md:1` count "a resource or progression curve that breaks the game" and "combat that kills for no reason" as important, and an important release finding blocks.
- Release #1280 was held two days on the Chaos Highway escort checks, Beatable and Not sprintable, from `game/scripts/escort-report.mjs`. The owner changed one check mid-release, then decided that balance is no reason to block while the mode is playable.

### Design
- A finding gets a third severity, `balance`, for a curve, difficulty or survival rate that moved. Its evidence holds the numbers on the head and on the baseline.
- `balance` never blocks and is never fixed in the playtest. The factory opens a `dev` bug for each, like an important old finding, with its numbers.
- Important stays for what a player hits as broken: a crash, a stall, a broken rule, a dead feature, a mode nobody can finish.
- The playtest report lists every balance finding, so the numbers stay visible.

### Invariants
- IV5.1 — A playtest whose only findings are `balance` passes.
- IV5.2 — Each `balance` finding opens or names a `dev` bug that carries its numbers.

## 6. Adopt a laptop branch

### Context
- A laptop branch enters the factory by hand: open an issue, push the branch as `factory/issue-N`, add the issue to the board, set its status, then `move N harden`. #1303 went this way, and its first order failed because the new card had no board status yet.
- `addCard` in `factory/src/card-events.ts:26` adds a card and sets its column in one call.

### Design
- `factory adopt <branch> <title> --by <who> --reason <why>` opens the issue with the title and the reason as its body, pushes the branch as `factory/issue-N`, and adds the card in Hardening with `addCard`.
- It refuses a branch that is missing on GitHub. A branch may hold `main` commits, since `main` merges into `dev` anyway.
- Hardening then runs the full suite and merges the card as for any approved card.

### Invariants
- IV6.1 — One `adopt` order puts the card in Hardening with its branch on GitHub, with no other step.

## Plan

Approach: three implementers on Sonnet, each in its own worktree branched from `release-round`, then merged back one by one with conflicts resolved by the controller. The changes share files like `ctl.ts`, `types.ts` and the process docs, so path-disjoint phases are not possible. Each phase owns its own symbols in those files. PH2 and PH3 code against IF1 and IF2, defined below.

### PH1 — Hotfix base guard and adopt
Worktree `.worktrees/rr-guard`, branch `rr-guard`. Covers changes 1 and 6.
- `factory/src/repo.ts` (modify): add `foreignCommits(head: string, base: string, other: string): Promise<number>`, the count of commits in `head` that are in `other` and not in `base`. Add it to the `Repo` type in `factory/src/types.ts:315` area.
- `factory/src/stages/common.ts:258-264` `guardedHead`: for a `main` base, throw `ForeignBaseError` when `foreignCommits(head, 'main', 'dev') > 0`.
- `factory/src/diff-guard.ts` or `factory/src/stages/common.ts` (modify): `class ForeignBaseError extends Error { base; other; count }`.
- `factory/src/stages/approval.ts:36-50` `approve`: run the same check on the build before `shipHotfix`.
- `factory/src/job.ts` or the stage failure path (modify): a `ForeignBaseError` rebuilds the card as `factory/src/stages/remove.ts:33-34` does: delete the branch and the work clone, comment the count, move the card to Design. Respects IV1.1.
- `factory/src/stages/triage.ts:27`: clone from `baseBranchFor(ctx, issue labels)` instead of `BASE_BRANCH`. Respects IV1.2.
- `factory/src/ctl.ts`, `factory/src/control.ts` (modify): write command `adopt <branch> <title>`. It refuses a branch missing on GitHub, creates the issue with the reason as body, pushes the branch head as `factory/issue-N`, and calls `addCard(ctx, n, 'Hardening', at)`. Respects IV6.1.
- Docs: `factory/docs/process.md` hotfix lines, `factory/docs/state.md` write command list, `factory/docs/hermes.md` commands, and the memory-free recipe in `factory/docs/operations.md` if it lists the five steps.
- Tests: `common.test.ts` or `branch-push.test.ts` for the push refusal, `approval.test.ts` for the ship refusal and the rebuild, `triage.test.ts` for the hotfix clone base, `control.test.ts` for adopt.
- Commits: "A hotfix branch never carries unreleased dev", "factory adopt brings a laptop branch in as a Hardening card".

### PH2 — Release from dev
Worktree `.worktrees/rr-release`, branch `rr-release`. Covers change 2 outside `playtest.ts`. Produces IF1 and IF2.
- `factory/src/types.ts:159-201`: replace `ReleaseState` and `PlaytestState` with IF1. Drop `pendingCut`, `lastRelease` stays as the last ship time.
- `factory/src/state.ts`: new defaults for IF1. Old state with `release.branch` set fails loud on load, since #1280 ships before the deploy.
- `factory/src/stages/release.ts`: becomes `openRelease`, which opens the tracking issue labeled `release`, sets `release` with a seed from the day, and adds the tracking card in Approval. No branch, no cleanup tasks.
- `factory/src/tick.ts:106-161,434-437,509-520,557-559`: release gate reasons become `unopened`, `tracking-missing`, `failed`, `playtest-blocked`, `playtest`, `candidate`, `ship-approval`. Playtest is due per IF2. Remove `dropStaleCandidate`, the release-task queue order and the cut pick. `factory playtest` sets `pendingPlaytest`.
- `factory/src/stages/common.ts:20-26` `baseBranchFor`: only `hotfix` maps to `main`, all else to `dev`.
- `factory/src/stages/merge.ts:98-99,203,305-314`: merges record only `devMerges`. The merge job also lands `release.playtest.fixes`, a pushed fix commit, as a source of its own before cards, then clears it.
- `factory/src/stages/candidate.ts:47-94`: builds `release.playtest.passed.sha` and its stored features, opens the PR from a branch `factory/candidate` pushed at that commit, sets `release.candidate`. A newer pass replaces the post.
- `factory/src/stages/ship.ts:29-135`: merges `release.candidate.sha` into `main`, closes the candidate features minus `removed`, drops them from `devMerges`, then calls `openRelease` work and opens the two cleanup tasks as plain `dev` cards with label `maintenance`.
- `factory/src/stages/remove.ts:11-42`, `factory/src/control.ts:338-357`: revert on `dev` only, look up `devMerges`, drop the candidate. Remove `cut`.
- `factory/src/stages/triage.ts:36,95-121`, `factory/src/stages/groom.ts:108-110`, `prompts/triage.md`, `prompts/groom.md`: drop the release fix field and `.factory/release.md`.
- `factory/src/inbox.ts:18-25,149,233-242`: an other reply on the candidate opens a plain `dev` issue.
- `factory/src/position.ts:101-122`, `factory/src/ctl.ts:243-256`, `factory/src/dashboard/snapshot.ts:50-53,109,124`, `factory/src/dashboard/badges.ts`, `factory/src/dashboard/labels.ts`, `factory/src/observability.ts:75`, `factory/src/cleanup.ts:20-23`, `factory/src/stuck.ts:170-181`, `factory/src/card-events.ts:13-14`, `factory/src/post-status.ts:18`: follow IF1, drop `release-task`.
- `factory/hermes/plugin/__init__.py:89-188,287`, `hermes/SOUL.md`, `hermes/factory-incidents.sh`, `hermes/config.yaml`: follow IF1, drop release tasks and cut.
- Docs and diagrams: `factory/docs/process.md`, `state.md`, `stages.md`, `operations.md`, `hermes.md`, then `npm run diagrams`.
- Respects IV2.1 to IV2.4.
- Commits: one per stage group, ending with docs and diagrams.

### PH3 — Playtest on dev, kept work, decisions, balance
Worktree `.worktrees/rr-playtest`, branch `rr-playtest`. Covers changes 3, 4, 5 and `playtest.ts` for change 2. Consumes IF1 and IF2.
- `factory/src/stages/playtest.ts:40-288`: start on the `dev` tip, store `start`, `baseline` and features per IF1. Pass writes `release.playtest.passed`. Fixes push to `factory/playtest-fixes` and set `release.playtest.fixes` instead of pushing to a release branch. No "release moved" check.
- Same file: kept work per change 3, a `release.playtest.work` record, resume when start and baseline match, set aside otherwise. Plays count across resumed jobs. `factory/src/cleanup.ts:22-23` keeps `release-playtest` while the record exists. Respects IV3.1, IV3.2.
- `playtest.ts:336-337` `history`: show only `release.playtest.decision` with its author. `factory/src/ctl.ts:319-336` `retry` takes `--by`, writes the decision record and comments it on the tracking issue. Respects IV4.1, IV4.2.
- `factory/prompts/release-playtest-review.md`, `factory/src/stages/playtest-review.ts`: add severity `balance` with head and baseline numbers. Balance never blocks, is never fixed, and opens or names a `dev` bug like an important old finding. Respects IV5.1, IV5.2.
- Docs: `factory/docs/stages.md` Release playtest section.
- Tests: `playtest.test.ts`, `playtest-review.test.ts`, `ctl.test.ts` for retry.
- Commits: one per change.

### Interfaces
- IF1 — state shape. `ReleaseState = { issue: number; day: string; postId: number | null; candidate: { sha: string; features: IssueMerge[] } | null; removed: number[]; playtest: PlaytestState; shipping?: { sha: string; features: { issue: number; title: string }[] } }`. `PlaytestState = { seed: number; runs: number; lastStart: { sha: string; at: string } | null; passed: { sha: string; features: IssueMerge[] } | null; fixes: string | null; blocked: { sha: string; reason: string } | null; decision: { by: string; at: string; text: string } | null; work: { start: string; baseline: string; features: IssueMerge[]; session: string; plays: number } | null }`. `FactoryState.pendingPlaytest: string | null`. PH2 writes types and defaults, PH3 writes the playtest fields.
- IF2 — playtest due rule. `playtestDue(state, devTip, now, hours): boolean` in `factory/src/tick.ts`: true when no block, `pendingPlaytest` is set, or `devTip !== lastStart.sha` and `lastStart.at` is older than `FACTORY_PLAYTEST_HOURS`. The setting goes in `factory/settings.env` and `config.ts`. Owned by PH2.

### Test strategy
- Each phase runs only the test files it touched, plus `npm run typecheck`. The controller runs the union after the merges.

### Order & dependencies
- PH1, PH2 and PH3 run at once. Merge order: PH2, then PH3, then PH1.
- The deploy to `main` waits until #1280 ships on the old code.

### Risks / rollback
- RK1 — PH2 and PH3 drift on IF1. The controller checks typecheck after the PH3 merge and fixes the drift.
- RK2 — `playtest.ts` fix landing through the merge job conflicts on `dev`. The merge session resolves it as for cards.
- RK3 — The deploy lands while a release is still open. State load fails loud by design, and rollback is a revert of the merge on `main`.
