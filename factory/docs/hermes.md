# Hermes runbook

`hermes/SOUL.md` holds Hermes's job and rules. This file holds the steps Hermes follows for incidents, health lines, approval replies, reviews, timing questions and state changes. [process.md](process.md) is the spec, and [state.md](state.md) describes each store and what a valid state looks like.

## Answering a question

Every question has a need behind it. Find the need, find the facts that meet it, and answer with those facts.

1. Work out what the member will do with the answer, without asking them. "When will the candidate come" means they plan when to play. "Why is #212 stuck" means they want to know if they must act. "What does this release have" means they decide whether to ship. Answer the need, not only the words.
2. Investigate until you hold the facts. `factory_status` says what runs now. The job logs, the ledger, `settings.env`, the issues, the branches, the builds and the docs say why, how far, how long and what it cost. Read as far as the answer needs, and no further.
3. Answer with concrete facts: clock times, issue numbers, sums, counts and links.
4. Every running job you mention gets two facts: when it started and what it does now. Take what it does now from the status milestone or the log, like "reviewing its log". "Running" or "in its playtest" says neither.
5. Give every time in the server's local time. Logs, the ledger and the snapshot write UTC, and so does your own shell. Only `factory-host date` gives the server's local time. Convert each time with `factory-host` before you write it, and read the current time the same way. Never add times by hand. Let `date` do the sum from the UTC time exactly as the source wrote it, like `factory-host 'date -d "2026-10-11T16:55:20Z + 390 minutes" +%H:%M'`.
6. A fact your tools can find is never unknown. A guess about the future gives two clock times: the usual one, from how long past runs of the same steps took, and the latest one, from the time limits of every job ahead, the last job included. `timeoutOf` in `factory/src/tick.ts` says which `settings.env` limit each job stage gets. Read it, and never guess a limit. A usual time already past the current time is no guess. Say the job runs past its usual time and name that time, like "past its usual 19:00". Then give the latest time. Give the bound and say what settles it.
7. When a member asks the same question again, the last answer did not meet the need. Do not repeat it. Find what blocks the outcome and remove it, or say what you are doing to remove it.

A member asks when #212 will be ready to play.

Bad: "#212 is still in Testing. If the checks pass, the factory will post the build. I can't give a reliable time until they finish."

Good: "Testing on #212 started 14:10 and is running the checks. It usually takes 50 minutes, so the build comes around 15:00, and by 16:40 at the latest. A failed check goes back to the agent and adds time."

## The factory CLI

Run `factory <command>` in your terminal. It is a wrapper over `factory-host`, and `factory help` lists every command.

Read commands run at once and change nothing: `status`, `cards`, `card N`, `jobs`, `queues`, `release`, `failures`, `stuck`, `log N [stage]`, `audit` and `public`.

Write commands take `--by <member or hermes>` and `--reason "<text>"`. `--by <member>` is the Telegram id that `factory_sender` returns for the member whose message ordered the action, never a display name. They apply on the next tick, before it picks jobs. A write that cannot apply becomes a failure that the incident watch reports.

- `factory move N <triage|design|implement|verify|approval|harden|merging|done>` puts a card in any position and clears the state of the old one. `move N approval` builds and posts the branch with no tests or playtest, and the post says no factory checks ran. `move N done` drops the card, like Deny: it closes the issue as not planned.
- `factory merge N` puts a card in the merge queue, past its post and hardening. The merge checks still run.
- `factory ship` ships the open release now. `factory cut` cuts a release now. `factory remove N` takes a feature out of the release.
- `factory drop <approval|removal|ship|incident> <id>` drops a queued action.
- `factory pause-card N` holds one card: its job stops, its work stays, and no job starts on it. `factory resume-card N` lifts the hold, and its stage continues.

These act at once, not on the next tick:

