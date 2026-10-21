# Host freeze and planned reboots

**Status:** validating
**Branch:** factory/host-freeze
**Worktree:** .worktrees/host-freeze
**Goal:** The factory server cannot be frozen again by a runaway process from Hermes's host shell. A weekly planned reboot drains the factory, reboots, and a boot check proves every service is back or raises an incident. The boot check runs after every boot, so today's dead dashboard would have raised an incident. Confirming it needs a provision or deploy run and one watched production reboot, which the user runs. Useless if: the cap leaves swap open so the box still thrashes, the boot check passes while `/factory/` returns 502, or the reboot kills running jobs while a quiet moment was minutes away.
**Mode:** hands-off

## Context

On 2026-10-21 the server froze at about 17:49 local and stayed frozen until a manual power cycle at 17:58.

- At 16:05 UTC Hermes held card #872 with `pause-card` and fixed its Russian text in the card's clone.
- At 16:07:38 UTC Hermes ran `npm run typecheck && npm test` in that clone through `factory-host`. That is the full game suite, run bare on the host, with 6 workers and no memory cap.
- At 16:08:02 UTC the tick logged `removed packages of idle clones issue-872`. `busy()` in `src/cleanup.ts` checks `jobs` and `interrupted` and ignores `held`, so the cleanup deleted `node_modules` under the running suite. That breaks the `pause-card` promise to keep the work clone.
- The vitest main process died with tinypool `MODULE_NOT_FOUND`. Its 5 forked workers lived on in the factory user's session slice and grew to about 3 GB each.
- At 16:10 UTC the merge checks started on top of them. Memory pressure began at 16:11 UTC. Chrome in the playtest was killed at 16:15 UTC.
- From 16:35 to 16:49 UTC the kernel made 138 OOM kills. It killed only wireplumber, pipewire and other desktop processes with `oom_score_adj` 200 or 300, which free almost nothing. At host scale they outrank a 3 GB worker with adj 0. The 8 GB of swap kept the box thrashing instead of failing.
- After the power cycle the dashboard crash-looped on `EADDRINUSE` for its stale socket. The errors service removes its socket before listening, and the dashboard does not.

## Design

1. Cleanup counts a held card's clone as busy, like `interrupted`.
2. The dashboard removes a stale socket before it listens, as `error-reports/service.ts` does.
3. Deploy caps the factory user's login slice, `user-1001.slice`, with `MemoryMax` from settings and `MemorySwapMax=0`. Hermes's `factory-host` commands and `claude-run` jobs live there. Inside the cap, a runaway is killed by the cgroup OOM killer, which picks the biggest process in the slice. Factory jobs run as system services and Docker containers, outside this slice.
4. `docs/hermes.md` gets the rule: the game tests run on the host only as targeted files with `TEST_WORKERS=1`. Its low-memory runbook also lists host processes, since the hog was not a container.
5. Planned reboot: `roam-factory-reboot.timer` runs `factory-reboot.sh` as root on `FACTORY_REBOOT_CALENDAR`.
   - It skips the run and logs why when a pause already exists.
   - It writes a `factory` pause with the note `planned reboot`, then waits until `jobs` is empty and the factory user's slice is idle, checking each minute for at most `FACTORY_REBOOT_DRAIN_MINUTES`.
   - It reboots after the wait either way, and logs any job it cut short.
6. Boot check: `roam-factory-boot-check.service` runs `factory-boot-check.sh` after every boot.
   - It removes a `factory` pause whose note is `planned reboot`.
   - It waits, at most `FACTORY_BOOT_CHECK_MINUTES`, until these all pass: the dashboard and errors services active, the tick and update timers active, the hermes, caddy and tunnel containers running, `/factory/` returning 200 on the public URL, and one tick that finished with success after this boot.
   - On failure it writes the failed checks to `$FACTORY_HOME/boot-failed`, which Hermes's incident watch prints. On success it removes that file.

### Invariants

