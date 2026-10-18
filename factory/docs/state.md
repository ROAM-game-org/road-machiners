# Factory state

This document describes all factory state as one model. It is the reference for Hermes and the spec of the write commands. `src/position.ts` holds the same model in code: `cardPosition`, `cardDrift` and `releaseDrift`.

The commands are the `factory` CLI. Read commands run at once and change nothing. Write commands apply on the next tick, before it picks jobs. Every write command takes `--by` and `--reason`.

## Stores

One card position spans several stores. A position is consistent when every store agrees.

- Project board: the column of each card. Written by every job that moves a card, and by `move`.
- Issue labels and comments: flags, model routing, design and feedback. Written by triage, design, the tick and `retry`.
- GitHub branches: `factory/issue-N`, `dev`, `main` and the release branch. Written by implement, testing, hardening, the merge job, a hotfix approve and ship.
- `state.json`: jobs, queues, card sub-positions, posts, builds, the release and the health records. Written by the tick, every job, and the write commands.
- Merge records: `devMerges` in `state.json` lists every issue merged into `dev` since the last cut, with its title, merge commit, branch and the branches it was reverted on. The cut moves the list into `release.merges`, and the merge job adds release-branch merges there. The release contents, the release removal and the dashboard's Next release read these lists, never git commit titles.
- Work clone: the task file and stage outputs, like `.factory/approval.json` and the screenshot. Written by the agent stages. Its pre-commit hook runs the diff guard.
- Clone backups: `$FACTORY_HOME/clone-backups/issue-N-<time>/` holds a work clone that `repair-clone` replaced, with `repair.json` and `status.txt`. Written only by `repair-clone`. No code reads or deletes it. Hermes deletes it by hand once the card is past the trouble.
- Web root: the published builds. `builds` keeps a card's build from its post until its release ships. Written by testing, the post-only checks, candidate, a hotfix approve, ship and the dev build.
- Telegram: the posts with buttons. Written by testing, the post-only checks, candidate, approve and ship.
- Source maps: `$FACTORY_HOME/sourcemaps/<commit>/` holds the maps of each release, dev and candidate build, and `published.jsonl` lists those builds. Written by ship, hotfix, the dev build and candidate. Read by the error service.
- Hermes's agy runs: `$FACTORY_HOME/state/hermes-agy-runs.json` holds the UTC `day` and its `runs`. Written only by `factory tool agy`, never by hand, under the lock `locks/hermes-agy-runs`, which refuses a run past `AGY_MAX_RUNS` of the day. A new day starts at 0. [operations.md](operations.md#hermess-agy-and-codex) has the rules.
- Public inbox: `$FACTORY_HOME/public-inbox/<update_id>.json` holds one reaction, forward or comment update. A comment has its thread or none, the sender's Telegram id, whether it addressed the bot, whether it may stand alone, and its context, the quoted or replied text, or null. Written only by the Hermes plugin's public handlers. The tick reads each into the public store and deletes it. A file it cannot read moves to `public-inbox/bad/`.
- Public store: `$FACTORY_HOME/public/public.db`, one SQLite file with WAL. It holds the proposals with their posts, votes and shown vote line, the build posts, the post attempts of the daily proposal cap, the player route attempts by issue and committee post, the player comments and chat messages with their sender id, context, filter result, the known work and language the filter found, whether the filter found it should be filed, the filter calls that failed for now, whether the message was linked to that work, digest time, dropped time, own issue and chat reply, the Telegram file ids of the message's images and the issue they were placed on, the in-game reports and the hits per address and per Telegram player, with the count of hits given back per address after a failed report. Written by the tick, triage and the error service, through `src/public/store.ts` only. It has no backup, and losing it loses only votes and unsent comments. `factory public` prints the proposals, their votes, the open build posts and the last ten chat messages with where each went: on an issue, off-topic under one, linked to one, or with no thread.
- Error reports: `$FACTORY_HOME/error-reports/` holds `store.json`, which ties each error fingerprint to its issue and counts reports and rejects, and `reports/<fingerprint>/<commit>.json.gz`, and `player-reports/<issue>/report-<id>.json.gz` for each kept report from the game form. Written only by the error service. Agent stages of an issue read its reports of both kinds.

## Card positions