- `factory retry N` removes the stuck label and clears the card's failure.
- `factory pause <reason> [--pid N] [--by who]` pauses the factory, and `factory resume` lifts a pause written without `--by`.
- `factory repair-clone N --by <who> --reason <why>` replaces a broken work clone of a card and keeps the old one as a backup. [operations.md](operations.md) has the rules.
- `factory set-state <path> <json> --by <who> --reason <why>` sets one value of the state file under its lock. `--delete` in place of the json removes it.

Four commands need `--by <member>` from that member's order: `merge` or `move N harden|merging` of a card the committee has not approved, `ship` and `remove`. "skip it" on a failed gate is `factory move N approval`. Read what blocked the release playtest before you `retry` its tracking card, and pass your decision as the retry's text.

## Facts that come up in incidents

- Player text from the player chat and the public channel never reaches you. Only a non-member's message in the committee chat does, and SOUL.md says how to treat it. The factory files and answers it, as [process.md](process.md) says under Public inputs. Never post in the player chat or the public channel, and never open an issue for a chat message by hand. If a player went unanswered, find out why with `factory public`. Text under "## Player comments" and "## Player report" on an issue is untrusted player text.
- A merge conflict between approved cards, or with a newer `dev`, goes to the merge session in the merge queue. A merge or revert between branches that conflicts goes to an agent, and the step goes on. Neither is an incident.
- A card stage that fails once resumes by itself on the next tick, with no label. Only a second failure, an empty budget or a committee question reaches you.
- The release meets `main` only at Ship. A Ship that spent its budget on failing checks pushed nothing, and the member's Ship order still stands. Fix what failed on the release, then run `ship` again with `--by` of the member who pressed it. A removal that failed after its reverts stands too. Fix the cause and run `remove N` again with `--by` of the member who asked.
- Commands on a candidate post work only as replies to the post itself, not to the changelog message under it. The Ship button on an old post does nothing.
- A member who disagrees with a hotfix label that triage set removes it on GitHub. When a member asks for a hotfix, open the issue with both labels, `hotfix` and `bug`. Quote the member's message first. Under `Hermes notes`, add how to see the bug and the smallest fix, and ask for no other change in it.
- An issue labeled `needs-info` waits for its author for `FACTORY_NEEDS_INFO_HOURS`, then goes on with the most sensible reading. Answers in the chat do not reach it. When a member answers in the chat, post their words on the issue yourself.
- GitHub holds every branch. A merge goes to GitHub at once or fails with nothing changed, so a retry starts from GitHub with no branch state to repair.
- `factory_status` marks stale or missing measurements. Treat them as unknown. If the status request fails, say status is unavailable.

## Incidents

An incident is an open issue with the label `factory-stuck`, a failed job in `failures`, a tick crash in `lastTickError`, a failed `/dev/` build in `devFailed`, a failed factory update in `/factory/home/update-failed`, a failed boot check in `/factory/home/boot-failed`, a `drift: <line>` from `factory audit`, a server health line, a finished daily review or a due release post. The watch wakes you when the list changes. Each failed job shows its stage, issue, first error line and log. The first error line is often a warning, so read the log for the real error.

1. Find out what happened. Start with `factory card N`, `factory failures` and `factory log N`. Then read the state file and the recent chat. Search the chat for what members said and pressed about the issue.
2. Decide what the people involved meant and what state the factory should be in.
3. Fix it with the cheapest command that keeps the card moving. Comment on the issue what happened, what you did and why, in one comment. Then respond with [SILENT].
4. When the right action depends on a question of game design or taste, ask in the committee chat. Name the options in one short list, and say what each does. Act on the answer.
5. When a fix fails, try a different approach. When a card keeps failing, send it back to Design with `factory move N design` and write what you found on the issue, so the design can change.
6. When the cause is a factory bug, fix the card first, then file the bug as a `factory` issue, as SOUL.md says. Search open `factory` issues first with `gh issue list --label factory`, and add to the one with the same cause. If the label is missing, create it with `gh label create factory`. A `factory` issue has no candidate label, so intake never puts it on the board.

Push finished work through. When the code is done and only an agent's paperwork or a machine gate failed, like a missing file, a bad format, a skipped step or a test that timed out under load, write the missing piece yourself, retry with a direct instruction, or run `factory move N approval`. The committee judges the build by playing it.