- IV1: Each new number lives once, in `settings.env`, and deploy fails loud when one is missing or malformed.
- IV2: The reboot never removes a pause it did not write.
- IV3: Every wait loop is bounded and ends with a logged result.

### Assumptions

- AS1: The factory user's ssh sessions and their leftovers run in `user-1001.slice`. The OOM log names `user@1001.service` for the orphan workers.
- AS2: The tick service's detached jobs stay in `system.slice`, since a system unit with `User=` runs there.

## Plan

1. `src/cleanup.ts` `busy()` and a test in `src/cleanup.test.ts`.
2. `src/dashboard/server.ts` `start()` and a test in `src/dashboard/server.test.ts`.
3. `settings.env` keys, validation in `factory_infra/__init__.py`, and a test in `infra/tests/test_factory_env.py`.
4. `infra/files/user-slice.conf.j2`, `factory-reboot.sh`, `factory-boot-check.sh` and their units, installed by `deploy/deploy.py`. Tests in `infra/tests/test_update_scripts.py` style for both scripts.
5. `hermes/factory-incidents.sh` prints `boot-failed`.
6. Docs: `docs/hermes.md`, `docs/operations.md`, `infra/README.md`.

## Verify

- Targeted tests pass: `cleanup.test.ts`, `dashboard/server.test.ts`, `config.test.ts`, `hermes/test_incidents.py` and all 36 infra tests, including 12 new tests for the reboot and boot check scripts.
- The desktop session belongs to `boris`, uid 1000, so the cap and the drain's slice check touch only the factory user's sessions.
- The server matches the assumptions: cgroup v2, `user-1001.slice` is inactive with no factory session, the tick unit reports `Result` and `ExecMainExitTimestampMonotonic`, `grub-editenv` exists with no `next_entry`, and `systemd-analyze` accepts the calendar. The next reboot would be Mon 2026-10-26 05:00.
- `pyinfra --dry` imports `deploy.py` and parses the new settings against the server. It skipped change detection, so it did not render or diff the new templates.
- Not run: provision or deploy, and a real reboot. Both change production, so the user runs them.

## Conclusion

The review found 4 problems, and all are fixed with tests:
- The boot check now waits on clock time. Before, slow curl rounds could outlast the unit's limit, so systemd killed the check before it wrote `boot-failed`.
- A failed pause lift now lands in `boot-failed`.
- An unreadable state file now stops the reboot with a log line, and never counts as drained.
- The GRUB guard reads its output first, so `pipefail` cannot turn it off by chance.

A reboot that fails after it pauses now lifts its own pause, so the factory never stays paused under a note that tells Hermes to leave it.

AS1 and AS2 held on the server. The Goal still waits on a deploy and one watched reboot.

### Hands-off decisions

- make: size Medium, full flow.
- make: branch `factory/host-freeze` from `origin/main` in `.worktrees/host-freeze`.
- ureview: applied all 4 review findings and the self-lifting pause, each with a test.

### Deferred (needs user input)

The four design questions got no answer in 10 minutes. Each value below is a placeholder I picked. Changing one takes one `settings.env` line and a deploy run.
- Reboot schedule: weekly, Monday 05:00 server time.
- Busy jobs: drain at most 50 minutes, then reboot anyway. 50 stays under Hermes's one-hour rule for lifting pauses.
- Hermes host cap: 4 GB of RAM and no swap. The factory's own CLI tests start one worker per CPU, and a `claude-run` job that runs them may hit the cap.
- Desktop: GNOME stays. Text mode would need a provision change.
- Deploy and a watched reboot: merge into `main`, run `deploy.py` from a checkout with the merge before Mon 2026-10-26 05:00, then run `sudo systemctl start roam-factory-reboot.service` at a quiet time. Read `logs/reboot.log` and `logs/boot-check.log`, and check that `paused` and `boot-failed` are absent and `/factory/` returns 200. Check that `systemctl show user-1001.slice -p MemoryMax -p MemorySwapMax` shows 4 GiB and 0.