The board column is the position. Only a Testing card has a second one, `post`. Each position lists the column, the state fields, the artifacts it needs and the job the tick runs next. `factory card N` prints a card's position and names each store that disagrees. `factory move N <position>` puts a card in the position and clears the state of the old one. It closes the card's open committee posts in state before it edits them to the new status, so a failed edit is reported and leaves no open post behind.

- `triage`: column Triage. Next job: triage.
- `design`: column Design. Next job: design.
- `implement`: column Implementation. Needs the plan on the issue. Next job: implement.
- `verify`: column Testing. Needs the branch with the build. Next job: verify, which tests, runs the post checkpoint and posts in one job.
- `post`: column Testing, with the issue in `postOnly`. Next job: checks, which builds, publishes and posts with no tests or playtest. `move N approval` puts a card here and drops its approval.
- `approval`: column Approval. Needs a published build in `builds` and an open post in `approvalPosts`, or an approval queued in `pendingApprovals`, or a hotfix's kept approval whose checked build waits to ship. Next job: approve, which runs when the committee presses Approve, or when the tick queues a kept approval again.
- `harden`: column Hardening, with an `approvedResolving` entry, or a cleanup task. Next job: harden, which runs the hardening session and moves the card to Merging. `move N harden` records the mover as approver when none is recorded.
- `merging`: column Merging, with an `approvedResolving` entry, or a cleanup task. Next job: merge, one for up to three Merging cards of a base. `move N merging` and `merge N` record the mover as approver when none is recorded.
- `done`: column Done. Runs nothing.

Fields that belong to one position:

- `postOnly` belongs to Testing only.
- `approvalPosts`, `postCaptions` and `pendingApprovals` belong to Approval only.
- `asked` maps an issue to the time its questions came, and belongs to Triage with `needs-info`. The comments of someone but the factory after that time are the answers. The tick starts the clock itself for a `needs-info` card without an entry.
- `pendingFeedback` maps an issue to the committee or player feedback its next verify job must act on, with the source and the comment body. A reply routed as patch or redesign, and a release removal, write it. The post of the build clears it.
- `routed` lists the issues whose models triage already routed, so a later triage run keeps the labels as the committee left them. Triage adds the issue on each pass.
- `approvedResolving` marks an approved card in Hardening or Merging. The merge comment names the approver.
- `caughtUpTo` holds, for each waiting Merging card, the head of its base that its last catch-up merged into its issue branch. The tick starts a catch-up when the base head differs, and drops the entry of a card that left Merging. `factory queues` lists it.
- `keptApprovals` holds a hotfix's approval from the approve job until the hotfix ships, in Approval or in Testing: `by`, the member, `at`, `build`, the approved build, `checked`, each build whose full checks passed under it, and `reason`, why it last went back to Testing. Only the approve job of a member's approval writes a new one. A patch or redesign route, Deny, `move` to any position but `verify`, `merge` and `drop approval` drop it, and each drop but Deny comments the reason. `factory card N` prints it. Testing records a passing build in `checked` before it moves the card to Approval and queues the approval, so a crash between the two leaves a card the tick queues again.

Flags hold on any position:

- `factory-stuck`: a job failed twice, spent its budget or asked the committee. The card waits in its column until `retry N` removes the label, or the stuck sweep removes it for a mechanical cause. A card stage that fails the first time takes no label: its issue stays in `interrupted`, its sessions keep the error, and the next tick resumes the stage.
- Held: `held` in `state.json` holds who held the card, why, when, and the stage of the job the hold stopped. The tick starts no job on the issue, a queued approval included, until `resume-card N` lifts it. A hold is no failure, so the card takes no label and Hermes gets no incident. `move` keeps it but forgets the stopped stage, since the move clears the sessions. `move N done` drops it.
- `voting`: a Triage card whose proposal waits for player votes. Triage skips it. The tick removes it and moves the card to Design when the net score of 👍 over 👎 reaches `FACTORY_MIN_VOTES`.
- `needs-info`: the author owes answers. The tick removes it when someone answers, or when `FACTORY_NEEDS_INFO_HOURS` pass since the questions.
- Approved: the card merges after hardening. It shows as `approvedResolving` or a queued approval. A hotfix shows it as a kept approval.
- Routing labels `design-sonnet` and `implementation-opus`, `open-network`, `hotfix`, `adhoc`, `release-task` and `bundled` change how the card runs, never where it stands.
- `release-candidate` marks a merged card that waits for Ship.
- `error-report` marks a bug the error service opened from a game error. Intake takes it with no votes, into Triage.

