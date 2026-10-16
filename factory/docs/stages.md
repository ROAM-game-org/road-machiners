# Stages

The rules of each step in [process.md](process.md). A card stage comments on its issue only when it fails for good, with the time it took. The board shows every other move, and each comment counts toward GitHub's spam checks. Agents write `.factory/needs-committee.md` only for a game design fork or a major save bump. A stage that ends with that file fails, so Hermes puts the question to the committee. The factory reads every `.factory/` file through `src/agent-output.ts`, which fails the stage when the file links outside the work clone, so an agent cannot hand the factory a host file to post.

## Game docs first

Every agent prompt that works in a game clone opens with `prompts/game-docs.md`, which `fillPrompt` fills in for `{{gameDocs}}`. Before any other step, `npm ci` included, the agent reads `game/CLAUDE.md` and `game/docs/DESIGN.md`. It then reads each doc in the Docs list of CLAUDE.md that covers its task, follows them and names them in its reasoning. The release changelog opens with it too. The change and waste prompts work in `factory/`, so each opens with the same step written for `../game/CLAUDE.md` and `../game/docs/DESIGN.md`. The step edits nothing, so triage, design, incident, adhoc, the player answer, the changelog and the waste review keep their rules on what they may change. A test fails when a new prompt is neither a stage with the step nor listed as one without it. Only prompt fragments and the follow-up prompts of a session that already read the docs skip it.

The stages that fix game code after implementation, testing, the hotfix integration round, hardening, merge-fix, ship-fix and the release playtest, get `prompts/fix-docs.md` in `{{fixDocs}}`: a fix that changes behavior a doc describes updates that doc in the same commit, with no broad docs pass.

The agent image build fails unless ultrapack ships `up:expand` and `up:udocument`, which design and implementation invoke.

## Intake

Intake puts every `feature-request` or `bug` issue older than `FACTORY_MIN_AGE_HOURS` into Triage. Nobody votes on GitHub. An issue labeled `hotfix` by a collaborator goes straight to Design.

Intake runs last in each tick, so a card it adds starts on the next tick. It reads every open candidate issue in one GitHub search per 100 issues.

## Triage

Triage runs Haiku, set by `FACTORY_TRIAGE_MODEL`, at `FACTORY_TRIAGE_EFFORT`. It scores the issue on a clear goal, a checkable result, a scope of one task and a fit with `game/docs/DESIGN.md`, and writes `.factory/triage.json`.

