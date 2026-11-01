# Release round

**Status:** planning
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