## Release positions

`factory release` prints the release position.

- None: `release` is null. `cut` makes one.
- Cut with open tasks: `release` is set, and release tasks are not all done. The playtest and the candidate wait. An open task is a `release-task` card outside Done, or an issue in `release.tasks` that the board does not show in Done.
- Playtest: every release task is done, and `release.playtest.passed` is not the release head. The playtest runs.
- Playtest blocked: `release.playtest.blocked` holds the commit and the reason. The tracking card has `factory-stuck`. `retry <tracking> [decision]` lifts it.
- Candidate building: `release.playtest.passed` is the release head and no post is current. The candidate runs.
- Candidate posted: `release.postId` holds the current candidate post, and `release.candidateSha` the commit it plays. Ship runs when a member presses Ship, or on `ship`. A tick that finds the release head past `candidateSha` drops the post and a queued Ship, unless a Ship runs. Ship refuses a release head other than `candidateSha`.
- Shipping: `release.shipping` holds the release head and the features Ship found on it before it merged into `main`. A Ship that runs again on the same head reuses that list, since the release is then already on `main`. `release.removed` takes an issue as soon as its reverts are pushed, so a removal that runs again goes on with the remaining steps.
- Shipped: `ship` merged the release into `main`, closed its cards and set `release` to null. A tag that already exists counts as made.

`release.playtest` holds the playtest of the open release: `seed`, fixed at the cut; `runs`, every play started, which names the audit folders; `passed`, the commit a clean play approved, which is also the next job's baseline; `blocked`; and `notes`, the members' decisions from `retry`. One job plays at most `FACTORY_PLAYTEST_RUNS` times, so the state keeps no count of plays left.

The public post of a shipped release has its own position in `releasePost`, beside the next open release. `factory release` prints it as `public post`.

- None due: `releasePost` is null.
- Waiting for a draft: Ship set `releasePost` with the changelog and the screenshot under `$FACTORY_HOME/release-posts/<day>/`, and `postId` is null. The incident watch shows `release post due`, and Hermes sends a draft.
- Draft posted: `releasePost.postId` holds the draft post in the committee chat, and `releasePost.draft` its text. A reply to it goes to Hermes, who sends a new draft. Publish on the current draft posts it to `FACTORY_PUBLIC_CHANNEL` and sets `releasePost` to null.

`release.tasks` lists every release task the factory created or labeled: the cut's cleanup tasks, a reply's task and a fix triage labeled. Each is written before its card or label goes on the board, since the board lists a write up to a minute late. `factory release` prints them as `recorded tasks`.

`factory audit` and `card N` flag five drifts: an open release whose tracking card is missing, a recorded release task missing from the board, a pending ship with no current candidate post, a candidate post of a commit the playtest did not pass, and a release post with a draft post id but no draft text or the reverse. `factory release` flags nothing.

The release tracking card has the label `release`. It waits in Approval for the whole release, and its post is `release.postId`. It never shows card drift.

## Queues

`factory queues` prints the queues. The tick applies each queue before it picks jobs.

- `pendingApprovals`: approvals the approve job runs. It moves the card to Hardening, or ships a hotfix. Fed by an Approve press on the card's current post, by a hotfix's Testing job whose checks passed under its kept approval, and by the tick for an Approval card whose kept approval waits with no job, failure, hold or stuck label. Drop with `drop approval <issue>`, which also drops the kept approval.
- `pendingRemovals`: features to take out of the release. Fed by `remove N`. Drop with `drop removal <issue>`.
- `pendingShip`: a Ship press the ship job runs. Fed by `ship`. Drop with `drop ship`.
- `pendingIncidents`: shipped bug issues the incident job runs. Drop with `drop incident <issue>`.
- `pendingAnswers`: public store comment ids of player questions the answer job answers, oldest first. Fed by the tick's chat replies, at most `FACTORY_ANSWERS_PER_DAY` a day. The answer job takes the first one off as it starts, so it never retries or answers twice. Remove one with `set-state`.
- `retried`: approve, remove, ship and incident orders whose job died or timed out once, as `stage:issue`. The order stays queued and runs once more. The job's end, or its second death, clears the entry.