- `ready` moves the card to Design and rates its complexity, as Model routing says. A clear bug is `ready`, and so is a justified improvement of an existing thing.
- `vote` is for a new feature or a substantial change. A bug is never `vote`. It rates complexity like `ready`, adds `voting`, writes its `pitch` to the public store and comments once. The card waits in Triage until players vote it to Design, as [process.md](process.md#public-inputs) says. Triage skips a `voting` card, and a `voting` card is no bundle candidate.
- `wont-do` comments the reason, labels the issue `wont-do`, closes it and moves the card to Done.
- `unclear` comments up to three questions, labels the issue `needs-info` and leaves the card in Triage. The committee chat gets one notice per new question set, with no quotes. The tick removes `needs-info` once someone answers on GitHub, or once `FACTORY_NEEDS_INFO_HOURS` pass since the questions, and triage runs again. Without an answer, triage and design go on with the most sensible reading, and design writes the assumptions into its comment.
- A request for a new authored location needs a reference image. Without one, triage is `unclear` and asks once for an upload.
- Triage can label a bug `hotfix` when it loses saves, crashes the game or blocks play. The committee chat gets a warning.
- Triage can label a card `release-task` when it fixes a feature of the open release. This works only while the release has no candidate post. New work waits for the next release. The release fix runs on the release branch and merges into it.

A `ready` issue may bundle other free Triage cards that touch the same code. Each bundled issue gets a comment and the label `bundled`, and its card moves to Done while the issue stays open. The state records it under `bundles`. Later stages read the bundled issues after the lead, and they close when the lead ships. A denied or refused lead sends each bundled issue back to Triage. A hotfix never bundles.

## Design

Design runs Opus, or Sonnet with `design-sonnet`, at `FACTORY_DESIGN_EFFORT`. It uses up:udesign and up:uplan in hands-off mode. A change to the game's UI or overlays is planned with the steps of `game/docs/ui.md`, and the task file gets a UI section with the decision, the tiers, the zone, the shared pieces and the event levels. The agent reads `docs/incident-log.md` from the clone, and the plan says how it keeps the rule of each class the change touches. It writes the task file `.factory-tasks/issue-N.md` in the work clone on branch `factory/issue-N`. Git ignores the task file, so design posts it to the issue as a comment, and later stages read it from the clone.

- Before the agent starts, the factory merges GitHub's issue branch and the latest base into the work clone, as [process.md](process.md#branches) says. The agent cannot fetch. It never asks the author about branches or the network, and work it cannot find is an assumption.
- `.factory/questions.json`, a JSON array of questions, sends the card back to Triage with the questions, as unclear triage does.
- `.factory/wont-do.md` closes the issue as wont-do.
- `.factory/summary.md` is a short plain-words summary of the planned change: a short story for a storyline, the new behavior and each meaningful change for a feature or a fix, with no code. The design comment shows it above the collapsed task file, as a plan and never as built work. With no summary the comment holds the task file alone.
- A revision reads the issue comments under "## Committee feedback". Comments under "## Committee question" are context only.
- A card labeled `bug` or `hotfix` gets `prompts/design-bug.md`. Before up:udesign, the agent runs `up:expand handsoff` on the bug once, through its plan step only, and writes a `## Bug expansion` section with the reproduction, expected against actual, the constraints and the verification hypotheses. A revision or a retry keeps the section. Design is the first stage of every bug path, since a hotfix skips triage, and triage never touches code.

## Implementation

Implementation runs Sonnet with up:uexecute on the task file, and Opus advises it through `claude --advisor` with `FACTORY_ADVISOR_MODEL`. A card with `implementation-opus` runs on Opus and gets no advisor. Subagents are off, so the agent implements every phase itself at the model triage picked. For a change a player can see, the agent captures real in-game screenshots, compares them with the issue, the plan, `game/docs/DESIGN.md` and, for the UI, the principle tests of `game/docs/ui.md`, and fixes until nothing obvious differs. The screenshots stay out of the commits. Its last step runs `up:udocument` on the game docs the change made stale and commits the edits, or edits nothing and says why in the task file. The stage fails when the agent made no new commit.

## Testing

[process.md](process.md#testing-column) shows the flow. These are the rules behind it.

- The job first merges the new commits of the issue branch on GitHub, then the current base, so the committee plays what the merge will take. A conflict with the branch goes to a merge agent at once. The testing session resolves a conflict with the base. An unfinished merge fails the stage.
- The session runs `prompts/test.md`. It plays the build, fixes every problem it finds, and writes `.factory/approval.json`, the screenshots and the optional `.factory/evidence.json`. It reads `docs/incident-log.md` from the clone and plays the check of each class the change touches. A patch reply after the last post is the whole task of the round. A hotfix session runs `prompts/harden.md` first.
- The session writes `.factory/needs-redesign.md` only when the plan itself contradicts the issue or the game docs. The reason goes on the issue under "## Committee feedback", and the card goes to Design.
- The post checkpoint pushes the branch and runs `npm ci` and the build in a fresh clone. The build runs `tsc`, so it typechecks too. The testing session already ran the tests near the change and played the build. A hotfix checkpoint runs the full checks instead: the full suite on GitHub Actions, as [operations.md](operations.md#full-suite-on-github-actions) says, and the playtest against the dev server and the build in the clone at the same time. A missing `.factory/approval.json` counts as a failure. The playtest prints the frame rate but does not check it, since the host runs other jobs at the same time. Only the release candidate fails under 50 fps.
- A failure goes back into the testing session as its next message, with the end of the log. Timeouts alone rerun the checks with no agent, up to 3 runs. The loop ends when the checks pass, or when the session's runs cost `FACTORY_TESTING_BUDGET_USD`, which fails the stage for Hermes.
- A passing run publishes the build at `/<hash>/` and posts it. The post holds the screenshot, the play link, the pull request link and how to try it, with Approve and Deny buttons. With no screenshot it is a text post, and the card still goes on.
- `factory move N approval` marks the card `postOnly`. A checks job then runs `npm ci` and the build only, once, with no agent. A failed build fails the stage. With no `.factory/approval.json` the post text points to the pull request. The post and the issue comment say that no factory checks ran on this build.

## Docs changes

A branch whose every changed file since its base is a Markdown file outside `game/docs/wiki/` is a docs change. `docsOnly()` in `src/stages/common.ts` decides it.

- Testing runs no session. The factory pushes the base merge and writes the approval text itself: the changed files, and to read the diff in the pull request. Its post checkpoint only builds. A conflict with the base still runs the session, since its agent resolves the conflict.
- Hardening runs no session unless the base merge conflicts.
- Testing and Hardening take the base like Design does. They resume their own unfinished base merge, skip a base the clone holds, and tell the agent when a clone with uncommitted changes kept an old base. They list the conflicts in `.factory/merge-conflicts.md` for the agent.
- The merge checkpoint checks it like any card.

## Hardening

[process.md](process.md#hardening-and-merging-columns) shows the flow. These are the rules behind it.

- The job merges the new commits of the issue branch on GitHub and the current base, so the merge queue meets only the conflicts of cards that harden at the same time.
- The session runs `prompts/harden.md`, with `game/docs/architecture/principles.md` pasted in from `dev`. It reads `docs/incident-log.md` from the clone and runs the check of each class the change touches. It runs up:uverify, then `/code-review`, and fixes every correctness finding and the cleanups that make the code shorter. No review gate follows it.
- No checks run in Hardening. The card moves to Merging.

## Merging

- A merge job runs in the branch queue when Merging holds a card that is not stuck or held. It takes the first three such cards whose base is the base of the first one, in board order. The first waiting card is always among them, so no card waits behind newer ones, except a card whose catch-up still runs, which goes in a later batch. The tick starts the next merge job for the cards left, on the base the batch pushed.
- Catch-up: when the base head of a waiting Merging card differs from the head in its `caughtUpTo` entry, the tick starts a `catch-up` branch job for it, one at a time. It covers every waiting card, with or without a running merge job. It skips the cards the running merge job took, and the cards the next merge job takes when none has taken its batch yet. The job merges the card's base into its issue branch with `prompts/merge-branches.md`, like any conflict between branches: an agent resolves a conflict in `work/merge-factory-issue-N`, the factory checks its diff, and only the issue branch is pushed. Then it writes the base head it took into `caughtUpTo`, also when the branch already held it. The card's own merge then meets only what the base gained since the last batch landed. A catch-up runs no checks and moves no column. A failed or dead catch-up records a failure for Hermes but labels nothing, and the merge job merges the card as before. The tick tries no new catch-up of that card while the failure stays in `failures`, a day or until `retry N`, and the dashboard does not count it as blocking.
- It clones the base into `$FACTORY_HOME/work/merge-queue` and merges each card's branch. A conflict goes to the merge session with `prompts/merge-branches.md`. An unfinished merge fails the job.
- The merge checkpoint runs the matching tests, the playtest and the build on the result. The matching tests are each changed test file that still exists, and the `X.test.ts` next to each changed `X.ts`, from `git diff` against the base inside `game/`. A change to how every test runs runs every test: `package-lock.json`, `vitest.config.ts`, `scripts/test-cache.mjs`, `src/test/cache/`, and the runner, setup files and shared fixtures under `src/test/` that the vitest config loads. A test helper under `src/test/` runs only the test next to it, like any source file. No match runs none. `testSubset()` in `src/stages/subset.ts` decides it. The release runs the full suite. A run past `FACTORY_CHECKS_TIMEOUT_MINUTES` loses its container and runs again, at most 3 runs, and a stalled test is a real failure, as [operations.md](operations.md#jobs-and-queues) says. A failure goes to the same session with `prompts/merge-fix.md`, which keeps the behavior the committee approved for each card. The agent runs the exact failing test first, but only the full checkpoint after its fix decides. The loop ends on a pass, or when its fix rounds cost `FACTORY_MERGING_BUDGET_USD`. The conflict rounds, before the checks and after a moved base, count apart, so an expensive conflict never takes the first fix of a real failure. A spent fix budget fails the job, and its error names both sums.
- The diff guard runs on everything the base takes. Then the job pushes the base. When GitHub rejects the push because the base moved, the job merges the new base in. It checks again only when that merge changed a game file that `docsOnly()` does not count as docs, so an incident-log commit costs no rerun.
- Each card gets `release-candidate`, a comment that names the cards merged with it, and moves to Done. A `dev` batch rebuilds `/dev/`. A release batch drops the current candidate post, so a new candidate follows.
- A failed job labels every card of its batch `factory-stuck`. Batches pushed before it stay in the base.
- The job log ends each batch, passed or failed, with its minutes and counts of card merges with their conflict rounds, checks runs, fix rounds, merges of a moved base and pushes.

## Approval

- Approve on a previewed card records the approver in `approvedResolving` and moves the card to Hardening.
- Approve on a hotfix ships it at once, on the build its full checks passed. When `main` moved since those checks, with or without a conflict, the card goes back to Testing and keeps its approval, as [Hotfix](#hotfix) says.
- Approve and Deny work only from the card's current post. A press on an older post gets an error reply and changes nothing.
- Deny labels the issue `wont-do` and closes it and its pull request as not planned.

## Approval replies

A rerun of design, implementation and testing costs hours, so a reply takes the smallest route that does what the member asked.

- A reply that starts with "patch:" or "redesign:" takes that route at once.
- Any other reply goes to Hermes with a header that names the post and the issue. Hermes routes it with the `factory_route_reply` tool.
- answer: Hermes answers in the chat. The card and its post stay, and the question goes on the issue under "## Committee question".
- patch: the card moves to Testing. The testing session takes the reply as its whole task, applies it, writes new approval text and screenshots, and the post checkpoint runs as usual. A session that finds the plan must change writes `.factory/needs-redesign.md`, and the card goes to Design.
- redesign: the card goes to Design.

Before a patch or a redesign queues, the plugin checks the issue as [process.md](process.md#committee-inputs) says. A refusal queues nothing and names what to get from the member.

A patch or a redesign goes on the issue under "## Committee feedback", closes the post and drops a queued approval. Every route adds a line to the ledger.

## Release

The release cut opens two cleanup issues, for optimization and code janitor work, labeled `release-task` and `maintenance`. Release tasks run the card stages against the release branch.

## Release playtest

The playtest checks that the merged features hold up together over a long run before the committee sees a candidate. It finds what the release broke, fixes it and confirms the fix in one job. It runs when no release task is open and the release head is not the commit it last passed. It runs on the tracking issue in the verify queue, counts toward the card job limit and has its own time limit, `FACTORY_PLAYTEST_TIMEOUT_MINUTES`.

- The job never merges `main` into the release. The release meets `main` once, at Ship.
- The factory clones the release head and checks the clone is at that commit. It dispatches the full game suite for that commit on GitHub Actions and plays at the same time. After the first play it waits for the run. A failed suite goes to the playtest agent with `prompts/release-playtest-checks.md`, like a failed check of its fixes, and the fix plays next. A suite that could not run fails the job as a machine failure, which the stuck sweep retries.
- Then it runs the game's `progression:playthrough` with one seed per release, the cut day as `YYYYMMDD`, for `FACTORY_PLAYTEST_TURNS` turns. 2250 turns are 5 in-game days, so the markov bot plays several of the other bot archetypes among the NPC traffic. The log holds every game event, snapshots of the player and every NPC, how the run ended and a summary.
- The first play also runs the seed on the baseline, side by side: the last commit this release passed, or `main` where the release branched off it before any pass. So a replay after a pass judges only what changed since that pass.
- Every truck travels in far mode and a scripted bot drives, so physics, close driving and choices the bot never makes do not happen. The log header, the prompt and the report say so.
- The factory reads the facts from each log: its seed, turns and commit, how it ended, and which kinds of activity never happened. A log of another run fails the job.
- An Opus agent reads the whole release log and writes `.factory/playtest.json` and the report `.factory/playtest.md`: observations, suspected issues, limitations, findings with severity and evidence, and the fixes it committed. Each finding is `release`, caused by a change since the baseline, or `old`, when the baseline has it too, with the evidence for the sort.
- The agent fixes each important `release` finding in its clone with the smallest change and commits it. It never removes or disables a feature or changes unrelated behavior to silence a finding. The factory replays the seed on the new head and resumes the same agent session. A replay checks that each fix holds and broke nothing, and does not hunt again.
- An important `old` finding that no open bug issue names opens a `bug` issue for `dev`, which waits for votes like any other. It never blocks the release.
- A clean verdict passes only with no important `release` finding, no commit since the play, a run that did not end in an error, and a reason for every death and every kind of missing activity. A clean verdict that misses one blocks.
- A clean end with fixes runs the diff checks first. Then the factory force-pushes the reviewed commit to `factory/suite-playtest`, dispatches the full suite for it on GitHub Actions, and runs the playtest and the build in the clone at the same time. A failed check goes to the same agent, and its fix plays again. Then the factory pushes the reviewed commit to the release, so the release head is the commit the last play passed. A release that moved meanwhile gets the fixes as a merge, and its new head plays next.
- A job plays at most `FACTORY_PLAYTEST_RUNS` times, the first play included. A blocked verdict, fixes left on the last play, or a failed check on the last play blocks the release. The job fails, so the tracking card takes `factory-stuck` and Hermes sees the failure. Hermes reads what blocked it and decides. `factory retry <tracking> [decision]` lifts the block and hands the decision to the next job's review.
- Each play and the fix checks print their phase and each step, so the worker shows what runs, like `Playing the baseline seed: running playtest`.
- Each play keeps its logs, facts, review, report and outcome in `$FACTORY_HOME/playtest/<day>/run-<n>/`. The job comments one report on the tracking issue at its end.

## Candidate

When no release task is open and the playtest passed the release head, the candidate job builds that commit at `/rc/`. The release agent writes the changelog, one line `- [#N] what changed` per change, and the job fails when the lines do not name the release's changes exactly. The post has a screenshot, the play link, the pull request, the count of changes and a Ship button. The changelog follows in a message under it, since a caption holds only 1024 characters. Any reply other than `ship` or `remove #N` opens a new `release-task` issue with the reply as its body.

The post records the commit it was built from. The candidate does not post when the release moved during its build. A release task merge, a playtest fix and Remove drop the post and a queued Ship when they move the release. Ship refuses a release whose head is not the commit of the post.

## Ship

Ship runs on the current candidate post only, with no release task open and the release still at the commit of the post. It checks the changelog again before it merges, as [process.md](process.md#branches) shows. Ship merges the release into a work clone of `main` in `work/ship-main`, once. The ship session resolves any conflict with `prompts/merge-branches.md`. The ship checkpoint runs the merge checkpoint's checks on the result, and a failure goes back into the ship session with `prompts/ship-fix.md`, until the checks pass or its fix rounds spent `FACTORY_MERGING_BUDGET_USD`. The conflict round counts apart, as in Merging. A spent budget fails Ship with nothing pushed, and Hermes asks a member. Before the push, the guard refuses a protected path or a SAVE_MAJOR change that differs from both `main` and the release, since only the ship session made it. Ship then pushes `main` and merges `main` into `dev`. A change on `main` never stops it. The factory builds a fresh clone of `main` with an empty save scope and runs `butler push` on the host, the only step that gets `BUTLER_API_KEY`. A GitHub release tagged `release-<day>` gets the changelog. The public post waits in `releasePost` with the changelog and the screenshot. Hermes drafts it with `factory_release_draft`, the draft goes to the committee chat with a Publish button, and a member's Publish posts it to the public channel. A reply to the draft goes to Hermes, who sends a new one. Each shipped issue loses `release-candidate` and closes.

## Hotfix

A hotfix fixes a bug in the shipped game. Its jobs run before other cards and past the card job limit. Its branch starts from `main`, and testing merges `main` into it. The post opens with a hotfix warning, and its button reads "Approve and ship to players". Approve merges and ships it like a release. A GitHub release tagged `hotfix-<day>-issue-<N>` gets a one-line changelog, and the committee chat says the hotfix shipped. The public channel gets nothing. The fix goes to `main` and `dev`. The open release stays as it is and meets the fix at its Ship.

A hotfix approval is given once and stays. The approve job records it in `keptApprovals`: the member, the time, the approved build and each build whose full checks passed under it. `main` takes only a checked build, and only while `main` is an ancestor of it. The guard runs again after a rejected push, so a `main` that moved during the checks or before the push never takes an unchecked merge. Otherwise the card goes back to Testing with the approval kept, with one issue comment and no chat message:

- Testing merges `main` as usual, and its session resolves any conflict. Then it runs `prompts/integrate.md` in place of the hardening and test rounds. The agent keeps the approved fix and what `main` gained, plays the fix and fixes what the merge broke.
- The post checkpoint runs the full suite on GitHub Actions and the playtest and the build in the clone, on the pushed commit, and a failure goes back into the same session. A spent budget fails the stage, and the approval stays for the retry.
- When the checks pass and the commit still contains the approved build, the build joins the approval's checked builds, the approval is queued again under the original member and the card moves to Approval with no post. The approve job ships it, or sends it back again if `main` moved again.
- The agent writes `.factory/intent-changed.md` when the merge, or a fix the checks need, needs a product choice or changes what the committee played. The approval then drops with that reason, and the build gets a normal post for a new approval. A card that lost its `hotfix` label drops it the same way.

The approval also drops with a reason on a patch or redesign route, Deny, `factory move` to any position but `verify`, `factory merge` and `factory drop approval N`, which is the explicit revocation. A branch that no longer contains the approved build drops it too. A tick queues a kept approval again for an Approval card whose current build is a checked one, with no job, failure, hold or stuck label, so a failed approve job ships after `retry N` with no new press.

## Incident

Ship and the hotfix ship queue an incident job for each shipped fix of a `bug` issue and each hotfix, in `pendingIncidents`. The job runs the design model in a clone of `dev`. It reads the issue as untrusted text and the fix commit, and judges the bug against the bar in `docs/incident-log.md`. Each entry is a class of bug with a rule, a check and the bugs seen. A bug that repeats a class updates that entry. A bug that starts a class gets a new entry, and a one-off bug gets none. The factory merges the change into `dev`. The job comments the outcome on the issue. A missing or malformed `.factory/incident.json` fails the job.

## Ad hoc

A member can ask Hermes for one-off work, like "simulate 10 battles and tell me if the MG is too weak". Hermes opens an `adhoc` issue in Implementation. The job runs Sonnet in a fresh clone of `dev` with the state, the job logs, the ledger and the archived agent transcripts mounted read only. A member can ask it what agents did on an issue, where they got stuck or what cost the most. It may run any repo harness and pushes nothing. It answers the member's message with `.factory/report.md` and any files, as [evidence.md](evidence.md#ad-hoc-files) says.

## Player answer

The tick sends a player's chat question that the bot would answer to `pendingAnswers`: one in its thread, or one that addressed the bot. It sends at most `FACTORY_ANSWERS_PER_DAY` a day, counting the answer jobs that ended in the last 24 hours in the ledger, the running one and the queued ones. Past that, the question gets no answer. Its thread note goes out at once either way. One answer job runs at a time, in the branch queue. It takes the first question off the queue as it starts, so a failed, dead or timed-out job never sends a second reply, and its question gets no answer. It runs Sonnet in a clone of `main` with `prompts/answer.md` on the restricted network, with only its Claude login: no tool keys and no Codex login. The agent reads the player text and the replied text in `.factory/question.md`, and the issue of a question under one in `.factory/issue.md`, as untrusted text. It reads the game's code and data, runs tests, scripts or the game when reading is not enough, and writes `.factory/answer.md`. The factory sends the answer as written when it is a plain, non-empty file inside the clone that does not hold the Claude login token. Anything else fails the job. The failure holds ids and the log path only, never player text.

## Model routing

The baseline is triage Haiku, design Opus, implementation Sonnet with an Opus advisor, and testing Sonnet. `FACTORY_DESIGN_MODEL` is the Opus id, `FACTORY_BUILD_MODEL` the Sonnet id and `FACTORY_TRIAGE_MODEL` the Haiku id. The issue's labels at the moment an agent starts decide its model.

- `design-sonnet` runs design on Sonnet.
- `implementation-opus` runs implementation on Opus. Testing and hardening stay on Sonnet.
- The release playtest, candidate and incident agents always run Opus. Triage always runs Haiku. Merge, ad hoc, player answer and waste review agents always run Sonnet.
- The triage prompt aims for about 20% Opus and 80% Sonnet in measured agent tokens. It is a rule of thumb, never a cap.

Triage rates each `ready` issue once and comments the rating under `Model routing from triage:`.

- `trivial` is one file or one small piece of logic, with no new state or cross-system rule. Triage adds `design-sonnet`.
- `hard` is a cross-system bug with no known cause, or a change to a save format or to shared data that many systems read. Triage adds `implementation-opus`. A change that only spans several systems is `intermediate`.
- `intermediate` or in doubt adds no label.

A label already on the issue wins, and triage never changes labels. A later triage run adds nothing once the issue is in the state's `routed` list. A member can add or remove a label at any time, and the next agent run reads it.

Committee rework that runs Implementation again gets its model from Hermes's judgment, not from code. After Hermes routes a redesign, or moves a card to Design or Implementation for a member, it removes `implementation-opus` for a small rework and adds it for a big redesign. It writes no label for a patch, whose testing session runs on Sonnet. Two reruns of Implementation never reach Hermes, so the issue keeps its label unless a member changes it: a member's own `redesign:` reply, and a patch whose testing session writes `.factory/needs-redesign.md`.

## Reference images

Before every agent stage, the host fetches the images of the issue body and every comment into `$FACTORY_HOME/media/issue-N/`. The agent sees them read only at `/work/.factory-media`, and the prompt lists their paths.

- It takes PNG, JPEG, GIF and WebP from GitHub's attachment hosts, and first-party images at `https://roam-game.online/<name>` or `/concepts/<name>`.
- It follows redirects only to GitHub's storage hosts, or from a first-party image to another one.
- Each file is at most 10 MB, and an issue has at most 12.
- An image that fails to fetch or decode is fetched once more. If it still fails, the prompt lists it as not available, and the agent works from the text and notes what it could not see. No stage fails for it. An image on another host is listed as not seen.
- The images a member sent in Telegram with a patch or redesign reply are listed too, from `$FACTORY_HOME/media/issue-N/committee/`. They stay private: the issue gets only their type, size and sha256. [process.md](process.md) says how they arrive.