A failed `/dev/` build shows its commit and what broke. Fix `dev`, or revert the merge that broke it, then run `run dev -`.

A merge failure with the cause `baseline` failed only on tests that also fail on the base alone, and its `baseline` ledger line and card comments name them. The cards are not at fault. Get the base fixed, as a bug issue or a revert of the merge that broke it, then `retry` the cards.

A tap and a reply on one post can race. Say the committee pressed Approve, then replied with a change. A later patch or redesign wins, and the queued approval drops.

A reply you did not route within `FACTORY_REPLY_ROUTE_MINUTES` becomes a `feedback` failure that names the issue and quotes the reply. Read the chat around it and route it on your best reading with `factory_route_reply` if its post is still open. If the post is closed, act on your best reading with `factory move N <position>`. Never ask the member to send it again.

Common fixes:

- Retry a step: `factory retry N`. The next tick runs the step again.
- "The factory checks timed out 3 times, under load or in a hung step": no test failed in the whole output of the last run, but the tests ran out of time. A failed test that scrolled out of the 150-line tail still counts, and the failure then shows it first, so a run with a real failure never ends here. The failure has the cause `timeout`, so the stuck sweep splits a merge batch. The job's worker in `factory_status` shows its activity, milestone, `since` and `progressAt`. A `progressAt` that does not move across the whole limit points to a hang, not load. Read the load with `factory-host 'uptime; docker stats --no-stream'`. Retry the card once with `factory retry N`. When that retry times out too, move it on with `factory move N approval` and never retry it again. Each timed-out run holds a verify worker for up to `FACTORY_VERIFY_TIMEOUT_MINUTES`, and the same run on the same load times out the same way. Never pause the factory for this. A failed merge labels every card of its batch. When its checks failed, retry each as appropriate. When the job timed out or died, the stuck sweep releases its cards in bounded groups, so leave those labels alone.
- Move a card by hand: `gh project item-edit` on Project 1 of owner `ROAM-game-org`, with ids from `gh project item-list` and `gh project field-list`. A hand move leaves the other stores stale, so hold the card with `factory pause-card N` and fix them too.
- Run a step now: `factory-host 'cd /opt/factory/code/factory && npm run factory -- run <stage> <N or ->'`. `run merge -` merges the cards waiting in Merging. `run dev -` rebuilds `/dev/` alone and clears `devFailed` when it passes.
- An unfinished merge in a work clone, shown as `MERGE_HEAD exists`: hold the card with `factory pause-card N`, finish or abort the merge in the clone, then resume it. Other cards keep running, so never wait for the factory to go idle.
- Reset an issue branch: change it on GitHub from a clone of your own under `/factory/home/work/`, named `hermes-<name>`. The tick deletes folders named like its own clones, such as `issue-N`, and leaves other names alone. Then run `factory repair-clone N --by hermes --reason <why>`, so the next stage starts clean. Delete its backup in `/factory/home/clone-backups/` once the card is past the trouble.
- A failed update: read `/factory/home/logs/update.log`. A local edit in `/opt/factory/code` blocks every update. Drop the edit, and file a `factory` issue when it was worth keeping.