## Health records

- `failures`: failed jobs of the last day. `factory failures` prints them. `retry N` clears a card's failure and its stuck label. A merge failure holds `batch`, the issues of its batch. `cause` says what failed, from the error's type: `timeout` and `died` for a job past its limit or lost, `github` for a failed `gh` call of the GitHub client, `disk` for an `ENOSPC` error, `decision` for a spent budget or a committee question, and `error` for anything else. `null` means the failure was recorded before causes existed, and the stuck sweep leaves it for Hermes.
- `stuck`: the stuck sweep's record of each open stuck card, by issue: `incident`, `kind`, `column`, the cause in `stage`, `error` (the failure text), `cause` (the failure's `cause`, `null` when recorded before causes), `log`, `since` and `batch` (the size of its failed merge batch), `tries` (the sweep's actions on it in this column), `released` and `refused`. Written only by the tick's sweep. `factory stuck` prints them. [operations.md](operations.md#stuck-sweep) has the rules.
- `sweepError`: the last crash of the stuck sweep, cleared by the next sweep that passes. The incident watch prints it.
- `lastTickError`: the last tick crash. `factory status` shows it.
- `lastWasteReview`: the start of the next waste review's period, the end of the last published review. Only a published review moves it forward. A review run by hand with none sets it one period back first, so its retry covers the same period. `set-state lastWasteReview` restores it.
- `devFailed`: the short hash of a `dev` whose build failed. The tick skips it until `dev` moves or Hermes clears it. `devError` holds what broke, and the incident watch prints its first line, so Hermes fixes `dev` or reverts the merge that broke it.
- Review pending: `$FACTORY_HOME/review-pending` names the issue of a finished waste review. Hermes's incident watch prints it, and Hermes deletes it once handled.
- Review publishing: `$FACTORY_HOME/waste-review-publish.json` holds a created review issue with its period, bottleneck and proposal until the job has closed it, recorded it and written `review-pending`. Only the waste job writes it. A retry of the same period finishes it, and a later period deletes it.
- Error service alert: `$FACTORY_HOME/error-reports/alert` holds one line per cap the error service hit that day: the daily issue cap, the disk cap or the per-address limit. Hermes's incident watch prints it, and Hermes deletes it once handled.
- Public inbox alert: `$FACTORY_HOME/public-alert` holds one line per day on which the Hermes plugin could not write a player vote or comment to `$FACTORY_HOME/public-inbox`. That update is lost and still never reaches the Hermes agent. Hermes's incident watch prints the file, and Hermes deletes it once handled.
- Pause: the pause file holds the reason and stops new work. A paused tick only checks the running jobs: it reaps a dead or timed-out job and resumes it once as usual. A second death or timeout fails it. It starts no job, applies no order, runs no cleanup and takes no intake. The file is one JSON record with `kind` (`usage-limit`, `factory` or `member`), `note`, `by`, `at`, and an optional `pid`. A reader that finds invalid JSON or a missing field fails loud. `pause <reason>` writes kind `factory`. `resume` removes a pause of kind `factory` or `usage-limit`, and refuses kind `member`. `pause <reason> --by <who> [--pid N]` writes kind `member`, and the tick lifts it once the process `pid` ends. A usage-limit pause is kind `usage-limit`, and nobody writes the file by hand.

## Consistency rules

`factory audit` prints one line per drift and prints nothing when the factory is clean. A drift is one of these:

- `postOnly` outside Testing.
- An approved card in Testing, which would get a preview and lose its approval.
- A Hardening or Merging card with no approval that is not a cleanup task.
- An approval post or a queued approval outside Approval.
- An Approval card with no open post that is not approved and keeps no approval.
- A running job whose stage differs from the stage the position runs. The stage of `post` is checks, of `approval` is approve, and `done` runs none.
- An open release whose tracking card is missing.
- A pending ship with no current candidate post.
- A candidate post of a commit the playtest did not pass.
- A held card in Done, a held card with a running job, or a held issue off the board. The line names who held it and why.

`factory audit` skips every card with a running job, because the job owns the card mid-step. A stage changes the column and the post before its job leaves `jobs`, so drift shows for seconds. `card N` still prints all drift lines of the card, and adds a line that a job is running.

## Commands

Read: `factory status`, `cards`, `card N`, `jobs`, `queues`, `release`, `failures`, `stuck`, `log N [stage]`, `audit` and `help`.

Write, each with `--by` and `--reason`:

- `move N <triage|design|implement|verify|approval|harden|merging|done>` changes the card's position. It stops the running job, closes the open post, clears the old position's state and sets the new one. `move N verify` and `move N approval` drop the approval, so the card gets a new post. `move N verify` keeps a hotfix's kept approval, so the rerun ships with no post.
- `move N done` drops the card the way Deny does. It comments, closes the PR, adds the `wont-do` label, closes the issue as not planned, moves the card to Done and releases the bundled issues.
- `move` and `merge` refuse the release tracking card.
- `merge N` puts a card in Merging. It skips the post and hardening, and the merge checkpoint still runs.
- `ship` ships the open release.
- `cut` cuts a release.
- `remove N` takes a feature out of the release.
- `drop <approval|removal|ship|incident> <id>` drops one queued entry. `drop approval N` also revokes a hotfix's kept approval. A card it leaves in Approval with no post shows drift, and `move N verify` gives it a new post.
- `pause-card N` holds a card. It stops the card's job, by its process group and the containers with its job id, and leaves every other job running. The job's work clone and agent sessions stay, the issue goes in `interrupted` with its stage marked to resume, and its card job limit slot frees. Its ledger line has the outcome `held`. A job that ended before the kill keeps its own line. It refuses a card off the board, in Done, already held, the release tracking card, and a card whose approve or remove job runs. It also refuses a Merging card in the `batch` of the running merge job. The merge job writes `batch`, the issue numbers it merges, on its own entry in `jobs` when it takes its cards, and an empty `batch` when no card waits. Its ledger line copies `batch` when the job ends. A Merging card outside the batch can be held and moved while the merge runs.
- `resume-card N` lifts the hold. The next tick runs the card's stage, and a job of the stopped stage continues its agents' sessions with `--resume`. It needs no board, so it also lifts a hold whose card is gone.

`card N`, `cards` and `status` show each hold with who held it and why. The public dashboard shows only the wait reason `held`.

Each target of `move` and `merge` has preconditions:

- `verify`, `approval`, `harden`, `merging` and `merge` need the branch.
- `implement` needs the task file.

A failed order changes nothing, and the order can be repeated.

Write orders wait while the factory is paused. The CLI still writes the order, says that the factory is paused and why, and the order applies when the pause is lifted.

`--by` is a committee member, by Telegram id, GitHub login or name, or `hermes`. Hermes passes the Telegram id of the member whose message ordered the action. Its `factory_sender` tool returns that id, since a Telegram display name matches no member.

`hermes` may send mechanical orders: `move` to any position except `harden` and `merging`, `merge` and `move` to `harden` or `merging` of a card the committee approved, `cut`, `drop`, `retry`, `pause-card` and `resume-card`. A member must send the product decisions: `ship`, `remove`, and `merge` or `move` to `harden` or `merging` of a card the committee has not approved. The CLI and the tick both refuse a gated order from `hermes`.

Immediate, with no tick wait: `retry N [decision]`, `pause <reason> [--by <who>] [--pid N]`, `resume`, `repair-clone N --by <who> --reason <why> [--backup-merge]` and `set-state <path> <json>|--delete --by <who> --reason <why>`. `set-state` changes one value at a dotted path, like `release.postId`, under the state lock, so no job has to stop. It refuses a path whose first key is not a store, a value of another kind than the one it replaces, like an object for a list, and a delete of anything but an entry of a map store like `pendingApprovals.5`. A null value takes any kind. It writes the old and the new value to the tick log. `retry` of the release tracking card also lifts a playtest block and keeps the decision in `release.playtest.notes`, so a new playtest job runs and reads it. `pause` and `resume` work on the pause record described under Pause. Hermes deletes a member pause itself once its reason is gone.

`repair-clone N` needs only that no job of the card runs. It holds the card and takes the clone lock `locks/issue-N` while it works, then lifts the hold it placed. It moves the card's work clone whole into a clone backup, checks out GitHub's `factory/issue-N` fresh and copies only the factory folders over. A repair that works removes the stuck label and the card's failures, like `retry N`. A failed repair changes no label, card or `state.json` field. [operations.md](operations.md#repairing-a-work-clone) has the rules.
