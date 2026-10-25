# Operations

How the factory runs on its host: jobs, limits, cleanup, failures and records.

## Jobs and queues

Each job is its own process, started by the tick. [process.md](process.md#tick-and-queues) lists the queues and the order jobs start in. `FACTORY_<QUEUE>_WORKERS` sets each queue's limit. The branch queue has no limit. Its jobs run side by side, and each one locks the shared folders it uses under `$FACTORY_HOME/locks`: `dev-build`, `release-main`, `merge-queue`, `ship-main` and each `merge-<branch>` conflict clone. A job waits for a locked folder at most `FACTORY_BRANCH_TIMEOUT_MINUTES`, and the cleanup sweep skips it. `FACTORY_<QUEUE>_TIMEOUT_MINUTES` sets each queue's time limit. Merge and Ship run the full checks and a fix loop, so both get `FACTORY_MERGE_TIMEOUT_MINUTES`. Each run of the factory checks also has its own limit, `FACTORY_CHECKS_TIMEOUT_MINUTES`, since the game's clock time limits are off on the host and a hung test or playtest prints nothing. The factory names the run's container and removes it at the limit, and appends `CheckTimeoutError: the checks ran past their N minute limit` to the checks log. Each run is judged by the log lines it wrote itself. A run with only timeout errors counts as a timeout and runs again, at most 3 runs in all. A run that also has another error is a real failure and goes to the agent. Every local test run gets `TEST_STALL_MINUTES` from `FACTORY_TEST_STALL_MINUTES`. When no test finished for that long, the suite prints `[test-cache] StallError` with each test file and test still running and exits 1. That is a real failure, so the agent gets the hung test's name instead of a blind rerun. Every 5 minutes a running check writes its minutes and its log size to the job log. Its step is in the job's status, not in the log text. Inside a job, an agent runs long commands with `factory-job`, and `FACTORY_JOB_MAX_MINUTES` caps the limit of each one. The agent waits on a job with `factory-job wait`, which returns when the job ends or after 9 minutes, never with `sleep`. After 3 waits on one job that did not end, it stops the job and runs a smaller check. The implementation prompt allows 5 change, run and read rounds per question, and the testing prompt 2 runs of a playtest, screenshot or test job per question, a 600-turn recorder run on 1 seed and about 45 minutes for the stage. `FACTORY_IMPLEMENT_TIMEOUT_MINUTES` and `FACTORY_VERIFY_TIMEOUT_MINUTES` stop a run that loops anyway, and its resume continues the same session. Every agent run gets `CLAUDE_CODE_AUTO_COMPACT_WINDOW` from `FACTORY_AGENT_COMPACT_WINDOW`, so the Claude CLI compacts a session's context at that many tokens instead of rereading an ever larger one each turn. The implementation agent keeps its plan progress in the task file's Conclusion, so a compaction loses nothing. An issue has at most one job at a time. Each job's containers carry its id as a label, so a timeout kills only that job.

Jobs share the host clone and the state file. Each git step and each state update runs under a lock in `$FACTORY_HOME/locks` or next to the state file. A lock of a dead process is taken over.

GitHub holds every branch. The host clone `$FACTORY_HOME/repo` keeps GitHub's branches as `origin/*`, and each fetch deletes any local branch. A merge or a revert runs in a throwaway worktree and pushes at once. A conflict or a rejected push leaves GitHub as it was, so a retry starts from GitHub. A conflict between branches goes to an agent in a work clone named `$FACTORY_HOME/work/merge-<branch>`, and its commit reaches GitHub only after the factory checks it. An agent's work reaches GitHub only after the factory checks its diff.

A work clone with no commit checked out, like one a full disk cut short, holds no work. The next job deletes it and clones again, and its log names the folder.

## CPU pools

Each job's containers run on a fixed set of CPUs. `FACTORY_CPU_LIGHT`, `FACTORY_CPU_IMPLEMENT` and `FACTORY_CPU_TEST` set each pool's share, and each pool gets round(share × cores) whole CPUs, at least 1. The pools must fit the host, or every job start throws.

- light: triage, waste review, design and branch jobs other than the merge and the candidate, so a catch-up's agent never takes the merge checks' CPUs.
- implement: implementation, ad hoc, verify, harden and release playtest jobs. The Testing job runs its build-only checkpoint here.
- test: the merge and ship checks, the candidate, which checks the frame rate, and the post-only checks. A job of another pool runs its local checks here too: a hotfix's post checkpoint and the release playtest's fix checks. The full game suite runs on GitHub Actions, never on these CPUs.

On the 8-core host that is CPU 0, CPUs 1-3 and CPUs 4-7. Agents never take the test pool's CPUs. Docker pins containers with `--cpuset-cpus`. A step run by hand is not pinned.

`FACTORY_VITEST_WORKERS_IMPLEMENT` and `FACTORY_VITEST_WORKERS_TEST` set how many workers the game's test runner starts in a container of each pool. The factory passes the count as `TEST_WORKERS`. Light containers get none and keep the game's rule of one worker per CPU.

## Full suite on GitHub Actions

`.github/workflows/game-suite.yml` runs the whole game suite for one commit on a standard GitHub runner, in the Playwright image the agent image is built on. `remoteSuite` in `src/stages/remote-suite.ts` dispatches it from `main` with the commit, takes the run id the dispatch returns, and reads the run every `FACTORY_SUITE_POLL_SECONDS` until it ends. A failed `tests` step goes to the fix agent with the end of its log. Any other failure, and a run still queued after `FACTORY_SUITE_START_MINUTES`, is a machine failure for the stuck sweep. The workflow sets `TEST_SUITE_MINUTES` to 20, so a suite that grew too slow fails the `tests` step with its slowest files, and the fix agent makes them cheaper. It sets `TEST_STALL_MINUTES` to 10, so a hung test fails the `tests` step with its name. It sets `TEST_TIMEOUTS=off` as the host does, because a runner's speed varies by about 20 percent from run to run, and a clock limit would fail tests by chance. The job stops at 25 minutes, which leaves room for setup above the suite limit, so only a broken runner reaches it and counts as a machine failure. Every test run, on the host too, fails a test over 30 s of CPU time and a test file over 90 s, so an agent meets a slow test on its own run before the suite does.

Standard runners are free on a public repository. Larger runners always cost money. Set this once so a mistake can never bill:

1. Open the org's Settings, then Billing and licensing, then Budgets and alerts.
2. If the org has a payment method, add a budget for Actions of $0 and turn on "Stop usage when budget limit is reached".
3. Without a payment method, paid usage is blocked already.

Run the workflow by hand with `gh workflow run game-suite.yml -R <repo> --ref main -f sha=<commit>`, and watch it with `gh run list -R <repo> --workflow game-suite.yml`.

## Memory

Memory, not CPU, limits how many jobs fit on the host. Each container writes its cgroup's peak memory to a file in its own folder under `$FACTORY_HOME/peaks` when it ends, and the factory reads and removes that folder. The job keeps the highest peak of its containers and writes it to its ledger line as `peakGb`. A container killed before its end writes none.

`FACTORY_GPU=on` gives every container the host's NVIDIA GPU, and the playtest checks the frame rate. `off` runs the playtest with `--cpu`, with fewer turns and no frame rate check.

## Card job limit

The factory has no limit on the jobs it starts per day. The Claude usage-limit pause guards the shared limit.

One card may start at most `FACTORY_MAX_JOBS_PER_CARD` jobs in any 24 hours. The jobs that count are triage, design, implementation, verify, harden, the release cut, the release playtest and the candidate. Checks, approve, merge, remove, ship, change, ad hoc, incident, dev and waste jobs do not count. A card at its limit waits with the reason `card-budget` until its oldest start leaves the window. Hotfix jobs count but run at the limit.

## Resume

A card job whose process dies within its time limit resumes once. This covers a crash, a memory kill or a reboot. A card job that runs past its time limit resumes once too. The tick kills it first and writes the ledger outcome `timeout`. Each issue keeps its agents' Claude Code sessions in `$FACTORY_HOME/sessions/issue-N`. The tick removes the job's containers, puts the issue in `interrupted` and frees its card job limit slot. The next tick starts the same stage, and each agent round continues its session with `--resume`. Merges, checks and publishing run again. A second death or a second timeout fails the job. A dead or timed-out branch job does not resume its session. An approve, remove, ship or incident job whose order is still queued keeps it once, puts it in `retried` and starts fresh on the next tick. A second death or timeout fails the job and drops its order. A job whose order is already gone fails and reports at once. A merge labels the cards of its batch `factory-stuck`, so it does not start again by itself. A card job that died and was found past its time limit resumes once too. A job's end clears the sessions and the mark.

`factory pause-card N` uses the same path. It kills the card's job, puts the issue in `interrupted` and frees its card job limit slot, and the card waits until `resume-card N`. The continued job counts as resumed once, so its death fails it.

## Cleanup and health

Every tick, after it checks the running jobs:

- It deletes each folder in the web root except `dev`, `concepts` and the builds of cards in Approval, Hardening or Merging, or merged and listed in `devMerges` or `release.merges`. A feature's build stays until its release ships. Ship drops the builds of the features it shipped, and a hotfix drops its build when it reaches `main`. It skips this while a verify, checks or branch job runs, since those deploy builds before they record them.
- It deletes the clones in `$FACTORY_HOME/work` of finished work: issues whose card is Done or off the board, `check-issue-*`, `merge-queue`, `dev-build`, `release-main`, `incident-*` not queued, `change-*` of the retired change job, `release-playtest`, `release-baseline`, and `release-candidate` with no release open. The playtest audit in `$FACTORY_HOME/playtest/` stays. A clone that stays loses its `node_modules`. A running or interrupted job keeps its clones. Folders with other names stay, and the tick log names them.
- It deletes job logs older than `FACTORY_LOG_DAYS`, except `tick.log`, `update.log` and the logs that `failures` names.
- It deletes archived agent transcripts older than `FACTORY_TRANSCRIPT_DAYS`.

Every tick writes `$FACTORY_HOME/health` with its time, the free disk and the available memory, also while paused. Under `FACTORY_MIN_FREE_GB` free, the tick starts no job. Memory under `FACTORY_MIN_AVAILABLE_GB` blocks nothing, and a host with no `/proc/meminfo` records none.

When `dev` moves past the commit `/dev/` serves, the next tick rebuilds `/dev/`, so a merge made outside the factory reaches the dev link too. A failed build records its commit in `devFailed` and what broke in `devError`, and the tick skips it until `dev` moves again. The incident watch shows both to Hermes, which fixes `dev` or reverts the merge that broke it.

## Repairing a work clone

A failed merge can leave a card's work clone with an open merge, conflicts or thousands of dirty files. The next job reuses any clone with a commit. A stage resumes its own unfinished merge of the base or of the issue branch, so those need no repair. Any other open merge fails the stage again. `factory repair-clone N --by <who> --reason <why>` swaps the clone for a fresh one and keeps the old one.

1. Run `factory repair-clone N --by hermes --reason <why>`. Add `--backup-merge` when the clone has an open merge, revert, cherry-pick or rebase, or conflicted files. Without it the command refuses such a clone.
2. Check the new clone. A repair that works already removed the stuck label and the failures, so the next tick continues the card.

The command needs no pause and no other idle card. It holds the card for its duration, takes the clone lock `$FACTORY_HOME/locks/issue-N`, and lifts only the hold it placed. A hold that was there before stays, and so does the `interrupted` mark, so a held card resumes in the new clone after `resume-card`. A job start, `prepareWorkClone` and the tick sweep of `work/issue-N` wait for that lock or skip the clone. The command acts at once. It refuses, and changes nothing in `work/`, when:

- a job of the card runs;
- `--by` is no member and not `hermes`;
- `work/issue-N` holds no clone with a commit, since the next job clones that again;
- the clone has an open operation or conflicts and no `--backup-merge`;
- the host clone, freshly fetched, has no `factory/issue-N`.

A repair fetches the host clone, then clones GitHub's `factory/issue-N` exactly, with fresh `origin/*` refs like `dev`. It moves the whole old clone, with its tracked, untracked and ignored files, to `$FACTORY_HOME/clone-backups/issue-N-<time>/clone`. `repair.json` beside it records who, why, the old HEAD and branch, the open operation, the conflicted files, the commits on no GitHub branch and the outcome. `status.txt` holds the old `git status`. Only the `.factory`, `.factory-tasks` and `.factory-media` folders are copied into the new clone. The repair passes only when the new clone's `git status` is clean and its HEAD is the branch head.

A failure after the move keeps the backup where it is, moves the half-made clone to `failed-fresh` in the backup and leaves `work/issue-N` free. The error prints the `mv` that restores the old clone. Nothing deletes a backup. The tick sweep reads only `work/`, so Hermes deletes a backup once the card is past the trouble. A failed repair leaves the stuck label and the failures in place.

## Stuck sweep

A stuck card waits for a person, so the tick explains each one and clears the ones no person needs. Every tick that is not paused, after cleanup and before the disk check, `sweepStuck` in `src/stuck.ts` reads the board the tick already fetched, every page of it. It writes one record in `stuck` for each open stuck card and changes nothing else on a card it cannot explain.

A record holds the cause: the card's newest failure, or the newest merge failure whose `batch` holds the card. It copies the failure's `error` text for people and its `cause` field. The sweep reads only `cause`, never the text. A cause of `null` marks a failure recorded before causes, and the card stays `blocked` for Hermes. A record keeps its cause after the failure leaves `failures`. Its incident is the issue, the stage and the time of that failure, so a new failure opens a new incident. A card with no failure gets an `unrecorded` incident at the time the sweep first saw it. The record goes when the label goes by any other hand, or when the card leaves the column the sweep released it in.

Each record has a kind. The first that fits wins:

- `running`: a job of the card runs, or the card is in the running merge batch. The sweep waits.
- `held`: the card is held. The sweep waits.
- `unrecorded`: no failure names the card. It stays for Hermes, since an empty budget or a committee question may have aged out of `failures`.
- `blocked`: an empty budget, a committee question, the release tracking card, an action the sweep already took in this column, a refused action, and every other failure, like a failed check. It stays for Hermes.
- `merge-batch`: a Merging card of a merge batch of two or more cards that timed out or died. The failure's cause is `timeout` or `died`.
- `clone-merge`: a Design, Implementation, Testing or Hardening card whose work clone has an open merge, revert, cherry-pick or rebase.
- `machine`: a failed `gh` call of the GitHub client, since the tick just read the board, a full suite on GitHub Actions that could not run, or a full disk once `FACTORY_MIN_FREE_GB` is free again. A full disk is an `ENOSPC` error. The retry runs once per card per column, so a call that fails for good turns `blocked` after it.

The sweep acts with the commands Hermes uses, and writes `tries` and `released` on the record before it acts:

- `merge-batch`: while no merge job runs and no unstuck Merging card of the same base waits, it runs `retry` on the first half, rounded up, of the oldest failed batch, by issue number. The next merge job takes exactly that half. A half that times out again is halved again, and a card that times out alone is `blocked`. A label GitHub refuses to remove stays, and the next tick tries again.
- `clone-merge`: `repair-clone` with `--backup-merge`, by `factory`, one card per tick and only with the disk above `FACTORY_MIN_FREE_GB`. It also refuses a clone with commits on no GitHub branch, so no unpushed work leaves the clone.
- `machine`: `retry`, one card per tick.

The board lists a write up to a minute late, so a card the sweep released keeps its kind for 5 minutes while the board still shows the label. The sweep does not repair or retry it again, and a merge release of it only removes the label once more. A label still there after that, with no new failure, is `blocked`. A clone repair or machine retry runs once per card per column. An action that fails writes its reason in `refused`, turns the record `blocked` and does not run again for that incident. A crash of the whole sweep writes `sweepError`, the tick goes on with the cards as they were, and the next sweep that passes clears it. The sweep reads GitHub only through the tick's board, and its only GitHub writes are the label removals.

Hermes's watch lists every stuck issue with its kind, like `stuck #12 Tow fee (sweep: merge-batch)`, and a `stuck sweep failed:` line for `sweepError`. A line holds for one incident, so Hermes wakes on a new failure or when the sweep gives a card back. `factory stuck` prints every record, and `factory card N` the card's one.

## Failures and Hermes

Each factory process sends its GitHub calls one at a time, as GitHub asks. A call that hits a rate limit waits `FACTORY_GITHUB_RETRY_BASE_SECONDS` and runs again, up to `FACTORY_GITHUB_RETRIES` times, with the wait doubled each time. Any other GitHub error fails at once. A call that runs past `FACTORY_GITHUB_TIMEOUT_SECONDS` is killed and fails, so a dead connection cannot hang a tick. It does not run again, since a write may have landed.

The factory acts only on a whole board. GitHub sometimes answers a page of the project's items with no items, or with fewer than it counts, while the project holds them, and `hasNextPage` can then claim the list ended. So every board read checks that each page gives the same `totalCount`, that no item is null or repeated, that a page before the last one holds items and a cursor, and that the pages add up to the count. A board that counts no items needs a second read of another shape that also finds none. A read that fails a check is read again from the first page, with the waits and the number of tries of a rate limit. An empty board also reads again, and counts only when every try finds it empty. A read that stays incomplete fails with a `BoardReadError`, a GitHub error, so the tick starts nothing, `factory cards` and `factory audit` print nothing and the dashboard shows the board as unavailable. No reader ever takes a cut board for the real one, so no card goes missing from the scheduler or the audit.

GitHub's project items list can also be whole by its own count and still omit open cards (#890: it listed 186 items for hours and left out new Design cards that their issues showed). So every board read also lists the open issues of the repository, which GitHub reads apart from the project items, and takes each one's own project item and Status. An open issue's own item wins over the listed one, and an open issue the list omits joins the board. The open issues read passes the same count, null, repeat and page checks, and fails with a `BoardReadError` when it stays incomplete. A closed card that the list omits costs nothing, since no stage acts on it.

The tick removes a work clone `issue-N` or `adhoc-N` only after it is sure of the card. When the board does not show the card open, the tick reads the issue's own project item first and keeps the clone when the card is open or the read fails. The sweep also keeps any clone whose run holds `locks/run-issue-N`, or `locks/run-stage-S` for a stage with no issue. Every `factory run` takes that lock for its whole run, so a stage run directly by hand, with no scheduler job in `state.json`, still keeps its clone. A second run of the same issue fails while the first lives. A lock of a dead process is stale and frees itself.

One card, as `factory card N`, a control order like `factory move N` or a hold, and an approval press read, is read from its issue's own project items, which GitHub reads apart from the items list. When the issue lists no card on the project, a whole board read must agree before the order fails with `not on the board`.

A card stage that fails resumes once on the next tick in its own sessions, and its agent gets the error. It takes no label and records no failure. A failed job after that, a branch job that timed out, a stage that spent its budget or asked the committee, and any other failed job labels its issue `factory-stuck` and records the failure in `failures` for a day. A failed merge job labels every card of its batch and records the batch in its failure. The factory posts nothing about it. A failed or dead catch-up job records its failure with its issue and labels nothing, since its card stays in the merge queue, and the stuck sweep never takes it as a stuck card's cause. A stuck release step labels the tracking issue. Removing the label lets the factory try again.

An agent run that ends on the Claude weekly usage limit is the exception. The factory writes a pause record of kind `usage-limit`, with the message as its note, to `$FACTORY_HOME/paused`, unless a pause is already there. The job still records its failure, but the card takes no label. Hermes resumes the factory after the reset, and the card runs its stage again.

Hermes manages the factory. Its incident watch wakes it on a stuck issue, a failed job, a tick crash in `lastTickError`, a failed `/dev/` build, a failed factory update, low disk, low memory, no tick for 20 minutes or a pause older than an hour. It also wakes on each `drift: <line>`, which is one line of `factory audit`, so Hermes fixes stale state before it blocks a card. Each call to GitHub and to `factory audit` has a time limit. A source that fails or times out repeats its last answer, so no known incident closes, and after 10 minutes it adds a `<source> failed since <time>` line. A failed or killed watch run stays in Hermes's cron log and never reaches the chat. Only Hermes's own messages do. Hermes reads the logs, the state and the chat, then fixes the incident. No failure waits for a person. When a fix fails, Hermes tries another approach, and a card that keeps failing goes back to Design with the findings. Hermes reports what it did and asks the committee only about product decisions and game design or taste. Hermes may push a merge to `dev` or to the open release after the factory checks pass. Hermes never edits factory code directly: it files each factory bug or change request as a GitHub issue labeled `factory` and works around it. When a committee member asks, Hermes may start a Claude Code job that opens a factory change pull request into `main`, which a person merges. [hermes/SOUL.md](../hermes/SOUL.md) holds its rules, and [hermes.md](hermes.md) its steps.

Hermes uses the `factory` CLI for every look at the factory and every change. Read commands print the state and change nothing. Write commands become inbox commands, and the next tick applies each one before it picks jobs. A write that cannot apply changes nothing and becomes a failure that names the reason. Each write names who ordered it and why, on the issue and in the ledger. Only a member's order runs `merge` or `move N harden` of a card the committee has not approved, and `ship`. `factory help` lists every command. [state.md](state.md) lists the commands.

While Hermes edits state, it pauses the factory with the file `$FACTORY_HOME/paused`, and every tick starts no job, applies no order, runs no cleanup and takes no intake. A paused tick still checks the running jobs, so a dead or timed-out job leaves `jobs` also during a pause. Hermes writes it with `factory pause <reason> --by hermes`. The option `--pid N` ties the pause to a process, and the tick lifts the pause once that process ends.

## Hermes's agy and codex

Hermes runs `agy` and `codex` from its shell the way an agent does, for work like a Russian draft from agy. The Hermes image has no agy login and no Codex login. Its `agy` and `codex` are copies of `hermes/agent-tool`, which sends the call through `factory-host` to `factory tool <agy|codex>` on the server. That command runs the image's own wrapper in a fresh agent container, as `src/hermes-tools.ts` builds it.

- Auth: agy gets the Google login in `$FACTORY_HOME/agy/antigravity-oauth-token` as a read-only mount, and codex gets the Codex login in `$FACTORY_HOME/codex`. Each secret goes to docker by env name or mount, never on a command line, and each tool gets only its own. The secrets stay out of Hermes's image, env and chat, but this is no wall against Hermes: its `factory-host` shell and its mount of the factory home already reach them, and a tool prints what Hermes asks. So Hermes never asks a tool for its env or login.
- Models: agy runs on `AGY_MODEL`, and codex on `CODEX_MODEL` at `CODEX_EFFORT` unless the call names a model with `-m`.
- Limits: Hermes's agy runs of one UTC day share one `AGY_MAX_RUNS`, counted in `$FACTORY_HOME/state/hermes-agy-runs.json` once the proxy is up. A call past it fails before it starts a container. `agy --help`, `agy -h` and `agy --version` count nothing. The cap stops a runaway loop. Hermes can edit the file, so SOUL.md tells it never to. Each call runs on 1 CPU and 2 GB, behind the egress proxy, and stops at `FACTORY_JOB_MAX_MINUTES`. A `factory tool` stopped by a signal removes its container too. When Hermes's own command times out, the ssh session ends with no signal on the server, so the call runs on until it ends or reaches the limit.
- Files: the tool's `/work` is `$FACTORY_HOME/hermes-tools`, which Hermes sees as `/factory/home/hermes-tools`. A call from a folder under it runs in the same folder under `/work`, and any other call runs in `/work`. So Hermes writes the inputs there, runs `agy` or `codex` from that folder, and reads the outputs there.
- Arguments and stdin reach the tool unchanged, and its output and exit code come back. A long call runs in the background with its output in a file in that folder, since Hermes's own command may time out first.
- Containers carry the label `factory-hermes-tool=1`. `docker ps --filter label=factory-hermes-tool=1` through `factory-host` lists the running calls.

`infra/deploy/status.py` prints where the deployed Hermes finds both commands. `FACTORY_SMOKE_HERMES=factory-hermes npx vitest run hermes-tools`, run on the server from the deployed `factory/`, checks both commands in the deployed Hermes container. It also gets one real answer from agy when the agy login is there, and one from codex when the Codex login is there. That agy answer counts against the day's `AGY_MAX_RUNS`. Without the factory env in its folder the test fails.

## Activity and status

Each job reports a heartbeat every `FACTORY_OBSERVATION_HEARTBEAT_MS`. The factory's own scripts print one JSON record for each step and phase, with `"source":"runner"`, and the runner reads only those records. The `[step]` lines beside them are for people. The caller of each command names its activity in the run options, so the runner never reads it from the command text. Agents report their phase with `factory-status`, and Hermes with its hooks and `factory_report_activity`, with no free text. The tick reports why each job waits. The public [dashboard](../dashboard/README.md) shows all of it, and Hermes's `factory_status` tool reads the same snapshot.

## Chat answers

When a member acts on a post by button or reply, the factory adds a status line under its caption, like "Approved by Ann", and drops its buttons. The state keeps each open post's caption for this, since Telegram cannot read one back. A command on a post answers with that status line alone. An approval post with no screenshot is a text message, so its status line edits the text, not a caption. An ad hoc task gets Hermes's reply, then the report, then any files. Errors always get a reply.

## Ledger and waste review

Every job adds one line to `$FACTORY_HOME/ledger.jsonl` when it ends: its id, stage, issue, start, end, outcome and agent runs. A merge job's line also holds `batch`, the issues it took, so the dashboard counts its time as work on those cards. `parts` lists each container run of the job with its kind and times: `agent` for an agent run, `checks` for tests and playtests, `build` for a game build. The caller of the container names the kind. A part still running when the job is killed ends at the job's end. Job time outside its parts is the factory's own git and GitHub work. The tick writes the line of a job that died or timed out, and `pause-card` the line of the job it held, with the outcome `held`. The dashboard and the waste review count a held job as neither finished nor failed, and its spend as no waste, since its stage continues in the same sessions. Each agent run reads its model, cost and minutes from the `result` event of its stream-json output. The cost is the CLI's `total_cost_usd`, which covers only that run, since the container keeps no Claude cost state. So each ledger record holds only its own spend, and the dashboard sums records. A finished agent run with no `result` event fails its job.

A run cut off before its `result` event still costs money. This covers a crash, a timeout, a dead job process and a usage limit. Every run keeps its Claude Code transcript on the host, in the issue's sessions folder or in `$FACTORY_HOME/usage/<job>.projects`. The run's open record in `$FACTORY_HOME/usage/<job>.run.json` names it. Whoever ends the run or the job prices that transcript at `FACTORY_MODEL_PRICES` and marks the run `fromTranscript`. Only transcript messages stamped at or after the run's start count, so a resumed session is not charged twice. These list prices give the same cost Claude Code reports for a finished run. The dashboard shows the spend of every job that failed, died, timed out or was stopped as wasted.

Before the factory deletes a sessions folder or a run's projects folder, it copies every transcript in it to `$FACTORY_HOME/transcripts/<session>/`, with its subagents. The transcripts are kept to analyze what agents did, where they got stuck and what to optimize. Each run in the ledger names its `sessionId`, so a ledger line leads to its transcripts. An ad hoc task sees the ledger and the archive read only, so a member asks Hermes for such an analysis. The folder is a Claude Code projects folder, so `transcriptUsage()` in `src/transcript.ts` reads it.

Every routed approval reply adds a line too.

Every card move adds a card line: the issue, the new column, the time and a step that names the move. `src/card-events.ts` writes it after the board takes the move, and no other code moves a card. A line holds no actor, comment or reason.

- Normal path: `entered`, `accepted` or `voted`, `planned`, `built`, `posted`, `approved`, `hardened` into Merging, and `merged`.
- Loops back: `questions`, `plan-wrong`, `patch` into Testing, `redesign`, `base-moved` of an approved hotfix into Testing, `removed` and `unbundled`. Older lines also hold `conflict` of a hotfix into Testing.
- Lines from before one session ran each stage also hold `patched`, `rebuild`, `review-failed` and `patch-replan`. No stage writes them now.
- Early ends: `triage-wont-do`, `design-wont-do`, `bundled`, `denied`, and `dropped` by `factory move N done`.
- Other moves: `moved` by `factory move`, `merge-ordered` by `factory merge`, `requeued` of a hotfix whose kept approval goes back to Approval, `shipped` for the release card and `reported` for an ad hoc task.
- A line carries `flow` when the card is a hotfix, a release task, the release card or an ad hoc task.

A groomed `unclear` verdict moves nothing, so its wait for the author stays in Triage. A `vote` verdict moves nothing either, so its wait for votes stays in Triage until `voted`. A move by hand on GitHub writes no line.

Every `FACTORY_WASTE_REVIEW_DAYS`, the tick starts a waste review in the triage queue. `wasteNumbers()` in `src/waste.ts` computes the cost per stage and model, the wait per queue, the stages that ran more than once on one issue, the routes and the most expensive issues. It computes the same numbers for the period before, so a jump shows. Ledger lines of the retired change job keep their stage `change`, and their id is no GitHub issue. They count in the totals, stages and models, and never as an issue. `JOB_ISSUE` in `src/types.ts` names the stages whose issue is a GitHub issue, and `RETIRED_JOB_STAGES` the stages old ledger lines may still hold. A Sonnet agent reads those numbers and the records, and writes `.factory/brief.json` with one bottleneck and one change request. The job records them in a closed issue labeled `factory-review` and writes `$FACTORY_HOME/review-pending`. That file is an incident line for Hermes. Hermes checks the review and posts to the committee only when something matters, then deletes the file. When the proposed change matters, Hermes files it as a `factory` issue for the owner. The first review waits one full period after the deploy.

The review's period starts at `lastWasteReview` in the state file. The job moves it to the review's end only after the issue is closed, the review is in `$FACTORY_HOME/waste-reviews.md` and `review-pending` is written. So a failed review keeps its period, and the next one covers it. While a `waste` failure stands in `failures`, the tick starts no review, so a broken review does not rerun on every tick. It runs again when the failure ages out after a day, or at once by `run waste -`. Once the issue exists, the job writes `$FACTORY_HOME/waste-review-publish.json`. A retry of the same period finds it and finishes that issue, with no agent and no second issue.

## Error reports

The release, dev and candidate builds post each new game error to `/errors` on the public site. Card previews post nothing, since an error there belongs to the card's own review. The build that publishes a reporting build moves its source maps to `$FACTORY_HOME/sourcemaps/<commit>/` first, so no map goes public. Dev and candidate maps go after `FACTORY_ERROR_MAP_DAYS`, and release maps stay.

The error service is its own systemd unit, `roam-factory-errors`, with its log in `logs/errors.log`. `src/error-reports/` holds its code. It refuses a report from another origin, one over the size caps, one past `FACTORY_ERROR_IP_PER_HOUR` for its address, one from a commit it has no maps for, and one whose stack maps to no game source. Each refusal counts by reason in `$FACTORY_HOME/error-reports/store.json`.

A report it takes gets a fingerprint from the error and the top game frames. The fingerprint ignores the numbers, signs, URLs and file or asset names in the message, so one cause that fails on many files opens one issue. The store ties the fingerprint to its issue number, and the issue body shows the fingerprint to people only. A lost store makes the next report of a known error open a second issue. A new fingerprint opens an issue labeled `bug` and `error-report`, at most `FACTORY_ERROR_DAILY_ISSUES` a day. A report from a commit the fingerprint has not seen comments on its open issue, and reopens a completed one when the build was published after the close. A `not planned` close stays closed. The service keeps one report file per fingerprint and commit, up to `FACTORY_ERROR_DISK_MB`. Agent stages of the issue get those files read-only at `/error-reports/`, and `npm run error:replay` in `game/` reruns their turn.

The service also keeps one file per kept player report from the game form, under the issue it opened or commented on. The same `FACTORY_ERROR_DISK_MB` covers both kinds. Agent stages of the issue get them read-only at `/player-reports/<issue>/`, and `npm run error:replay` loads their world and runs one turn.

A daily cap, the disk cap or an address past its limit writes a line to `$FACTORY_HOME/error-reports/alert`. Hermes's incident watch prints it, and Hermes deletes the file once handled.

A Hermes plugin that cannot write a player vote or comment to `$FACTORY_HOME/public-inbox` writes one line per day to `$FACTORY_HOME/public-alert`. The plugin still stops that update, so player text never reaches the Hermes agent, and the update itself is lost. Hermes's incident watch prints the file, and Hermes finds why the inbox write failed, usually a full disk or a wrong mode, then deletes the file.

## Player chat delivery

The bot reads the player chat only as far as Telegram delivers to it, so the chat needs this setup. The factory cannot check it, so check it by hand after a change to the chat or the bot.

- The bot is an admin of the channel's discussion group, and of `FACTORY_PROPOSAL_CHAT` when that is another group. An admin bot gets every message and every reaction, whatever its privacy mode.
- If the bot is not an admin, Telegram's privacy mode decides. With privacy on, the default, the bot gets only commands, @mentions of it and replies to its own messages, so a plain bug report or idea never arrives. Only the bot's owner can turn privacy off, with `/setprivacy` in BotFather, and the bot must then leave and rejoin each group. Making the bot an admin is the simpler fix.
- The bot needs the right to send messages in the group, since it replies there.
- To check, post a plain message with no mention in the discussion group and see that `factory public` lists it within two ticks.

## Deploying the factory

The server runs the factory from GitHub's `main`, and only from there. To change factory code or `settings.env`, merge it into `main`. Every 2 minutes, `factory-update` checks `main`. When `main` moved, it builds the new commit in its own release folder, with no pause, and records the commit in `$FACTORY_HOME/deployed`. It refuses a code dir with local edits. [infra/README.md](../infra/README.md) has the details.