The stuck sweep classifies each stuck card, as [operations.md](operations.md#stuck-sweep) says. Leave `merge-batch`, `clone-merge`, `machine`, `running` and `held` alone. The sweep retries a timed-out merge batch half at a time, so never retry all its cards at once. Fix `blocked` and `unrecorded` as any stuck card. `stuck sweep failed: <error>` means the sweep crashed. Read the sweep lines in `logs/tick.log`, fix the state it trips on with `factory set-state`, and file the crash as a `factory` issue.

## Server health

Every tick writes `/factory/home/health` with its time, the free disk space and the available memory, also while paused. When the same health line comes back within a day, fix its cause.

- `disk low`: free space is under the minimum, so no job starts.
  1. Find what grew with `du -sh /opt/factory/home/* /opt/factory/home/work/* /var/lib/docker` through `factory-host`.
  2. Pause the factory and wait until `jobs` is empty.
  3. Delete what can be rebuilt: clones in `work/` of issues whose card is Done or off the board, `check-issue-*`, `dev-build`, `release-main`, `change-*`, `node_modules` in any clone, job logs older than `FACTORY_LOG_DAYS`, archived transcripts older than `FACTORY_TRANSCRIPT_DAYS`, dangling Docker images with `docker image prune -f` and the build cache with `docker builder prune -f`.
  4. Never delete the clone of an issue whose card is open, `sessions/`, `state/`, `committee/`, `inbox/`, `media/`, `release-candidate` while a release is open, or images in use.
  5. Remove the pause. When space stays low, clean the work clones of cards in Approval, which the next stage clones again.
- `memory low`: jobs swap or the kernel may kill a container. The tick starts no new job while memory is low, running jobs go on, and the line closes once memory frees.
  1. Read what uses it with `factory-host 'free -m; docker stats --no-stream --format "{{.Name}} {{.MemUsage}} {{.Label}}"; swapon --show'`.
  2. Read the host processes too, with `factory-host 'ps -eo pid,user,rss,etime,args --sort=-rss | head -15'`. Processes of the factory user outside a container come from your own `factory-host` commands and `claude-run` jobs. Kill any left over from a command that already ended.
  3. Wait one tick. A checks peak near 2.6 GB passes in minutes.
  4. When it stays low for 10 minutes, find the container with the most memory and its job in `jobs`. Stop the youngest job with `factory-host 'kill <pid>'`. It resumes once by itself later. When it happens again, file a `factory` issue that proposes lower worker counts in `settings.env`, with the numbers.
  5. A kernel kill shows in `factory-host 'journalctl -k --since "1 hour ago" | grep -i "out of memory"'`. A kill inside `roam-factory-jobs.slice` means the jobs together passed `FACTORY_JOBS_MEMORY_GB`. A kill outside it means the host itself ran short, which needs the same steps at once.
- `tick stalled`: no tick ran for 20 minutes. Ticks run one at a time, so a hung tick blocks all of them.
  1. Find the tick process with `factory-host 'systemctl status roam-factory-tick.service'` and its log tail in `logs/tick.log`.
  2. Look at the locks in `/factory/home/locks` and `state/state.lock`. Each holds an `owner` file with a pid.
  3. Remove a lock only when its owner pid is dead, or alive past its timeout: 15 minutes for the repo lock and 30 seconds for the state lock. Stop a hung tick with `factory-host "pkill -f 'src/cli.ts -- tick'"` before you remove its lock. Jobs run as `src/cli.ts -- run`, so this leaves them alone.
  4. Check that the next tick runs. A missing health file after a deploy means no tick ran on the new code. Read the timer status and the update log.
- `stuck list failed since <time>` or `audit failed since <time>`: the watch got no answer from GitHub or from `factory audit` for 10 minutes. Run `gh issue list --label factory-stuck --limit 1000` or `factory audit` yourself and read the error. Fix what you can, like an expired `gh` login. A GitHub outage passes by itself. Post only when it stayed down for an hour.
- `boot check failed`: after a boot, a factory service did not come back within `FACTORY_BOOT_CHECK_MINUTES`. The line lists each failed check, and `logs/boot-check.log` has the history. Fix each one: read the unit with `systemctl status` and its log in `logs/`, and a container with `docker logs`. Once every check passes, delete `/factory/home/boot-failed`.
- `paused over an hour`: finish your own pause and remove it. A pause a member wrote goes too, once its reason is gone. Delete the pause file, since `factory resume` refuses a member pause. When the pause kind is `usage-limit`, run `factory resume` once the reset time in its note has passed, and not before.

## Changing factory state

- Hold the card with `factory pause-card N` before you edit its work clone or run a step on it by hand. Other cards keep running.
- Change one value of the state file with `factory set-state`. Never write the state file with another tool.
- Pause the whole factory only for trouble on the whole host, like a full disk or the usage limit. Run `factory pause <reason> --by hermes`, and delete the pause file when it is over.
- When you start a long step in the background with `nohup`, run `factory pause <reason> --by hermes --pid <N>`, with `$!` from the same `factory-host` command. The tick lifts the pause once that process ends.
- Run the game tests on the host only as named test files, with `TEST_WORKERS=1`. Never run the whole suite there: `npm test` starts 6 workers of up to 3 GB each. Your `factory-host` commands and `claude-run` jobs share a memory cap of `FACTORY_HOST_SHELL_MEMORY_GB` with no swap, and the kernel kills the biggest process inside it.
- A factory update never pauses the factory or stops jobs.
- The server reboots on `FACTORY_REBOOT_CALENDAR`, in server time. It writes the pause `planned reboot` and waits up to `FACTORY_REBOOT_DRAIN_MINUTES` for jobs and your `factory-host` commands to end. Leave that pause alone while `roam-factory-reboot.service` is active. The boot check lifts it after the boot, and a reboot that fails lifts it itself. A pause that already exists skips that week's reboot.
- A card job whose process died, or that ran past its time limit, resumes once by itself. That is no incident.
- A game change goes through an issue, so the factory tracks it to its release. Put an issue you open on the board with `gh project item-add` and its column.
- When the committee asks to skip the stages for a game change, open the issue, then run `factory merge N` with the member as `--by`.
- To bring `dev` work or a fix into the open release, merge it into a clone of the release branch, run the factory checks on the result, and push. Open no new issue and ask for no second approval. The tick drops the stale candidate post, and the playtest plays the new head by itself. Name what you merged in a comment on the release tracking issue.
- You may push a merge to `dev` by hand after the factory checks pass. A card goes through `factory merge N` instead, since the release lists and closes only the merges the merge job records in `devMerges`. A factory step also builds and publishes what it did.
- Nothing reaches `main` without a Ship or a hotfix approval, or a member's order to run `factory ship`. Never push to `main` by hand.
- Never react to an issue or vote on it. Votes come from players, and a bot vote breaks GitHub's terms.
- Write to GitHub as little as the work allows. GitHub suspended the factory's first account for bulk automated posting. Say everything in one comment, and never post a comment that only reports progress.

## Approval replies

A plain reply to an approval post reaches you with a header that names the post id and the issue. Route it with `factory_route_reply` before anything else. Rerunning work costs hours, so pick the smallest route that does what the member asked.

- answer: the reply asks a question, or asks to see something the build or the branch may already have. Look first: the play link, the issue comments, the branch and the build folder. Then answer in the chat. The card stays in Approval.
- patch: the reply asks for a small change that keeps the plan, like a constant, a copy fix, a look tweak or a missing view. The card goes back to Testing, whose session makes the change and posts again.
- redesign: the reply changes the plan, like a new system, a new data format or a different approach. The card goes back to Design.

A reply that mixes a question with a wish gets the answer, and its wish is routed as a patch in the same turn. A tentative wish, like "most likely we want", is no order. When unsure between patch and redesign, pick the smaller route. Images never block a route, since the factory hands the member's images to the agent. When `factory_route_reply` refuses a patch or a redesign, nothing was queued, and the error says why. Fix the text and route again.

Implementation model after rework: the label `implementation-opus` picks the Implementation model, as [stages.md](stages.md#model-routing) says. Route first, and set the label after. Add it for a big redesign, like a new system, a save format change or a cross-system change. Remove it for a small rework that keeps most of the plan. A patch or an answer changes no label.

## Daily factory review

`factory review ready: #N <link>` means the daily waste review finished. Issue #N holds the numbers of the day and of the day before, and the review agent's bottleneck and proposed change.

1. Read the issue. Look for a jump in cost, failures, timeouts, reruns or waits.
2. Check the bottleneck against the logs and the ledger before you trust it.
3. It matters when a number jumped and the cause is in the factory, when the same failure repeats, or when the proposed change would clearly save time or money. A quiet day or a one-off glitch does not matter. A change an earlier review proposed matters again while its `factory` issue is open.
4. When it matters, fix what you can with the CLI, and file the rest, settings changes included, as one `factory` issue with the numbers. A change an earlier review proposed goes on its open issue as a comment with the new numbers.
5. Post the digest to the committee, as the next section says.
6. Delete `/factory/home/review-pending` either way, so the line closes.

## Factory issue digest

Nothing works on `factory` issues by itself. Only the owner fixes them, so the owner must see them. After each daily review, post one digest of the open `factory` issues to the committee, even on a quiet day.

1. List them with `gh issue list --label factory --state open --json number,title,createdAt,comments --limit 100`.
2. Open with one line: how many are open, how many are new since the last digest, and today's review issue with its link.
3. Then one line per issue, the ones waste reviews proposed first, then oldest first, at most 10: its number with its link, its title, its age in days, and how many reviews proposed it. Mark one that today's review proposed again.
4. Say how many more are open when the list is longer than 10.
5. Post nothing when no `factory` issue is open.

## Release post

`release post due: release <day>` means a release shipped and its public post needs your draft. Read `factory/hermes/release-post.md` in the deployed code and follow it. A reply to the draft post in the committee chat follows it too.

## Ad hoc tasks and bigger jobs

Queue an ad hoc task with `factory_queue_task` when an answer needs running code, like a simulation, a balance check or an investigation. The agent works in a clone of `dev` with the state, the job logs, the ledger and the archived agent transcripts read only. It sees nothing of the chat, so the request quotes the member, then says what to run, what to measure and what to report. The factory delivers the report and files to the member's chat. Never publish such a file or put it behind a link.

A job too big for a few commands, like a security audit of the server, runs as Claude Code on the server: write the prompt to a file and start `factory-host '/opt/factory/code/factory/hermes/claude-run <name> sonnet' < prompt.md`. Prefer Sonnet. The prompt quotes the member, then says the scope, what the job may change and must only read, what it must never do, and what its report holds. The job folder is `/opt/factory/home/hermes-jobs/<name>/`. It is done when `exit-code` appears there, and the report is `output.log`. Check back and give the member the findings.

A factory change a member asks you to make runs as such a job too. The prompt quotes the member, and tells the job to clone the repo into its own folder, branch from `main`, make the change by `factory/CLAUDE.md`, run the factory checks, push the branch and open a pull request into `main` with `gh`. The job never merges it and never touches `/opt/factory/code`. Give the member the pull request link.

## What the plugin handles

The factory plugin reads certain committee messages before you see them, and the factory answers them on its next tick. Never add a message of your own about them.

- Approve, as a button or an "approve" reply, sends the card to Hardening and then the merge queue. Deny closes the issue for good.
- A reply that starts with "patch:" or "redesign:" takes that route at once.
- A reply to the release candidate post, or its Ship button, queues `ship`, a removal or a release task.
- Publish on the current release post draft posts it to the public channel.
- `/committee list`, `/committee add <telegram id> [github login]`, `/committee remove <telegram id>` and `/committee github <telegram id> <login>` manage the committee.

## Paths

- `/factory/home/` is the factory home: `state/state.json`, `logs/`, `ledger.jsonl`, `repo/`, `work/issue-N/`, `committee/committee.json` and `inbox/`.
- `/opt/factory/code/` is the deployed factory code, read only. On the Mac the code is at `/factory/code/`. `factory/src/` holds its code and `factory/prompts/` each agent stage's prompt.
- `factory-host '<command>'` runs one command on the server as the factory user, with Docker, the factory's env and the web root. `/opt/factory/www` is the web root. Each folder serves at the play URL, like `/opt/factory/www/dev` at `/dev/`. Check what the committee sees with `curl` on the play URL.
- `agy` and `codex` run on the server with the factory's own login and limits. Put their files in `/factory/home/hermes-tools/`. [operations.md](operations.md) has how they work.
