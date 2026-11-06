# Perf gate

Status: validating

Branch: perf-rework

Worktree: .worktrees/perf-rework

Goal: One command plays the bench on the Ally and says whether a commit is slower than the last stored numbers, beyond what the same code varies by. Child tasks of `docs/tasks/perf-rework.md` use it for their before and after, and landings can use it to catch slowdowns. Useless if: the band is wide enough to hide a real slowdown; it fails unchanged code; it passes an untrusted run; it hides fight turn waits inside a pooled number.

Mode: hands-off

## Context

See `docs/tasks/perf-rework.md`. The Ally is a ROG Xbox Ally, Ryzen Z2 A, with no other jobs on it. The bench plays there with ANGLE Vulkan, and the GPU and its timer work over plain SSH. On Windows the bench reads machine load at start and end only, since other programs' CPU use is not measured.

## Design

- Turn starts: the report lists every turn start with its scene, wait and whether a turn was already computed. Fight and the first drive turn are timed from the press. Later drive turns are timed from the moment playback ended.
- Drive trust: the two cold passes on opposite routes stay. The spread check skips drive, and the gate judges each pass by itself.
- Stored numbers: `game/scripts/perf-landed.json` holds per machine, per measure, a value and a limit. It comes from at least 3 trusted reports of one commit. The limit is the value plus the noise, which is the larger of the range between reports and the largest pass difference inside one report. Landing refuses a frame mean whose noise is over 10 percent of its value.
- Measures: mean frame time per scene, each drive pass alone, turn wait, plan preview and boot can fail the gate. p99 and frames over 100 ms are shown and cannot fail it, since their noise reaches 67 percent.
- Why mean: when frames outrun the GPU in the uncapped bench, the median falls while stalls of 100 ms or more grow. Town-night gave a 12 ms median and a 20 ms mean with a 20 ms GPU time. The mean agrees between passes within 3 percent there.
- Commands: `npm run perf -- --land <reports>` writes the stored numbers and refuses to raise a value past its old limit. `npm run perf -- --gate <report>` exits 0 on pass, 1 on a slowdown and 2 on an untrusted run or a report that lacks a measure. `npm run perf:remote -- <runs>` sends HEAD to the host in `PERF_HOST`, plays the bench and fetches the reports.

TDD: yes for the pure report code and the drive gap tracker. The remote script is checked by running it.

### Invariants

- IV1 — Unchanged code passes the gate at its stored numbers.
- IV2 — A measure over its limit fails, and an untrusted run never passes.
- IV3 — Stored numbers never rise without a person editing the file.

## Plan

### PH1 — Turn starts in the report
- `game/src/bench/report.ts` `TurnStart`, `BenchReport.turns.starts`, `turnStats()`.
- `game/src/bench/bench.ts` `startTurn()`, `playDrive()`, `driveTurnGaps()`.

### PH2 — Gate
- `game/scripts/perf-report.mjs` `spreadProblems()`, `gateMeasures()`, `landedFrom()`, `gateLines()`, `gateSummary()`; `perf-report.d.mts`; `game/src/test/perf-report.test.ts`.
- `game/scripts/perf.mjs` `--land`, `--gate`.

### PH3 — Remote runner
- `game/scripts/perf-remote.mjs`, `game/package.json`, `game/.env.example`, `game/docs/tools.md`.

### PH4 — Stored numbers
- Three full runs on the Ally at the PH3 commit, landed into `game/scripts/perf-landed.json`.

## Verify

One full run on the Ally at c2b8dd75c took about 14 minutes and was trusted. All 20 timed turn starts are in the report: 8 of 8 fight presses found no ready turn and waited 0.8 to 1.6 s, the first drive press waited 1.7 s, and 11 of the 12 drive turn starts were ready. ANGLE D3D11 was not usable: in town-night one frame's timer query never returned, which stopped the bench twice, so Windows uses ANGLE Vulkan as Linux does.

Pacing the bench with GPU fences was tried and reverted. Fence results arrive late, so every scene sat near 28 ms, including town-day at 12 ms CPU and 17 ms GPU.

At 31f7febcc two full runs were trusted, and the same scenes agree within 7 percent on mean: town-day 16.5 and 15.8, town-day-far 28.9 and 27.8, town-night 20.4 and 20.8, town-night-far 23.7 and 23.2, fight 38.3 and 36.9. Fight spread reached 10.0 percent in one run, at the trust limit.

IV1 is not yet confirmed. `perf-landed.json` still holds median keys from c2b8dd75c, so the gate exits 2 on every run until 3 runs at the current commit are landed. IV2 and IV3 hold in tests.

## Conclusion

Independent review found four problems, all fixed in 970bb0695 except that the stored numbers wait on the runs above: stored numbers in the old measure, a p99 limit wide enough to pass a 67 percent slowdown, an over-100 count that one Windows hitch can fail, and a press after a plan edit that waits behind a stale job.

### Hands-off decisions

- make: the gate host is the Ally — it has no factory on it, and the bench is trusted there.
- udesign: the gate is on demand, not tied to landings — pushing it into `land-dev.sh` and the factory changes how every landing runs, so it waits for the user.

### Deferred (needs user input)

- Running the gate on each landing — dev has up to 47 landings a day, so the choice is between per-landing runs and batches once a run's length is known.
